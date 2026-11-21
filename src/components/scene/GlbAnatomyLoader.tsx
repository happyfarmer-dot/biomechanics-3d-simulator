import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Mesh, Vector3 } from 'three';
import {
  DEFAULT_HEIGHT_M,
  JOINT_ORDER,
  SKELETON_CONFIG,
} from '../../data/skeletonConfig';
import { calibrateSkeletonFromScene } from '../../engine/calibrateSkeleton';
import {
  classifyMeshZone,
  findNearestBoneJointInZone,
  prepareAutoSkinnedMuscle,
  updateSkinnedMuscleVertices,
  type SkinnedMuscleData,
} from '../../engine/muscleSkinning';
import { runRigIntegrityCheck } from '../../engine/rigIntegrityCheck';
import { useSimStore } from '../../store/useSimStore';
import type { JointId, RiskSeverity, Vec3 } from '../../types/biomechanics';
import {
  getSkinFresnelMaterial,
  getZAnatomyBoneMaterial,
  getZAnatomyMuscleMaterial,
} from '../../utils/anatomyTextures';

const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;
useGLTF.setDecoderPath(DRACO_PATH);

const DEFAULT_GLB_URL = `${import.meta.env.BASE_URL}models/anatomy_rigged.glb`;

interface BoneBinding {
  kind: 'bone' | 'skin';
  mesh: Mesh;
  jointId: JointId;
  localOffset: Vec3;
  modelScale: number;
}

interface MuscleBinding {
  name: string;
  jointId: JointId;
  skinned: SkinnedMuscleData;
}

class GlbSilentBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message || '模型解析失敗');
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function RealAnatomyModel({
  url,
  onReady,
}: {
  url: string;
  onReady: (loaded: boolean) => void;
}) {
  const { scene } = useGLTF(url);
  const kinematics = useSimStore((s) => s.kinematics);
  const heightM = useSimStore((s) => s.heightM);
  const layers = useSimStore((s) => s.layers);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const setModelStatus = useSimStore((s) => s.setModelStatus);
  const setCalibratedOffsets = useSimStore((s) => s.setCalibratedOffsets);
  const setIntegrityReport = useSimStore((s) => s.setIntegrityReport);
  const placeForceAtPoint = useSimStore((s) => s.placeForceAtPoint);

  // Step 1: Calibrate real anatomical joint centers from GLB bone bounding boxes
  const calibration = useMemo(() => calibrateSkeletonFromScene(scene), [scene]);

  useEffect(() => {
    setCalibratedOffsets(calibration.offsets);
    return () => setCalibratedOffsets(null);
  }, [calibration, setCalibratedOffsets]);

  // Step 2: 100% Spatial Partitioning + Per-Vertex Auto-Skinning
  const { boneBindings, muscleBindings, unassignedMeshCount } = useMemo(() => {
    const bones: BoneBinding[] = [];
    const muscles: MuscleBinding[] = [];
    const [cx, minY, cz] = calibration.centerOffset;
    const s = calibration.modelScale;
    let unassigned = 0;

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      if (obj.scale.x < 0 || obj.scale.y < 0 || obj.scale.z < 0) {
        const sx = obj.scale.x < 0 ? -1 : 1;
        const sy = obj.scale.y < 0 ? -1 : 1;
        const sz = obj.scale.z < 0 ? -1 : 1;
        obj.geometry = obj.geometry.clone();
        obj.geometry.scale(sx, sy, sz);
        if (sx * sy * sz < 0 && obj.geometry.index) {
          const idx = obj.geometry.index.array;
          for (let i = 0; i < idx.length; i += 3) {
            const tmp = idx[i + 1];
            idx[i + 1] = idx[i + 2];
            idx[i + 2] = tmp;
          }
          obj.geometry.index.needsUpdate = true;
        }
        obj.geometry.computeVertexNormals();
        obj.scale.set(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z));
      }
      const nl = obj.name.toLowerCase();
      const zone = classifyMeshZone(obj, calibration);

      if (nl.startsWith('muscle__') || nl.includes('muscle')) {
        const skinned = prepareAutoSkinnedMuscle(obj, zone, calibration);
        muscles.push({
          name: obj.name,
          jointId: skinned.primaryJoint,
          skinned,
        });
      } else {
        const kind: 'bone' | 'skin' = nl.includes('skin') ? 'skin' : 'bone';
        const jointId = findNearestBoneJointInZone(obj, zone, calibration);
        if (!jointId) unassigned++;

        const cloned = obj.clone();
        cloned.visible = true;
        const worldPos = new Vector3();
        obj.getWorldPosition(worldPos);
        const normX = (worldPos.x - cx) * s;
        const normY = (worldPos.y - minY) * s;
        const normZ = (worldPos.z - cz) * s;

        const jRest = calibration.restPositions[jointId];
        bones.push({
          kind,
          mesh: cloned,
          jointId,
          localOffset: [normX - jRest[0], normY - jRest[1], normZ - jRest[2]],
          modelScale: s,
        });
      }
    });

    return { boneBindings: bones, muscleBindings: muscles, unassignedMeshCount: unassigned };
  }, [scene, calibration]);

  useEffect(() => {
    console.info(
      `[Z-Anatomy] Loaded ${boneBindings.length} bones, ${muscleBindings.length} auto-skinned muscles, unassignedMeshCount === ${unassignedMeshCount}`
    );
    const ok = boneBindings.length > 0 || muscleBindings.length > 0;
    onReady(ok);
    if (ok) {
      setModelStatus({ state: 'loaded' });
      const report = runRigIntegrityCheck(
        muscleBindings.map((m) => m.skinned),
        unassignedMeshCount,
        calibration
      );
      setIntegrityReport(report);
    } else {
      setModelStatus({ state: 'error', message: '模型中無有效網格' });
    }
    return () => onReady(false);
  }, [
    boneBindings.length,
    muscleBindings,
    unassignedMeshCount,
    calibration,
    onReady,
    setModelStatus,
    setIntegrityReport,
  ]);

  // Step 3: Update only muscles whose used joints changed via DQS
  const prevJointSigRef = useMemo(() => new Map<number, string>(), []);
  const stretchRatios = useMemo(() => {
    const ratios = new Array<number>(muscleBindings.length);
    for (let i = 0; i < muscleBindings.length; i++) {
      const m = muscleBindings[i];
      let sig = `${heightM}`;
      for (const jId of m.skinned.usedJoints) {
        const j = kinematics.joints[jId];
        sig += `|${j.worldPosition[0].toFixed(4)},${j.worldPosition[1].toFixed(4)},${j.worldQuaternion[0].toFixed(4)},${j.worldQuaternion[1].toFixed(4)},${j.worldQuaternion[2].toFixed(4)}`;
      }
      if (prevJointSigRef.get(i) !== sig) {
        prevJointSigRef.set(i, sig);
        ratios[i] = updateSkinnedMuscleVertices(
          m.skinned,
          kinematics,
          heightM,
          calibration.restPositions
        );
      } else {
        ratios[i] = 1;
      }
    }
    return ratios;
  }, [muscleBindings, kinematics, heightM, calibration.restPositions, prevJointSigRef]);

  const activeMacroSet = useMemo(() => {
    if (!focusedJointId) return null;
    const set = new Set<JointId>([focusedJointId]);
    const p = SKELETON_CONFIG[focusedJointId].parentId;
    if (p) set.add(p);
    for (const id of JOINT_ORDER) {
      if (SKELETON_CONFIG[id].parentId === focusedJointId) set.add(id);
    }
    return set;
  }, [focusedJointId]);

  const hScale = heightM / DEFAULT_HEIGHT_M;

  return (
    <group name="real-zanatomy-model">
      {/* Bones attached to calibrated joints */}
      {boneBindings.map((b, idx) => {
        if (b.kind === 'skin' && !layers.skin) return null;
        if (b.kind === 'bone' && !layers.skeleton) return null;

        const j = kinematics.joints[b.jointId];
        const isGhosted = Boolean(activeMacroSet && !activeMacroSet.has(b.jointId));
        const material =
          b.kind === 'skin'
            ? getSkinFresnelMaterial(isGhosted)
            : getZAnatomyBoneMaterial(isGhosted);

        return (
          <group
            key={`bone_${b.mesh.name}_${idx}`}
            position={j.worldPosition}
            quaternion={j.worldQuaternion}
          >
            <primitive
              object={b.mesh}
              position={[
                b.localOffset[0] * hScale,
                b.localOffset[1] * hScale,
                b.localOffset[2] * hScale,
              ]}
              scale={[b.modelScale * hScale, b.modelScale * hScale, b.modelScale * hScale]}
              material={material}
              castShadow={!isGhosted && b.kind !== 'skin'}
              onClick={(e: { stopPropagation: () => void; point: Vector3 }) => {
                if (interactionMode !== 'force') return;
                e.stopPropagation();
                placeForceAtPoint(b.jointId, [e.point.x, e.point.y, e.point.z]);
              }}
            />
          </group>
        );
      })}

      {/* Dual-Bone Skinned Muscles in world space */}
      {layers.muscles &&
        muscleBindings.map((m, idx) => {
          const isGhosted = Boolean(
            activeMacroSet &&
              m.skinned.usedJoints.every((jid) => !activeMacroSet.has(jid))
          );
          const stretch = stretchRatios[idx] ?? 1;
          const jointRisk = jointRiskMap[m.jointId];
          let status: RiskSeverity = jointRisk;
          if (stretch > 1.3) status = 'critical';
          else if (stretch > 1.15 && status === 'normal') status = 'warning';

          const material = getZAnatomyMuscleMaterial(status, isGhosted);

          return (
            <mesh
              key={`muscle_${m.name}_${idx}`}
              geometry={m.skinned.geometry}
              material={material}
              frustumCulled={false}
              visible
              onClick={(e) => {
                if (interactionMode !== 'force') return;
                e.stopPropagation();
                placeForceAtPoint(m.jointId, [e.point.x, e.point.y, e.point.z]);
              }}
            />
          );
        })}
    </group>
  );
}

export function GlbAnatomyLoader({
  url = DEFAULT_GLB_URL,
  onExternalActive,
}: {
  url?: string;
  onExternalActive?: (active: boolean) => void;
}) {
  const [available, setAvailable] = useState(false);
  const setModelStatus = useSimStore((s) => s.setModelStatus);

  useEffect(() => {
    let cancelled = false;
    setModelStatus({ state: 'loading' });
    fetch(url, { method: 'HEAD' })
      .then((res) => {
        if (cancelled) return;
        const ct = res.headers.get('content-type') ?? '';
        const isValidGlb = res.ok && !ct.includes('text/html');
        setAvailable(isValidGlb);
        if (!isValidGlb) {
          onExternalActive?.(false);
          setModelStatus({
            state: 'error',
            message: !res.ok ? `HTTP ${res.status}` : '檔案格式非 GLB',
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAvailable(false);
          onExternalActive?.(false);
          setModelStatus({
            state: 'error',
            message: err instanceof Error ? err.message : '網路連線失敗',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, onExternalActive, setModelStatus]);

  if (!available) return null;

  return (
    <GlbSilentBoundary
      onError={(msg) => {
        onExternalActive?.(false);
        setModelStatus({ state: 'error', message: msg });
      }}
    >
      <Suspense fallback={null}>
        <RealAnatomyModel url={url} onReady={(ok) => onExternalActive?.(ok)} />
      </Suspense>
    </GlbSilentBoundary>
  );
}

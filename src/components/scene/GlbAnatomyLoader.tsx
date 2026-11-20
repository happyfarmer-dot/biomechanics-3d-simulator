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
  prepareSkinnedMuscle,
  resolveMuscleBonePair,
  updateSkinnedMuscleVertices,
  type SkinnedMuscleData,
} from '../../engine/muscleSkinning';
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
const VALID_JOINT_IDS = new Set<string>(JOINT_ORDER);

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

function parseMeshClassification(name: string): {
  kind: 'bone' | 'muscle' | 'skin';
  jointId: JointId;
} {
  const parts = name.split('__');
  if (parts.length >= 2) {
    const prefix = parts[0].toUpperCase();
    const candidateJoint = parts[1];
    if (VALID_JOINT_IDS.has(candidateJoint)) {
      if (prefix === 'BONE') return { kind: 'bone', jointId: candidateJoint as JointId };
      if (prefix === 'MUSCLE') return { kind: 'muscle', jointId: candidateJoint as JointId };
      if (prefix === 'SKIN') return { kind: 'skin', jointId: candidateJoint as JointId };
    }
  }

  const lower = name.toLowerCase();
  const isL = lower.includes('_l') || lower.includes('.l') || lower.includes('left');
  const isR = lower.includes('_r') || lower.includes('.r') || lower.includes('right');
  const side = isL ? '_L' : isR ? '_R' : '';

  const kind: 'bone' | 'muscle' | 'skin' = lower.includes('skin')
    ? 'skin'
    : lower.includes('muscle')
    ? 'muscle'
    : 'bone';

  let jointId: JointId = 'pelvis';
  if (lower.includes('femur') || lower.includes('quad') || lower.includes('hamstring') || lower.includes('glute')) {
    jointId = (`hip${side || '_R'}`) as JointId;
  } else if (lower.includes('tibia') || lower.includes('fibula') || lower.includes('patella') || lower.includes('gastroc') || lower.includes('soleus')) {
    jointId = (`knee${side || '_R'}`) as JointId;
  } else if (lower.includes('foot') || lower.includes('talus') || lower.includes('ankle')) {
    jointId = (`ankle${side || '_R'}`) as JointId;
  } else if (lower.includes('humerus') || lower.includes('deltoid') || lower.includes('biceps') || lower.includes('triceps')) {
    jointId = (`shoulder${side || '_R'}`) as JointId;
  } else if (lower.includes('radius') || lower.includes('ulna') || lower.includes('forearm')) {
    jointId = (`elbow${side || '_R'}`) as JointId;
  } else if (lower.includes('hand') || lower.includes('wrist')) {
    jointId = (`wrist${side || '_R'}`) as JointId;
  } else if (lower.includes('skull') || lower.includes('head') || lower.includes('mandible')) {
    jointId = 'head';
  } else if (lower.includes('neck') || lower.includes('cervical')) {
    jointId = 'neck';
  } else if (lower.includes('lumbar') || lower.includes('erector')) {
    jointId = 'lumbar';
  } else if (lower.includes('thorax') || lower.includes('rib') || lower.includes('sternum') || lower.includes('pectoralis')) {
    jointId = 'thorax';
  }

  return { kind, jointId };
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
  const placeForceAtPoint = useSimStore((s) => s.placeForceAtPoint);

  // Step 1: Calibrate real anatomical joint centers from GLB bone bounding boxes
  const calibration = useMemo(() => calibrateSkeletonFromScene(scene), [scene]);

  useEffect(() => {
    setCalibratedOffsets(calibration.offsets);
    return () => setCalibratedOffsets(null);
  }, [calibration, setCalibratedOffsets]);

  // Step 2: Prepare bone bindings and dual-bone LBS skinned muscles
  const { boneBindings, muscleBindings } = useMemo(() => {
    const bones: BoneBinding[] = [];
    const muscles: MuscleBinding[] = [];
    const [cx, minY, cz] = calibration.centerOffset;
    const s = calibration.modelScale;

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const { kind, jointId } = parseMeshClassification(obj.name);

      if (kind === 'muscle') {
        const { originJoint, insertionJoint } = resolveMuscleBonePair(obj.name, jointId);
        const skinned = prepareSkinnedMuscle(obj, originJoint, insertionJoint, calibration);
        muscles.push({
          name: obj.name,
          jointId,
          skinned,
        });
      } else {
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

    return { boneBindings: bones, muscleBindings: muscles };
  }, [scene, calibration]);

  useEffect(() => {
    const ok = boneBindings.length > 0 || muscleBindings.length > 0;
    onReady(ok);
    if (ok) {
      setModelStatus({ state: 'loaded' });
    } else {
      setModelStatus({ state: 'error', message: '模型中無有效網格' });
    }
    return () => onReady(false);
  }, [boneBindings.length, muscleBindings.length, onReady, setModelStatus]);

  // Step 3: Update only muscles whose origin or insertion joint transform changed
  const prevJointSigRef = useMemo(() => new Map<number, string>(), []);
  const stretchRatios = useMemo(() => {
    const ratios = new Array<number>(muscleBindings.length);
    for (let i = 0; i < muscleBindings.length; i++) {
      const m = muscleBindings[i];
      const jO = kinematics.joints[m.skinned.originJoint];
      const jI = kinematics.joints[m.skinned.insertionJoint];
      const sig = `${jO.worldPosition[0].toFixed(4)},${jO.worldPosition[1].toFixed(4)},${jO.worldQuaternion[0].toFixed(4)},${jO.worldQuaternion[1].toFixed(4)},${jI.worldPosition[0].toFixed(4)},${jI.worldPosition[1].toFixed(4)},${jI.worldQuaternion[0].toFixed(4)},${jI.worldQuaternion[1].toFixed(4)},${heightM}`;
      if (prevJointSigRef.get(i) !== sig) {
        prevJointSigRef.set(i, sig);
        ratios[i] = updateSkinnedMuscleVertices(m.skinned, kinematics, heightM);
      } else {
        ratios[i] = 1;
      }
    }
    return ratios;
  }, [muscleBindings, kinematics, heightM, prevJointSigRef]);

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
              !activeMacroSet.has(m.skinned.originJoint) &&
              !activeMacroSet.has(m.skinned.insertionJoint)
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

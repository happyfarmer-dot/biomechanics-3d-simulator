import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Color,
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import {
  DEFAULT_HEIGHT_M,
  JOINT_ORDER,
  SKELETON_CONFIG,
} from '../../data/skeletonConfig';
import { calibrateSkeletonFromScene } from '../../engine/calibrateSkeleton';
import {
  applyGpuDqsToMaterial,
  createGpuDqsUniforms,
  updateGpuDqsUniforms,
} from '../../engine/gpuDqsShader';
import { computeClavicleWorldState } from '../../engine/kinematics';
import {
  buildJointDualQuaternions,
  classifyMeshZone,
  findNearestBoneJointInZone,
  isMicroDebrisMesh,
  prepareAutoSkinnedMuscle,
  type SkinnedMuscleData,
} from '../../engine/muscleSkinning';
import {
  buildMuscleStrainSummary,
  computeActiveTensionScore,
  computeMuscleStrainFromDqsTable,
  createMuscleStrainTracker,
  getStrainHeatmapVisual,
  type MuscleStrainTracker,
} from '../../engine/muscleStrainTracker';
import { runRigIntegrityCheck } from '../../engine/rigIntegrityCheck';
import { useSimStore } from '../../store/useSimStore';
import type { JointId, RiskSeverity, Vec3 } from '../../types/biomechanics';
import {
  createIndependentZAnatomyMuscleMaterial,
  getSkinFresnelMaterial,
  getZAnatomyBoneMaterial,
} from '../../utils/anatomyTextures';

const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;
useGLTF.setDecoderPath(DRACO_PATH);

const DEFAULT_GLB_URL = `${import.meta.env.BASE_URL}models/anatomy_rigged.glb`;

const CLAVICLE_SCAPULA_KEYWORDS = ['clavicle', 'clavicula', 'scapula', 'acromion', 'coracoid'];

const DEEP_INTERNAL_KEYWORDS = [
  'intercostal',
  'diaphragm',
  'transversus',
  'multifidus',
  'rotatores',
  'interspinal',
  'intertransvers',
  'obturator',
  'gemellus',
  'piriformis',
  'popliteus',
  'supinator',
  'pronator_quadratus',
  'subscapularis',
  'pectoralis_minor',
  'iliacus',
  'psoas',
  'quadratus_lumborum',
  'scalene',
  'longus_colli',
  'longus_capitis',
  'vastus_intermedius',
  'ligament',
  'capsule',
  'tendon_sheath',
  'bursa',
  'membrane',
  'fascia',
  'cartilage',
  'meniscus',
  'disc',
  'lumbrical',
  'interosse',
];

function isSuperficialSkinMesh(name: string): boolean {
  const nl = name.toLowerCase();
  return !DEEP_INTERNAL_KEYWORDS.some((kw) => nl.includes(kw));
}

function isExtremityOrHeadBone(jointId: JointId): boolean {
  return (
    jointId === 'head' ||
    jointId === 'wrist_L' ||
    jointId === 'wrist_R' ||
    jointId === 'ankle_L' ||
    jointId === 'ankle_R'
  );
}

const NOOP_RAYCAST = () => null;
const UP_AXIS = new Vector3(0, 1, 0);

interface BoneBinding {
  kind: 'bone' | 'skin';
  mesh: Mesh;
  jointId: JointId;
  clavicleSide?: 'L' | 'R';
  localOffset: Vec3;
  modelScale: number;
}

interface MuscleBinding {
  name: string;
  jointId: JointId;
  superficial: boolean;
  skinned: SkinnedMuscleData;
  tracker: MuscleStrainTracker;
  material: MeshStandardMaterial;
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
  const pose = useSimStore((s) => s.pose);
  const kinematics = useSimStore((s) => s.kinematics);
  const loads = useSimStore((s) => s.loads);
  const heightM = useSimStore((s) => s.heightM);
  const layers = useSimStore((s) => s.layers);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const muscleEffectMode = useSimStore((s) => s.muscleEffectMode);
  const muscleStrainSubMode = useSimStore((s) => s.muscleStrainSubMode);
  const setModelStatus = useSimStore((s) => s.setModelStatus);
  const setCalibratedOffsets = useSimStore((s) => s.setCalibratedOffsets);
  const setIntegrityReport = useSimStore((s) => s.setIntegrityReport);
  const setMuscleStrainSummary = useSimStore((s) => s.setMuscleStrainSummary);
  const skinOpacity = useSimStore((s) => s.skinOpacity);
  const placeForceAtPoint = useSimStore((s) => s.placeForceAtPoint);
  const selectNearestJointAtPoint = useSimStore((s) => s.selectNearestJointAtPoint);
  const [pointerDownPos, setPointerDownPos] = useState<{ x: number; y: number } | null>(null);

  // Shared GPU DQS uniforms across all muscles & skin shell
  const gpuDqsUniforms = useMemo(() => createGpuDqsUniforms(), []);

  // Shared single MeshPhysicalMaterial instances for skin shell (eliminates 476 duplicate materials!)
  const { skinShellMuscleMaterial, skinShellBoneMaterial } = useMemo(() => {
    const commonOpts = {
      color: '#ddb59b',
      roughness: 0.65,
      metalness: 0.0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: DoubleSide,
    };
    const muscleSkin = new MeshPhysicalMaterial(commonOpts);
    applyGpuDqsToMaterial(muscleSkin, gpuDqsUniforms, 'dqs_skin_v1');
    const boneSkin = new MeshPhysicalMaterial(commonOpts);
    return { skinShellMuscleMaterial: muscleSkin, skinShellBoneMaterial: boneSkin };
  }, [gpuDqsUniforms]);

  useEffect(() => {
    skinShellMuscleMaterial.opacity = skinOpacity;
    skinShellBoneMaterial.opacity = skinOpacity;
  }, [skinOpacity, skinShellMuscleMaterial, skinShellBoneMaterial]);

  // Step 0: Bake any negative mirror scale into geometry BEFORE calibration
  useMemo(() => {
    scene.updateMatrixWorld(true);
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
    });
    scene.updateMatrixWorld(true);
  }, [scene]);

  // Step 1: Calibrate real anatomical joint centers from GLB bone bounding boxes
  const calibration = useMemo(() => calibrateSkeletonFromScene(scene), [scene]);

  useEffect(() => {
    setCalibratedOffsets(calibration.offsets);
    return () => setCalibratedOffsets(null);
  }, [calibration, setCalibratedOffsets]);

  // Step 2: 100% Spatial Partitioning + GPU DQS Muscle Preparation + Clavicle/Scapula Binding
  const { boneBindings, muscleBindings, unassignedMeshCount } = useMemo(() => {
    const bones: BoneBinding[] = [];
    const muscles: MuscleBinding[] = [];
    const [cx, minY, cz] = calibration.centerOffset;
    const s = calibration.modelScale;
    let unassigned = 0;

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      if (isMicroDebrisMesh(obj, calibration)) {
        obj.visible = false;
        return;
      }
      const nl = obj.name.toLowerCase();
      const zone = classifyMeshZone(obj, calibration);

      if (nl.startsWith('muscle__') || nl.includes('muscle')) {
        const skinned = prepareAutoSkinnedMuscle(obj, zone, calibration);
        const tracker = createMuscleStrainTracker(skinned);
        const material = createIndependentZAnatomyMuscleMaterial();
        applyGpuDqsToMaterial(material, gpuDqsUniforms, 'dqs_muscle_v1');
        muscles.push({
          name: obj.name,
          jointId: skinned.primaryJoint,
          superficial: isSuperficialSkinMesh(obj.name),
          skinned,
          tracker,
          material,
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

        // Bind clavicle & scapula bones to scapulohumeral rhythm virtual nodes
        const isClavicleOrScapula =
          kind === 'bone' && CLAVICLE_SCAPULA_KEYWORDS.some((kw) => nl.includes(kw));
        let clavicleSide: 'L' | 'R' | undefined;
        let restAnchor: Vec3 = calibration.restPositions[jointId];

        if (isClavicleOrScapula) {
          clavicleSide = normX >= 0 ? 'L' : 'R';
          const shRest = calibration.restPositions[`shoulder_${clavicleSide}` as JointId];
          const sign = clavicleSide === 'L' ? 1 : -1;
          restAnchor = [sign * 0.025, shRest[1] + 0.015, shRest[2] + 0.02];
        }

        bones.push({
          kind,
          mesh: cloned,
          jointId,
          clavicleSide,
          localOffset: [normX - restAnchor[0], normY - restAnchor[1], normZ - restAnchor[2]],
          modelScale: s,
        });
      }
    });

    return { boneBindings: bones, muscleBindings: muscles, unassignedMeshCount: unassigned };
  }, [scene, calibration, gpuDqsUniforms]);

  useEffect(() => {
    console.info(
      `[Z-Anatomy] Loaded ${boneBindings.length} bones, ${muscleBindings.length} GPU-DQS muscles, unassignedMeshCount === ${unassignedMeshCount}`
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

  const hScale = heightM / DEFAULT_HEIGHT_M;

  // Step 3: Update GPU DQS uniforms & compute anchor-only muscle strains (NO full-mesh CPU vertex overwrite!)
  const strainsRef = useRef<Float32Array>(new Float32Array(0));
  const stretchRatiosRef = useRef<Float32Array>(new Float32Array(0));

  const { stretchRatios, strains, clavLState, clavRState } = useMemo(() => {
    updateGpuDqsUniforms(gpuDqsUniforms, kinematics, calibration.restPositions, hScale, pose);
    buildJointDualQuaternions(kinematics, calibration.restPositions, hScale, pose);

    const clavL = computeClavicleWorldState(
      'L',
      pose,
      kinematics.joints.thorax,
      calibration.restPositions.shoulder_L,
      calibration.restPositions.thorax,
      hScale
    );
    const clavR = computeClavicleWorldState(
      'R',
      pose,
      kinematics.joints.thorax,
      calibration.restPositions.shoulder_R,
      calibration.restPositions.thorax,
      hScale
    );

    if (strainsRef.current.length !== muscleBindings.length) {
      strainsRef.current = new Float32Array(muscleBindings.length);
      stretchRatiosRef.current = new Float32Array(muscleBindings.length).fill(1);
    }
    const ratios = stretchRatiosRef.current;
    const curStrains = strainsRef.current;

    for (let i = 0; i < muscleBindings.length; i++) {
      const m = muscleBindings[i];
      curStrains[i] = computeMuscleStrainFromDqsTable(m.tracker, m.skinned, heightM);
      const jO = kinematics.joints[m.skinned.primaryJoint];
      const jI = kinematics.joints[m.skinned.secondaryJoint];
      const curLen = Math.hypot(
        jI.worldPosition[0] - jO.worldPosition[0],
        jI.worldPosition[1] - jO.worldPosition[1],
        jI.worldPosition[2] - jO.worldPosition[2]
      );
      ratios[i] = curLen / Math.max(m.skinned.restLength * hScale, 0.05);
    }

    return { stretchRatios: ratios, strains: curStrains, clavLState: clavL, clavRState: clavR };
  }, [muscleBindings, kinematics, heightM, hScale, pose, calibration.restPositions, gpuDqsUniforms]);

  // Display metric for heatmap (geometric strain vs active tension)
  const displayMetrics = useMemo(() => {
    const out = new Float32Array(muscleBindings.length);
    for (let i = 0; i < muscleBindings.length; i++) {
      const gStrain = strains[i] ?? 0;
      out[i] =
        muscleStrainSubMode === 'activeTension'
          ? computeActiveTensionScore(gStrain, loads[muscleBindings[i].jointId])
          : gStrain;
    }
    return out;
  }, [muscleBindings, strains, muscleStrainSubMode, loads]);

  // Sync top contracting & stretching summary to store when heatmap mode is active
  useEffect(() => {
    if (muscleEffectMode !== 'strain') return;
    const entries: Array<{ zhName: string; name: string; strain: number }> = [];
    for (let i = 0; i < muscleBindings.length; i++) {
      const t = muscleBindings[i].tracker;
      if (t.skip) continue;
      entries.push({
        name: t.name,
        zhName: t.zhName,
        strain: displayMetrics[i] ?? 0,
      });
    }
    setMuscleStrainSummary(buildMuscleStrainSummary(entries));
  }, [muscleEffectMode, muscleBindings, displayMetrics, setMuscleStrainSummary]);

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

  const tmpColor = useMemo(() => new Color(), []);
  const tmpEmissive = useMemo(() => new Color(), []);

  // Subtle breathing pulse for overstretched (> 30%) muscles in strain heatmap mode
  useFrame(({ clock }) => {
    if (muscleEffectMode !== 'strain') return;
    const phase = clock.getElapsedTime() * 4.5;
    const pulse = 0.5 + 0.5 * Math.sin(phase);
    for (let i = 0; i < muscleBindings.length; i++) {
      if ((displayMetrics[i] ?? 0) > 0.3) {
        muscleBindings[i].material.emissiveIntensity = 0.45 + 0.18 * pulse;
      }
    }
  });

  // Lightweight proxy colliders along each bone segment so clicking/applying force works accurately with GPU DQS
  const proxySegments = useMemo(() => {
    const start = new Vector3();
    const end = new Vector3();
    const dir = new Vector3();
    const mid = new Vector3();
    const quat = new Quaternion();

    return JOINT_ORDER.map((jId) => {
      const j = kinematics.joints[jId];
      start.set(...j.worldPosition);
      end.set(...j.distalWorldPosition);
      dir.subVectors(end, start);
      const len = Math.max(dir.length(), 0.05);
      mid.addVectors(start, end).multiplyScalar(0.5);
      if (dir.lengthSq() > 1e-6) {
        quat.setFromUnitVectors(UP_AXIS, dir.normalize());
      } else {
        quat.identity();
      }
      const radius = Math.max(0.028, SKELETON_CONFIG[jId].boneRadius * 1.45 * hScale);
      return {
        jointId: jId,
        position: [mid.x, mid.y, mid.z] as Vec3,
        quaternion: [quat.x, quat.y, quat.z, quat.w] as [number, number, number, number],
        length: len,
        radius,
      };
    });
  }, [kinematics, hScale]);

  const handleSurfaceClick = (
    jointId: JointId,
    e: { stopPropagation: () => void; point: Vector3; nativeEvent: MouseEvent }
  ) => {
    if (
      pointerDownPos &&
      Math.hypot(e.nativeEvent.clientX - pointerDownPos.x, e.nativeEvent.clientY - pointerDownPos.y) >= 6
    ) {
      return;
    }
    e.stopPropagation();
    if (interactionMode === 'force') {
      placeForceAtPoint(jointId, [e.point.x, e.point.y, e.point.z]);
    } else {
      selectNearestJointAtPoint([e.point.x, e.point.y, e.point.z]);
    }
  };

  return (
    <group
      name="real-zanatomy-model"
      onPointerDown={(e) => {
        setPointerDownPos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }}
    >
      {/* Bones attached to calibrated joints (clavicle/scapula driven by scapulohumeral rhythm) */}
      {boneBindings.map((b, idx) => {
        if (b.kind === 'skin' && !layers.skin) return null;
        if (b.kind === 'bone' && !layers.skeleton) return null;

        const clavState =
          b.clavicleSide === 'L' ? clavLState : b.clavicleSide === 'R' ? clavRState : null;
        const j = kinematics.joints[b.jointId];
        const worldPosition = clavState ? clavState.worldPosition : j.worldPosition;
        const worldQuaternion = clavState ? clavState.worldQuaternion : j.worldQuaternion;

        const isGhosted = Boolean(activeMacroSet && !activeMacroSet.has(b.jointId));
        const material =
          b.kind === 'skin'
            ? getSkinFresnelMaterial(isGhosted)
            : getZAnatomyBoneMaterial(isGhosted);

        return (
          <group
            key={`bone_${b.mesh.name}_${idx}`}
            position={worldPosition}
            quaternion={worldQuaternion}
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
              onClick={(e: { stopPropagation: () => void; point: Vector3; nativeEvent: MouseEvent }) =>
                handleSurfaceClick(b.jointId, e)
              }
            />
          </group>
        );
      })}

      {/* GPU Dual-Quaternion Skinned Muscles */}
      {layers.muscles &&
        muscleBindings.map((m, idx) => {
          const isGhosted = Boolean(
            activeMacroSet &&
              m.skinned.usedJoints.every((jid) => !activeMacroSet.has(jid))
          );
          let isMacroTranslucent = false;
          if (focusedJointId && !isGhosted) {
            const fp = calibration.restPositions[focusedJointId];
            const mc = m.skinned.restCenter;
            const dist = Math.hypot(mc[0] - fp[0], mc[1] - fp[1], mc[2] - fp[2]);
            if (dist < 0.25) {
              isMacroTranslucent = true;
            }
          }

          const mat = m.material;
          const isTransparent = isGhosted || isMacroTranslucent;
          mat.transparent = isTransparent;
          mat.opacity = isGhosted ? 0.14 : isMacroTranslucent ? 0.22 : 1;
          mat.depthWrite = !isTransparent;

          if (muscleEffectMode === 'strain') {
            const metric = displayMetrics[idx] ?? 0;
            const vis = getStrainHeatmapVisual(metric, tmpColor, tmpEmissive, 0);
            mat.color.copy(vis.color);
            mat.emissive.copy(vis.emissive);
            mat.emissiveIntensity = vis.emissiveIntensity;
          } else {
            const stretch = stretchRatios[idx] ?? 1;
            const jointRisk = jointRiskMap[m.jointId];
            let status: RiskSeverity = jointRisk;
            if (stretch > 1.3) status = 'critical';
            else if (stretch > 1.15 && status === 'normal') status = 'warning';

            mat.color.set('#8f3d37');
            if (status === 'critical') {
              mat.emissive.set('#dc2626');
              mat.emissiveIntensity = 0.4;
            } else if (status === 'warning') {
              mat.emissive.set('#d97706');
              mat.emissiveIntensity = 0.3;
            } else {
              mat.emissive.set('#000000');
              mat.emissiveIntensity = 0;
            }
          }

          return (
            <mesh
              key={`muscle_${m.name}_${idx}`}
              geometry={m.skinned.geometry}
              material={mat}
              frustumCulled={false}
              raycast={NOOP_RAYCAST}
              visible
            />
          );
        })}

      {/* Lightweight Proxy Colliders for accurate click-to-select & click-to-apply-force under GPU DQS */}
      {proxySegments.map((seg) => (
        <mesh
          key={`proxy_${seg.jointId}`}
          position={seg.position}
          quaternion={seg.quaternion}
          onClick={(e) => handleSurfaceClick(seg.jointId, e)}
        >
          <capsuleGeometry args={[seg.radius, Math.max(0.01, seg.length - seg.radius), 4, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ))}

      {/* Smooth Anatomical Skin Shell: single shared GPU-DQS material on superficial muscles + skull/hands/feet */}
      {layers.skin && (
        <>
          {muscleBindings.map((m, idx) => {
            if (!m.superficial) return null;
            const isGhosted = Boolean(
              activeMacroSet &&
                m.skinned.usedJoints.every((jid) => !activeMacroSet.has(jid))
            );
            if (isGhosted) return null;
            return (
              <mesh
                key={`skin_shell_${m.name}_${idx}`}
                geometry={m.skinned.geometry}
                material={skinShellMuscleMaterial}
                frustumCulled={false}
                raycast={NOOP_RAYCAST}
              />
            );
          })}
          {boneBindings.map((b, idx) => {
            if (b.kind !== 'bone' || !isExtremityOrHeadBone(b.jointId)) return null;
            const isGhosted = Boolean(activeMacroSet && !activeMacroSet.has(b.jointId));
            if (isGhosted) return null;
            const j = kinematics.joints[b.jointId];
            return (
              <group
                key={`skin_bone_${b.mesh.name}_${idx}`}
                position={j.worldPosition}
                quaternion={j.worldQuaternion}
              >
                <mesh
                  geometry={b.mesh.geometry}
                  material={skinShellBoneMaterial}
                  position={[
                    b.localOffset[0] * hScale,
                    b.localOffset[1] * hScale,
                    b.localOffset[2] * hScale,
                  ]}
                  scale={[
                    b.modelScale * hScale * 1.018,
                    b.modelScale * hScale * 1.018,
                    b.modelScale * hScale * 1.018,
                  ]}
                  raycast={NOOP_RAYCAST}
                />
              </group>
            );
          })}
        </>
      )}
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

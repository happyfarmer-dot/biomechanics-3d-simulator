import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box3, Mesh, Quaternion, Vector3 } from 'three';
import { createNeutralPose, JOINT_ORDER, SKELETON_CONFIG } from '../../data/skeletonConfig';
import { computeKinematics, localEulerToQuaternion } from '../../engine/kinematics';
import { useSimStore } from '../../store/useSimStore';
import type { JointId, Vec3 } from '../../types/biomechanics';
import {
  getSkinFresnelMaterial,
  getZAnatomyBoneMaterial,
  getZAnatomyMuscleMaterial,
} from '../../utils/anatomyTextures';

// Configure local Draco decoder (offline & GitHub Pages compatible)
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;
useGLTF.setDecoderPath(DRACO_PATH);

const DEFAULT_GLB_URL = `${import.meta.env.BASE_URL}models/anatomy_rigged.glb`;
const VALID_JOINT_IDS = new Set<string>(JOINT_ORDER);

interface RealAnatomyBinding {
  mesh: Mesh;
  kind: 'bone' | 'muscle' | 'skin';
  jointId: JointId;
  /** Local offset relative to the rest-pose joint center (m) */
  localOffset: Vec3;
  /** Uniform scale factor applied to mesh geometry */
  modelScale: number;
}

function parseMeshClassification(name: string): {
  kind: 'bone' | 'muscle' | 'skin';
  jointId: JointId;
} {
  // Primary convention from scripts/prepare_zanatomy.py:
  //   BONE__<jointId>__<origName>
  //   MUSCLE__<jointId>__<origName>
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

  // Fallback heuristic for custom .glb files
  const lower = name.toLowerCase();
  const isL = lower.includes('_l') || lower.includes('left');
  const isR = lower.includes('_r') || lower.includes('right');
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
  const setModelStatus = useSimStore((s) => s.setModelStatus);

  const bindings = useMemo<RealAnatomyBinding[]>(() => {
    scene.updateMatrixWorld(true);
    const overallBox = new Box3().setFromObject(scene);
    const size = new Vector3();
    const center = new Vector3();
    overallBox.getSize(size);
    overallBox.getCenter(center);

    const modelScale = size.y > 1e-4 ? heightM / size.y : 1;
    const minY = overallBox.min.y;
    const neutralKin = computeKinematics(createNeutralPose(), heightM);

    const list: RealAnatomyBinding[] = [];
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const { kind, jointId } = parseMeshClassification(obj.name);
      const cloned = obj.clone();

      const worldPos = new Vector3();
      obj.getWorldPosition(worldPos);
      const normX = (worldPos.x - center.x) * modelScale;
      const normY = (worldPos.y - minY) * modelScale;
      const normZ = (worldPos.z - center.z) * modelScale;

      const jRest = neutralKin.joints[jointId].worldPosition;
      const localOffset: Vec3 = [
        normX - jRest[0],
        normY - jRest[1],
        normZ - jRest[2],
      ];

      list.push({
        mesh: cloned,
        kind,
        jointId,
        localOffset,
        modelScale,
      });
    });
    return list;
  }, [scene, heightM]);

  useEffect(() => {
    const ok = bindings.length > 0;
    onReady(ok);
    if (ok) {
      setModelStatus({ state: 'loaded' });
    } else {
      setModelStatus({ state: 'error', message: '模型中無有效網格' });
    }
    return () => onReady(false);
  }, [bindings.length, onReady, setModelStatus]);

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

  return (
    <group name="real-zanatomy-model">
      {bindings.map((b, idx) => {
        if (b.kind === 'skin' && !layers.skin) return null;
        if (b.kind === 'bone' && !layers.skeleton) return null;
        if (b.kind === 'muscle' && !layers.muscles) return null;

        const j = kinematics.joints[b.jointId];
        const isGhosted = Boolean(activeMacroSet && !activeMacroSet.has(b.jointId));
        const risk = jointRiskMap[b.jointId];

        let groupQuat = j.worldQuaternion;
        if (b.kind === 'muscle') {
          b.mesh.visible = true;
          const lower = b.mesh.name.toLowerCase();
          let distalId: JointId | null = null;
          if (
            b.jointId.startsWith('shoulder_') &&
            (lower.includes('biceps') || lower.includes('triceps'))
          ) {
            distalId = (b.jointId === 'shoulder_L' ? 'elbow_L' : 'elbow_R') as JointId;
          } else if (
            b.jointId.startsWith('hip_') &&
            ['rectus_femoris', 'rectus femoris', 'quadriceps', 'hamstring', 'biceps_femoris', 'biceps femoris', 'semitendinosus', 'semimembranosus', 'sartorius', 'gracilis'].some((k) =>
              lower.includes(k)
            )
          ) {
            distalId = (b.jointId === 'hip_L' ? 'knee_L' : 'knee_R') as JointId;
          }

          if (distalId) {
            const distalLocal = localEulerToQuaternion(kinematics.joints[distalId].localEuler);
            const partial = new Quaternion().slerp(distalLocal, 0.35);
            const q = new Quaternion(...j.worldQuaternion).multiply(partial);
            groupQuat = [q.x, q.y, q.z, q.w];
          }
        }

        const material =
          b.kind === 'skin'
            ? getSkinFresnelMaterial(isGhosted)
            : b.kind === 'muscle'
            ? getZAnatomyMuscleMaterial(risk, isGhosted)
            : getZAnatomyBoneMaterial(isGhosted);

        return (
          <group
            key={`${b.mesh.name}_${idx}`}
            position={j.worldPosition}
            quaternion={groupQuat}
          >
            <primitive
              object={b.mesh}
              position={b.localOffset}
              scale={[b.modelScale, b.modelScale, b.modelScale]}
              material={material}
              castShadow={!isGhosted && b.kind !== 'skin'}
            />
          </group>
        );
      })}
    </group>
  );
}

/**
 * Non-blocking external Z-Anatomy GLB loader for ./models/anatomy_rigged.glb.
 * Reports explicit load status to TopBar and falls back to procedural anatomy on error.
 */
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

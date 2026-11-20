import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Mesh } from 'three';
import { useSimStore } from '../../store/useSimStore';
import type { JointId } from '../../types/biomechanics';
import {
  getBoneMaterial,
  getMuscleMaterial,
  getSkinFresnelMaterial,
} from '../../utils/anatomyTextures';

const DEFAULT_GLB_URL = `${import.meta.env.BASE_URL}models/anatomy_rigged.glb`;

interface GlbMeshBinding {
  mesh: Mesh;
  kind: 'bone' | 'muscle' | 'skin';
  jointId: JointId;
}

function resolveJointFromName(name: string): JointId {
  const lower = name.toLowerCase();
  const isL = lower.includes('_l') || lower.includes('left');
  const isR = lower.includes('_r') || lower.includes('right');
  const side = isL ? '_L' : isR ? '_R' : '';

  if (lower.includes('femur') || lower.includes('quad') || lower.includes('hamstring') || lower.includes('glute')) {
    return (`hip${side || '_R'}`) as JointId;
  }
  if (lower.includes('tibia') || lower.includes('fibula') || lower.includes('patella') || lower.includes('gastroc') || lower.includes('soleus')) {
    return (`knee${side || '_R'}`) as JointId;
  }
  if (lower.includes('foot') || lower.includes('talus') || lower.includes('ankle')) {
    return (`ankle${side || '_R'}`) as JointId;
  }
  if (lower.includes('humerus') || lower.includes('deltoid') || lower.includes('biceps') || lower.includes('triceps')) {
    return (`shoulder${side || '_R'}`) as JointId;
  }
  if (lower.includes('radius') || lower.includes('ulna') || lower.includes('forearm')) {
    return (`elbow${side || '_R'}`) as JointId;
  }
  if (lower.includes('hand') || lower.includes('wrist')) {
    return (`wrist${side || '_R'}`) as JointId;
  }
  if (lower.includes('skull') || lower.includes('head') || lower.includes('mandible')) return 'head';
  if (lower.includes('neck') || lower.includes('cervical')) return 'neck';
  if (lower.includes('lumbar') || lower.includes('erector')) return 'lumbar';
  if (lower.includes('thorax') || lower.includes('rib') || lower.includes('sternum') || lower.includes('pectoralis')) return 'thorax';
  return 'pelvis';
}

class GlbSilentBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function GlbRiggedModel({
  url,
  onReady,
}: {
  url: string;
  onReady: (loaded: boolean) => void;
}) {
  const { scene } = useGLTF(url);
  const kinematics = useSimStore((s) => s.kinematics);
  const layers = useSimStore((s) => s.layers);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);

  const bindings = useMemo<GlbMeshBinding[]>(() => {
    const list: GlbMeshBinding[] = [];
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const n = obj.name.toLowerCase();
      const cloned = obj.clone();
      let kind: GlbMeshBinding['kind'] = 'bone';
      if (n.includes('skin')) kind = 'skin';
      else if (n.includes('muscle')) kind = 'muscle';
      list.push({
        mesh: cloned,
        kind,
        jointId: resolveJointFromName(obj.name),
      });
    });
    return list;
  }, [scene]);

  useEffect(() => {
    onReady(bindings.length > 0);
    return () => onReady(false);
  }, [bindings.length, onReady]);

  return (
    <group name="external-glb-anatomy">
      {bindings.map((b, idx) => {
        if (b.kind === 'skin' && !layers.skin) return null;
        if (b.kind === 'bone' && !layers.skeleton) return null;
        if (b.kind === 'muscle' && !layers.muscles) return null;

        const j = kinematics.joints[b.jointId];
        const isGhosted = Boolean(focusedJointId && focusedJointId !== b.jointId);
        const risk = jointRiskMap[b.jointId];

        const material =
          b.kind === 'skin'
            ? getSkinFresnelMaterial(isGhosted)
            : b.kind === 'muscle'
            ? getMuscleMaterial(risk, isGhosted)
            : getBoneMaterial(isGhosted);

        return (
          <primitive
            key={`${b.mesh.name}_${idx}`}
            object={b.mesh}
            position={j.worldPosition}
            quaternion={j.worldQuaternion}
            material={material}
          />
        );
      })}
    </group>
  );
}

/**
 * Non-blocking external GLB loader for /models/anatomy_rigged.glb.
 * Silently falls back to procedural anatomy if the file is absent.
 */
export function GlbAnatomyLoader({
  url = DEFAULT_GLB_URL,
  onExternalActive,
}: {
  url?: string;
  onExternalActive?: (active: boolean) => void;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url, { method: 'HEAD' })
      .then((res) => {
        if (cancelled) return;
        const ct = res.headers.get('content-type') ?? '';
        const isValidGlb = res.ok && !ct.includes('text/html');
        setAvailable(isValidGlb);
        if (!isValidGlb) onExternalActive?.(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false);
          onExternalActive?.(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, onExternalActive]);

  if (!available) return null;

  return (
    <GlbSilentBoundary onError={() => onExternalActive?.(false)}>
      <Suspense fallback={null}>
        <GlbRiggedModel url={url} onReady={(ok) => onExternalActive?.(ok)} />
      </Suspense>
    </GlbSilentBoundary>
  );
}

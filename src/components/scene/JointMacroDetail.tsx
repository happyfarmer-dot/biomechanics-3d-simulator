import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import { JOINT_MACRO_ANATOMY } from '../../data/jointMacroAnatomy';
import { useSimStore } from '../../store/useSimStore';
import type { RiskSeverity, SoftTissueDef } from '../../types/biomechanics';

const UP = new Vector3(0, 1, 0);

const RISK_COLORS: Record<RiskSeverity, { color: string; emissive: string; intensity: number }> = {
  normal: { color: '#38bdf8', emissive: '#0284c7', intensity: 0.45 },
  warning: { color: '#facc15', emissive: '#ca8a04', intensity: 0.75 },
  critical: { color: '#ef4444', emissive: '#dc2626', intensity: 1.05 },
};

function SoftTissueMesh({
  def,
  status,
  scale,
}: {
  def: SoftTissueDef;
  status: RiskSeverity;
  scale: number;
}) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const p0 = new Vector3(...def.localStart).multiplyScalar(scale * 0.72);
    const p1 = new Vector3(...def.localEnd).multiplyScalar(scale * 0.72);
    const diff = p1.clone().sub(p0);
    const len = Math.max(diff.length(), 0.004);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(UP, diff.normalize());
    return {
      midpoint: [mid.x, mid.y, mid.z] as [number, number, number],
      length: len,
      quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
    };
  }, [def, scale]);

  const style = RISK_COLORS[status];
  const r = def.radius * scale * 0.58;

  return (
    <group position={midpoint} quaternion={quaternion}>
      {def.shape === 'disc' ? (
        <group>
          {/* Delicate glowing mechanical force ring inside joint cavity */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[Math.min(r * 1.4, 0.018 * scale), 0.0022 * scale, 10, 28]} />
            <meshStandardMaterial
              color={style.color}
              emissive={style.emissive}
              emissiveIntensity={style.intensity}
              roughness={0.25}
              transparent
              opacity={0.72}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <cylinderGeometry args={[Math.min(r * 0.85, 0.012 * scale), Math.min(r * 0.85, 0.012 * scale), Math.min(length * 0.65, 0.014 * scale), 18]} />
            <meshStandardMaterial
              color={style.color}
              emissive={style.emissive}
              emissiveIntensity={style.intensity * 0.5}
              roughness={0.35}
              transparent
              opacity={0.38}
              depthWrite={false}
            />
          </mesh>
        </group>
      ) : def.shape === 'meniscus' ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 0.85, r * 0.28, 10, 20, Math.PI * 1.25]} />
          <meshStandardMaterial
            color={style.color}
            emissive={style.emissive}
            emissiveIntensity={style.intensity}
            roughness={0.3}
            transparent
            opacity={0.62}
            depthWrite={false}
          />
        </mesh>
      ) : (
        <mesh>
          <capsuleGeometry args={[Math.min(r * 0.65, 0.0045 * scale), Math.max(length * 0.65, 0.004), 8, 12]} />
          <meshStandardMaterial
            color={style.color}
            emissive={style.emissive}
            emissiveIntensity={style.intensity}
            roughness={0.3}
            transparent
            opacity={0.65}
            depthWrite={false}
          />
        </mesh>
      )}

      {status !== 'normal' && (
        <Html position={[0, 0, 0]} center distanceFactor={0.85} style={{ pointerEvents: 'none' }}>
          <div
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold shadow border ${
              status === 'critical'
                ? 'bg-red-950/90 text-red-200 border-red-500/60'
                : 'bg-amber-950/90 text-amber-200 border-amber-500/60'
            }`}
          >
            {def.id}
          </div>
        </Html>
      )}
    </group>
  );
}

export function JointMacroDetail() {
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const showMacro = useSimStore((s) => s.layers.macroLigaments);
  const kinematics = useSimStore((s) => s.kinematics);
  const focusedSoftTissues = useSimStore((s) => s.focusedSoftTissues);
  const heightM = useSimStore((s) => s.heightM);

  if (!focusedJointId || !showMacro) return null;

  const defs = JOINT_MACRO_ANATOMY[focusedJointId];
  if (!defs) return null;

  const j = kinematics.joints[focusedJointId];
  const scale = heightM / 1.75;

  return (
    <group position={j.worldPosition} quaternion={j.worldQuaternion} name="joint-macro-detail">
      {defs.map((def) => {
        const load = focusedSoftTissues.find((t) => t.id === def.id);
        return (
          <SoftTissueMesh
            key={def.id}
            def={def}
            status={load?.status ?? 'normal'}
            scale={scale}
          />
        );
      })}
    </group>
  );
}

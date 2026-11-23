import { Html, Line } from '@react-three/drei';
import { Vector3 } from 'three';
import { useSimStore } from '../../store/useSimStore';
import type { Vec3 } from '../../types/biomechanics';

export interface MomentArmGeometryResult {
  lineStart: Vec3;
  lineEnd: Vec3;
  footPoint: Vec3;
  momentArmM: number;
  forceMagN: number;
  torqueNm: number;
}

export function computeMomentArmGeometry(
  jointPos: Vec3,
  appPoint: Vec3,
  forceVec: Vec3
): MomentArmGeometryResult | null {
  const f = new Vector3(forceVec[0], forceVec[1], forceVec[2]);
  const fMag = f.length();
  if (fMag < 1e-3) return null;

  const dir = f.clone().divideScalar(fMag);
  const j = new Vector3(jointPos[0], jointPos[1], jointPos[2]);
  const p = new Vector3(appPoint[0], appPoint[1], appPoint[2]);

  const pj = j.clone().sub(p);
  const tProj = pj.dot(dir);
  const foot = p.clone().addScaledVector(dir, tProj);
  const momentArmM = j.distanceTo(foot);
  const torqueNm = fMag * momentArmM;

  const lineStart = p.clone().addScaledVector(dir, -0.45);
  const lineEnd = p.clone().addScaledVector(dir, 0.45);

  return {
    lineStart: [lineStart.x, lineStart.y, lineStart.z],
    lineEnd: [lineEnd.x, lineEnd.y, lineEnd.z],
    footPoint: [foot.x, foot.y, foot.z],
    momentArmM,
    forceMagN: fMag,
    torqueNm,
  };
}

export function MomentArmOverlay() {
  const forces = useSimStore((s) => s.forces);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const kinematics = useSimStore((s) => s.kinematics);
  const dynamicLoadFactor = useSimStore((s) => s.dynamicLoadFactor);

  const targetJointId = focusedJointId ?? selectedJoint;
  if (!targetJointId || forces.length === 0) return null;

  const jointState = kinematics.joints[targetJointId];
  if (!jointState) return null;

  // Pick the primary force (preferring one targeting this joint, else first force)
  const primaryForce =
    forces.find((f) => f.targetJoint === targetJointId) ?? forces[0];
  if (!primaryForce) return null;

  const targetParent = kinematics.joints[primaryForce.targetJoint];
  if (!targetParent) return null;

  const p0 = new Vector3(...targetParent.worldPosition);
  const p1 = new Vector3(...targetParent.distalWorldPosition);
  const appPt = p0.lerp(p1, primaryForce.positionRatio);

  const scaledForce: Vec3 = [
    primaryForce.forceVectorWorld[0] * dynamicLoadFactor,
    primaryForce.forceVectorWorld[1] * dynamicLoadFactor,
    primaryForce.forceVectorWorld[2] * dynamicLoadFactor,
  ];

  const geom = computeMomentArmGeometry(
    jointState.worldPosition,
    [appPt.x, appPt.y, appPt.z],
    scaledForce
  );
  if (!geom) return null;

  const midMoment: Vec3 = [
    (jointState.worldPosition[0] + geom.footPoint[0]) * 0.5,
    (jointState.worldPosition[1] + geom.footPoint[1]) * 0.5,
    (jointState.worldPosition[2] + geom.footPoint[2]) * 0.5,
  ];

  return (
    <group>
      {/* 外力作用線 (Line of Action) */}
      <Line
        points={[geom.lineStart, geom.lineEnd]}
        color="#f87171"
        lineWidth={1.5}
        dashed
        dashSize={0.03}
        gapSize={0.02}
        transparent
        opacity={0.75}
      />

      {/* 有效力臂線段 d_perp */}
      {geom.momentArmM > 0.005 && (
        <Line
          points={[jointState.worldPosition, geom.footPoint]}
          color="#facc15"
          lineWidth={2.5}
        />
      )}

      {/* 緊湊 3D 標籤 */}
      <Html position={midMoment} center distanceFactor={2.2} zIndexRange={[10, 0]}>
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-amber-400/60 bg-slate-950/90 px-2 py-0.5 text-[10px] font-mono text-amber-200 shadow-lg backdrop-blur-sm">
          力臂 {(geom.momentArmM * 100).toFixed(1)} cm｜力矩 τ = F × d = {geom.torqueNm.toFixed(0)} N·m
        </div>
      </Html>
    </group>
  );
}

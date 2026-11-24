import { Html, Line } from '@react-three/drei';
import { Vector3 } from 'three';
import { JOINT_ORDER, SKELETON_CONFIG } from '../../data/skeletonConfig';
import { getForceApplicationPoint } from '../../engine/staticsEngine';
import { useSimStore } from '../../store/useSimStore';
import type { JointId, Vec3 } from '../../types/biomechanics';

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
  return computeCombinedMomentArmGeometry(jointPos, [{ position: appPoint, force: forceVec }]);
}

/**
 * Computes the resultant force, net moment, effective moment arm d_perp, and
 * equivalent line of action (wrench axis) for one or more 3D point forces about `jointPos`.
 */
export function computeCombinedMomentArmGeometry(
  jointPos: Vec3,
  pointForces: Array<{ position: Vec3; force: Vec3 }>
): MomentArmGeometryResult | null {
  if (pointForces.length === 0) return null;

  const j = new Vector3(jointPos[0], jointPos[1], jointPos[2]);
  const fTotal = new Vector3(0, 0, 0);
  const tauTotal = new Vector3(0, 0, 0);
  const weightedPos = new Vector3(0, 0, 0);
  let weightSum = 0;

  for (const pf of pointForces) {
    const f = new Vector3(pf.force[0], pf.force[1], pf.force[2]);
    const fm = f.length();
    if (fm < 1e-4) continue;
    const p = new Vector3(pf.position[0], pf.position[1], pf.position[2]);
    fTotal.add(f);
    tauTotal.add(p.clone().sub(j).cross(f));
    weightedPos.addScaledVector(p, fm);
    weightSum += fm;
  }

  const fMag = fTotal.length();
  if (fMag < 1e-3) return null;

  const dir = fTotal.clone().divideScalar(fMag);
  // Perpendicular vector from joint to equivalent line of action: r_perp = (F × τ) / |F|²
  const rPerp = new Vector3().crossVectors(fTotal, tauTotal).divideScalar(fMag * fMag);
  const foot = j.clone().add(rPerp);
  const momentArmM = rPerp.length();
  // Net torque perpendicular to F equals fMag * momentArmM; report total resultant torque magnitude
  const torqueNm = tauTotal.length();

  // Anchor the dashed line of action near the force-weighted application centroid projected onto the wrench axis
  const centerProj =
    weightSum > 1e-6
      ? weightedPos.divideScalar(weightSum).sub(foot).dot(dir)
      : 0;
  const lineCenter = foot.clone().addScaledVector(dir, centerProj);
  const lineStart = lineCenter.clone().addScaledVector(dir, -0.45);
  const lineEnd = lineCenter.clone().addScaledVector(dir, 0.45);

  return {
    lineStart: [lineStart.x, lineStart.y, lineStart.z],
    lineEnd: [lineEnd.x, lineEnd.y, lineEnd.z],
    footPoint: [foot.x, foot.y, foot.z],
    momentArmM,
    forceMagN: fMag,
    torqueNm,
  };
}

function getDownstreamJointSet(rootId: JointId): Set<JointId> {
  const set = new Set<JointId>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of JOINT_ORDER) {
      const parent = SKELETON_CONFIG[id].parentId;
      if (parent && set.has(parent) && !set.has(id)) {
        set.add(id);
        changed = true;
      }
    }
  }
  return set;
}

export function MomentArmOverlay() {
  const showSpatialComponents = useSimStore((s) => s.layers.spatialComponents);
  const forces = useSimStore((s) => s.forces);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const kinematics = useSimStore((s) => s.kinematics);
  const heightM = useSimStore((s) => s.heightM);
  const dynamicLoadFactor = useSimStore((s) => s.dynamicLoadFactor);

  const targetJointId = focusedJointId ?? selectedJoint;
  if (!showSpatialComponents || !targetJointId || forces.length === 0) return null;

  const jointState = kinematics.joints[targetJointId];
  if (!jointState) return null;

  const downstream = getDownstreamJointSet(targetJointId);
  const relevantForces = forces.filter((f) => downstream.has(f.targetJoint));
  const activeForces = relevantForces.length > 0 ? relevantForces : forces;

  const pointForces = activeForces.map((f) => ({
    position: getForceApplicationPoint(f, kinematics, heightM),
    force: [
      f.forceVectorWorld[0] * dynamicLoadFactor,
      f.forceVectorWorld[1] * dynamicLoadFactor,
      f.forceVectorWorld[2] * dynamicLoadFactor,
    ] as Vec3,
  }));

  const geom = computeCombinedMomentArmGeometry(jointState.worldPosition, pointForces);
  if (!geom) return null;

  const midMoment: Vec3 = [
    (jointState.worldPosition[0] + geom.footPoint[0]) * 0.5,
    (jointState.worldPosition[1] + geom.footPoint[1]) * 0.5,
    (jointState.worldPosition[2] + geom.footPoint[2]) * 0.5,
  ];

  return (
    <group>
      {/* 外力等效作用線 (Resultant Line of Action) */}
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
      <Html position={midMoment} center zIndexRange={[10, 0]}>
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-amber-400/60 bg-slate-950/90 px-2 py-0.5 text-[10px] font-mono text-amber-200 shadow-lg backdrop-blur-sm">
          {activeForces.length > 1 ? `合力(${activeForces.length}) ` : ''}
          力臂 {(geom.momentArmM * 100).toFixed(1)} cm｜力矩 τ = {geom.torqueNm.toFixed(0)} N·m
        </div>
      </Html>
    </group>
  );
}

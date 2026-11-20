import { Quaternion, Vector3 } from 'three';
import { SKELETON_CONFIG } from '../data/skeletonConfig';
import type { JointId, PoseMap, Vec3 } from '../types/biomechanics';
import { computeKinematics } from './kinematics';

const RAD2DEG = 180 / Math.PI;

export type LimbId = 'arm_L' | 'arm_R' | 'leg_L' | 'leg_R';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Closed-form Analytical Two-Bone IK Solver for human arms and legs.
 * Given a target 3D world position for wrist_L/R or ankle_L/R, solves:
 *   - Mid-joint flexion (elbow / knee) via Law of Cosines
 *   - Root-joint flexion & abduction (shoulder / hip) in parent local coordinates
 */
export function solveTwoBoneLimbIK(
  limb: LimbId,
  targetWorldPos: Vec3,
  currentPose: PoseMap,
  heightM: number
): Partial<PoseMap> {
  const isArm = limb.startsWith('arm_');
  const isLeft = limb.endsWith('_L');
  const sign = isLeft ? 1 : -1;

  const parentId: JointId = isArm ? 'thorax' : 'pelvis';
  const rootId: JointId = isArm
    ? (`shoulder_${isLeft ? 'L' : 'R'}` as JointId)
    : (`hip_${isLeft ? 'L' : 'R'}` as JointId);
  const midId: JointId = isArm
    ? (`elbow_${isLeft ? 'L' : 'R'}` as JointId)
    : (`knee_${isLeft ? 'L' : 'R'}` as JointId);

  const kin = computeKinematics(currentPose, heightM);
  const rootWorld = new Vector3(...kin.joints[rootId].worldPosition);
  const parentQuat = new Quaternion(...kin.joints[parentId].worldQuaternion);

  const midCfg = SKELETON_CONFIG[midId];
  const endId: JointId = isArm
    ? (`wrist_${isLeft ? 'L' : 'R'}` as JointId)
    : (`ankle_${isLeft ? 'L' : 'R'}` as JointId);
  const endCfg = SKELETON_CONFIG[endId];

  const L1 = Math.hypot(
    midCfg.offsetRatio[0],
    midCfg.offsetRatio[1],
    midCfg.offsetRatio[2]
  ) * heightM;
  const L2 = Math.hypot(
    endCfg.offsetRatio[0],
    endCfg.offsetRatio[1],
    endCfg.offsetRatio[2]
  ) * heightM;

  const vWorld = new Vector3(...targetWorldPos).sub(rootWorld);
  const vLocal = vWorld.clone().applyQuaternion(parentQuat.clone().invert());

  const minReach = Math.abs(L1 - L2) + 0.03;
  const maxReach = L1 + L2 - 0.005;
  const D = clamp(vLocal.length(), minReach, maxReach);

  // Law of cosines for mid-joint flexion
  const cosBeta = clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1);
  const interiorRad = Math.acos(cosBeta);
  const midFlexRad = Math.PI - interiorRad;
  const maxMidDeg = isArm ? 145 : 135;
  const midFlexDeg = clamp(midFlexRad * RAD2DEG, 0, maxMidDeg);

  // Direction of root -> target in parent local space
  const dir = vLocal.normalize();
  const rawFlexDeg = Math.asin(clamp(dir.z, -1, 1)) * RAD2DEG;
  const rawAbdDeg = sign * Math.atan2(dir.x, -dir.y) * RAD2DEG;

  // Offset angle alpha caused by mid-joint bending
  const alphaDeg =
    Math.atan2(L2 * Math.sin(midFlexRad), L1 + L2 * Math.cos(midFlexRad)) * RAD2DEG;

  // Elbow bends forward (+Z), Knee bends backward (-Z)
  const rootFlexDeg = isArm ? rawFlexDeg - alphaDeg : rawFlexDeg + alphaDeg;

  const rootLimits = SKELETON_CONFIG[rootId].romLimits;
  const clampedRootFlex = clamp(
    Math.round(rootFlexDeg * 10) / 10,
    rootLimits.flexion[0],
    rootLimits.flexion[1]
  );
  const clampedRootAbd = clamp(
    Math.round(rawAbdDeg * 10) / 10,
    rootLimits.abduction[0],
    rootLimits.abduction[1]
  );

  return {
    [rootId]: {
      ...currentPose[rootId],
      flexion: clampedRootFlex,
      abduction: clampedRootAbd,
    },
    [midId]: {
      ...currentPose[midId],
      flexion: Math.round(midFlexDeg * 10) / 10,
    },
  };
}

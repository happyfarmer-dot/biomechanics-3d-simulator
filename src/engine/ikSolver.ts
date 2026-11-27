import { Quaternion, Vector3 } from 'three';
import { DEFAULT_HEIGHT_M, SKELETON_CONFIG } from '../data/skeletonConfig';
import type { JointId, PoseMap, Vec3 } from '../types/biomechanics';
import { computeKinematics } from './kinematics';

const RAD2DEG = 180 / Math.PI;

export type LimbId = 'arm_L' | 'arm_R' | 'leg_L' | 'leg_R';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getSegmentVec(
  jointId: JointId,
  heightM: number,
  calibratedOffsets?: Record<JointId, Vec3> | null
): Vector3 {
  if (calibratedOffsets?.[jointId]) {
    const hScale = heightM / DEFAULT_HEIGHT_M;
    const o = calibratedOffsets[jointId];
    return new Vector3(o[0] * hScale, o[1] * hScale, o[2] * hScale);
  }
  const r = SKELETON_CONFIG[jointId].offsetRatio;
  return new Vector3(r[0] * heightM, r[1] * heightM, r[2] * heightM);
}

/**
 * Closed-form Analytical Two-Bone IK Solver with 3D kinematics polish.
 * Supports calibrated GLB offsets, overhead arm reach (>90°), and preset anchoring.
 */
export function solveTwoBoneLimbIK(
  limb: LimbId,
  targetWorldPos: Vec3,
  currentPose: PoseMap,
  heightM: number,
  calibratedOffsets?: Record<JointId, Vec3> | null,
  activePresetId?: string | null
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
  const endId: JointId = isArm
    ? (`wrist_${isLeft ? 'L' : 'R'}` as JointId)
    : (`ankle_${isLeft ? 'L' : 'R'}` as JointId);

  const kin = computeKinematics(currentPose, heightM, calibratedOffsets, activePresetId);
  const rootWorld = new Vector3(...kin.joints[rootId].worldPosition);
  const parentQuat = new Quaternion(...kin.joints[parentId].worldQuaternion);

  const vUpper = getSegmentVec(midId, heightM, calibratedOffsets);
  const vLower = getSegmentVec(endId, heightM, calibratedOffsets);
  const L1 = Math.max(0.05, vUpper.length());
  const L2 = Math.max(0.05, vLower.length());

  const vWorld = new Vector3(...targetWorldPos).sub(rootWorld);
  const vLocal = vWorld.clone().applyQuaternion(parentQuat.clone().invert());

  const minReach = Math.abs(L1 - L2) + 0.03;
  const maxReach = L1 + L2 - 0.005;
  const D = clamp(vLocal.length(), minReach, maxReach);

  // Law of cosines for mid-joint flexion
  const cosBeta = clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1);
  const interiorRad = Math.acos(cosBeta);
  const midFlexRad = Math.PI - interiorRad;
  const midLimits = SKELETON_CONFIG[midId].romLimits;
  const initialMidFlex = clamp(midFlexRad * RAD2DEG, midLimits.flexion[0], midLimits.flexion[1]);

  const dir = vLocal.clone().normalize();
  const uRest = vUpper.clone().normalize();
  const restFlexDeg = Math.asin(clamp(uRest.z, -1, 1)) * RAD2DEG;
  const restAbdDeg = sign * Math.atan2(uRest.x, -uRest.y) * RAD2DEG;

  const alphaDeg =
    Math.atan2(L2 * Math.sin(midFlexRad), L1 + L2 * Math.cos(midFlexRad)) * RAD2DEG;

  const rootLimits = SKELETON_CONFIG[rootId].romLimits;
  const baseAsinDeg = Math.asin(clamp(dir.z, -1, 1)) * RAD2DEG;
  const candidates: Array<{ flex: number; abd: number }> = [
    {
      flex: baseAsinDeg + (isArm ? -alphaDeg : alphaDeg) - restFlexDeg,
      abd: sign * Math.atan2(dir.x, -dir.y) * RAD2DEG - restAbdDeg,
    },
    {
      flex:
        (dir.z >= 0 ? 180 - baseAsinDeg : -180 - baseAsinDeg) +
        (isArm ? -alphaDeg : alphaDeg) -
        restFlexDeg,
      abd: sign * Math.atan2(-dir.x, dir.y) * RAD2DEG + restAbdDeg,
    },
  ];

  // Evaluate reach accuracy in parent-anchored offset to avoid grounding jumps on legs
  const desiredRel = new Vector3(...targetWorldPos).sub(rootWorld);
  const evalDistSq = (rFlex: number, rAbd: number, mFlex: number): number => {
    const testPose: PoseMap = {
      ...currentPose,
      [rootId]: { ...currentPose[rootId], flexion: rFlex, abduction: rAbd },
      [midId]: { ...currentPose[midId], flexion: mFlex },
    };
    const tk = computeKinematics(testPose, heightM, calibratedOffsets, activePresetId);
    const rw = tk.joints[rootId].worldPosition;
    const ew = tk.joints[endId].worldPosition;
    const dx = ew[0] - rw[0] - desiredRel.x;
    const dy = ew[1] - rw[1] - desiredRel.y;
    const dz = ew[2] - rw[2] - desiredRel.z;
    return dx * dx + dy * dy + dz * dz;
  };

  const polishCandidate = (initF: number, initA: number) => {
    let f = clamp(initF, rootLimits.flexion[0], rootLimits.flexion[1]);
    let a = clamp(initA, rootLimits.abduction[0], rootLimits.abduction[1]);
    let m = initialMidFlex;
    let errSq = evalDistSq(f, a, m);
    for (const step of [6, 2, 0.5]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const df of [-step, 0, step]) {
          for (const da of [-step, 0, step]) {
            for (const dm of [-step, 0, step]) {
              if (df === 0 && da === 0 && dm === 0) continue;
              const nf = clamp(f + df, rootLimits.flexion[0], rootLimits.flexion[1]);
              const na = clamp(a + da, rootLimits.abduction[0], rootLimits.abduction[1]);
              const nm = clamp(m + dm, midLimits.flexion[0], midLimits.flexion[1]);
              const eSq = evalDistSq(nf, na, nm);
              if (eSq + 1e-7 < errSq) {
                errSq = eSq;
                f = nf;
                a = na;
                m = nm;
                improved = true;
              }
            }
          }
        }
      }
    }
    const excursionPenalty =
      (Math.abs(f - currentPose[rootId].flexion) +
        Math.abs(a - currentPose[rootId].abduction) * 1.15) *
      1e-5;
    return { f, a, m, score: errSq + excursionPenalty };
  };

  let best = polishCandidate(candidates[0].flex, candidates[0].abd);
  const alt = polishCandidate(candidates[1].flex, candidates[1].abd);
  if (alt.score < best.score) {
    best = alt;
  }

  return {
    [rootId]: {
      ...currentPose[rootId],
      flexion: Math.round(best.f * 10) / 10,
      abduction: Math.round(best.a * 10) / 10,
    },
    [midId]: {
      ...currentPose[midId],
      flexion: Math.round(best.m * 10) / 10,
    },
  };
}

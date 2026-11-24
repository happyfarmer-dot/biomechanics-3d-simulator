import { Quaternion, Vector3 } from 'three';
import {
  DEFAULT_HEIGHT_M,
  DEFAULT_MASS_KG,
  GRAVITY_MPS2,
  JOINT_ORDER,
  SKELETON_CONFIG,
} from '../data/skeletonConfig';
import type {
  JointId,
  JointLoadResult,
  KinematicsResult,
  SpatialForce,
  Vec3,
} from '../types/biomechanics';

const DEG2RAD = Math.PI / 180;
const LUMBAR_ERECTOR_SPINAE_ARM_M = 0.05;

export interface PointForce {
  segmentId: JointId;
  position: Vec3;
  force: Vec3;
}

export function getForceApplicationPoint(
  f: SpatialForce,
  kinematics: KinematicsResult,
  heightM: number = DEFAULT_HEIGHT_M
): Vec3 {
  const j = kinematics.joints[f.targetJoint];
  const t = Math.max(0, Math.min(1, f.positionRatio));
  const cx = j.worldPosition[0] + (j.distalWorldPosition[0] - j.worldPosition[0]) * t;
  const cy = j.worldPosition[1] + (j.distalWorldPosition[1] - j.worldPosition[1]) * t;
  const cz = j.worldPosition[2] + (j.distalWorldPosition[2] - j.worldPosition[2]) * t;

  if (f.surfaceAngleDeg === undefined) {
    return [cx, cy, cz];
  }

  const r = SKELETON_CONFIG[f.targetJoint].boneRadius * (heightM / DEFAULT_HEIGHT_M);
  const az = f.surfaceAngleDeg * DEG2RAD;
  const localRadial = new Vector3(r * Math.sin(az), 0, r * Math.cos(az));
  const worldQuat = new Quaternion(...j.worldQuaternion);
  localRadial.applyQuaternion(worldQuat);

  return [cx + localRadial.x, cy + localRadial.y, cz + localRadial.z];
}

export function getForceTipPoint(
  f: SpatialForce,
  kinematics: KinematicsResult,
  heightM: number = DEFAULT_HEIGHT_M
): Vec3 {
  const pApp = getForceApplicationPoint(f, kinematics, heightM);
  const s = f.scaleNpm || 1000;
  return [
    pApp[0] + f.forceVectorWorld[0] / s,
    pApp[1] + f.forceVectorWorld[1] / s,
    pApp[2] + f.forceVectorWorld[2] / s,
  ];
}

export function getForceMagnitudeN(f: SpatialForce): number {
  return Math.hypot(
    f.forceVectorWorld[0],
    f.forceVectorWorld[1],
    f.forceVectorWorld[2]
  );
}

/**
 * Computes net reaction forces and torques at every joint by recursively
 * accumulating downstream point forces & moments upstream along the skeleton tree:
 *   F_j = Σ F_k
 *   τ_j = Σ ((P_k - P_j) × F_k)
 * Projects world F_j and τ_j into each joint's local frame using worldQuaternion^-1.
 */
export function computeStatics(
  kinematics: KinematicsResult,
  spatialForces: SpatialForce[],
  options: {
    includeGravity?: boolean;
    bodyMassKg?: number;
    heightM?: number;
    dynamicLoadFactor?: number;
  } = {}
): Record<JointId, JointLoadResult> {
  const includeGravity = options.includeGravity ?? true;
  const bodyMassKg = options.bodyMassKg ?? DEFAULT_MASS_KG;
  const heightM = options.heightM ?? DEFAULT_HEIGHT_M;
  const dynamicLoadFactor = Math.max(1.0, options.dynamicLoadFactor ?? 1.0);

  const childrenMap: Record<JointId, JointId[]> = {} as Record<JointId, JointId[]>;
  for (const id of JOINT_ORDER) {
    childrenMap[id] = [];
  }
  for (const id of JOINT_ORDER) {
    const parentId = SKELETON_CONFIG[id].parentId;
    if (parentId) {
      childrenMap[parentId].push(id);
    }
  }

  const segmentForces: Record<JointId, PointForce[]> = {} as Record<JointId, PointForce[]>;
  for (const id of JOINT_ORDER) {
    segmentForces[id] = [];
  }

  for (const sf of spatialForces) {
    if (getForceMagnitudeN(sf) < 1e-6) continue;
    segmentForces[sf.targetJoint].push({
      segmentId: sf.targetJoint,
      position: getForceApplicationPoint(sf, kinematics, heightM),
      force: [
        sf.forceVectorWorld[0] * dynamicLoadFactor,
        sf.forceVectorWorld[1] * dynamicLoadFactor,
        sf.forceVectorWorld[2] * dynamicLoadFactor,
      ],
    });
  }

  if (includeGravity) {
    for (const id of JOINT_ORDER) {
      const massRatio = SKELETON_CONFIG[id].massRatio;
      if (massRatio <= 0) continue;
      const weightN = bodyMassKg * massRatio * GRAVITY_MPS2 * dynamicLoadFactor;
      segmentForces[id].push({
        segmentId: id,
        position: kinematics.joints[id].comWorldPosition,
        force: [0, -weightN, 0],
      });
    }
  }

  const downstreamForces: Record<JointId, PointForce[]> = {} as Record<JointId, PointForce[]>;
  function collectDownstream(jointId: JointId): PointForce[] {
    const list: PointForce[] = [...segmentForces[jointId]];
    for (const childId of childrenMap[jointId]) {
      list.push(...collectDownstream(childId));
    }
    downstreamForces[jointId] = list;
    return list;
  }
  collectDownstream('pelvis');

  const results = {} as Record<JointId, JointLoadResult>;

  for (const id of JOINT_ORDER) {
    const jState = kinematics.joints[id];
    const Pj = new Vector3(...jState.worldPosition);
    const netF = new Vector3(0, 0, 0);
    const netTau = new Vector3(0, 0, 0);

    for (const pf of downstreamForces[id]) {
      const Pk = new Vector3(...pf.position);
      const Fk = new Vector3(...pf.force);
      netF.add(Fk);
      const r = Pk.sub(Pj);
      netTau.add(r.cross(Fk));
    }

    const invQuat = new Quaternion(...jState.worldQuaternion).invert();
    const localF = netF.clone().applyQuaternion(invQuat);
    const localTau = netTau.clone().applyQuaternion(invQuat);

    const axialForceN = Math.abs(localF.y);
    const mlShearN = localF.x;
    const apShearN = localF.z;
    const shearForceN = Math.hypot(mlShearN, apShearN);

    const sagittalMomentNm = localTau.x;
    const coronalMomentNm = localTau.z;
    const torsionMomentNm = localTau.y;
    const bendingMomentNm = Math.hypot(sagittalMomentNm, coronalMomentNm);

    const result: JointLoadResult = {
      jointId: id,
      worldForce: [netF.x, netF.y, netF.z],
      worldTorque: [netTau.x, netTau.y, netTau.z],
      localForce: [localF.x, localF.y, localF.z],
      localTorque: [localTau.x, localTau.y, localTau.z],
      axialForceN,
      shearForceN,
      apShearN,
      mlShearN,
      bendingMomentNm,
      sagittalMomentNm,
      coronalMomentNm,
      torsionMomentNm,
    };

    if (id === 'lumbar') {
      result.lumbarEstimatedCompressionN =
        axialForceN + Math.abs(sagittalMomentNm) / LUMBAR_ERECTOR_SPINAE_ARM_M;
    }

    results[id] = result;
  }

  return results;
}

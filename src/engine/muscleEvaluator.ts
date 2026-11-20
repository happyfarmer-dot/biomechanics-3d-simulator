import { Quaternion, Vector3 } from 'three';
import { MUSCLE_CONFIG } from '../data/muscleConfig';
import { createNeutralPose, DEFAULT_HEIGHT_M } from '../data/skeletonConfig';
import type {
  KinematicsResult,
  MuscleAttachment,
  MuscleState,
  Vec3,
} from '../types/biomechanics';
import { computeKinematics } from './kinematics';

const restLengthCache = new Map<number, Record<string, number>>();

function resolveAttachmentWorld(
  attachment: MuscleAttachment,
  kinematics: KinematicsResult,
  heightScale: number
): Vec3 {
  const joint = kinematics.joints[attachment.jointId];
  const jPos = new Vector3(...joint.worldPosition);
  const jQuat = new Quaternion(...joint.worldQuaternion);
  const local = new Vector3(
    attachment.localOffset[0] * heightScale,
    attachment.localOffset[1] * heightScale,
    attachment.localOffset[2] * heightScale
  );
  const world = jPos.add(local.applyQuaternion(jQuat));
  return [world.x, world.y, world.z];
}

function computePolylineLength(points: Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const dz = points[i][2] - points[i - 1][2];
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return total;
}

export function getRestLengths(heightM: number = DEFAULT_HEIGHT_M): Record<string, number> {
  const key = Math.round(heightM * 10000);
  const cached = restLengthCache.get(key);
  if (cached) return cached;

  const neutralKin = computeKinematics(createNeutralPose(), heightM);
  const scale = heightM / DEFAULT_HEIGHT_M;
  const lengths: Record<string, number> = {};

  for (const m of MUSCLE_CONFIG) {
    const pts: Vec3[] = [
      resolveAttachmentWorld(m.origin, neutralKin, scale),
      ...m.viaPoints.map((vp) => resolveAttachmentWorld(vp, neutralKin, scale)),
      resolveAttachmentWorld(m.insertion, neutralKin, scale),
    ];
    lengths[m.id] = Math.max(computePolylineLength(pts), 1e-6);
  }

  restLengthCache.set(key, lengths);
  return lengths;
}

export function evaluateMuscles(
  kinematics: KinematicsResult,
  heightM: number = DEFAULT_HEIGHT_M
): MuscleState[] {
  const restLengths = getRestLengths(heightM);
  const scale = heightM / DEFAULT_HEIGHT_M;

  return MUSCLE_CONFIG.map((m) => {
    const pointsWorld: Vec3[] = [
      resolveAttachmentWorld(m.origin, kinematics, scale),
      ...m.viaPoints.map((vp) => resolveAttachmentWorld(vp, kinematics, scale)),
      resolveAttachmentWorld(m.insertion, kinematics, scale),
    ];

    const currentLength = computePolylineLength(pointsWorld);
    const restLength = restLengths[m.id] ?? currentLength;
    const strain = (currentLength - restLength) / restLength;

    let status: MuscleState['status'] = 'normal';
    if (strain > 0.3) {
      status = 'critical';
    } else if (strain > 0.15) {
      status = 'warning';
    }

    return {
      id: m.id,
      groupId: m.groupId,
      name: m.name,
      nameZh: m.nameZh,
      side: m.side,
      restLength,
      currentLength,
      strain,
      status,
      pointsWorld,
    };
  });
}

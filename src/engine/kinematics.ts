import { Euler, Quaternion, Vector3 } from 'three';
import { DEFAULT_HEIGHT_M, JOINT_ORDER, SKELETON_CONFIG } from '../data/skeletonConfig';
import type {
  AnatomicalAngles,
  JointId,
  JointWorldState,
  KinematicsResult,
  LocalEuler,
  PoseMap,
  Quat,
  Vec3,
} from '../types/biomechanics';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function getSideSign(jointId: JointId): number {
  if (jointId.endsWith('_L')) return 1;
  if (jointId.endsWith('_R')) return -1;
  return 0;
}

/**
 * Pure function converting clinical anatomical angles (degrees) into Three.js local Euler angles (radians).
 * Guarantees strict left/right mirror symmetry in Three.js right-handed coordinates (+Y up, +Z front, +X left, -X right):
 * - Positive shoulder/hip abduction raises BOTH left and right limbs outward laterally.
 * - Positive internal rotation rotates BOTH left and right limbs toward the body midline.
 */
export function anatomicalToEuler(jointId: JointId, angles: AnatomicalAngles): LocalEuler {
  const { flexion, abduction, rotation } = angles;
  const sign = getSideSign(jointId);
  const order = 'ZXY' as const;

  if (sign === 0) {
    // Spine / Root (pelvis, lumbar, thorax, neck, head): distal points +Y
    return {
      x: flexion * DEG2RAD,
      y: rotation * DEG2RAD,
      z: -abduction * DEG2RAD,
      order,
    };
  }

  // Lower limb knee & ankle have positive flexion = backward/plantar (+X)
  if (jointId.startsWith('knee_') || jointId.startsWith('ankle_')) {
    return {
      x: flexion * DEG2RAD,
      y: -sign * rotation * DEG2RAD,
      z: sign * abduction * DEG2RAD,
      order,
    };
  }

  // Upper limb (shoulder, elbow, wrist) and Hip: positive flexion = forward (-X)
  return {
    x: -flexion * DEG2RAD,
    y: -sign * rotation * DEG2RAD,
    z: sign * abduction * DEG2RAD,
    order,
  };
}

/**
 * Inverse mapping from local Euler (radians, order ZXY) back to anatomical degrees.
 * Used when reading back TransformControls gizmo rotations without gimbal feedback loops.
 */
export function eulerToAnatomical(jointId: JointId, euler: { x: number; y: number; z: number }): AnatomicalAngles {
  const sign = getSideSign(jointId);

  if (sign === 0) {
    return {
      flexion: euler.x * RAD2DEG,
      abduction: -euler.z * RAD2DEG,
      rotation: euler.y * RAD2DEG,
    };
  }

  if (jointId.startsWith('knee_') || jointId.startsWith('ankle_')) {
    return {
      flexion: euler.x * RAD2DEG,
      abduction: sign * euler.z * RAD2DEG,
      rotation: -sign * euler.y * RAD2DEG,
    };
  }

  return {
    flexion: -euler.x * RAD2DEG,
    abduction: sign * euler.z * RAD2DEG,
    rotation: -sign * euler.y * RAD2DEG,
  };
}

export function localEulerToQuaternion(localEuler: LocalEuler): Quaternion {
  return new Quaternion().setFromEuler(
    new Euler(localEuler.x, localEuler.y, localEuler.z, localEuler.order)
  );
}

export function computeKinematics(
  pose: PoseMap,
  heightM: number = DEFAULT_HEIGHT_M,
  calibratedOffsets?: Record<JointId, Vec3> | null
): KinematicsResult {
  const joints = {} as Record<JointId, JointWorldState>;
  const scale = heightM / DEFAULT_HEIGHT_M;

  const pelvisAngles = pose.pelvis ?? { flexion: 0, abduction: 0, rotation: 0 };
  const pelvisQuat = localEulerToQuaternion(anatomicalToEuler('pelvis', pelvisAngles));
  const pelvisInvQuat = pelvisQuat.clone().invert();

  for (const id of JOINT_ORDER) {
    const cfg = SKELETON_CONFIG[id];
    const angles = pose[id] ?? { flexion: 0, abduction: 0, rotation: 0 };
    const localEuler = anatomicalToEuler(id, angles);
    const localQuat = localEulerToQuaternion(localEuler);

    const localOffset = calibratedOffsets?.[id]
      ? new Vector3(
          calibratedOffsets[id][0] * scale,
          calibratedOffsets[id][1] * scale,
          calibratedOffsets[id][2] * scale
        )
      : new Vector3(
          cfg.offsetRatio[0] * heightM,
          cfg.offsetRatio[1] * heightM,
          cfg.offsetRatio[2] * heightM
        );

    let worldPos: Vector3;
    let worldQuat: Quaternion;

    if (cfg.parentId === null) {
      // Pelvis: keephip/ankle grounded by adjusting pelvis vertical shift from hip pivot
      worldPos = localOffset;
      worldQuat = localQuat;
    } else if (id === 'hip_L' || id === 'hip_R') {
      // Closed-chain standing pelvis tilt: counter-rotate hip_L and hip_R by pelvisInvQuat
      // and keep hip world positions anchored so both legs stand upright on y = 0 floor.
      const parent = joints[cfg.parentId];
      const parentPos = new Vector3(...parent.worldPosition);
      worldPos = parentPos.add(localOffset);
      worldQuat = new Quaternion(...parent.worldQuaternion)
        .multiply(pelvisInvQuat)
        .multiply(localQuat);
    } else {
      const parent = joints[cfg.parentId];
      const parentPos = new Vector3(...parent.worldPosition);
      const parentQuat = new Quaternion(...parent.worldQuaternion);
      worldPos = parentPos.add(localOffset.applyQuaternion(parentQuat));
      worldQuat = parentQuat.clone().multiply(localQuat);
    }

    const distalLocal = new Vector3(
      cfg.distalRatio[0] * heightM,
      cfg.distalRatio[1] * heightM,
      cfg.distalRatio[2] * heightM
    );
    const distalWorld = worldPos.clone().add(distalLocal.clone().applyQuaternion(worldQuat));
    const comWorld = worldPos
      .clone()
      .add(distalLocal.clone().multiplyScalar(cfg.comRatio).applyQuaternion(worldQuat));

    joints[id] = {
      id,
      parentId: cfg.parentId,
      worldPosition: [worldPos.x, worldPos.y, worldPos.z] as Vec3,
      worldQuaternion: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w] as Quat,
      localEuler,
      distalWorldPosition: [distalWorld.x, distalWorld.y, distalWorld.z] as Vec3,
      comWorldPosition: [comWorld.x, comWorld.y, comWorld.z] as Vec3,
    };
  }

  return { joints };
}

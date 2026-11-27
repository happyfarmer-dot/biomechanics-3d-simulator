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
    y: sign * rotation * DEG2RAD,
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
    rotation: sign * euler.y * RAD2DEG,
  };
}

const _eulerZxy = new Euler(0, 0, 0, 'ZXY');

function wrapRad(rad: number): number {
  let r = rad;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/**
 * Converts a local Quaternion back to anatomical angles (degrees) without ZXY gimbal-lock
 * clamping at flexion = ±90°, selecting the Euler branch closest to `reference`.
 */
export function quaternionToAnatomicalContinuous(
  jointId: JointId,
  q: Quaternion,
  reference: AnatomicalAngles
): AnatomicalAngles {
  _eulerZxy.setFromQuaternion(q, 'ZXY');
  const ex = _eulerZxy.x;
  const ey = _eulerZxy.y;
  const ez = _eulerZxy.z;

  const refEuler = anatomicalToEuler(jointId, reference);

  // Near gimbal lock (|x| ≈ 90°), decouple z and y using reference.y to prevent ±75° spikes
  if (Math.abs(Math.cos(ex)) < 1e-3) {
    const s = ex >= 0 ? 1 : -1;
    const lockedY = refEuler.y;
    const lockedZ = wrapRad(ez + s * ey - s * lockedY);
    const lockCand = eulerToAnatomical(jointId, { x: ex, y: lockedY, z: lockedZ });
    const lockAlt = eulerToAnatomical(jointId, {
      x: s * Math.PI - ex,
      y: lockedY,
      z: lockedZ,
    });
    const d1 =
      (lockCand.flexion - reference.flexion) ** 2 +
      (lockCand.abduction - reference.abduction) ** 2 +
      (lockCand.rotation - reference.rotation) ** 2;
    const d2 =
      (lockAlt.flexion - reference.flexion) ** 2 +
      (lockAlt.abduction - reference.abduction) ** 2 +
      (lockAlt.rotation - reference.rotation) ** 2;
    return d2 < d1 ? lockAlt : lockCand;
  }

  const altY = wrapRad(ey + Math.PI);
  const altZ = wrapRad(ez + Math.PI);
  const candidates: AnatomicalAngles[] = [
    eulerToAnatomical(jointId, { x: ex, y: ey, z: ez }),
    eulerToAnatomical(jointId, { x: Math.PI - ex, y: altY, z: altZ }),
    eulerToAnatomical(jointId, { x: -Math.PI - ex, y: altY, z: altZ }),
  ];

  // When passing within ~7 deg of ±90° (|cos(ex)| < 0.12), include continuous branch locked to refEuler.y
  // so Euler extraction does not jump 60-110 deg in abduction/rotation mid-trajectory.
  if (Math.abs(Math.cos(ex)) < 0.12) {
    const s = ex >= 0 ? 1 : -1;
    const lockedY = refEuler.y;
    const lockedZ = wrapRad(ez + s * ey - s * lockedY);
    candidates.push(eulerToAnatomical(jointId, { x: ex, y: lockedY, z: lockedZ }));
    candidates.push(eulerToAnatomical(jointId, { x: s * Math.PI - ex, y: lockedY, z: lockedZ }));
  }

  let best = candidates[0];
  let bestDistSq = Infinity;
  for (const c of candidates) {
    const df = c.flexion - reference.flexion;
    const da = c.abduction - reference.abduction;
    const dr = c.rotation - reference.rotation;
    const distSq = df * df + da * da + dr * dr;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = c;
    }
  }
  return best;
}

export function localEulerToQuaternion(localEuler: LocalEuler): Quaternion {
  _eulerZxy.set(localEuler.x, localEuler.y, localEuler.z, localEuler.order);
  return new Quaternion().setFromEuler(_eulerZxy);
}

const NON_FOOT_ANCHORED_PRESETS = new Set([
  'superman_back_extension',
  'freestyle_swim_catch',
  'childs_pose',
  'russian_twist',
  'flat_bench_press_bottom',
  'dumbbell_chest_fly_bottom',
]);

const MID_FOOT_CENTERED_PRESETS = new Set([
  'farmers_walk',
  'sprint_drive_phase',
]);

const PLANTED_LEFT_FOOT_PRESETS = new Set([
  'bulgarian_split_squat_bottom',
  'soccer_kick_windup',
  'kneeling_hip_flexor_stretch',
  'warrior_two',
]);

const PLANTED_RIGHT_FOOT_PRESETS = new Set([
  'single_leg_rdl_balance',
  'baseball_pitch_cocking',
  'boxing_right_cross',
  'tennis_forehand_swing',
  'golf_downswing_impact',
  'forward_lunge_bottom',
]);

const APPARATUS_HAND_ANCHORS: Record<string, [number, number, number]> = {
  pull_up_peak: [0, 2.18, 0.14],
  parallel_bar_dip_bottom: [0, 1.25, 0.08],
};

const FLOOR_HAND_XZ_ANCHORS: Record<string, [number, number]> = {
  push_up_bottom: [0, 0.5],
  cobra_pose: [0, 0.5],
};

export function computeKinematics(
  pose: PoseMap,
  heightM: number = DEFAULT_HEIGHT_M,
  calibratedOffsets?: Record<JointId, Vec3> | null,
  activePresetId?: string | null
): KinematicsResult {
  const joints = {} as Record<JointId, JointWorldState>;
  const scale = heightM / DEFAULT_HEIGHT_M;

  const pelvisAngles = pose.pelvis ?? { flexion: 0, abduction: 0, rotation: 0 };
  const isProneOrSupine =
    Math.abs(pelvisAngles.flexion) >= 60 || Math.abs(pelvisAngles.abduction) >= 60;
  const pelvisQuat = localEulerToQuaternion(anatomicalToEuler('pelvis', pelvisAngles));
  const pelvisInvQuat = pelvisQuat.clone().invert();

  const getOffsetAxis = (id: JointId, axis: 0 | 1 | 2): number =>
    calibratedOffsets?.[id]
      ? calibratedOffsets[id][axis] * scale
      : SKELETON_CONFIG[id].offsetRatio[axis] * heightM;
  const getOffsetY = (id: JointId): number => getOffsetAxis(id, 1);

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
      worldPos = localOffset;
      worldQuat = localQuat;
    } else if ((id === 'hip_L' || id === 'hip_R') && !isProneOrSupine) {
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

  // Auto Grounding: shift = neutralLowestSupportY - currentLowestSupportY
  // Guarantees exact 0.000 mm vertical drift in neutral standing while grounding standing, tiptoe, kneeling, and lying poses.
  const neutralPelvisY = getOffsetY('pelvis');
  const neutralAnkleLY =
    neutralPelvisY + getOffsetY('hip_L') + getOffsetY('knee_L') + getOffsetY('ankle_L');
  const neutralAnkleRY =
    neutralPelvisY + getOffsetY('hip_R') + getOffsetY('knee_R') + getOffsetY('ankle_R');
  const neutralMinAnkleY = Math.min(neutralAnkleLY, neutralAnkleRY);
  const neutralMinToeY = Math.min(
    neutralAnkleLY + SKELETON_CONFIG.ankle_L.distalRatio[1] * heightM,
    neutralAnkleRY + SKELETON_CONFIG.ankle_R.distalRatio[1] * heightM
  );
  const kneePad = 0.055 * scale;

  let currentMinSupportY: number;
  if (!isProneOrSupine) {
    currentMinSupportY = Math.min(
      joints.ankle_L.worldPosition[1] - neutralMinAnkleY,
      joints.ankle_R.worldPosition[1] - neutralMinAnkleY,
      joints.ankle_L.distalWorldPosition[1] - neutralMinToeY,
      joints.ankle_R.distalWorldPosition[1] - neutralMinToeY,
      joints.knee_L.worldPosition[1] - kneePad,
      joints.knee_R.worldPosition[1] - kneePad
    );
  } else {
    currentMinSupportY = Math.min(
      joints.ankle_L.worldPosition[1] - 0.06 * scale,
      joints.ankle_R.worldPosition[1] - 0.06 * scale,
      joints.ankle_L.distalWorldPosition[1] - 0.015 * scale,
      joints.ankle_R.distalWorldPosition[1] - 0.015 * scale,
      joints.knee_L.worldPosition[1] - kneePad,
      joints.knee_R.worldPosition[1] - kneePad,
      joints.pelvis.worldPosition[1] - 0.095 * scale,
      joints.thorax.worldPosition[1] - 0.105 * scale,
      joints.shoulder_L.worldPosition[1] - 0.065 * scale,
      joints.shoulder_R.worldPosition[1] - 0.065 * scale,
      joints.elbow_L.worldPosition[1] - 0.045 * scale,
      joints.elbow_R.worldPosition[1] - 0.045 * scale,
      joints.wrist_L.worldPosition[1] - 0.035 * scale,
      joints.wrist_R.worldPosition[1] - 0.035 * scale,
      joints.head.worldPosition[1] - 0.09 * scale
    );
  }

  const shiftAll = (dx: number, dy: number, dz: number) => {
    if (Math.abs(dx) <= 1e-6 && Math.abs(dy) <= 1e-6 && Math.abs(dz) <= 1e-6) return;
    for (const id of JOINT_ORDER) {
      joints[id].worldPosition[0] += dx;
      joints[id].worldPosition[1] += dy;
      joints[id].worldPosition[2] += dz;
      joints[id].distalWorldPosition[0] += dx;
      joints[id].distalWorldPosition[1] += dy;
      joints[id].distalWorldPosition[2] += dz;
      joints[id].comWorldPosition[0] += dx;
      joints[id].comWorldPosition[1] += dy;
      joints[id].comWorldPosition[2] += dz;
    }
  };

  const getGripPoint = (side: 'L' | 'R'): Vec3 => {
    const j = joints[side === 'L' ? 'wrist_L' : 'wrist_R'];
    return [
      j.worldPosition[0] + (j.distalWorldPosition[0] - j.worldPosition[0]) * 0.45,
      j.worldPosition[1] + (j.distalWorldPosition[1] - j.worldPosition[1]) * 0.45,
      j.worldPosition[2] + (j.distalWorldPosition[2] - j.worldPosition[2]) * 0.45,
    ];
  };

  const appAnchor = activePresetId ? APPARATUS_HAND_ANCHORS[activePresetId] : undefined;
  if (appAnchor) {
    const gL = getGripPoint('L');
    const gR = getGripPoint('R');
    const gMidX = (gL[0] + gR[0]) * 0.5;
    const gMidY = (gL[1] + gR[1]) * 0.5;
    const gMidZ = (gL[2] + gR[2]) * 0.5;
    shiftAll(appAnchor[0] * scale - gMidX, appAnchor[1] * scale - gMidY, appAnchor[2] * scale - gMidZ);
    return { joints };
  }

  // Neutral standing has neutralLowestSupportY === 0, so shiftY = 0 - currentMinSupportY
  const shiftY = -currentMinSupportY;
  let shiftX = 0;
  let shiftZ = 0;

  const neutralPelvisZ = getOffsetAxis('pelvis', 2);
  const neutralAnkleLZ =
    neutralPelvisZ + getOffsetAxis('hip_L', 2) + getOffsetAxis('knee_L', 2) + getOffsetAxis('ankle_L', 2);
  const neutralAnkleRZ =
    neutralPelvisZ + getOffsetAxis('hip_R', 2) + getOffsetAxis('knee_R', 2) + getOffsetAxis('ankle_R', 2);
  const neutralAnkleZ = (neutralAnkleLZ + neutralAnkleRZ) * 0.5;

  const floorHandXZ = activePresetId ? FLOOR_HAND_XZ_ANCHORS[activePresetId] : undefined;
  if (floorHandXZ) {
    const gL = getGripPoint('L');
    const gR = getGripPoint('R');
    shiftX = floorHandXZ[0] * scale - (gL[0] + gR[0]) * 0.5;
    shiftZ = floorHandXZ[1] * scale - (gL[2] + gR[2]) * 0.5;
  } else if (activePresetId === 'standard_plank') {
    shiftX = -(joints.elbow_L.worldPosition[0] + joints.elbow_R.worldPosition[0]) * 0.5;
    shiftZ = 0.42 * scale - (joints.elbow_L.worldPosition[2] + joints.elbow_R.worldPosition[2]) * 0.5;
  } else if (activePresetId === 'side_plank') {
    shiftX = -joints.elbow_R.worldPosition[0];
    shiftZ = -joints.elbow_R.worldPosition[2];
  } else if (activePresetId === 'glute_bridge_peak' || activePresetId === 'barbell_hip_thrust_peak') {
    shiftX = -(joints.ankle_L.worldPosition[0] + joints.ankle_R.worldPosition[0]) * 0.5;
    shiftZ = 0.42 * scale - (joints.ankle_L.worldPosition[2] + joints.ankle_R.worldPosition[2]) * 0.5;
  } else if (!isProneOrSupine && (!activePresetId || !NON_FOOT_ANCHORED_PRESETS.has(activePresetId))) {
    const aL = joints.ankle_L.worldPosition;
    const aR = joints.ankle_R.worldPosition;
    let plantedZ: number;
    if (activePresetId && PLANTED_LEFT_FOOT_PRESETS.has(activePresetId)) {
      plantedZ = aL[2];
    } else if (activePresetId && PLANTED_RIGHT_FOOT_PRESETS.has(activePresetId)) {
      plantedZ = aR[2];
    } else if (activePresetId && MID_FOOT_CENTERED_PRESETS.has(activePresetId)) {
      plantedZ = (aL[2] + aR[2]) * 0.5;
    } else if (Math.abs(aL[1] - aR[1]) > 0.04 * scale) {
      plantedZ = aL[1] <= aR[1] ? aL[2] : aR[2];
    } else {
      plantedZ = (aL[2] + aR[2]) * 0.5;
    }
    shiftZ = neutralAnkleZ - plantedZ;
  }

  shiftAll(shiftX, shiftY, shiftZ);

  return { joints };
}

/**
 * Scapulohumeral Rhythm (classic ~2:1 approximation):
 * When shoulder abduction or flexion exceeds 30 deg, the clavicle/scapula
 * elevates and upward-rotates at ~28% of the excess angle.
 */
export function computeClavicleWorldState(
  side: 'L' | 'R',
  pose: PoseMap,
  thorax: JointWorldState,
  shoulderRestPos: Vec3,
  thoraxRestPos?: Vec3,
  hScale: number = 1
): { worldPosition: Vec3; worldQuaternion: Quat; restPosition: Vec3 } {
  const shAngles = pose[`shoulder_${side}` as JointId];
  const excess = Math.max(0, Math.max(shAngles.abduction, shAngles.flexion) - 30);
  const clavDeg = Math.min(28, excess * 0.28);
  const sign = side === 'L' ? 1 : -1;

  const thoraxQuat = new Quaternion(...thorax.worldQuaternion);
  _eulerZxy.set(0, -sign * clavDeg * 0.25 * DEG2RAD, sign * clavDeg * DEG2RAD, 'ZXY');
  const localQuat = new Quaternion().setFromEuler(_eulerZxy);
  const worldQuat = thoraxQuat.clone().multiply(localQuat);

  // Sternoclavicular pivot near medial clavicle
  const pivotRest: Vec3 = [sign * 0.025, shoulderRestPos[1] + 0.015, shoulderRestPos[2] + 0.02];
  const tRestX = thoraxRestPos ? thoraxRestPos[0] : 0;
  const tRestY = thoraxRestPos ? thoraxRestPos[1] : 1.239;
  const tRestZ = thoraxRestPos ? thoraxRestPos[2] : 0;
  const relFromThorax = new Vector3(
    (pivotRest[0] - tRestX) * hScale,
    (pivotRest[1] - tRestY) * hScale,
    (pivotRest[2] - tRestZ) * hScale
  ).applyQuaternion(thoraxQuat);
  const worldPos: Vec3 = [
    thorax.worldPosition[0] + relFromThorax.x,
    thorax.worldPosition[1] + relFromThorax.y,
    thorax.worldPosition[2] + relFromThorax.z,
  ];

  return {
    worldPosition: worldPos,
    worldQuaternion: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w],
    restPosition: pivotRest,
  };
}

/**
 * Computes progressive forearm pronation/supination state between elbow hinge (fraction = 0, ulna)
 * and distal forearm / wrist entry (fraction = 1.0, full elbow.rotation).
 */
export function computeForearmTwistState(
  side: 'L' | 'R',
  pose: PoseMap,
  kinematics: KinematicsResult,
  fraction: number,
  elbowRestPos?: Vec3,
  wristRestPos?: Vec3
): { worldPosition: Vec3; worldQuaternion: Quat; restPosition: Vec3 } {
  const shId: JointId = side === 'L' ? 'shoulder_L' : 'shoulder_R';
  const elId: JointId = side === 'L' ? 'elbow_L' : 'elbow_R';
  const wrId: JointId = side === 'L' ? 'wrist_L' : 'wrist_R';

  const shState = kinematics.joints[shId];
  const elState = kinematics.joints[elId];
  const wrState = kinematics.joints[wrId];
  const elAngles = pose[elId] ?? { flexion: 0, abduction: 0, rotation: 0 };

  const t = Math.max(0, Math.min(1, fraction));
  const twistEuler = anatomicalToEuler(elId, {
    flexion: elAngles.flexion,
    abduction: elAngles.abduction,
    rotation: elAngles.rotation * t,
  });

  const shQuat = new Quaternion(...shState.worldQuaternion);
  const twistQuat = localEulerToQuaternion(twistEuler);
  const worldQuat = shQuat.multiply(twistQuat);

  const elPos = elState.worldPosition;
  const wrPos = wrState.worldPosition;
  const worldPosition: Vec3 = [
    elPos[0] + (wrPos[0] - elPos[0]) * t,
    elPos[1] + (wrPos[1] - elPos[1]) * t,
    elPos[2] + (wrPos[2] - elPos[2]) * t,
  ];

  const elR = elbowRestPos ?? [0, 0, 0];
  const wrR = wristRestPos ?? elR;
  const restPosition: Vec3 = [
    elR[0] + (wrR[0] - elR[0]) * t,
    elR[1] + (wrR[1] - elR[1]) * t,
    elR[2] + (wrR[2] - elR[2]) * t,
  ];

  return {
    worldPosition,
    worldQuaternion: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w],
    restPosition,
  };
}



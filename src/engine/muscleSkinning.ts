import { Box3, BufferGeometry, Float32BufferAttribute, Mesh, Quaternion, Vector3 } from 'three';
import { createNeutralPose, DEFAULT_HEIGHT_M } from '../data/skeletonConfig';
import type { JointId, KinematicsResult, PoseMap, Vec3 } from '../types/biomechanics';
import type { CalibrationResult } from './calibrateSkeleton';
import { computeClavicleWorldState, computeForearmTwistState } from './kinematics';

export type LimbZone = 'arm_L' | 'arm_R' | 'leg_L' | 'leg_R' | 'head_neck' | 'torso';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface SkinnedMuscleData {
  name: string;
  geometry: BufferGeometry;
  zone: LimbZone;
  primaryJoint: JointId;
  secondaryJoint: JointId;
  vertexCount: number;
  jointAIndices: Uint8Array;
  jointBIndices: Uint8Array;
  weightsB: Float32Array;
  /** Flattened [x, y, z] rest world position at height = 1.75m */
  restPositions: Float32Array;
  restNormals: Float32Array;
  restLength: number;
  restDiagLength: number;
  restCenter: Vec3;
  usedJoints: JointId[];
}

export const ALL_JOINTS: JointId[] = [
  'pelvis', 'lumbar', 'thorax', 'neck', 'head',
  'shoulder_L', 'elbow_L', 'wrist_L',
  'shoulder_R', 'elbow_R', 'wrist_R',
  'hip_L', 'knee_L', 'ankle_L',
  'hip_R', 'knee_R', 'ankle_R',
];

export const JOINT_TO_INDEX: Record<JointId, number> = Object.fromEntries(
  ALL_JOINTS.map((id, idx) => [id, idx])
) as Record<JointId, number>;

export const CLAVICLE_L_INDEX = 17;
export const CLAVICLE_R_INDEX = 18;
export const ELBOW_HINGE_L_INDEX = 19;
export const ELBOW_HINGE_R_INDEX = 20;
export const FOREARM_MID_L_INDEX = 21;
export const FOREARM_MID_R_INDEX = 22;
export const TOTAL_SKIN_BONES = 23;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const LOWER_BODY_KEYWORDS = [
  'glute',
  'tensor_fascia',
  'tensor fascia',
  'iliotibial',
  'iliac',
  'psoas',
  'sartorius',
  'quadricep',
  'rectus_femoris',
  'rectus femoris',
  'vastus',
  'femur',
  'femoris',
  'gracilis',
  'adductor_longus',
  'adductor_brevis',
  'adductor_magnus',
  'adductor_minimus',
  'adductor_hallucis',
  'adductor longus',
  'adductor brevis',
  'adductor magnus',
  'adductor minimus',
  'adductor hallucis',
  'hamstring',
  'biceps_femoris',
  'biceps femoris',
  'semitendinosus',
  'semimembranosus',
  'pectineus',
  'piriformis',
  'obturator',
  'gemellus',
  'quadratus_femoris',
  'quadratus femoris',
  'tibia',
  'fibula',
  'peroneus',
  'fibularis',
  'gastroc',
  'soleus',
  'plantar',
  'popliteus',
  'patella',
  'calcane',
  'talus',
  'tarsal',
  'metatarsal',
  'hallucis',
  'pedis',
  'foot',
  'toe',
  'hip_bone',
  'ilium',
  'ischium',
  'pubis',
  'sacrum',
  'coccyx',
];

const UPPER_LIMB_ANATOMY_KEYWORDS = [
  'humerus',
  'radius',
  'ulna',
  'carpal',
  'metacarpal',
  'capitate',
  'hamate',
  'lunate',
  'pisiform',
  'scaphoid',
  'trapezium',
  'trapezoid',
  'triquetrum',
  'phalanx',
  'phalanges',
  'hand',
  'manus',
  'finger',
  'thumb',
  'pollicis',
  'indicis',
  'carpi',
  'wrist',
  'forearm',
  'palmar',
  'thenar',
  'hypothenar',
  'lumbrical',
  'interosse',
  'retinaculum',
  'tendon_sheath',
  'deltoid',
  'biceps_brachii',
  'biceps brachii',
  'triceps',
  'brachialis',
  'brachioradialis',
  'pronator',
  'supinator',
  'anconeus',
  'coracobrachialis',
  'supraspinatus',
  'infraspinatus',
  'subscapularis',
  'teres_major',
  'teres_minor',
  'teres major',
  'teres minor',
  'flexor_digitorum',
  'extensor_digitorum',
  'digiti_minimi',
];

/**
 * Strips the legacy export prefix BONE__<jointId>__ or MUSCLE__<jointId>__ so only the
 * true anatomical structure name is matched against keyword lists.
 */
function getCleanAnatomicalName(rawName: string): string {
  const nl = rawName.toLowerCase();
  const match = nl.match(/^(?:bone|muscle)__[a-z0-9_]+__(.+)$/);
  return match ? match[1] : nl;
}

export function isMicroDebrisMesh(mesh: Mesh, calibration: CalibrationResult): boolean {
  mesh.updateMatrixWorld(true);
  const rawBox = new Box3().setFromObject(mesh);
  if (rawBox.isEmpty()) return true;
  const size = new Vector3();
  rawBox.getSize(size);
  const diagM = size.length() * calibration.modelScale;
  return diagM < 0.015;
}

/**
 * Classifies any mesh (bone, muscle, or tendon) into one of 6 mutually exclusive
 * spatial limb zones based on its normalized bounding-box center, anatomical keywords,
 * and calibrated landmarks.
 */
export function classifyMeshZone(
  mesh: Mesh,
  calibration: CalibrationResult
): LimbZone {
  mesh.updateMatrixWorld(true);
  const rawBox = new Box3().setFromObject(mesh);
  const rawCenter = new Vector3();
  rawBox.getCenter(rawCenter);

  const [ocx, minY] = calibration.centerOffset;
  const s = calibration.modelScale;
  const cx = (rawCenter.x - ocx) * s;
  const cy = (rawCenter.y - minY) * s;

  const cleanName = getCleanAnatomicalName(mesh.name);
  const r = calibration.restPositions;
  const neckY = r.neck[1];

  // 1. Foot / plantar level guard: center.y < anklePos.y + 0.05m MUST be leg_L or leg_R
  const ankleY = (r.ankle_L[1] + r.ankle_R[1]) * 0.5;
  if (cy < ankleY + 0.05) {
    return cx >= 0 ? 'leg_L' : 'leg_R';
  }

  // 2. Head & Neck
  if (
    cy >= neckY - 0.015 ||
    cleanName.includes('skull') ||
    cleanName.includes('cranium') ||
    cleanName.includes('frontal') ||
    cleanName.includes('parietal') ||
    cleanName.includes('temporal') ||
    cleanName.includes('occipital') ||
    cleanName.includes('sphenoid') ||
    cleanName.includes('ethmoid') ||
    cleanName.includes('zygomatic') ||
    cleanName.includes('maxilla') ||
    cleanName.includes('mandible') ||
    cleanName.includes('masseter') ||
    cleanName.includes('sternocleidomastoid') ||
    cleanName.includes('splenius') ||
    cleanName.includes('semispinalis') ||
    cleanName.includes('capitis') ||
    cleanName.includes('cervicis') ||
    cleanName.includes('scalene') ||
    cleanName.includes('platysma')
  ) {
    return 'head_neck';
  }

  // 3. Explicit lower-body / pelvic keyword guard (on clean anatomical name): NEVER classify into arm_L or arm_R
  const hasLowerBodyKeyword = LOWER_BODY_KEYWORDS.some((kw) => cleanName.includes(kw));
  const pelvisY = r.pelvis[1];
  const hipY = (r.hip_L[1] + r.hip_R[1]) * 0.5;
  const hipAbsX = Math.abs(r.hip_L[0]);
  const wristAbsX = Math.abs(r.wrist_L[0]);
  const elbowY = (r.elbow_L[1] + r.elbow_R[1]) * 0.5;

  if (hasLowerBodyKeyword) {
    if (
      cleanName.includes('hip_bone') ||
      cleanName.includes('sacrum') ||
      cleanName.includes('ilium') ||
      cleanName.includes('pubis') ||
      cleanName.includes('ischium') ||
      cleanName.includes('coccyx')
    ) {
      return 'torso';
    }
    return cx >= 0 ? 'leg_L' : 'leg_R';
  }

  // 4. Spatial guard below pelvisPos.y + 0.08m:
  // If close to the thigh/hip surface (|cx| < |hipPos.x| + 0.08m) or not laterally out at the forearm/hand
  // (|cx| <= |wristPos.x| - 0.06m) or below the fingertips (cy <= 0.65m), it CANNOT be an arm mesh!
  const isUpperLimbKeyword =
    UPPER_LIMB_ANATOMY_KEYWORDS.some((kw) => cleanName.includes(kw)) && cy > 0.65;
  const isBelowPelvisMargin = cy < pelvisY + 0.08;
  const isNearThighSurface = Math.abs(cx) < hipAbsX + 0.08;
  const isOutAtHandLateral =
    (Math.abs(cx) > wristAbsX - 0.065 || isUpperLimbKeyword) &&
    !isNearThighSurface &&
    cy > 0.65;

  if (isBelowPelvisMargin && !isOutAtHandLateral) {
    if (cy < hipY + 0.04) {
      return cx >= 0 ? 'leg_L' : 'leg_R';
    }
    return 'torso';
  }

  const shLX = r.shoulder_L[0];
  const shY = (r.shoulder_L[1] + r.shoulder_R[1]) * 0.5;

  // 5. Upper limbs (only if above pelvis margin or verified laterally out at hand/forearm)
  // Always use actual spatial side (cx >= 0 -> arm_L, cx < 0 -> arm_R)
  const canBeArm = !isBelowPelvisMargin || isOutAtHandLateral;

  if (
    canBeArm &&
    (isUpperLimbKeyword ||
      isOutAtHandLateral ||
      (Math.abs(cx) > Math.abs(shLX) * 0.75 && cy > elbowY - 0.25 && cy < shY + 0.12))
  ) {
    return cx >= 0 ? 'arm_L' : 'arm_R';
  }

  if (cy < hipY + 0.04) {
    return cx >= 0 ? 'leg_L' : 'leg_R';
  }

  return 'torso';
}

/**
 * Finds the nearest single driving joint for a rigid bone mesh within its spatial zone,
 * including virtual distal segments for hand_tip, foot_tip, and head_top.
 */
export function findNearestBoneJointInZone(
  mesh: Mesh,
  zone: LimbZone,
  calibration: CalibrationResult
): JointId {
  mesh.updateMatrixWorld(true);
  const rawBox = new Box3().setFromObject(mesh);
  const rawCenter = new Vector3();
  rawBox.getCenter(rawCenter);
  const [ocx, minY] = calibration.centerOffset;
  const s = calibration.modelScale;
  const py = (rawCenter.y - minY) * s;
  const px = (rawCenter.x - ocx) * s;

  const r = calibration.restPositions;

  if (zone === 'head_neck') {
    return py >= r.head[1] - 0.01 ? 'head' : 'neck';
  }

  if (zone === 'arm_L' || zone === 'arm_R') {
    const side = zone === 'arm_L' ? 'L' : 'R';
    const sh = r[`shoulder_${side}` as JointId];
    const el = r[`elbow_${side}` as JointId];
    const wr = r[`wrist_${side}` as JointId];
    const sx = Math.abs(sh[0]);
    if (Math.abs(px) < sx * 0.85 && py > el[1]) return 'thorax';
    if (py <= wr[1] + 0.015) return `wrist_${side}` as JointId;
    if (py <= el[1] + 0.015) return `elbow_${side}` as JointId;
    return `shoulder_${side}` as JointId;
  }

  if (zone === 'leg_L' || zone === 'leg_R') {
    const side = zone === 'leg_L' ? 'L' : 'R';
    const hp = r[`hip_${side}` as JointId];
    const kn = r[`knee_${side}` as JointId];
    const an = r[`ankle_${side}` as JointId];
    if (py <= an[1] + 0.05) return `ankle_${side}` as JointId;
    if (py >= hp[1] + 0.03) return 'pelvis';
    if (py <= kn[1] + 0.015) return `knee_${side}` as JointId;
    return `hip_${side}` as JointId;
  }

  // Torso
  if (py >= r.thorax[1] - 0.03) return 'thorax';
  if (py >= r.lumbar[1] - 0.02) return 'lumbar';
  return 'pelvis';
}

/**
 * Computes strict anatomical vertex weights with:
 * - ±0.055m (5.5cm) clamped transition bands at knee & elbow (0.0 knee weight in mid-thigh!)
 * - Pelvic-gluteal origin pinning above hipPos.y + 0.03m
 * - Dual horizontal & vertical gates for thorax-shoulder boundary (latissimus/pectoralis/serratus/trapezius & vy < shoulderPos.y)
 * - Foot sole 100% ankle binding below anklePos.y + 0.05m
 */
const ROTATOR_CUFF_KEYWORDS = [
  'supraspinatus',
  'infraspinatus',
  'subscapularis',
  'teres_minor',
  'teres minor',
];

const AXILLA_BOUNDARY_KEYWORDS = [
  'latissimus',
  'pectoralis',
  'serratus',
  'teres_major',
  'teres major',
  'trapezius',
  'rhomboid',
  'subclavius',
];

interface VertexBonePair {
  jAIdx: number;
  jBIdx: number;
  jALogical: JointId;
  jBLogical: JointId;
  wB: number;
}

function makePair(jA: JointId, jB: JointId, wB: number): VertexBonePair {
  return {
    jAIdx: JOINT_TO_INDEX[jA],
    jBIdx: JOINT_TO_INDEX[jB],
    jALogical: jA,
    jBLogical: jB,
    wB,
  };
}

/**
 * Unified 3D continuous spatial weight field for the shoulder-axilla region
 * (thorax / scapula [clavicle_L|R] / shoulder_L|R).
 * Shared across both arm and torso zones so chest, back, deltoid, and rotator cuff
 * muscles deform seamlessly without hard plane cutoffs.
 */
function computeShoulderAxillaWeightField(
  vx: number,
  vy: number,
  vz: number,
  side: 'L' | 'R',
  r: Record<JointId, Vec3>,
  meshNameLower: string
): VertexBonePair {
  const shId = `shoulder_${side}` as JointId;
  const elId = `elbow_${side}` as JointId;
  const clavIdx = side === 'L' ? CLAVICLE_L_INDEX : CLAVICLE_R_INDEX;
  const sh = r[shId];
  const el = r[elId];
  const sx = Math.abs(sh[0]);
  const absX = Math.abs(vx);

  // 1. Deltoid: C1 continuous 3D projection from acromion/clavicle (scapula node) to deltoid tuberosity (humerus)
  if (meshNameLower.includes('deltoid')) {
    const acromionX = sh[0] * 0.82;
    const acromionY = sh[1] + 0.05;
    const acromionZ = sh[2];
    const tuberosityX = sh[0] * 1.12;
    const tuberosityY = sh[1] - 0.14;
    const tuberosityZ = sh[2];
    const dx = tuberosityX - acromionX;
    const dy = tuberosityY - acromionY;
    const dz = tuberosityZ - acromionZ;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const t =
      lenSq > 1e-6
        ? clamp(((vx - acromionX) * dx + (vy - acromionY) * dy + (vz - acromionZ) * dz) / lenSq, 0, 1)
        : 1;
    return {
      jAIdx: clavIdx,
      jBIdx: JOINT_TO_INDEX[shId],
      jALogical: 'thorax',
      jBLogical: shId,
      wB: smoothstep(0.04, 0.92, t),
    };
  }

  // 2. Rotator cuff (supraspinatus, infraspinatus, subscapularis, teres minor):
  // Driven between scapula (clavicle_L/R) and humerus (shoulder_L/R) along medial-to-humeral-head axis
  if (ROTATOR_CUFF_KEYWORDS.some((kw) => meshNameLower.includes(kw))) {
    const scapX = sh[0] * 0.42;
    const scapY = sh[1] - 0.015;
    const scapZ = sh[2] - 0.03;
    const dx = sh[0] - scapX;
    const dy = sh[1] - scapY;
    const dz = sh[2] - scapZ;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const t =
      lenSq > 1e-6
        ? clamp(((vx - scapX) * dx + (vy - scapY) * dy + (vz - scapZ) * dz) / lenSq, 0, 1)
        : 0;
    return {
      jAIdx: clavIdx,
      jBIdx: JOINT_TO_INDEX[shId],
      jALogical: 'thorax',
      jBLogical: shId,
      wB: smoothstep(0.22, 0.92, t),
    };
  }

  // 3. Unified wider 3D continuous Gaussian humerus-axis field for thoracohumeral / axilla muscles
  // Widened 11.5 cm falloff prevents abrupt creases/tearing in pectorals & lats during overhead lifts
  const hx = (sh[0] + el[0]) * 0.55;
  const hy = (sh[1] + el[1]) * 0.48;
  const hz = (sh[2] + el[2]) * 0.5;
  const abx = hx - sh[0];
  const aby = hy - sh[1];
  const abz = hz - sh[2];
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const tSeg =
    abLenSq > 1e-8
      ? clamp(((vx - sh[0]) * abx + (vy - sh[1]) * aby + (vz - sh[2]) * abz) / abLenSq, 0, 1)
      : 0;
  const cx = sh[0] + abx * tSeg;
  const cy = sh[1] + aby * tSeg;
  const cz = sh[2] + abz * tSeg;
  const dHumerus = Math.hypot(vx - cx, vy - cy, vz - cz);
  const wArm =
    Math.exp(-Math.pow(dHumerus / 0.115, 2)) *
    smoothstep(sh[1] - 0.24, sh[1] - 0.01, vy) *
    smoothstep(sx * 0.28, sx * 0.90, absX);
  return makePair('thorax', shId, wArm);
}

function computeVertexJointPairAndWeight(
  vx: number,
  vy: number,
  vz: number,
  zone: LimbZone,
  r: Record<JointId, Vec3>,
  meshNameLower: string = '',
  isMedialOriginMesh: boolean = false
): VertexBonePair {
  const TRANSITION_M = 0.055; // strict ±5.5cm transition band for knee & elbow hinge
  const DISTAL_TRANSITION_M = 0.025; // strict ±2.5cm transition band for wrist & ankle

  if (zone === 'leg_L' || zone === 'leg_R') {
    const side = zone === 'leg_L' ? 'L' : 'R';
    const hipId = `hip_${side}` as JointId;
    const kneeId = `knee_${side}` as JointId;
    const ankleId = `ankle_${side}` as JointId;

    const hipY = r[hipId][1];
    const kneeY = r[kneeId][1];
    const ankleY = r[ankleId][1];

    // 0. Foot sole / plantar guard: below ankleY - 0.025m is 100% bound to ankle
    if (vy < ankleY - DISTAL_TRANSITION_M) {
      return makePair(kneeId, ankleId, 1.0);
    }

    // 1. Pelvic-Hip gluteal origin pinning with smooth 19cm transition
    if (vy >= hipY - 0.15) {
      const wHip = smoothstep(hipY + 0.04, hipY - 0.15, vy);
      return makePair('pelvis', hipId, wHip);
    }

    // 2. Mid-thigh down to Knee transition (strict ±5.5cm around kneeY)
    if (vy >= kneeY - TRANSITION_M) {
      const wKnee = smoothstep(kneeY + TRANSITION_M, kneeY - TRANSITION_M, vy);
      return makePair(hipId, kneeId, wKnee);
    }

    // 3. Lower leg down to Ankle + Foot virtual segment (strict ±2.5cm around ankleY)
    const wAnkle = smoothstep(ankleY + DISTAL_TRANSITION_M, ankleY - DISTAL_TRANSITION_M, vy);
    return makePair(kneeId, ankleId, wAnkle);
  }

  if (zone === 'arm_L' || zone === 'arm_R') {
    const side = zone === 'arm_L' ? 'L' : 'R';
    const shId = `shoulder_${side}` as JointId;
    const elId = `elbow_${side}` as JointId;
    const wrId = `wrist_${side}` as JointId;
    const elbowHingeIdx = side === 'L' ? ELBOW_HINGE_L_INDEX : ELBOW_HINGE_R_INDEX;
    const forearmMidIdx = side === 'L' ? FOREARM_MID_L_INDEX : FOREARM_MID_R_INDEX;

    const sh = r[shId];
    const el = r[elId];
    const wr = r[wrId];
    const sx = Math.abs(sh[0]);
    const absX = Math.abs(vx);

    const isDeltoid = meshNameLower.includes('deltoid');
    const isRotatorCuff = ROTATOR_CUFF_KEYWORDS.some((kw) => meshNameLower.includes(kw));
    const isAxillaMuscle = AXILLA_BOUNDARY_KEYWORDS.some((kw) => meshNameLower.includes(kw));

    // 1. Unified 3D shoulder-axilla spatial weight field (deltoid, rotator cuff, axilla/medial-origin muscles)
    if (
      isDeltoid ||
      isRotatorCuff ||
      isAxillaMuscle ||
      isMedialOriginMesh ||
      (absX < sx - 0.02 && vy > el[1] + TRANSITION_M)
    ) {
      return computeShoulderAxillaWeightField(vx, vy, vz, side, r, meshNameLower);
    }

    // 2. Upper arm into pure flexion/abduction elbow hinge (zero axial twist at elbow crease)
    if (vy >= el[1] - TRANSITION_M) {
      const wHinge = smoothstep(el[1] + TRANSITION_M, el[1] - TRANSITION_M, vy);
      return {
        jAIdx: JOINT_TO_INDEX[shId],
        jBIdx: elbowHingeIdx,
        jALogical: shId,
        jBLogical: elId,
        wB: wHinge,
      };
    }

    // 3. Progressive forearm pronation/supination: 0% at elbow_hinge -> 50% at forearm_mid -> 100% at wrist entry
    const midForearmY = (el[1] - TRANSITION_M + wr[1] + DISTAL_TRANSITION_M) * 0.5;
    if (vy >= midForearmY) {
      const wMid = smoothstep(el[1] - TRANSITION_M, midForearmY, vy);
      return {
        jAIdx: elbowHingeIdx,
        jBIdx: forearmMidIdx,
        jALogical: elId,
        jBLogical: elId,
        wB: wMid,
      };
    }
    if (vy >= wr[1] + DISTAL_TRANSITION_M) {
      const wDistal = smoothstep(midForearmY, wr[1] + DISTAL_TRANSITION_M, vy);
      return {
        jAIdx: forearmMidIdx,
        jBIdx: JOINT_TO_INDEX[elId],
        jALogical: elId,
        jBLogical: elId,
        wB: wDistal,
      };
    }

    // 4. Wrist + Hand virtual segment (strict ±2.5cm around wr.y)
    const wWrist = smoothstep(wr[1] + DISTAL_TRANSITION_M, wr[1] - DISTAL_TRANSITION_M, vy);
    return makePair(elId, wrId, wWrist);
  }

  if (zone === 'head_neck') {
    const neckY = r.neck[1];
    const headY = r.head[1];
    const thoraxTopY = Math.min(neckY - 0.07, r.thorax[1] + 0.16);
    if (vy <= neckY) {
      const wNeck = smoothstep(thoraxTopY, neckY, vy);
      return makePair('thorax', 'neck', wNeck);
    }
    const wHead = smoothstep(neckY, headY - 0.03, vy);
    return makePair('neck', 'head', wHead);
  }

  // Torso (pelvis -> lumbar -> thorax -> neck/head or shoulder-axilla field)
  const lumbarY = r.lumbar[1];
  const thoraxY = r.thorax[1];
  const neckY = r.neck[1];
  const headY = r.head[1];
  const hipY = (r.hip_L[1] + r.hip_R[1]) * 0.5;
  const shSide: 'L' | 'R' = vx >= 0 ? 'L' : 'R';
  const sh = r[`shoulder_${shSide}` as JointId];
  const sx = Math.abs(sh[0]);
  const absX = Math.abs(vx);

  // Unified 3D shoulder-axilla field for wide chest/back/scapular muscles in torso zone
  if (vy > lumbarY && vy > sh[1] - 0.24 && absX >= sx * 0.28) {
    const shPair = computeShoulderAxillaWeightField(vx, vy, vz, shSide, r, meshNameLower);
    if (shPair.wB > 1e-4) {
      return shPair;
    }
  }

  // Continuous neck transition for upper trapezius / splenius extending above thoraxTopY
  const thoraxTopY = Math.min(neckY - 0.07, thoraxY + 0.16);
  if (vy > thoraxTopY && absX < sx - 0.04) {
    if (vy <= neckY) {
      const wNeck = smoothstep(thoraxTopY, neckY, vy);
      return makePair('thorax', 'neck', wNeck);
    }
    const wHead = smoothstep(neckY, headY - 0.03, vy);
    return makePair('neck', 'head', wHead);
  }

  // If a torso/gluteal muscle extends below lumbar into the hip region
  if (vy < hipY + 0.04) {
    const side = vx >= 0 ? 'L' : 'R';
    const hipId = `hip_${side}` as JointId;
    const wHip = smoothstep(hipY + 0.04, hipY - 0.15, vy);
    return makePair('pelvis', hipId, wHip);
  }

  if (vy <= lumbarY + 0.04) {
    const wLumbar = smoothstep(lumbarY - 0.04, lumbarY + 0.04, vy);
    return makePair('pelvis', 'lumbar', wLumbar);
  }

  const wThorax = smoothstep(thoraxY - 0.06, thoraxY + 0.02, vy);
  return makePair('lumbar', 'thorax', wThorax);
}

/**
 * Prepares per-vertex Dual Quaternion Skinning (DQS) data with baked world rest positions.
 */
export function prepareAutoSkinnedMuscle(
  mesh: Mesh,
  zone: LimbZone,
  calibration: CalibrationResult
): SkinnedMuscleData {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.clone();
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const count = posAttr.count;

  const [ocx, minY, ocz] = calibration.centerOffset;
  const s = calibration.modelScale;
  const r = calibration.restPositions;

  const jointAIndices = new Uint8Array(count);
  const jointBIndices = new Uint8Array(count);
  const weightsB = new Float32Array(count);
  const restPositions = new Float32Array(count * 3);
  const restNormals = new Float32Array(count * 3);

  const usedSet = new Set<JointId>();
  const v = new Vector3();

  const meshNameLower = mesh.name.toLowerCase();
  let minX = Infinity, minYBox = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxYBox = -Infinity, maxZ = -Infinity;
  let minAbsX = Infinity;

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    const wx = (v.x - ocx) * s;
    const wy = (v.y - minY) * s;
    const wz = (v.z - ocz) * s;

    if (wx < minX) minX = wx;
    if (wy < minYBox) minYBox = wy;
    if (wz < minZ) minZ = wz;
    if (wx > maxX) maxX = wx;
    if (wy > maxYBox) maxYBox = wy;
    if (wz > maxZ) maxZ = wz;
    const ax = Math.abs(wx);
    if (ax < minAbsX) minAbsX = ax;

    const i3 = i * 3;
    restPositions[i3] = wx;
    restPositions[i3 + 1] = wy;
    restPositions[i3 + 2] = wz;
  }

  const isMedialOriginMesh =
    (zone === 'arm_L' || zone === 'arm_R') &&
    minAbsX < Math.abs(r.shoulder_L[0]) * 0.55;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const wx = restPositions[i3];
    const wy = restPositions[i3 + 1];
    const wz = restPositions[i3 + 2];

    const pair = computeVertexJointPairAndWeight(
      wx,
      wy,
      wz,
      zone,
      r,
      meshNameLower,
      isMedialOriginMesh
    );

    jointAIndices[i] = pair.jAIdx;
    jointBIndices[i] = pair.jBIdx;
    weightsB[i] = pair.wB;
    usedSet.add(pair.jALogical);
    usedSet.add(pair.jBLogical);

    if (normAttr) {
      restNormals[i3] = normAttr.getX(i);
      restNormals[i3 + 1] = normAttr.getY(i);
      restNormals[i3 + 2] = normAttr.getZ(i);
    } else {
      restNormals[i3] = 0;
      restNormals[i3 + 1] = 1;
      restNormals[i3 + 2] = 0;
    }

    posAttr.setXYZ(i, wx, wy, wz);
  }

  posAttr.needsUpdate = true;

  // Deduplicated, UV-seam-welded, cross-joint-aware Laplacian weight smoothing (3 iterations)
  const indexAttr = geo.getIndex();
  if (indexAttr && usedSet.size > 1) {
    // 1. Spatial weld groups (0.5 mm quantization) to weld UV seams
    const weldKeyToGroup = new Map<string, number>();
    const vertexGroup = new Int32Array(count);
    const groupMembers: number[][] = [];
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const key = `${Math.round(restPositions[i3] * 2000)},${Math.round(
        restPositions[i3 + 1] * 2000
      )},${Math.round(restPositions[i3 + 2] * 2000)}`;
      let g = weldKeyToGroup.get(key);
      if (g === undefined) {
        g = groupMembers.length;
        weldKeyToGroup.set(key, g);
        groupMembers.push([i]);
      } else {
        groupMembers[g].push(i);
      }
      vertexGroup[i] = g;
    }

    // 2. Deduplicated neighbor sets on welded vertex groups
    const groupCount = groupMembers.length;
    const groupNeighbors: Array<Set<number>> = Array.from(
      { length: groupCount },
      () => new Set<number>()
    );
    const idxArr = indexAttr.array;
    for (let t = 0; t + 2 < idxArr.length; t += 3) {
      const ga = vertexGroup[idxArr[t]];
      const gb = vertexGroup[idxArr[t + 1]];
      const gc = vertexGroup[idxArr[t + 2]];
      if (ga !== gb) {
        groupNeighbors[ga].add(gb);
        groupNeighbors[gb].add(ga);
      }
      if (gb !== gc) {
        groupNeighbors[gb].add(gc);
        groupNeighbors[gc].add(gb);
      }
      if (gc !== ga) {
        groupNeighbors[gc].add(ga);
        groupNeighbors[ga].add(gc);
      }
    }

    const wNext = new Float32Array(count);
    for (let iter = 0; iter < 3; iter++) {
      for (let g = 0; g < groupCount; g++) {
        const members = groupMembers[g];
        const rep = members[0];
        const curW = weightsB[rep];
        const ja = jointAIndices[rep];
        const jb = jointBIndices[rep];
        const nbrGroups = groupNeighbors[g];

        // Preserve pure rigid anchors so origin/insertion attachment never drifts
        if (nbrGroups.size === 0 || curW <= 1e-4 || curW >= 0.9999) {
          for (let m = 0; m < members.length; m++) {
            wNext[members[m]] = curW;
          }
          continue;
        }

        let sum = 0;
        let cnt = 0;
        for (const ng of nbrGroups) {
          const nb = groupMembers[ng][0];
          const nja = jointAIndices[nb];
          const njb = jointBIndices[nb];
          const nw = weightsB[nb];
          if (nja === ja && njb === jb) {
            sum += nw;
            cnt++;
          } else if (nja === jb && njb === ja) {
            sum += 1 - nw;
            cnt++;
          } else if (njb === ja) {
            // Proximal chain neighbor transitioning into ja -> weight on jb is 0
            sum += 0;
            cnt++;
          } else if (nja === jb) {
            // Distal chain neighbor transitioning out of jb -> weight on jb is 1
            sum += 1;
            cnt++;
          }
        }
        const smoothed = cnt > 0 ? clamp(0.55 * curW + 0.45 * (sum / cnt), 0, 1) : curW;
        for (let m = 0; m < members.length; m++) {
          const vi = members[m];
          jointAIndices[vi] = ja;
          jointBIndices[vi] = jb;
          wNext[vi] = smoothed;
        }
      }
      weightsB.set(wNext);
    }
  }

  // Write static GPU DQS attributes (aBoneIndex, aBoneWeight) onto the cloned geometry!
  const aBoneIndex = new Float32Array(count * 2);
  const aBoneWeight = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const i2 = i * 2;
    aBoneIndex[i2] = jointAIndices[i];
    aBoneIndex[i2 + 1] = jointBIndices[i];
    const wb = weightsB[i];
    aBoneWeight[i2] = 1 - wb;
    aBoneWeight[i2 + 1] = wb;
  }
  geo.setAttribute('aBoneIndex', new Float32BufferAttribute(aBoneIndex, 2));
  geo.setAttribute('aBoneWeight', new Float32BufferAttribute(aBoneWeight, 2));

  const usedJoints = Array.from(usedSet);
  const primaryJoint = usedJoints[0] ?? 'pelvis';
  const secondaryJoint = usedJoints[1] ?? primaryJoint;

  const pO = r[primaryJoint];
  const pI = r[secondaryJoint];
  const restLength = Math.max(
    Math.hypot(pI[0] - pO[0], pI[1] - pO[1], pI[2] - pO[2]),
    0.05
  );
  const restDiagLength = Math.max(
    Math.hypot(maxX - minX, maxYBox - minYBox, maxZ - minZ),
    0.02
  );
  const restCenter: Vec3 = [
    (minX + maxX) * 0.5,
    (minYBox + maxYBox) * 0.5,
    (minZ + maxZ) * 0.5,
  ];

  return {
    name: mesh.name,
    geometry: geo,
    zone,
    primaryJoint,
    secondaryJoint,
    vertexCount: count,
    jointAIndices,
    jointBIndices,
    weightsB,
    restPositions,
    restNormals,
    restLength,
    restDiagLength,
    restCenter,
    usedJoints,
  };
}

// Pre-allocated DQS Dual Quaternion table for all 19 bones (17 standard + clavicle_L + clavicle_R):
// [rx, ry, rz, rw, dx, dy, dz, dw]
const _jointDQ = new Float32Array(TOTAL_SKIN_BONES * 8);
const _qTmp = new Quaternion();
const _neutralPoseFallback = createNeutralPose();

function writeBoneDQ(
  idx: number,
  rx: number,
  ry: number,
  rz: number,
  rw: number,
  worldPos: Vec3,
  restPos: Vec3,
  hScale: number
) {
  _qTmp.set(rx, ry, rz, rw).normalize();
  const qx = _qTmp.x;
  const qy = _qTmp.y;
  const qz = _qTmp.z;
  const qw = _qTmp.w;

  const prx = restPos[0] * hScale;
  const pry = restPos[1] * hScale;
  const prz = restPos[2] * hScale;

  const cx1 = qy * prz - qz * pry + qw * prx;
  const cy1 = qz * prx - qx * prz + qw * pry;
  const cz1 = qx * pry - qy * prx + qw * prz;
  const rotX = prx + 2 * (qy * cz1 - qz * cy1);
  const rotY = pry + 2 * (qz * cx1 - qx * cz1);
  const rotZ = prz + 2 * (qx * cy1 - qy * cx1);

  const tx = worldPos[0] - rotX;
  const ty = worldPos[1] - rotY;
  const tz = worldPos[2] - rotZ;

  const dx = 0.5 * (tx * qw + ty * qz - tz * qy);
  const dy = 0.5 * (-tx * qz + ty * qw + tz * qx);
  const dz = 0.5 * (tx * qy - ty * qx + tz * qw);
  const dw = -0.5 * (tx * qx + ty * qy + tz * qz);

  const base = idx * 8;
  _jointDQ[base] = qx;
  _jointDQ[base + 1] = qy;
  _jointDQ[base + 2] = qz;
  _jointDQ[base + 3] = qw;
  _jointDQ[base + 4] = dx;
  _jointDQ[base + 5] = dy;
  _jointDQ[base + 6] = dz;
  _jointDQ[base + 7] = dw;
}

export function buildJointDualQuaternions(
  kinematics: KinematicsResult,
  restJointPositions: Record<JointId, Vec3>,
  hScale: number,
  pose: PoseMap = _neutralPoseFallback
) {
  for (let idx = 0; idx < ALL_JOINTS.length; idx++) {
    const id = ALL_JOINTS[idx];
    const j = kinematics.joints[id];
    const rPos = restJointPositions[id];
    writeBoneDQ(
      idx,
      j.worldQuaternion[0],
      j.worldQuaternion[1],
      j.worldQuaternion[2],
      j.worldQuaternion[3],
      j.worldPosition,
      rPos,
      hScale
    );
  }

  const thorax = kinematics.joints.thorax;
  const clavL = computeClavicleWorldState(
    'L',
    pose,
    thorax,
    restJointPositions.shoulder_L,
    restJointPositions.thorax,
    hScale
  );
  writeBoneDQ(
    CLAVICLE_L_INDEX,
    clavL.worldQuaternion[0],
    clavL.worldQuaternion[1],
    clavL.worldQuaternion[2],
    clavL.worldQuaternion[3],
    clavL.worldPosition,
    clavL.restPosition,
    hScale
  );

  const clavR = computeClavicleWorldState(
    'R',
    pose,
    thorax,
    restJointPositions.shoulder_R,
    restJointPositions.thorax,
    hScale
  );
  writeBoneDQ(
    CLAVICLE_R_INDEX,
    clavR.worldQuaternion[0],
    clavR.worldQuaternion[1],
    clavR.worldQuaternion[2],
    clavR.worldQuaternion[3],
    clavR.worldPosition,
    clavR.restPosition,
    hScale
  );

  const hingeL = computeForearmTwistState('L', pose, kinematics, 0, restJointPositions.elbow_L, restJointPositions.wrist_L);
  writeBoneDQ(
    ELBOW_HINGE_L_INDEX,
    hingeL.worldQuaternion[0],
    hingeL.worldQuaternion[1],
    hingeL.worldQuaternion[2],
    hingeL.worldQuaternion[3],
    hingeL.worldPosition,
    hingeL.restPosition,
    hScale
  );

  const hingeR = computeForearmTwistState('R', pose, kinematics, 0, restJointPositions.elbow_R, restJointPositions.wrist_R);
  writeBoneDQ(
    ELBOW_HINGE_R_INDEX,
    hingeR.worldQuaternion[0],
    hingeR.worldQuaternion[1],
    hingeR.worldQuaternion[2],
    hingeR.worldQuaternion[3],
    hingeR.worldPosition,
    hingeR.restPosition,
    hScale
  );

  const midL = computeForearmTwistState('L', pose, kinematics, 0.5, restJointPositions.elbow_L, restJointPositions.wrist_L);
  writeBoneDQ(
    FOREARM_MID_L_INDEX,
    midL.worldQuaternion[0],
    midL.worldQuaternion[1],
    midL.worldQuaternion[2],
    midL.worldQuaternion[3],
    midL.worldPosition,
    midL.restPosition,
    hScale
  );

  const midR = computeForearmTwistState('R', pose, kinematics, 0.5, restJointPositions.elbow_R, restJointPositions.wrist_R);
  writeBoneDQ(
    FOREARM_MID_R_INDEX,
    midR.worldQuaternion[0],
    midR.worldQuaternion[1],
    midR.worldQuaternion[2],
    midR.worldQuaternion[3],
    midR.worldPosition,
    midR.restPosition,
    hScale
  );
}

/**
 * Evaluates a single skinned vertex's world position using the currently built _jointDQ table.
 * Used for zero-GC anchor-only strain computation when full-mesh skinning runs on GPU.
 */
export function evaluateSkinnedVertexFromTable(
  data: SkinnedMuscleData,
  vertexIndex: number,
  hScale: number,
  out: Vector3
): Vector3 {
  const baseA = data.jointAIndices[vertexIndex] * 8;
  const baseB = data.jointBIndices[vertexIndex] * 8;
  const wB = data.weightsB[vertexIndex];
  const wA = 1 - wB;

  let rx = _jointDQ[baseA];
  let ry = _jointDQ[baseA + 1];
  let rz = _jointDQ[baseA + 2];
  let rw = _jointDQ[baseA + 3];
  let dx = _jointDQ[baseA + 4];
  let dy = _jointDQ[baseA + 5];
  let dz = _jointDQ[baseA + 6];
  let dw = _jointDQ[baseA + 7];

  if (wB > 1e-5) {
    let rBx = _jointDQ[baseB];
    let rBy = _jointDQ[baseB + 1];
    let rBz = _jointDQ[baseB + 2];
    let rBw = _jointDQ[baseB + 3];
    let dBx = _jointDQ[baseB + 4];
    let dBy = _jointDQ[baseB + 5];
    let dBz = _jointDQ[baseB + 6];
    let dBw = _jointDQ[baseB + 7];

    const dot = rx * rBx + ry * rBy + rz * rBz + rw * rBw;
    if (dot < 0) {
      rBx = -rBx; rBy = -rBy; rBz = -rBz; rBw = -rBw;
      dBx = -dBx; dBy = -dBy; dBz = -dBz; dBw = -dBw;
    }

    rx = wA * rx + wB * rBx;
    ry = wA * ry + wB * rBy;
    rz = wA * rz + wB * rBz;
    rw = wA * rw + wB * rBw;
    dx = wA * dx + wB * dBx;
    dy = wA * dy + wB * dBy;
    dz = wA * dz + wB * dBz;
    dw = wA * dw + wB * dBw;

    const invNorm = 1 / Math.hypot(rx, ry, rz, rw);
    rx *= invNorm; ry *= invNorm; rz *= invNorm; rw *= invNorm;
    dx *= invNorm; dy *= invNorm; dz *= invNorm; dw *= invNorm;
  }

  const tx = 2 * (-dw * rx + dx * rw - dy * rz + dz * ry);
  const ty = 2 * (-dw * ry + dx * rz + dy * rw - dz * rx);
  const tz = 2 * (-dw * rz - dx * ry + dy * rx + dz * rw);

  const i3 = vertexIndex * 3;
  const vx = data.restPositions[i3] * hScale;
  const vy = data.restPositions[i3 + 1] * hScale;
  const vz = data.restPositions[i3 + 2] * hScale;

  const cx1 = ry * vz - rz * vy + rw * vx;
  const cy1 = rz * vx - rx * vz + rw * vy;
  const cz1 = rx * vy - ry * vx + rw * vz;

  return out.set(
    vx + 2 * (ry * cz1 - rz * cy1) + tx,
    vy + 2 * (rz * cx1 - rx * cz1) + ty,
    vz + 2 * (rx * cy1 - ry * cx1) + tz
  );
}

/**
 * Restores exact rest-pose positions & normals onto a muscle geometry (required before GPU DQS rendering
 * if CPU skinning was run during integrity self-check).
 */
export function restoreRestMuscleVertices(data: SkinnedMuscleData): void {
  const posAttr = data.geometry.getAttribute('position');
  const normAttr = data.geometry.getAttribute('normal');
  const { vertexCount, restPositions, restNormals } = data;
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3;
    posAttr.setXYZ(i, restPositions[i3], restPositions[i3 + 1], restPositions[i3 + 2]);
    if (normAttr) {
      normAttr.setXYZ(i, restNormals[i3], restNormals[i3 + 1], restNormals[i3 + 2]);
    }
  }
  posAttr.needsUpdate = true;
  if (normAttr) normAttr.needsUpdate = true;
}

/**
 * Updates auto-skinned muscle vertices in-place using Dual Quaternion Skinning (DQS).
 * Guarantees zero volume collapse and shortest-path antipodal sign handling.
 */
export function updateSkinnedMuscleVertices(
  data: SkinnedMuscleData,
  kinematics: KinematicsResult,
  heightM: number,
  restJointPositions: Record<JointId, Vec3>,
  pose: PoseMap = _neutralPoseFallback
): number {
  const hScale = heightM / DEFAULT_HEIGHT_M;
  buildJointDualQuaternions(kinematics, restJointPositions, hScale, pose);

  const posAttr = data.geometry.getAttribute('position');
  const normAttr = data.geometry.getAttribute('normal');
  const {
    vertexCount,
    jointAIndices,
    jointBIndices,
    weightsB,
    restPositions,
    restNormals,
  } = data;

  for (let i = 0; i < vertexCount; i++) {
    const baseA = jointAIndices[i] * 8;
    const baseB = jointBIndices[i] * 8;
    const wB = weightsB[i];
    const wA = 1 - wB;

    const rAx = _jointDQ[baseA];
    const rAy = _jointDQ[baseA + 1];
    const rAz = _jointDQ[baseA + 2];
    const rAw = _jointDQ[baseA + 3];
    const dAx = _jointDQ[baseA + 4];
    const dAy = _jointDQ[baseA + 5];
    const dAz = _jointDQ[baseA + 6];
    const dAw = _jointDQ[baseA + 7];

    let rx = rAx;
    let ry = rAy;
    let rz = rAz;
    let rw = rAw;
    let dx = dAx;
    let dy = dAy;
    let dz = dAz;
    let dw = dAw;

    if (wB > 1e-5) {
      let rBx = _jointDQ[baseB];
      let rBy = _jointDQ[baseB + 1];
      let rBz = _jointDQ[baseB + 2];
      let rBw = _jointDQ[baseB + 3];
      let dBx = _jointDQ[baseB + 4];
      let dBy = _jointDQ[baseB + 5];
      let dBz = _jointDQ[baseB + 6];
      let dBw = _jointDQ[baseB + 7];

      // Shortest-path antipodal check (dot < 0 -> flip sign)
      const dot = rAx * rBx + rAy * rBy + rAz * rBz + rAw * rBw;
      if (dot < 0) {
        rBx = -rBx;
        rBy = -rBy;
        rBz = -rBz;
        rBw = -rBw;
        dBx = -dBx;
        dBy = -dBy;
        dBz = -dBz;
        dBw = -dBw;
      }

      rx = wA * rAx + wB * rBx;
      ry = wA * rAy + wB * rBy;
      rz = wA * rAz + wB * rBz;
      rw = wA * rAw + wB * rBw;

      dx = wA * dAx + wB * dBx;
      dy = wA * dAy + wB * dBy;
      dz = wA * dAz + wB * dBz;
      dw = wA * dAw + wB * dBw;

      const invNorm = 1 / Math.hypot(rx, ry, rz, rw);
      rx *= invNorm;
      ry *= invNorm;
      rz *= invNorm;
      rw *= invNorm;
      dx *= invNorm;
      dy *= invNorm;
      dz *= invNorm;
      dw *= invNorm;
    }

    // Reconstruct translation from blended dual quaternion: t = 2 * (q_d * conjugate(q_r)).xyz
    const tx = 2 * (-dw * rx + dx * rw - dy * rz + dz * ry);
    const ty = 2 * (-dw * ry + dx * rz + dy * rw - dz * rx);
    const tz = 2 * (-dw * rz - dx * ry + dy * rx + dz * rw);

    const i3 = i * 3;
    const vx = restPositions[i3] * hScale;
    const vy = restPositions[i3 + 1] * hScale;
    const vz = restPositions[i3 + 2] * hScale;

    // Rotate rest vertex by blended (rx, ry, rz, rw) and add translation
    const cx1 = ry * vz - rz * vy + rw * vx;
    const cy1 = rz * vx - rx * vz + rw * vy;
    const cz1 = rx * vy - ry * vx + rw * vz;

    posAttr.setXYZ(
      i,
      vx + 2 * (ry * cz1 - rz * cy1) + tx,
      vy + 2 * (rz * cx1 - rx * cz1) + ty,
      vz + 2 * (rx * cy1 - ry * cx1) + tz
    );

    if (normAttr) {
      const nx = restNormals[i3];
      const ny = restNormals[i3 + 1];
      const nz = restNormals[i3 + 2];
      const ncx = ry * nz - rz * ny + rw * nx;
      const ncy = rz * nx - rx * nz + rw * ny;
      const ncz = rx * ny - ry * nx + rw * nz;
      normAttr.setXYZ(
        i,
        nx + 2 * (ry * ncz - rz * ncy),
        ny + 2 * (rz * ncx - rx * ncz),
        nz + 2 * (rx * ncy - ry * ncx)
      );
    }
  }

  posAttr.needsUpdate = true;
  if (normAttr) normAttr.needsUpdate = true;

  const jO = kinematics.joints[data.primaryJoint];
  const jI = kinematics.joints[data.secondaryJoint];
  const curLen = Math.hypot(
    jI.worldPosition[0] - jO.worldPosition[0],
    jI.worldPosition[1] - jO.worldPosition[1],
    jI.worldPosition[2] - jO.worldPosition[2]
  );
  return curLen / Math.max(data.restLength * hScale, 0.05);
}

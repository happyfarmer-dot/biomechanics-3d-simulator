import { Box3, BufferGeometry, Mesh, Quaternion, Vector3 } from 'three';
import { DEFAULT_HEIGHT_M } from '../data/skeletonConfig';
import type { JointId, KinematicsResult, Vec3 } from '../types/biomechanics';
import type { CalibrationResult } from './calibrateSkeleton';

export type LimbZone = 'arm_L' | 'arm_R' | 'leg_L' | 'leg_R' | 'head_neck' | 'torso';

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
const AXILLA_BOUNDARY_KEYWORDS = [
  'latissimus',
  'pectoralis',
  'serratus',
  'teres_major',
  'teres_minor',
  'teres major',
  'teres minor',
  'trapezius',
  'rhomboid',
  'subclavius',
];

function computeVertexJointPairAndWeight(
  vx: number,
  vy: number,
  vz: number,
  zone: LimbZone,
  r: Record<JointId, Vec3>,
  meshNameLower: string = ''
): { jA: JointId; jB: JointId; wB: number } {
  const TRANSITION_M = 0.055; // strict ±5.5cm transition band for knee & elbow
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
      return { jA: kneeId, jB: ankleId, wB: 1.0 };
    }

    // 1. Pelvic-Hip gluteal origin pinning: above hipY + 0.03m is 100% pelvis
    if (vy >= hipY - 0.12) {
      const wHip = smoothstep(hipY + 0.03, hipY - 0.12, vy);
      return { jA: 'pelvis', jB: hipId, wB: wHip };
    }

    // 2. Mid-thigh down to Knee transition (strict ±5.5cm around kneeY)
    if (vy >= kneeY - TRANSITION_M) {
      const wKnee = smoothstep(kneeY + TRANSITION_M, kneeY - TRANSITION_M, vy);
      return { jA: hipId, jB: kneeId, wB: wKnee };
    }

    // 3. Lower leg down to Ankle + Foot virtual segment (strict ±2.5cm around ankleY)
    const wAnkle = smoothstep(ankleY + DISTAL_TRANSITION_M, ankleY - DISTAL_TRANSITION_M, vy);
    return { jA: kneeId, jB: ankleId, wB: wAnkle };
  }

  if (zone === 'arm_L' || zone === 'arm_R') {
    const side = zone === 'arm_L' ? 'L' : 'R';
    const shId = `shoulder_${side}` as JointId;
    const elId = `elbow_${side}` as JointId;
    const wrId = `wrist_${side}` as JointId;

    const sh = r[shId];
    const el = r[elId];
    const wr = r[wrId];
    const sx = Math.abs(sh[0]);
    const absX = Math.abs(vx);
    const isAxillaMuscle = AXILLA_BOUNDARY_KEYWORDS.some((kw) =>
      meshNameLower.includes(kw)
    );
    const dShoulder = Math.hypot(vx - sh[0], vy - sh[1], vz - sh[2]);

    // 1. Strict Thorax-Shoulder origin pinning (eliminates flying-squirrel armpit wing membrane):
    // For latissimus/pectoralis/serratus/teres OR vertices medial to the humeral head (absX < sx - 0.02)
    if (isAxillaMuscle || (absX < sx - 0.02 && vy > el[1] + TRANSITION_M)) {
      if (vy < sh[1] + 0.02) {
        if (vy < sh[1] - 0.09 || (dShoulder > 0.13 && absX < sx - 0.02)) {
          return { jA: 'thorax', jB: shId, wB: 0.0 };
        }
        const wxGate = smoothstep(sx - 0.02, sx + 0.035, absX);
        const wyGate = smoothstep(sh[1] - 0.09, sh[1] - 0.02, vy);
        return { jA: 'thorax', jB: shId, wB: wxGate * wyGate };
      }
      const wxGate = smoothstep(sx - 0.05, sx + 0.02, absX);
      return { jA: 'thorax', jB: shId, wB: wxGate };
    }

    // 2. Upper arm down to Elbow transition (strict ±5.5cm around el.y)
    if (vy >= el[1] - TRANSITION_M) {
      const wElbow = smoothstep(el[1] + TRANSITION_M, el[1] - TRANSITION_M, vy);
      return { jA: shId, jB: elId, wB: wElbow };
    }

    // 3. Forearm down to Wrist + Hand virtual segment (strict ±2.5cm around wr.y, no ballooning)
    const wWrist = smoothstep(wr[1] + DISTAL_TRANSITION_M, wr[1] - DISTAL_TRANSITION_M, vy);
    return { jA: elId, jB: wrId, wB: wWrist };
  }

  if (zone === 'head_neck') {
    const neckY = r.neck[1];
    const headY = r.head[1];
    const thoraxTopY = Math.min(neckY - 0.07, r.thorax[1] + 0.16);
    if (vy <= neckY) {
      const wNeck = smoothstep(thoraxTopY, neckY, vy);
      return { jA: 'thorax', jB: 'neck', wB: wNeck };
    }
    const wHead = smoothstep(neckY, headY - 0.03, vy);
    return { jA: 'neck', jB: 'head', wB: wHead };
  }

  // Torso (pelvis -> lumbar -> thorax -> neck/head if extending above thoraxTopY)
  const lumbarY = r.lumbar[1];
  const thoraxY = r.thorax[1];
  const neckY = r.neck[1];
  const headY = r.head[1];
  const hipY = (r.hip_L[1] + r.hip_R[1]) * 0.5;
  const shSide = vx >= 0 ? 'L' : 'R';
  const sh = r[`shoulder_${shSide}` as JointId];
  const sx = Math.abs(sh[0]);
  const absX = Math.abs(vx);
  const dShoulder = Math.hypot(vx - sh[0], vy - sh[1], vz - sh[2]);

  // Strict Axilla / Shoulder gate for wide chest/back muscles in torso zone
  if (vy > lumbarY && vy >= sh[1] - 0.09 && (absX >= sx - 0.02 || dShoulder <= 0.13)) {
    const shId = `shoulder_${shSide}` as JointId;
    const wxGate = smoothstep(sx - 0.02, sx + 0.035, absX);
    const wyGate = vy < sh[1] ? smoothstep(sh[1] - 0.09, sh[1] - 0.02, vy) : 1.0;
    const wArm = wxGate * wyGate;
    if (wArm > 1e-4) {
      return { jA: 'thorax', jB: shId, wB: wArm };
    }
  }

  // Continuous neck transition for upper trapezius / splenius extending above thoraxTopY
  const thoraxTopY = Math.min(neckY - 0.07, thoraxY + 0.16);
  if (vy > thoraxTopY && absX < sx - 0.04) {
    if (vy <= neckY) {
      const wNeck = smoothstep(thoraxTopY, neckY, vy);
      return { jA: 'thorax', jB: 'neck', wB: wNeck };
    }
    const wHead = smoothstep(neckY, headY - 0.03, vy);
    return { jA: 'neck', jB: 'head', wB: wHead };
  }

  // If a torso/gluteal muscle extends below lumbar into the hip region
  if (vy < hipY + 0.03) {
    const side = vx >= 0 ? 'L' : 'R';
    const hipId = `hip_${side}` as JointId;
    const wHip = smoothstep(hipY + 0.03, hipY - 0.12, vy);
    return { jA: 'pelvis', jB: hipId, wB: wHip };
  }

  if (vy <= lumbarY + 0.04) {
    const wLumbar = smoothstep(lumbarY - 0.04, lumbarY + 0.04, vy);
    return { jA: 'pelvis', jB: 'lumbar', wB: wLumbar };
  }

  const wThorax = smoothstep(thoraxY - 0.06, thoraxY + 0.02, vy);
  return { jA: 'lumbar', jB: 'thorax', wB: wThorax };
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

    const { jA, jB, wB } = computeVertexJointPairAndWeight(wx, wy, wz, zone, r, meshNameLower);

    jointAIndices[i] = JOINT_TO_INDEX[jA];
    jointBIndices[i] = JOINT_TO_INDEX[jB];
    weightsB[i] = wB;
    usedSet.add(jA);
    usedSet.add(jB);

    const i3 = i * 3;
    restPositions[i3] = wx;
    restPositions[i3 + 1] = wy;
    restPositions[i3 + 2] = wz;

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

// Pre-allocated DQS Dual Quaternion table for all 17 joints: [rx, ry, rz, rw, dx, dy, dz, dw]
const _jointDQ = new Float32Array(ALL_JOINTS.length * 8);
const _qTmp = new Quaternion();

function buildJointDualQuaternions(
  kinematics: KinematicsResult,
  restJointPositions: Record<JointId, Vec3>,
  hScale: number
) {
  for (let idx = 0; idx < ALL_JOINTS.length; idx++) {
    const id = ALL_JOINTS[idx];
    const j = kinematics.joints[id];
    const rPos = restJointPositions[id];

    const rx = j.worldQuaternion[0];
    const ry = j.worldQuaternion[1];
    const rz = j.worldQuaternion[2];
    const rw = j.worldQuaternion[3];

    // Translation t = P_world - R * (P_rest * hScale)
    _qTmp.set(rx, ry, rz, rw);
    const prx = rPos[0] * hScale;
    const pry = rPos[1] * hScale;
    const prz = rPos[2] * hScale;

    // Rotate P_rest by q: v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
    const cx1 = ry * prz - rz * pry + rw * prx;
    const cy1 = rz * prx - rx * prz + rw * pry;
    const cz1 = rx * pry - ry * prx + rw * prz;
    const rotX = prx + 2 * (ry * cz1 - rz * cy1);
    const rotY = pry + 2 * (rz * cx1 - rx * cz1);
    const rotZ = prz + 2 * (rx * cy1 - ry * cx1);

    const tx = j.worldPosition[0] - rotX;
    const ty = j.worldPosition[1] - rotY;
    const tz = j.worldPosition[2] - rotZ;

    // Dual part q_d = 0.5 * (tx*i + ty*j + tz*k) * q_r
    const dx = 0.5 * (tx * rw + ty * rz - tz * ry);
    const dy = 0.5 * (-tx * rz + ty * rw + tz * rx);
    const dz = 0.5 * (tx * ry - ty * rx + tz * rw);
    const dw = -0.5 * (tx * rx + ty * ry + tz * rz);

    const base = idx * 8;
    _jointDQ[base] = rx;
    _jointDQ[base + 1] = ry;
    _jointDQ[base + 2] = rz;
    _jointDQ[base + 3] = rw;
    _jointDQ[base + 4] = dx;
    _jointDQ[base + 5] = dy;
    _jointDQ[base + 6] = dz;
    _jointDQ[base + 7] = dw;
  }
}

/**
 * Updates auto-skinned muscle vertices in-place using Dual Quaternion Skinning (DQS).
 * Guarantees zero volume collapse and shortest-path antipodal sign handling.
 */
export function updateSkinnedMuscleVertices(
  data: SkinnedMuscleData,
  kinematics: KinematicsResult,
  heightM: number,
  restJointPositions: Record<JointId, Vec3>
): number {
  const hScale = heightM / DEFAULT_HEIGHT_M;
  buildJointDualQuaternions(kinematics, restJointPositions, hScale);

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

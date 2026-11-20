import { Box3, BufferGeometry, Mesh, Quaternion, Vector3 } from 'three';
import { DEFAULT_HEIGHT_M } from '../data/skeletonConfig';
import type { JointId, KinematicsResult } from '../types/biomechanics';
import type { CalibrationResult } from './calibrateSkeleton';

export type LimbZone = 'arm_L' | 'arm_R' | 'leg_L' | 'leg_R' | 'head_neck' | 'torso';

export interface BoneSegmentDef {
  jointA: JointId; // proximal joint (drives segment transform)
  jointB: JointId; // distal joint (defines segment endpoint)
}

const ZONE_SEGMENTS: Record<LimbZone, BoneSegmentDef[]> = {
  arm_L: [
    { jointA: 'thorax', jointB: 'shoulder_L' },
    { jointA: 'shoulder_L', jointB: 'elbow_L' },
    { jointA: 'elbow_L', jointB: 'wrist_L' },
  ],
  arm_R: [
    { jointA: 'thorax', jointB: 'shoulder_R' },
    { jointA: 'shoulder_R', jointB: 'elbow_R' },
    { jointA: 'elbow_R', jointB: 'wrist_R' },
  ],
  leg_L: [
    { jointA: 'pelvis', jointB: 'hip_L' },
    { jointA: 'hip_L', jointB: 'knee_L' },
    { jointA: 'knee_L', jointB: 'ankle_L' },
  ],
  leg_R: [
    { jointA: 'pelvis', jointB: 'hip_R' },
    { jointA: 'hip_R', jointB: 'knee_R' },
    { jointA: 'knee_R', jointB: 'ankle_R' },
  ],
  head_neck: [
    { jointA: 'thorax', jointB: 'neck' },
    { jointA: 'neck', jointB: 'head' },
  ],
  torso: [
    { jointA: 'pelvis', jointB: 'lumbar' },
    { jointA: 'lumbar', jointB: 'thorax' },
  ],
};

export interface SkinnedMuscleData {
  geometry: BufferGeometry;
  zone: LimbZone;
  primaryJoint: JointId;
  secondaryJoint: JointId;
  vertexCount: number;
  jointAIndices: Uint8Array;
  jointBIndices: Uint8Array;
  weightsB: Float32Array;
  /** Flattened [x, y, z] local position relative to jointA rest position */
  localPosA: Float32Array;
  /** Flattened [x, y, z] local position relative to jointB rest position */
  localPosB: Float32Array;
  restNormals: Float32Array;
  restLength: number;
  /** Unique joints referenced by this muscle */
  usedJoints: JointId[];
}

const ALL_JOINTS: JointId[] = [
  'pelvis', 'lumbar', 'thorax', 'neck', 'head',
  'shoulder_L', 'elbow_L', 'wrist_L',
  'shoulder_R', 'elbow_R', 'wrist_R',
  'hip_L', 'knee_L', 'ankle_L',
  'hip_R', 'knee_R', 'ankle_R',
];

const JOINT_TO_INDEX: Record<JointId, number> = Object.fromEntries(
  ALL_JOINTS.map((id, idx) => [id, idx])
) as Record<JointId, number>;

/**
 * Classifies any mesh (bone, muscle, or tendon) into one of 6 mutually exclusive
 * spatial limb zones based on its normalized bounding-box center and calibrated landmarks.
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

  const nl = mesh.name.toLowerCase();

  // 1. Head & Neck
  const neckY = calibration.restPositions.neck[1];
  if (
    cy >= neckY - 0.02 ||
    nl.includes('__head__') ||
    nl.includes('__neck__') ||
    nl.includes('skull') ||
    nl.includes('mandible') ||
    nl.includes('masseter') ||
    nl.includes('sternocleidomastoid')
  ) {
    return 'head_neck';
  }

  // 2. Arms: lateral to shoulder X and above hip Y, or explicitly tagged shoulder/elbow/wrist
  const shLX = calibration.restPositions.shoulder_L[0];
  const shRX = calibration.restPositions.shoulder_R[0];
  const shY = (calibration.restPositions.shoulder_L[1] + calibration.restPositions.shoulder_R[1]) * 0.5;
  const hipY = (calibration.restPositions.hip_L[1] + calibration.restPositions.hip_R[1]) * 0.5;

  if (
    nl.includes('shoulder_l') ||
    nl.includes('elbow_l') ||
    nl.includes('wrist_l') ||
    (cx > shLX * 0.78 && cy > hipY - 0.08 && cy < shY + 0.12)
  ) {
    return 'arm_L';
  }
  if (
    nl.includes('shoulder_r') ||
    nl.includes('elbow_r') ||
    nl.includes('wrist_r') ||
    (cx < shRX * 0.78 && cy > hipY - 0.08 && cy < shY + 0.12)
  ) {
    return 'arm_R';
  }

  // 3. Legs: below hip Y
  if (
    nl.includes('hip_l') ||
    nl.includes('knee_l') ||
    nl.includes('ankle_l') ||
    (cy < hipY + 0.03 && cx >= 0)
  ) {
    return 'leg_L';
  }
  if (
    nl.includes('hip_r') ||
    nl.includes('knee_r') ||
    nl.includes('ankle_r') ||
    (cy < hipY + 0.03 && cx < 0)
  ) {
    return 'leg_R';
  }

  // 4. Default: Torso
  return 'torso';
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-8) {
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    return dx * dx + dy * dy + dz * dz;
  }
  let t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const cz = az + t * abz;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Finds the nearest single driving joint for a rigid bone mesh within its spatial zone.
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
  const [ocx, minY, ocz] = calibration.centerOffset;
  const s = calibration.modelScale;
  const px = (rawCenter.x - ocx) * s;
  const py = (rawCenter.y - minY) * s;
  const pz = (rawCenter.z - ocz) * s;

  const segs = ZONE_SEGMENTS[zone];
  let bestJoint: JointId = segs[0].jointA;
  let bestDistSq = Infinity;

  for (const seg of segs) {
    const pA = calibration.restPositions[seg.jointA];
    const pB = calibration.restPositions[seg.jointB];
    const dSq = pointToSegmentDistSq(px, py, pz, pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      // If closer to distal joint, use jointB for end-effector bones (hand/foot/head)
      const dA = (px - pA[0]) ** 2 + (py - pA[1]) ** 2 + (pz - pA[2]) ** 2;
      const dB = (px - pB[0]) ** 2 + (py - pB[1]) ** 2 + (pz - pB[2]) ** 2;
      bestJoint = dB < dA * 0.4 ? seg.jointB : seg.jointA;
    }
  }
  return bestJoint;
}

/**
 * Per-vertex automatic skinning: for every vertex v, finds the 2 nearest bone segments
 * within its mutually exclusive LimbZone and computes smooth inverse-distance weights.
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
  const segs = ZONE_SEGMENTS[zone];

  const jointAIndices = new Uint8Array(count);
  const jointBIndices = new Uint8Array(count);
  const weightsB = new Float32Array(count);
  const localPosA = new Float32Array(count * 3);
  const localPosB = new Float32Array(count * 3);
  const restNormals = new Float32Array(count * 3);

  const usedSet = new Set<JointId>();
  const v = new Vector3();

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    const wx = (v.x - ocx) * s;
    const wy = (v.y - minY) * s;
    const wz = (v.z - ocz) * s;

    // Find nearest 2 segments in this zone
    let best1Idx = 0;
    let best1Dist = Infinity;
    let best2Idx = 0;
    let best2Dist = Infinity;

    for (let k = 0; k < segs.length; k++) {
      const pA = calibration.restPositions[segs[k].jointA];
      const pB = calibration.restPositions[segs[k].jointB];
      const dSq = pointToSegmentDistSq(wx, wy, wz, pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
      if (dSq < best1Dist) {
        best2Dist = best1Dist;
        best2Idx = best1Idx;
        best1Dist = dSq;
        best1Idx = k;
      } else if (dSq < best2Dist) {
        best2Dist = dSq;
        best2Idx = k;
      }
    }

    const j1 = segs[best1Idx].jointA;
    const j2 = segs.length > 1 ? segs[best2Idx].jointA : segs[0].jointB;

    const d1 = Math.sqrt(best1Dist) + 0.015;
    const d2 = Math.sqrt(best2Dist) + 0.015;
    // Smooth inverse-distance blend with 0.06m transition softness
    const inv1 = 1 / (d1 * d1);
    const inv2 = 1 / (d2 * d2);
    const wB = j1 === j2 ? 0 : inv2 / (inv1 + inv2);

    jointAIndices[i] = JOINT_TO_INDEX[j1];
    jointBIndices[i] = JOINT_TO_INDEX[j2];
    weightsB[i] = wB;
    usedSet.add(j1);
    usedSet.add(j2);

    const p1 = calibration.restPositions[j1];
    const p2 = calibration.restPositions[j2];
    const i3 = i * 3;

    localPosA[i3] = wx - p1[0];
    localPosA[i3 + 1] = wy - p1[1];
    localPosA[i3 + 2] = wz - p1[2];

    localPosB[i3] = wx - p2[0];
    localPosB[i3 + 1] = wy - p2[1];
    localPosB[i3 + 2] = wz - p2[2];

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

  const primaryJoint = segs[0].jointA;
  const secondaryJoint = segs[segs.length - 1].jointB;
  const pO = calibration.restPositions[primaryJoint];
  const pI = calibration.restPositions[secondaryJoint];
  const restLength = Math.max(
    Math.hypot(pI[0] - pO[0], pI[1] - pO[1], pI[2] - pO[2]),
    0.05
  );

  return {
    geometry: geo,
    zone,
    primaryJoint,
    secondaryJoint,
    vertexCount: count,
    jointAIndices,
    jointBIndices,
    weightsB,
    localPosA,
    localPosB,
    restNormals,
    restLength,
    usedJoints: Array.from(usedSet),
  };
}

// Pre-allocated scratch objects (Zero GC per update)
const _pA = new Vector3();
const _pB = new Vector3();
const _qA = new Quaternion();
const _qB = new Quaternion();
const _vA = new Vector3();
const _vB = new Vector3();
const _nAvg = new Vector3();

/**
 * Updates auto-skinned muscle vertices in-place using Linear Blend Skinning.
 */
export function updateSkinnedMuscleVertices(
  data: SkinnedMuscleData,
  kinematics: KinematicsResult,
  heightM: number
): number {
  const hScale = heightM / DEFAULT_HEIGHT_M;
  const posAttr = data.geometry.getAttribute('position');
  const normAttr = data.geometry.getAttribute('normal');
  const {
    vertexCount,
    jointAIndices,
    jointBIndices,
    weightsB,
    localPosA,
    localPosB,
    restNormals,
  } = data;

  for (let i = 0; i < vertexCount; i++) {
    const jA = kinematics.joints[ALL_JOINTS[jointAIndices[i]]];
    const jB = kinematics.joints[ALL_JOINTS[jointBIndices[i]]];
    const w = weightsB[i];
    const invW = 1 - w;
    const i3 = i * 3;

    _pA.set(...jA.worldPosition);
    _qA.set(...jA.worldQuaternion);
    _vA
      .set(localPosA[i3] * hScale, localPosA[i3 + 1] * hScale, localPosA[i3 + 2] * hScale)
      .applyQuaternion(_qA)
      .add(_pA);

    if (w < 1e-4) {
      posAttr.setXYZ(i, _vA.x, _vA.y, _vA.z);
      if (normAttr) {
        _nAvg.set(restNormals[i3], restNormals[i3 + 1], restNormals[i3 + 2]).applyQuaternion(_qA);
        normAttr.setXYZ(i, _nAvg.x, _nAvg.y, _nAvg.z);
      }
      continue;
    }

    _pB.set(...jB.worldPosition);
    _qB.set(...jB.worldQuaternion);
    _vB
      .set(localPosB[i3] * hScale, localPosB[i3 + 1] * hScale, localPosB[i3 + 2] * hScale)
      .applyQuaternion(_qB)
      .add(_pB);

    posAttr.setXYZ(
      i,
      _vA.x * invW + _vB.x * w,
      _vA.y * invW + _vB.y * w,
      _vA.z * invW + _vB.z * w
    );

    if (normAttr) {
      _nAvg
        .set(restNormals[i3], restNormals[i3 + 1], restNormals[i3 + 2])
        .applyQuaternion(w > 0.5 ? _qB : _qA);
      normAttr.setXYZ(i, _nAvg.x, _nAvg.y, _nAvg.z);
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

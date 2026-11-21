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
  const neckY = calibration.restPositions.neck[1];

  if (
    cy >= neckY - 0.015 ||
    nl.includes('__head__') ||
    nl.includes('__neck__') ||
    nl.includes('skull') ||
    nl.includes('mandible') ||
    nl.includes('masseter') ||
    nl.includes('sternocleidomastoid')
  ) {
    return 'head_neck';
  }

  const shLX = calibration.restPositions.shoulder_L[0];
  const shRX = calibration.restPositions.shoulder_R[0];
  const shY =
    (calibration.restPositions.shoulder_L[1] + calibration.restPositions.shoulder_R[1]) * 0.5;
  const hipY =
    (calibration.restPositions.hip_L[1] + calibration.restPositions.hip_R[1]) * 0.5;

  if (
    nl.includes('shoulder_l') ||
    nl.includes('elbow_l') ||
    nl.includes('wrist_l') ||
    (cx > shLX * 0.72 && cy > hipY - 0.08 && cy < shY + 0.12)
  ) {
    return 'arm_L';
  }
  if (
    nl.includes('shoulder_r') ||
    nl.includes('elbow_r') ||
    nl.includes('wrist_r') ||
    (cx < shRX * 0.72 && cy > hipY - 0.08 && cy < shY + 0.12)
  ) {
    return 'arm_R';
  }

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
    if (py >= hp[1] + 0.03) return 'pelvis';
    if (py <= an[1] + 0.02) return `ankle_${side}` as JointId;
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
 * - Thorax-shoulder origin pinning by lateral distance |vx| vs shoulder half-width sx
 * - Hand/foot/head virtual terminal segment pinning (w = 1.0 beyond wrist/ankle/head)
 */
function computeVertexJointPairAndWeight(
  wx: number,
  wy: number,
  _wz: number,
  zone: LimbZone,
  r: Record<JointId, Vec3>
): { jA: JointId; jB: JointId; wB: number } {
  const TRANSITION_M = 0.055; // strict ±5.5cm transition band

  if (zone === 'leg_L' || zone === 'leg_R') {
    const side = zone === 'leg_L' ? 'L' : 'R';
    const hipId = `hip_${side}` as JointId;
    const kneeId = `knee_${side}` as JointId;
    const ankleId = `ankle_${side}` as JointId;

    const hipY = r[hipId][1];
    const kneeY = r[kneeId][1];
    const ankleY = r[ankleId][1];

    // 1. Pelvic-Hip gluteal origin pinning: above hipY + 0.03m is 100% pelvis
    if (wy >= hipY - 0.12) {
      const wHip = smoothstep(hipY + 0.03, hipY - 0.12, wy);
      return { jA: 'pelvis', jB: hipId, wB: wHip };
    }

    // 2. Mid-thigh down to Knee transition (strict ±5.5cm around kneeY)
    if (wy >= kneeY - TRANSITION_M) {
      const wKnee = smoothstep(kneeY + TRANSITION_M, kneeY - TRANSITION_M, wy);
      return { jA: hipId, jB: kneeId, wB: wKnee };
    }

    // 3. Lower leg down to Ankle + Foot virtual segment (strict ±4.5cm around ankleY; below is 100% ankle)
    const wAnkle = smoothstep(ankleY + 0.045, ankleY - 0.025, wy);
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
    const absX = Math.abs(wx);

    // 1. Thorax-Shoulder origin pinning (pectoralis / latissimus medial to shoulder)
    if (absX < 1.05 * sx && wy > el[1] + TRANSITION_M) {
      const wArm = smoothstep(0.65 * sx, 1.05 * sx, absX);
      return { jA: 'thorax', jB: shId, wB: wArm };
    }

    // 2. Upper arm down to Elbow transition (strict ±5.5cm around el.y)
    if (wy >= el[1] - TRANSITION_M) {
      const wElbow = smoothstep(el[1] + TRANSITION_M, el[1] - TRANSITION_M, wy);
      return { jA: shId, jB: elId, wB: wElbow };
    }

    // 3. Forearm down to Wrist + Hand virtual segment (below wr.y is 100% wrist)
    const wWrist = smoothstep(wr[1] + 0.045, wr[1] - 0.02, wy);
    return { jA: elId, jB: wrId, wB: wWrist };
  }

  if (zone === 'head_neck') {
    const neckY = r.neck[1];
    const headY = r.head[1];
    if (wy < headY - 0.025) {
      const wNeck = smoothstep(neckY - 0.03, neckY + 0.03, wy);
      return { jA: 'thorax', jB: 'neck', wB: wNeck };
    }
    const wHead = smoothstep(headY - 0.025, headY + 0.02, wy);
    return { jA: 'neck', jB: 'head', wB: wHead };
  }

  // Torso (pelvis -> lumbar -> thorax) with lateral shoulder pinning for wide chest/back muscles
  const lumbarY = r.lumbar[1];
  const thoraxY = r.thorax[1];
  const hipY = (r.hip_L[1] + r.hip_R[1]) * 0.5;
  const sx = (Math.abs(r.shoulder_L[0]) + Math.abs(r.shoulder_R[0])) * 0.5;
  const absX = Math.abs(wx);

  // If a torso muscle (e.g., pectoralis or latissimus) extends laterally toward the humerus
  if (wy > lumbarY && absX > 0.65 * sx) {
    const side = wx >= 0 ? 'L' : 'R';
    const shId = `shoulder_${side}` as JointId;
    const wArm = smoothstep(0.65 * sx, 1.05 * sx, absX);
    return { jA: 'thorax', jB: shId, wB: wArm };
  }

  // If a torso/gluteal muscle extends below lumbar into the hip region
  if (wy < hipY + 0.03) {
    const side = wx >= 0 ? 'L' : 'R';
    const hipId = `hip_${side}` as JointId;
    const wHip = smoothstep(hipY + 0.03, hipY - 0.12, wy);
    return { jA: 'pelvis', jB: hipId, wB: wHip };
  }

  if (wy <= lumbarY + 0.04) {
    const wLumbar = smoothstep(lumbarY - 0.04, lumbarY + 0.04, wy);
    return { jA: 'pelvis', jB: 'lumbar', wB: wLumbar };
  }

  const wThorax = smoothstep(thoraxY - 0.06, thoraxY + 0.02, wy);
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

    const { jA, jB, wB } = computeVertexJointPairAndWeight(wx, wy, wz, zone, r);

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

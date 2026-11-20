import { BufferGeometry, Mesh, Quaternion, Vector3 } from 'three';
import { DEFAULT_HEIGHT_M, SKELETON_CONFIG } from '../data/skeletonConfig';
import type { JointId, KinematicsResult } from '../types/biomechanics';
import type { CalibrationResult } from './calibrateSkeleton';

export interface SkinnedMuscleData {
  geometry: BufferGeometry;
  originJoint: JointId;
  insertionJoint: JointId;
  vertexCount: number;
  weights: Float32Array;
  localOriginPositions: Float32Array;
  localInsertionPositions: Float32Array;
  restNormals: Float32Array;
  restLength: number;
}

export function resolveMuscleBonePair(
  meshName: string,
  defaultJointId: JointId
): { originJoint: JointId; insertionJoint: JointId } {
  const nl = meshName.toLowerCase();
  const side: 'L' | 'R' =
    defaultJointId.endsWith('_L') || nl.includes('_l') || nl.includes('.l')
      ? 'L'
      : 'R';

  // Neck / Head
  if (nl.includes('sternocleidomastoid')) {
    return { originJoint: 'thorax', insertionJoint: 'head' };
  }
  if (nl.includes('trapezius') || nl.includes('splenius') || nl.includes('levator')) {
    return { originJoint: 'thorax', insertionJoint: 'neck' };
  }

  // Shoulder / Chest / Back -> Humerus (shoulder_L/R)
  if (
    [
      'latissimus',
      'pectoralis',
      'deltoid',
      'supraspinatus',
      'infraspinatus',
      'teres',
      'subscapularis',
      'coracobrachialis',
    ].some((k) => nl.includes(k))
  ) {
    return { originJoint: 'thorax', insertionJoint: `shoulder_${side}` as JointId };
  }

  // Upper arm -> Forearm (shoulder_L/R -> elbow_L/R)
  if (nl.includes('biceps') || nl.includes('triceps') || nl.includes('brachialis')) {
    if (!nl.includes('femoris')) {
      return {
        originJoint: `shoulder_${side}` as JointId,
        insertionJoint: `elbow_${side}` as JointId,
      };
    }
  }

  // Forearm -> Hand (elbow_L/R -> wrist_L/R)
  if (
    [
      'brachioradialis',
      'pronator',
      'supinator',
      'carpi',
      'pollicis',
      'indicis',
      'anconeus',
      'forearm',
    ].some((k) => nl.includes(k)) ||
    (nl.includes('digitorum') && defaultJointId.startsWith('elbow_'))
  ) {
    return {
      originJoint: `elbow_${side}` as JointId,
      insertionJoint: `wrist_${side}` as JointId,
    };
  }

  // Trunk (pelvis -> thorax)
  if (
    [
      'rectus_abdominis',
      'rectus abdominis',
      'oblique',
      'transversus',
      'erector',
      'iliocostalis',
      'longissimus',
      'spinalis',
    ].some((k) => nl.includes(k))
  ) {
    return { originJoint: 'pelvis', insertionJoint: 'thorax' };
  }

  // Pelvis -> Femur (glutes / iliopsoas)
  if (['gluteus', 'piriformis', 'iliopsoas', 'psoas', 'iliacus'].some((k) => nl.includes(k))) {
    return { originJoint: 'pelvis', insertionJoint: `hip_${side}` as JointId };
  }

  // Bi-articular thigh muscles (pelvis -> knee_L/R)
  if (
    [
      'rectus_femoris',
      'rectus femoris',
      'biceps_femoris',
      'biceps femoris',
      'semitendinosus',
      'semimembranosus',
      'sartorius',
      'gracilis',
    ].some((k) => nl.includes(k))
  ) {
    return { originJoint: 'pelvis', insertionJoint: `knee_${side}` as JointId };
  }

  // Mono-articular thigh muscles (hip_L/R -> knee_L/R)
  if (['vastus', 'quadriceps', 'adductor', 'pectineus', 'tensor'].some((k) => nl.includes(k))) {
    return {
      originJoint: `hip_${side}` as JointId,
      insertionJoint: `knee_${side}` as JointId,
    };
  }

  // Lower leg muscles (knee_L/R -> ankle_L/R)
  if (
    ['gastrocnemius', 'soleus', 'tibialis', 'fibularis', 'peroneus', 'popliteus', 'hallucis', 'plantaris'].some((k) =>
      nl.includes(k)
    ) ||
    (nl.includes('digitorum') && defaultJointId.startsWith('knee_'))
  ) {
    return {
      originJoint: `knee_${side}` as JointId,
      insertionJoint: `ankle_${side}` as JointId,
    };
  }

  const parent = SKELETON_CONFIG[defaultJointId].parentId;
  return {
    originJoint: parent ?? defaultJointId,
    insertionJoint: defaultJointId,
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Bakes rest-pose vertices into normalized world coordinates and computes smooth
 * dual-bone Linear Blend Skinning (LBS) weights along origin -> insertion axis.
 */
export function prepareSkinnedMuscle(
  mesh: Mesh,
  originJoint: JointId,
  insertionJoint: JointId,
  calibration: CalibrationResult
): SkinnedMuscleData {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.clone();
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const count = posAttr.count;

  const [cx, minY, cz] = calibration.centerOffset;
  const s = calibration.modelScale;

  const pOriginRest = new Vector3(...calibration.restPositions[originJoint]);
  const pInsertRest = new Vector3(...calibration.restPositions[insertionJoint]);
  const axis = pInsertRest.clone().sub(pOriginRest);
  const restLength = Math.max(axis.length(), 0.05);
  const axisDir = axis.clone().divideScalar(restLength);

  const weights = new Float32Array(count);
  const localOriginPositions = new Float32Array(count * 3);
  const localInsertionPositions = new Float32Array(count * 3);
  const restNormals = new Float32Array(count * 3);

  const v = new Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    const wx = (v.x - cx) * s;
    const wy = (v.y - minY) * s;
    const wz = (v.z - cz) * s;

    // Project onto origin -> insertion axis
    const t =
      ((wx - pOriginRest.x) * axisDir.x +
        (wy - pOriginRest.y) * axisDir.y +
        (wz - pOriginRest.z) * axisDir.z) /
      restLength;
    const w = originJoint === insertionJoint ? 1 : smoothstep(0.08, 0.92, t);
    weights[i] = w;

    localOriginPositions[i * 3] = wx - pOriginRest.x;
    localOriginPositions[i * 3 + 1] = wy - pOriginRest.y;
    localOriginPositions[i * 3 + 2] = wz - pOriginRest.z;

    localInsertionPositions[i * 3] = wx - pInsertRest.x;
    localInsertionPositions[i * 3 + 1] = wy - pInsertRest.y;
    localInsertionPositions[i * 3 + 2] = wz - pInsertRest.z;

    if (normAttr) {
      restNormals[i * 3] = normAttr.getX(i);
      restNormals[i * 3 + 1] = normAttr.getY(i);
      restNormals[i * 3 + 2] = normAttr.getZ(i);
    } else {
      restNormals[i * 3] = 0;
      restNormals[i * 3 + 1] = 1;
      restNormals[i * 3 + 2] = 0;
    }

    posAttr.setXYZ(i, wx, wy, wz);
  }
  posAttr.needsUpdate = true;
  geo.computeBoundingSphere();

  return {
    geometry: geo,
    originJoint,
    insertionJoint,
    vertexCount: count,
    weights,
    localOriginPositions,
    localInsertionPositions,
    restNormals,
    restLength,
  };
}

// Pre-allocated scratch objects (Zero GC per update)
const _pOrigin = new Vector3();
const _pInsert = new Vector3();
const _qOrigin = new Quaternion();
const _qInsert = new Quaternion();
const _vA = new Vector3();
const _vB = new Vector3();
const _nAvg = new Vector3();

/**
 * Updates skinned muscle vertices in-place using Dual-Bone LBS + volume-preserving radial bulge.
 * Returns stretchRatio (currentLength / restLength).
 */
export function updateSkinnedMuscleVertices(
  data: SkinnedMuscleData,
  kinematics: KinematicsResult,
  heightM: number
): number {
  const jO = kinematics.joints[data.originJoint];
  const jI = kinematics.joints[data.insertionJoint];
  const hScale = heightM / DEFAULT_HEIGHT_M;

  _pOrigin.set(...jO.worldPosition);
  _pInsert.set(...jI.worldPosition);
  _qOrigin.set(...jO.worldQuaternion);
  _qInsert.set(...jI.worldQuaternion);

  const curLen = _pOrigin.distanceTo(_pInsert);
  const restLenScaled = data.restLength * hScale;
  const stretchRatio = curLen / Math.max(restLenScaled, 0.05);
  const clampedStretch = Math.max(0.75, Math.min(1.35, stretchRatio));
  const radialScale = 1 / Math.sqrt(clampedStretch);
  const bulgeAmp = (radialScale - 1) * 0.032 * hScale;

  const posAttr = data.geometry.getAttribute('position');
  const normAttr = data.geometry.getAttribute('normal');
  const {
    vertexCount,
    weights,
    localOriginPositions,
    localInsertionPositions,
    restNormals,
  } = data;

  for (let i = 0; i < vertexCount; i++) {
    const w = weights[i];
    const invW = 1 - w;
    const i3 = i * 3;

    _vA
      .set(
        localOriginPositions[i3] * hScale,
        localOriginPositions[i3 + 1] * hScale,
        localOriginPositions[i3 + 2] * hScale
      )
      .applyQuaternion(_qOrigin)
      .add(_pOrigin);

    _vB
      .set(
        localInsertionPositions[i3] * hScale,
        localInsertionPositions[i3 + 1] * hScale,
        localInsertionPositions[i3 + 2] * hScale
      )
      .applyQuaternion(_qInsert)
      .add(_pInsert);

    const midWeight = 4 * w * invW;
    const nx = restNormals[i3];
    const ny = restNormals[i3 + 1];
    const nz = restNormals[i3 + 2];

    const px = _vA.x * invW + _vB.x * w + nx * bulgeAmp * midWeight;
    const py = _vA.y * invW + _vB.y * w + ny * bulgeAmp * midWeight;
    const pz = _vA.z * invW + _vB.z * w + nz * bulgeAmp * midWeight;

    posAttr.setXYZ(i, px, py, pz);

    if (normAttr) {
      _nAvg.set(nx, ny, nz).applyQuaternion(w > 0.5 ? _qInsert : _qOrigin);
      normAttr.setXYZ(i, _nAvg.x, _nAvg.y, _nAvg.z);
    }
  }

  posAttr.needsUpdate = true;
  if (normAttr) normAttr.needsUpdate = true;

  return stretchRatio;
}

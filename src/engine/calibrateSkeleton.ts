import { Box3, Mesh, Object3D, Vector3 } from 'three';
import {
  createNeutralPose,
  DEFAULT_HEIGHT_M,
  JOINT_ORDER,
  SKELETON_CONFIG,
} from '../data/skeletonConfig';
import type { JointId, Vec3 } from '../types/biomechanics';
import { computeKinematics } from './kinematics';

export interface CalibrationResult {
  restPositions: Record<JointId, Vec3>;
  offsets: Record<JointId, Vec3>;
  modelScale: number;
  centerOffset: Vec3;
  minY: number;
}

interface BoneBoxEntry {
  nameLower: string;
  box: Box3;
  center: Vector3;
}

function mergeMatchingBoxes(
  entries: BoneBoxEntry[],
  keywords: string[],
  side?: 'L' | 'R'
): Box3 | null {
  const merged = new Box3();
  let found = false;
  for (const e of entries) {
    if (side === 'L' && e.center.x <= 0.005) {
      continue;
    }
    if (side === 'R' && e.center.x >= -0.005) {
      continue;
    }
    if (keywords.some((kw) => e.nameLower.includes(kw))) {
      merged.union(e.box);
      found = true;
    }
  }
  return found ? merged : null;
}

function boxCenter(box: Box3): Vec3 {
  const c = new Vector3();
  box.getCenter(c);
  return [c.x, c.y, c.z];
}

/**
 * Scans all BONE__ meshes in the loaded GLB scene, normalizes them to DEFAULT_HEIGHT_M (1.75m)
 * with feet at y = 0 and centered X/Z, and measures real anatomical joint centers.
 */
export function calibrateSkeletonFromScene(scene: Object3D): CalibrationResult {
  scene.updateMatrixWorld(true);
  const overallBox = new Box3().setFromObject(scene);
  const size = new Vector3();
  const overallCenter = new Vector3();
  overallBox.getSize(size);
  overallBox.getCenter(overallCenter);

  const modelScale = size.y > 1e-4 ? DEFAULT_HEIGHT_M / size.y : 1;
  const minY = overallBox.min.y;
  const centerOffset: Vec3 = [overallCenter.x, minY, overallCenter.z];

  // Collect normalized world Box3 for every bone mesh
  const boneEntries: BoneBoxEntry[] = [];
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const nl = obj.name.toLowerCase();
    if (nl.startsWith('muscle__') || nl.includes('skin')) return;

    const rawBox = new Box3().setFromObject(obj);
    if (rawBox.isEmpty()) return;

    const normBox = new Box3(
      new Vector3(
        (rawBox.min.x - overallCenter.x) * modelScale,
        (rawBox.min.y - minY) * modelScale,
        (rawBox.min.z - overallCenter.z) * modelScale
      ),
      new Vector3(
        (rawBox.max.x - overallCenter.x) * modelScale,
        (rawBox.max.y - minY) * modelScale,
        (rawBox.max.z - overallCenter.z) * modelScale
      )
    );
    const c = new Vector3();
    normBox.getCenter(c);
    boneEntries.push({ nameLower: nl, box: normBox, center: c });
  });

  // Fallback baseline from neutral procedural kinematics
  const fallbackKin = computeKinematics(createNeutralPose(), DEFAULT_HEIGHT_M);
  const restPositions = {} as Record<JointId, Vec3>;
  for (const id of JOINT_ORDER) {
    restPositions[id] = [...fallbackKin.joints[id].worldPosition];
  }

  // Spine & Head centers (Axial joints: force X = 0.0)
  const pelvisBox = mergeMatchingBoxes(boneEntries, ['__pelvis__', 'hip_bone', 'ilium', 'sacrum']);
  if (pelvisBox) {
    const pc = boxCenter(pelvisBox);
    restPositions.pelvis = [0.0, pc[1], pc[2]];
  } else {
    restPositions.pelvis = [0.0, restPositions.pelvis[1], restPositions.pelvis[2]];
  }

  const lumbarBox = mergeMatchingBoxes(boneEntries, ['__lumbar__', 'lumbar']);
  if (lumbarBox) {
    const lc = boxCenter(lumbarBox);
    restPositions.lumbar = [0.0, lc[1], lc[2]];
  } else {
    restPositions.lumbar = [0.0, restPositions.lumbar[1], restPositions.lumbar[2]];
  }

  const thoraxBox = mergeMatchingBoxes(boneEntries, ['__thorax__', 'sternum', 'thoracic']);
  if (thoraxBox) {
    const tc = boxCenter(thoraxBox);
    restPositions.thorax = [0.0, tc[1] - 0.04, tc[2]];
  } else {
    restPositions.thorax = [0.0, restPositions.thorax[1], restPositions.thorax[2]];
  }

  const neckBox = mergeMatchingBoxes(boneEntries, ['__neck__', 'cervical']);
  if (neckBox) {
    const nc = boxCenter(neckBox);
    restPositions.neck = [0.0, nc[1], nc[2]];
  } else {
    restPositions.neck = [0.0, restPositions.neck[1], restPositions.neck[2]];
  }

  const headBox = mergeMatchingBoxes(boneEntries, ['__head__', 'skull', 'cranium', 'frontal']);
  if (headBox) {
    const hc = boxCenter(headBox);
    restPositions.head = [0.0, headBox.min.y + 0.05, hc[2]];
  } else {
    restPositions.head = [0.0, restPositions.head[1], restPositions.head[2]];
  }

  // Filter left-side (+X) bone entries to calibrate anatomical Left (_L) as the single source of truth
  const leftBoneEntries = boneEntries.filter((e) => e.center.x > 0.005);

  const humerusL = mergeMatchingBoxes(leftBoneEntries, ['humerus'], 'L');
  const forearmL = mergeMatchingBoxes(leftBoneEntries, ['radius', 'ulna'], 'L');
  const handL = mergeMatchingBoxes(leftBoneEntries, ['carpal', 'metacarpal', 'hand'], 'L');

  if (humerusL) {
    const hc = boxCenter(humerusL);
    const hSpan = humerusL.max.y - humerusL.min.y;
    restPositions.shoulder_L = [
      Math.max(0.08, hc[0] - 0.014),
      humerusL.min.y + hSpan * 0.92,
      hc[2],
    ];
  }

  if (humerusL && forearmL) {
    const hc = boxCenter(humerusL);
    const fc = boxCenter(forearmL);
    restPositions.elbow_L = [
      (hc[0] + fc[0]) * 0.5,
      (humerusL.min.y + forearmL.max.y) * 0.5,
      (hc[2] + fc[2]) * 0.5,
    ];
  }

  if (forearmL && handL) {
    const fc = boxCenter(forearmL);
    const hnc = boxCenter(handL);
    restPositions.wrist_L = [
      (fc[0] + hnc[0]) * 0.5,
      (forearmL.min.y + handL.max.y) * 0.5,
      (fc[2] + hnc[2]) * 0.5,
    ];
  } else if (forearmL) {
    const fc = boxCenter(forearmL);
    restPositions.wrist_L = [fc[0], forearmL.min.y + 0.01, fc[2]];
  }

  const femurL = mergeMatchingBoxes(leftBoneEntries, ['femur'], 'L');
  const tibiaL = mergeMatchingBoxes(leftBoneEntries, ['tibia'], 'L');
  const patellaL = mergeMatchingBoxes(leftBoneEntries, ['patella'], 'L');
  const footL = mergeMatchingBoxes(leftBoneEntries, ['talus', 'tarsal', 'calcaneus'], 'L');

  if (femurL) {
    const fmc = boxCenter(femurL);
    const fSpan = femurL.max.y - femurL.min.y;
    restPositions.hip_L = [
      Math.max(0.05, fmc[0] - 0.018),
      femurL.min.y + fSpan * 0.92,
      fmc[2],
    ];
  }

  if (femurL && tibiaL) {
    const fmc = boxCenter(femurL);
    const tc = boxCenter(tibiaL);
    const patZ = patellaL ? boxCenter(patellaL)[2] - 0.022 : (fmc[2] + tc[2]) * 0.5;
    restPositions.knee_L = [
      (fmc[0] + tc[0]) * 0.5,
      (femurL.min.y + tibiaL.max.y) * 0.5,
      patZ,
    ];
  }

  if (tibiaL && footL) {
    const tc = boxCenter(tibiaL);
    const ftc = boxCenter(footL);
    restPositions.ankle_L = [
      (tc[0] + ftc[0]) * 0.5,
      (tibiaL.min.y + footL.max.y) * 0.5,
      (tc[2] + ftc[2]) * 0.5,
    ];
  } else if (tibiaL) {
    const tc = boxCenter(tibiaL);
    restPositions.ankle_L = [tc[0], tibiaL.min.y + 0.01, tc[2]];
  }

  // Strictly mirror all Right-side (_R, -X) joints from the calibrated Left-side (_L, +X) joints
  const MIRROR_PAIRS: Array<[JointId, JointId]> = [
    ['shoulder_L', 'shoulder_R'],
    ['elbow_L', 'elbow_R'],
    ['wrist_L', 'wrist_R'],
    ['hip_L', 'hip_R'],
    ['knee_L', 'knee_R'],
    ['ankle_L', 'ankle_R'],
  ];
  for (const [idL, idR] of MIRROR_PAIRS) {
    const posL = restPositions[idL];
    restPositions[idR] = [-posL[0], posL[1], posL[2]];
  }

  // Compute parent-relative offsets
  const offsets = {} as Record<JointId, Vec3>;
  for (const id of JOINT_ORDER) {
    const parentId = SKELETON_CONFIG[id].parentId;
    if (!parentId) {
      offsets[id] = [...restPositions[id]];
    } else {
      const p = restPositions[parentId];
      const c = restPositions[id];
      offsets[id] = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
    }
  }

  return {
    restPositions,
    offsets,
    modelScale,
    centerOffset,
    minY,
  };
}

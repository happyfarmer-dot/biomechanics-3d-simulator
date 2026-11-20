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
    if (side === 'L' && !e.nameLower.includes('_l') && !e.nameLower.includes('.l') && !e.nameLower.includes('__shoulder_l') && !e.nameLower.includes('__elbow_l') && !e.nameLower.includes('__wrist_l') && !e.nameLower.includes('__hip_l') && !e.nameLower.includes('__knee_l') && !e.nameLower.includes('__ankle_l')) {
      continue;
    }
    if (side === 'R' && !e.nameLower.includes('_r') && !e.nameLower.includes('.r') && !e.nameLower.includes('__shoulder_r') && !e.nameLower.includes('__elbow_r') && !e.nameLower.includes('__wrist_r') && !e.nameLower.includes('__hip_r') && !e.nameLower.includes('__knee_r') && !e.nameLower.includes('__ankle_r')) {
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

  // Spine & Head centers
  const pelvisBox = mergeMatchingBoxes(boneEntries, ['__pelvis__', 'hip_bone', 'ilium', 'sacrum']);
  if (pelvisBox) restPositions.pelvis = boxCenter(pelvisBox);

  const lumbarBox = mergeMatchingBoxes(boneEntries, ['__lumbar__', 'lumbar']);
  if (lumbarBox) restPositions.lumbar = boxCenter(lumbarBox);

  const thoraxBox = mergeMatchingBoxes(boneEntries, ['__thorax__', 'sternum', 'thoracic']);
  if (thoraxBox) {
    const tc = boxCenter(thoraxBox);
    restPositions.thorax = [tc[0], tc[1] - 0.04, tc[2]];
  }

  const neckBox = mergeMatchingBoxes(boneEntries, ['__neck__', 'cervical']);
  if (neckBox) restPositions.neck = boxCenter(neckBox);

  const headBox = mergeMatchingBoxes(boneEntries, ['__head__', 'skull', 'cranium', 'frontal']);
  if (headBox) {
    const hc = boxCenter(headBox);
    restPositions.head = [hc[0], headBox.min.y + 0.05, hc[2]];
  }

  // Bilateral Limbs (L = +X, R = -X)
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;

    const humerus = mergeMatchingBoxes(boneEntries, ['humerus'], side);
    const forearm = mergeMatchingBoxes(boneEntries, ['radius', 'ulna'], side);
    const hand = mergeMatchingBoxes(boneEntries, ['carpal', 'metacarpal', 'hand'], side);

    if (humerus) {
      const hc = boxCenter(humerus);
      const hSpan = humerus.max.y - humerus.min.y;
      // Shoulder: proximal 92% height of humerus, nudged medially to humeral head center
      restPositions[`shoulder_${side}`] = [
        hc[0] - sign * 0.014,
        humerus.min.y + hSpan * 0.92,
        hc[2],
      ];
    }

    if (humerus && forearm) {
      const hc = boxCenter(humerus);
      const fc = boxCenter(forearm);
      restPositions[`elbow_${side}`] = [
        (hc[0] + fc[0]) * 0.5,
        (humerus.min.y + forearm.max.y) * 0.5,
        (hc[2] + fc[2]) * 0.5,
      ];
    }

    if (forearm && hand) {
      const fc = boxCenter(forearm);
      const hnc = boxCenter(hand);
      restPositions[`wrist_${side}`] = [
        (fc[0] + hnc[0]) * 0.5,
        (forearm.min.y + hand.max.y) * 0.5,
        (fc[2] + hnc[2]) * 0.5,
      ];
    } else if (forearm) {
      const fc = boxCenter(forearm);
      restPositions[`wrist_${side}`] = [fc[0], forearm.min.y + 0.01, fc[2]];
    }

    const femur = mergeMatchingBoxes(boneEntries, ['femur'], side);
    const tibia = mergeMatchingBoxes(boneEntries, ['tibia'], side);
    const patella = mergeMatchingBoxes(boneEntries, ['patella'], side);
    const foot = mergeMatchingBoxes(boneEntries, ['talus', 'tarsal', 'calcaneus'], side);

    if (femur) {
      const fmc = boxCenter(femur);
      const fSpan = femur.max.y - femur.min.y;
      // Hip: proximal 92% height of femur, nudged medially to femoral head
      restPositions[`hip_${side}`] = [
        fmc[0] - sign * 0.018,
        femur.min.y + fSpan * 0.92,
        fmc[2],
      ];
    }

    if (femur && tibia) {
      const fmc = boxCenter(femur);
      const tc = boxCenter(tibia);
      const patZ = patella ? boxCenter(patella)[2] - 0.022 : (fmc[2] + tc[2]) * 0.5;
      restPositions[`knee_${side}`] = [
        (fmc[0] + tc[0]) * 0.5,
        (femur.min.y + tibia.max.y) * 0.5,
        patZ,
      ];
    }

    if (tibia && foot) {
      const tc = boxCenter(tibia);
      const ftc = boxCenter(foot);
      restPositions[`ankle_${side}`] = [
        (tc[0] + ftc[0]) * 0.5,
        (tibia.min.y + foot.max.y) * 0.5,
        (tc[2] + ftc[2]) * 0.5,
      ];
    } else if (tibia) {
      const tc = boxCenter(tibia);
      restPositions[`ankle_${side}`] = [tc[0], tibia.min.y + 0.01, tc[2]];
    }
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

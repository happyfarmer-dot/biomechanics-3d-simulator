import type { JointConfig, JointId, PoseMap } from '../types/biomechanics';

export const JOINT_ORDER: JointId[] = [
  'pelvis',
  'lumbar',
  'thorax',
  'neck',
  'head',
  'shoulder_L',
  'elbow_L',
  'wrist_L',
  'shoulder_R',
  'elbow_R',
  'wrist_R',
  'hip_L',
  'knee_L',
  'ankle_L',
  'hip_R',
  'knee_R',
  'ankle_R',
];

export const ROOT_HEIGHT_RATIO = 0.53;
export const DEFAULT_HEIGHT_M = 1.75;
export const DEFAULT_MASS_KG = 70;
export const GRAVITY_MPS2 = 9.81;

/**
 * Segment proportions & mass ratios (Winter / Dempster anthropometric tables):
 * Head: 8.26%, Trunk: 46.84% (Pelvis 14.00% + Lumbar 12.84% + Thorax 20.00%),
 * Upper Arm: 3.25% each, Forearm: 1.87% each, Hand: 0.65% each,
 * Thigh: 10.50% each, Shank: 4.75% each, Foot: 1.43% each.
 * Total = 100.00%.
 */
export const SKELETON_CONFIG: Record<JointId, JointConfig> = {
  pelvis: {
    id: 'pelvis',
    nameZh: '骨盆',
    parentId: null,
    offsetRatio: [0, ROOT_HEIGHT_RATIO, 0],
    distalRatio: [0, 0.07, 0],
    massRatio: 0.14,
    comRatio: 0.5,
    boneRadius: 0.075,
    romLimits: { flexion: [-25, 30], abduction: [-25, 30], rotation: [-30, 30] },
  },
  lumbar: {
    id: 'lumbar',
    nameZh: '腰椎',
    parentId: 'pelvis',
    offsetRatio: [0, 0.07, 0],
    distalRatio: [0, 0.12, 0],
    massRatio: 0.1284,
    comRatio: 0.5,
    boneRadius: 0.048,
    romLimits: { flexion: [-25, 60], abduction: [-25, 25], rotation: [-30, 30] },
  },
  thorax: {
    id: 'thorax',
    nameZh: '胸廓',
    parentId: 'lumbar',
    offsetRatio: [0, 0.12, 0],
    distalRatio: [0, 0.14, 0],
    massRatio: 0.2,
    comRatio: 0.5,
    boneRadius: 0.085,
    romLimits: { flexion: [-20, 35], abduction: [-20, 20], rotation: [-35, 35] },
  },
  neck: {
    id: 'neck',
    nameZh: '頸椎',
    parentId: 'thorax',
    offsetRatio: [0, 0.14, 0],
    distalRatio: [0, 0.06, 0],
    massRatio: 0,
    comRatio: 0.5,
    boneRadius: 0.032,
    romLimits: { flexion: [-45, 50], abduction: [-45, 45], rotation: [-70, 70] },
  },
  head: {
    id: 'head',
    nameZh: '頭部',
    parentId: 'neck',
    offsetRatio: [0, 0.06, 0],
    distalRatio: [0, 0.08, 0],
    massRatio: 0.0826,
    comRatio: 0.5,
    boneRadius: 0.075,
    romLimits: { flexion: [-30, 30], abduction: [-25, 25], rotation: [-35, 35] },
  },

  // Left Upper Limb (+X)
  shoulder_L: {
    id: 'shoulder_L',
    nameZh: '左肩關節',
    parentId: 'thorax',
    offsetRatio: [0.115, 0.10, 0],
    distalRatio: [0, -0.18, 0],
    massRatio: 0.0325,
    comRatio: 0.436,
    boneRadius: 0.028,
    romLimits: { flexion: [-50, 180], abduction: [-30, 180], rotation: [-70, 90] },
  },
  elbow_L: {
    id: 'elbow_L',
    nameZh: '左肘關節',
    parentId: 'shoulder_L',
    offsetRatio: [0, -0.18, 0],
    distalRatio: [0, -0.285 / 1.75, 0],
    massRatio: 0.0187,
    comRatio: 0.43,
    boneRadius: 0.022,
    romLimits: { flexion: [0, 145], abduction: [-10, 10], rotation: [-85, 85] },
  },
  wrist_L: {
    id: 'wrist_L',
    nameZh: '左腕關節',
    parentId: 'elbow_L',
    offsetRatio: [0, -0.285 / 1.75, 0],
    distalRatio: [0, -0.095, 0],
    massRatio: 0.0065,
    comRatio: 0.506,
    boneRadius: 0.018,
    romLimits: { flexion: [-70, 75], abduction: [-20, 30], rotation: [-15, 15] },
  },

  // Right Upper Limb (-X)
  shoulder_R: {
    id: 'shoulder_R',
    nameZh: '右肩關節',
    parentId: 'thorax',
    offsetRatio: [-0.115, 0.10, 0],
    distalRatio: [0, -0.18, 0],
    massRatio: 0.0325,
    comRatio: 0.436,
    boneRadius: 0.028,
    romLimits: { flexion: [-50, 180], abduction: [-30, 180], rotation: [-70, 90] },
  },
  elbow_R: {
    id: 'elbow_R',
    nameZh: '右肘關節',
    parentId: 'shoulder_R',
    offsetRatio: [0, -0.18, 0],
    distalRatio: [0, -0.285 / 1.75, 0],
    massRatio: 0.0187,
    comRatio: 0.43,
    boneRadius: 0.022,
    romLimits: { flexion: [0, 145], abduction: [-10, 10], rotation: [-85, 85] },
  },
  wrist_R: {
    id: 'wrist_R',
    nameZh: '右腕關節',
    parentId: 'elbow_R',
    offsetRatio: [0, -0.285 / 1.75, 0],
    distalRatio: [0, -0.095, 0],
    massRatio: 0.0065,
    comRatio: 0.506,
    boneRadius: 0.018,
    romLimits: { flexion: [-70, 75], abduction: [-20, 30], rotation: [-15, 15] },
  },

  // Left Lower Limb (+X)
  hip_L: {
    id: 'hip_L',
    nameZh: '左髖關節',
    parentId: 'pelvis',
    offsetRatio: [0.055, -0.02, 0],
    distalRatio: [0, -0.245, 0],
    massRatio: 0.105,
    comRatio: 0.433,
    boneRadius: 0.038,
    romLimits: { flexion: [-30, 120], abduction: [-30, 45], rotation: [-45, 45] },
  },
  knee_L: {
    id: 'knee_L',
    nameZh: '左膝關節',
    parentId: 'hip_L',
    offsetRatio: [0, -0.245, 0],
    distalRatio: [0, -0.235, 0],
    massRatio: 0.0475,
    comRatio: 0.433,
    boneRadius: 0.03,
    romLimits: { flexion: [0, 135], abduction: [-10, 10], rotation: [-15, 15] },
  },
  ankle_L: {
    id: 'ankle_L',
    nameZh: '左踝關節',
    parentId: 'knee_L',
    offsetRatio: [0, -0.235, 0],
    distalRatio: [0, -0.03, 0.08],
    massRatio: 0.0143,
    comRatio: 0.5,
    boneRadius: 0.022,
    romLimits: { flexion: [-20, 50], abduction: [-20, 30], rotation: [-15, 15] },
  },

  // Right Lower Limb (-X)
  hip_R: {
    id: 'hip_R',
    nameZh: '右髖關節',
    parentId: 'pelvis',
    offsetRatio: [-0.055, -0.02, 0],
    distalRatio: [0, -0.245, 0],
    massRatio: 0.105,
    comRatio: 0.433,
    boneRadius: 0.038,
    romLimits: { flexion: [-30, 120], abduction: [-30, 45], rotation: [-45, 45] },
  },
  knee_R: {
    id: 'knee_R',
    nameZh: '右膝關節',
    parentId: 'hip_R',
    offsetRatio: [0, -0.245, 0],
    distalRatio: [0, -0.235, 0],
    massRatio: 0.0475,
    comRatio: 0.433,
    boneRadius: 0.03,
    romLimits: { flexion: [0, 135], abduction: [-10, 10], rotation: [-15, 15] },
  },
  ankle_R: {
    id: 'ankle_R',
    nameZh: '右踝關節',
    parentId: 'knee_R',
    offsetRatio: [0, -0.235, 0],
    distalRatio: [0, -0.03, 0.08],
    massRatio: 0.0143,
    comRatio: 0.5,
    boneRadius: 0.022,
    romLimits: { flexion: [-20, 50], abduction: [-20, 30], rotation: [-15, 15] },
  },
};

export function createNeutralPose(): PoseMap {
  return {
    pelvis: { flexion: 0, abduction: 0, rotation: 0 },
    lumbar: { flexion: 0, abduction: 0, rotation: 0 },
    thorax: { flexion: 0, abduction: 0, rotation: 0 },
    neck: { flexion: 0, abduction: 0, rotation: 0 },
    head: { flexion: 0, abduction: 0, rotation: 0 },
    shoulder_L: { flexion: 0, abduction: 0, rotation: 0 },
    elbow_L: { flexion: 0, abduction: 0, rotation: 0 },
    wrist_L: { flexion: 0, abduction: 0, rotation: 0 },
    shoulder_R: { flexion: 0, abduction: 0, rotation: 0 },
    elbow_R: { flexion: 0, abduction: 0, rotation: 0 },
    wrist_R: { flexion: 0, abduction: 0, rotation: 0 },
    hip_L: { flexion: 0, abduction: 0, rotation: 0 },
    knee_L: { flexion: 0, abduction: 0, rotation: 0 },
    ankle_L: { flexion: 0, abduction: 0, rotation: 0 },
    hip_R: { flexion: 0, abduction: 0, rotation: 0 },
    knee_R: { flexion: 0, abduction: 0, rotation: 0 },
    ankle_R: { flexion: 0, abduction: 0, rotation: 0 },
  };
}

/**
 * Reasonable injury limit bounds for UI sliders & camera-relative joystick.
 * Allows exceeding AAOS safe limits to trigger injury alerts without 180-deg mesh tearing.
 */
export function getJointSliderLimits(jointId: JointId): {
  flexion: [number, number];
  abduction: [number, number];
  rotation: [number, number];
} {
  if (jointId.startsWith('knee_')) {
    return { flexion: [-15, 155], abduction: [-35, 35], rotation: [-40, 40] };
  }
  if (jointId.startsWith('hip_')) {
    return { flexion: [-45, 135], abduction: [-45, 75], rotation: [-55, 55] };
  }
  if (jointId.startsWith('elbow_')) {
    return { flexion: [-10, 155], abduction: [-30, 30], rotation: [-95, 95] };
  }
  if (jointId.startsWith('wrist_')) {
    return { flexion: [-85, 85], abduction: [-45, 55], rotation: [-35, 35] };
  }
  if (jointId.startsWith('ankle_')) {
    return { flexion: [-35, 65], abduction: [-35, 45], rotation: [-35, 35] };
  }
  if (jointId === 'pelvis') {
    return { flexion: [-25, 30], abduction: [-25, 30], rotation: [-30, 30] };
  }
  if (jointId.startsWith('shoulder_')) {
    return { flexion: [-65, 180], abduction: [-45, 180], rotation: [-90, 100] };
  }
  const rom = SKELETON_CONFIG[jointId].romLimits;
  return {
    flexion: [rom.flexion[0] - 15, rom.flexion[1] + 20],
    abduction: [rom.abduction[0] - 15, rom.abduction[1] + 15],
    rotation: [rom.rotation[0] - 15, rom.rotation[1] + 15],
  };
}


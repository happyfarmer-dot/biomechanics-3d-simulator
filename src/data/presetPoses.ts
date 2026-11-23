import type { PoseMap, PresetPose } from '../types/biomechanics';
import { EXTRA_PRESET_POSES } from './presetPosesExtra';
import { createNeutralPose } from './skeletonConfig';

function withOverrides(overrides: Partial<PoseMap>): PoseMap {
  return {
    ...createNeutralPose(),
    ...overrides,
  };
}

export const PRESET_POSES: PresetPose[] = [
  {
    id: 'neutral_standing',
    name: '標準站姿',
    description: 'AAOS 中立基準站姿，用於快取肌群基準長度 L0 與靜態重力基準。',
    pose: createNeutralPose(),
    forces: [],
    includeGravity: true,
    focusJointId: null,
    interactionMode: 'pose',
  },
  {
    id: 'knee_lateral_impact',
    name: '膝關節外側撞擊',
    description: '於右小腿遠端外側 (-X) 施加向內 (+X) 350 N 撞擊力，產生 > 45 N·m 外翻彎矩，示範右膝 MCL 與 ACL 高風險受力。',
    pose: withOverrides({
      knee_R: { flexion: 20, abduction: 6, rotation: -5 },
      hip_R: { flexion: 12, abduction: 0, rotation: 0 },
      ankle_R: { flexion: -8, abduction: 0, rotation: 0 },
    }),
    forces: [
      {
        id: 'knee_valgus_impact',
        targetJoint: 'knee_R',
        positionRatio: 0.75,
        surfaceAngleDeg: -90, // -X lateral surface
        forceVectorWorld: [350, 0, 0], // Pushing toward +X medial -> Valgus!
        scaleNpm: 1000,
        label: '外側撞擊推力',
      },
    ],
    includeGravity: true,
    focusJointId: 'knee_R',
    interactionMode: 'force',
  },
  {
    id: 'rounded_twisted_lift',
    name: '圓背轉身搬 20kg',
    description: '腰椎屈曲 45° 合併軸向旋轉 18°，雙手前伸各承受 10 kgf (98.1 N) 向下負荷，自動聚焦腰椎觀察椎間盤壓縮與後外側纖維環應力。',
    pose: withOverrides({
      lumbar: { flexion: 45, abduction: 4, rotation: 18 },
      thorax: { flexion: 15, abduction: 0, rotation: 8 },
      neck: { flexion: -20, abduction: 0, rotation: -10 },
      shoulder_L: { flexion: 48, abduction: 10, rotation: 0 },
      shoulder_R: { flexion: 48, abduction: 10, rotation: 0 },
      elbow_L: { flexion: 25, abduction: 0, rotation: 0 },
      elbow_R: { flexion: 25, abduction: 0, rotation: 0 },
      hip_L: { flexion: 25, abduction: 5, rotation: 0 },
      hip_R: { flexion: 25, abduction: 5, rotation: 0 },
      knee_L: { flexion: 15, abduction: 0, rotation: 0 },
      knee_R: { flexion: 15, abduction: 0, rotation: 0 },
    }),
    forces: [
      {
        id: 'lift_load_L',
        targetJoint: 'wrist_L',
        positionRatio: 0.6,
        surfaceAngleDeg: 0,
        forceVectorWorld: [0, -98.1, 0],
        scaleNpm: 1000,
        label: '左手負荷 10kg',
      },
      {
        id: 'lift_load_R',
        targetJoint: 'wrist_R',
        positionRatio: 0.6,
        surfaceAngleDeg: 0,
        forceVectorWorld: [0, -98.1, 0],
        scaleNpm: 1000,
        label: '右手負荷 10kg',
      },
    ],
    includeGravity: true,
    focusJointId: 'lumbar',
    interactionMode: 'pose',
  },
  {
    id: 'shoulder_impingement_press',
    name: '過頭推舉肩夾擠',
    description: '雙肩外展 105° 合併內旋 55° 負重推舉，自動聚焦右肩觀察棘上肌肌腱與肩峰下夾擠。',
    pose: withOverrides({
      shoulder_L: { flexion: 10, abduction: 105, rotation: 55 },
      shoulder_R: { flexion: 10, abduction: 105, rotation: 55 },
      elbow_L: { flexion: 75, abduction: 0, rotation: 0 },
      elbow_R: { flexion: 75, abduction: 0, rotation: 0 },
      lumbar: { flexion: -8, abduction: 0, rotation: 0 },
    }),
    forces: [
      {
        id: 'press_load_L',
        targetJoint: 'wrist_L',
        positionRatio: 0.5,
        surfaceAngleDeg: 0,
        forceVectorWorld: [0, -120, 0],
        scaleNpm: 1000,
        label: '左啞鈴 12.2kg',
      },
      {
        id: 'press_load_R',
        targetJoint: 'wrist_R',
        positionRatio: 0.5,
        surfaceAngleDeg: 0,
        forceVectorWorld: [0, -120, 0],
        scaleNpm: 1000,
        label: '右啞鈴 12.2kg',
      },
    ],
    includeGravity: true,
    focusJointId: 'shoulder_R',
    interactionMode: 'pose',
  },
  ...EXTRA_PRESET_POSES,
];

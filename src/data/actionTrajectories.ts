import { Quaternion } from 'three';
import { PRESET_POSES } from './presetPoses';
import { createNeutralPose, JOINT_ORDER } from './skeletonConfig';
import {
  anatomicalToEuler,
  localEulerToQuaternion,
  quaternionToAnatomicalContinuous,
} from '../engine/kinematics';
import type { AnatomicalAngles, JointId, PoseMap } from '../types/biomechanics';

export interface ActionKeyframe {
  t: number; // 0 .. 1
  label: string;
  pose: PoseMap;
}

export interface ActionTrajectory {
  presetId: string;
  title: string;
  keyframes: ActionKeyframe[];
}

function poseWith(overrides: Partial<PoseMap>): PoseMap {
  return { ...createNeutralPose(), ...overrides };
}

const PRESET_POSE_BY_ID: Record<string, PoseMap> = Object.fromEntries(
  PRESET_POSES.map((p) => [p.id, p.pose])
);

function makeTraj(
  presetId: string,
  title: string,
  startLabel: string,
  midLabel: string,
  endLabel: string,
  startOverrides: Partial<PoseMap>,
  midOverrides?: Partial<PoseMap>
): ActionTrajectory {
  const startPose = poseWith(startOverrides);
  const endPose = PRESET_POSE_BY_ID[presetId] ?? createNeutralPose();
  const midPose = midOverrides
    ? poseWith(midOverrides)
    : interpolatePoseSlerp(
        [
          { t: 0, label: startLabel, pose: startPose },
          { t: 1, label: endLabel, pose: endPose },
        ],
        0.5
      );

  return {
    presetId,
    title,
    keyframes: [
      { t: 0, label: startLabel, pose: startPose },
      { t: 0.5, label: midLabel, pose: midPose },
      { t: 1, label: endLabel, pose: endPose },
    ],
  };
}

function makeFiveTraj(
  presetId: string,
  title: string,
  startLabel: string,
  midLabel: string,
  endLabel: string,
  ov0: Partial<PoseMap>,
  ov25: Partial<PoseMap>,
  ov50: Partial<PoseMap>,
  ov75: Partial<PoseMap>
): ActionTrajectory {
  return {
    presetId,
    title,
    keyframes: [
      { t: 0, label: startLabel, pose: poseWith(ov0) },
      { t: 0.25, label: midLabel, pose: poseWith(ov25) },
      { t: 0.5, label: midLabel, pose: poseWith(ov50) },
      { t: 0.75, label: midLabel, pose: poseWith(ov75) },
      { t: 1, label: endLabel, pose: PRESET_POSE_BY_ID[presetId] ?? createNeutralPose() },
    ],
  };
}

const _qA = new Quaternion();
const _qB = new Quaternion();
const _qOut = new Quaternion();
const _refAngles: AnatomicalAngles = { flexion: 0, abduction: 0, rotation: 0 };

// 1-2 DOF hinge/pivot joints should interpolate in anatomical axes directly so simultaneous
// flexion + pronation/supination does not induce non-physiological 3rd-axis abduction (valgus/varus).
const HINGE_OR_PIVOT_JOINTS = new Set<JointId>([
  'elbow_L',
  'elbow_R',
  'wrist_L',
  'wrist_R',
  'knee_L',
  'knee_R',
  'ankle_L',
  'ankle_R',
]);

export function interpolatePoseSlerp(keyframes: ActionKeyframe[], t: number): PoseMap {
  const clampedT = Math.max(0, Math.min(1, t));
  if (keyframes.length === 0) return createNeutralPose();
  if (keyframes.length === 1 || clampedT <= keyframes[0].t) return keyframes[0].pose;
  if (clampedT >= keyframes[keyframes.length - 1].t) return keyframes[keyframes.length - 1].pose;

  let kfA = keyframes[0];
  let kfB = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (clampedT >= keyframes[i].t && clampedT <= keyframes[i + 1].t) {
      kfA = keyframes[i];
      kfB = keyframes[i + 1];
      break;
    }
  }
  const span = Math.max(1e-6, kfB.t - kfA.t);
  const alpha = (clampedT - kfA.t) / span;

  const out = createNeutralPose();
  for (const jId of JOINT_ORDER as JointId[]) {
    const a = kfA.pose[jId];
    const b = kfB.pose[jId];

    if (HINGE_OR_PIVOT_JOINTS.has(jId)) {
      out[jId] = {
        flexion: a.flexion + (b.flexion - a.flexion) * alpha,
        abduction: a.abduction + (b.abduction - a.abduction) * alpha,
        rotation: a.rotation + (b.rotation - a.rotation) * alpha,
      };
      continue;
    }

    const eA = anatomicalToEuler(jId, a);
    const eB = anatomicalToEuler(jId, b);
    _qA.copy(localEulerToQuaternion(eA));
    _qB.copy(localEulerToQuaternion(eB));
    _qOut.copy(_qA).slerp(_qB, alpha);

    _refAngles.flexion = a.flexion + (b.flexion - a.flexion) * alpha;
    _refAngles.abduction = a.abduction + (b.abduction - a.abduction) * alpha;
    _refAngles.rotation = a.rotation + (b.rotation - a.rotation) * alpha;

    out[jId] = quaternionToAnatomicalContinuous(jId, _qOut, _refAngles);
  }
  return out;
}

export const ACTION_TRAJECTORIES: Record<string, ActionTrajectory> = {
  // === 經典臨床示範 ===
  knee_lateral_impact: makeTraj(
    'knee_lateral_impact',
    '膝外側撞擊軌跡',
    '微蹲站立',
    '外側受推',
    '外翻撞擊',
    { hip_R: { flexion: 10, abduction: 0, rotation: 0 }, knee_R: { flexion: 15, abduction: 0, rotation: 0 }, ankle_R: { flexion: -5, abduction: 0, rotation: 0 } }
  ),
  rounded_twisted_lift: makeTraj(
    'rounded_twisted_lift',
    '搬重物軌跡',
    '直立預備',
    '前傾伸手',
    '圓背轉身極限',
    { elbow_L: { flexion: 5, abduction: 0, rotation: -90 }, elbow_R: { flexion: 5, abduction: 0, rotation: -90 } },
    { lumbar: { flexion: 22, abduction: 0, rotation: 8 }, shoulder_L: { flexion: 25, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 25, abduction: 8, rotation: 0 }, elbow_L: { flexion: 15, abduction: 0, rotation: -165 }, elbow_R: { flexion: 15, abduction: 0, rotation: -165 }, hip_L: { flexion: 15, abduction: 4, rotation: 0 }, hip_R: { flexion: 15, abduction: 4, rotation: 0 }, knee_L: { flexion: 15, abduction: 0, rotation: 0 }, knee_R: { flexion: 15, abduction: 0, rotation: 0 } }
  ),
  shoulder_impingement_press: makeTraj(
    'shoulder_impingement_press',
    '肩夾擠推舉軌跡',
    '肩前預備',
    '中段外展',
    '夾擠高點',
    { shoulder_L: { flexion: 25, abduction: 30, rotation: 40 }, shoulder_R: { flexion: 25, abduction: 30, rotation: 40 }, elbow_L: { flexion: 105, abduction: 0, rotation: -145 }, elbow_R: { flexion: 105, abduction: 0, rotation: -145 }, wrist_L: { flexion: -15, abduction: 0, rotation: 0 }, wrist_R: { flexion: -15, abduction: 0, rotation: 0 } }
  ),

  // === 1. 重量訓練與肌力 (15 種) ===
  barbell_squat_bottom: makeTraj(
    'barbell_squat_bottom',
    '槓鈴深蹲軌跡',
    '站立預備',
    '離心半蹲',
    '深蹲底端',
    { shoulder_L: { flexion: -20, abduction: 65, rotation: 55 }, shoulder_R: { flexion: -20, abduction: 65, rotation: 55 }, elbow_L: { flexion: 110, abduction: 0, rotation: -165 }, elbow_R: { flexion: 110, abduction: 0, rotation: -165 }, wrist_L: { flexion: -20, abduction: 0, rotation: 0 }, wrist_R: { flexion: -20, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 26, abduction: 0, rotation: 0 }, lumbar: { flexion: 6, abduction: 0, rotation: 0 }, thorax: { flexion: 3, abduction: 0, rotation: 0 }, hip_L: { flexion: 46, abduction: 12, rotation: 6 }, hip_R: { flexion: 46, abduction: 12, rotation: 6 }, knee_L: { flexion: 68, abduction: 0, rotation: 0 }, knee_R: { flexion: 68, abduction: 0, rotation: 0 }, ankle_L: { flexion: -22, abduction: 0, rotation: 0 }, ankle_R: { flexion: -22, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -20, abduction: 65, rotation: 55 }, shoulder_R: { flexion: -20, abduction: 65, rotation: 55 }, elbow_L: { flexion: 110, abduction: 0, rotation: -165 }, elbow_R: { flexion: 110, abduction: 0, rotation: -165 }, wrist_L: { flexion: -20, abduction: 0, rotation: 0 }, wrist_R: { flexion: -20, abduction: 0, rotation: 0 } }
  ),
  sumo_deadlift_start: makeTraj(
    'sumo_deadlift_start',
    '相撲硬舉軌跡',
    '寬站鎖定',
    '屈髖下放',
    '起始拉槓',
    { shoulder_L: { flexion: 0, abduction: 0.5, rotation: 1.5 }, shoulder_R: { flexion: 0, abduction: 0.5, rotation: 1.5 }, elbow_L: { flexion: 5, abduction: 0, rotation: -155 }, elbow_R: { flexion: 5, abduction: 0, rotation: -155 }, hip_L: { flexion: 5, abduction: 35, rotation: 22 }, hip_R: { flexion: 5, abduction: 35, rotation: 22 }, knee_L: { flexion: 5, abduction: 0, rotation: 0 }, knee_R: { flexion: 5, abduction: 0, rotation: 0 }, ankle_L: { flexion: 14, abduction: 8, rotation: 10 }, ankle_R: { flexion: 14, abduction: 8, rotation: 10 } },
    { pelvis: { flexion: 25, abduction: 0, rotation: 0 }, lumbar: { flexion: 5, abduction: 0, rotation: 0 }, thorax: { flexion: 3, abduction: 0, rotation: 0 }, neck: { flexion: -9, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 32, abduction: 1, rotation: -0.5 }, shoulder_R: { flexion: 32, abduction: 1, rotation: -0.5 }, elbow_L: { flexion: 5, abduction: 0, rotation: -155 }, elbow_R: { flexion: 5, abduction: 0, rotation: -155 }, hip_L: { flexion: 25, abduction: 35, rotation: 22 }, hip_R: { flexion: 25, abduction: 35, rotation: 22 }, knee_L: { flexion: 31, abduction: 0, rotation: 0 }, knee_R: { flexion: 31, abduction: 0, rotation: 0 }, ankle_L: { flexion: 3, abduction: 8, rotation: 10 }, ankle_R: { flexion: 3, abduction: 8, rotation: 10 } }
  ),
  romanian_deadlift: makeTraj(
    'romanian_deadlift',
    '羅馬尼亞硬舉軌跡',
    '直立鎖定',
    '髖鉸鏈中段',
    '最低拉伸',
    { shoulder_L: { flexion: 0, abduction: 4, rotation: 1 }, shoulder_R: { flexion: 0, abduction: 4, rotation: 1 }, elbow_L: { flexion: 5, abduction: 0, rotation: -155 }, elbow_R: { flexion: 5, abduction: 0, rotation: -155 } },
    { pelvis: { flexion: 23, abduction: 0, rotation: 0 }, lumbar: { flexion: 5, abduction: 0, rotation: 0 }, thorax: { flexion: 2, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 29, abduction: 5.5, rotation: 0.5 }, shoulder_R: { flexion: 29, abduction: 5.5, rotation: 0.5 }, elbow_L: { flexion: 5, abduction: 0, rotation: -155 }, elbow_R: { flexion: 5, abduction: 0, rotation: -155 }, hip_L: { flexion: 15, abduction: 6, rotation: 0 }, hip_R: { flexion: 15, abduction: 6, rotation: 0 }, knee_L: { flexion: 16, abduction: 0, rotation: 0 }, knee_R: { flexion: 16, abduction: 0, rotation: 0 }, ankle_L: { flexion: -1, abduction: 0, rotation: 0 }, ankle_R: { flexion: -1, abduction: 0, rotation: 0 } }
  ),
  flat_bench_press_bottom: makeFiveTraj(
    'flat_bench_press_bottom',
    '平板臥推軌跡',
    '頂端鎖定',
    '垂直下放',
    '觸胸底端',
    { pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 65, abduction: 48, rotation: 20 }, shoulder_R: { flexion: 65, abduction: 48, rotation: 20 }, elbow_L: { flexion: 8, abduction: 0, rotation: -165 }, elbow_R: { flexion: 8, abduction: 0, rotation: -165 }, wrist_L: { flexion: -55, abduction: 0, rotation: 0 }, wrist_R: { flexion: -55, abduction: 0, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 52.5, abduction: 32.5, rotation: 19 }, shoulder_R: { flexion: 52.5, abduction: 32.5, rotation: 19 }, elbow_L: { flexion: 32, abduction: 0, rotation: -165 }, elbow_R: { flexion: 32, abduction: 0, rotation: -165 }, wrist_L: { flexion: -45, abduction: 0, rotation: 0 }, wrist_R: { flexion: -45, abduction: 0, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 38, abduction: 32, rotation: 15 }, shoulder_R: { flexion: 38, abduction: 32, rotation: 15 }, elbow_L: { flexion: 54, abduction: 0, rotation: -165 }, elbow_R: { flexion: 54, abduction: 0, rotation: -165 }, wrist_L: { flexion: -36, abduction: 0, rotation: 0 }, wrist_R: { flexion: -36, abduction: 0, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 21.5, abduction: 29, rotation: 14 }, shoulder_R: { flexion: 21.5, abduction: 29, rotation: 14 }, elbow_L: { flexion: 76, abduction: 0, rotation: -165 }, elbow_R: { flexion: 76, abduction: 0, rotation: -165 }, wrist_L: { flexion: -28, abduction: 0, rotation: 0 }, wrist_R: { flexion: -28, abduction: 0, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } }
  ),
  incline_dumbbell_press_bottom: makeTraj(
    'incline_dumbbell_press_bottom',
    '上斜啞鈴臥推軌跡',
    '頂端鎖定',
    '離心下放',
    '底端拉伸',
    { pelvis: { flexion: -45, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 82, abduction: 18, rotation: 0 }, shoulder_R: { flexion: 82, abduction: 18, rotation: 0 }, elbow_L: { flexion: 10, abduction: 0, rotation: -140 }, elbow_R: { flexion: 10, abduction: 0, rotation: -140 }, wrist_L: { flexion: -55, abduction: 0, rotation: 0 }, wrist_R: { flexion: -55, abduction: 0, rotation: 0 }, hip_L: { flexion: 50, abduction: 12, rotation: 0 }, hip_R: { flexion: 50, abduction: 12, rotation: 0 }, knee_L: { flexion: 70, abduction: 0, rotation: 0 }, knee_R: { flexion: 70, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: -45, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 54, abduction: 35, rotation: 22 }, shoulder_R: { flexion: 54, abduction: 35, rotation: 22 }, elbow_L: { flexion: 50, abduction: 0, rotation: -130 }, elbow_R: { flexion: 50, abduction: 0, rotation: -130 }, wrist_L: { flexion: -40, abduction: 0, rotation: 0 }, wrist_R: { flexion: -40, abduction: 0, rotation: 0 }, hip_L: { flexion: 50, abduction: 12, rotation: 0 }, hip_R: { flexion: 50, abduction: 12, rotation: 0 }, knee_L: { flexion: 70, abduction: 0, rotation: 0 }, knee_R: { flexion: 70, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } }
  ),
  standing_overhead_press: makeFiveTraj(
    'standing_overhead_press',
    '過頭推舉軌跡',
    '鎖骨預備',
    '過頭推起',
    '頂峰鎖定',
    { shoulder_L: { flexion: 43.5, abduction: 25.5, rotation: 37.5 }, shoulder_R: { flexion: 43.5, abduction: 25.5, rotation: 37.5 }, elbow_L: { flexion: 118, abduction: 0, rotation: -170 }, elbow_R: { flexion: 118, abduction: 0, rotation: -170 }, wrist_L: { flexion: -55, abduction: 0, rotation: 0 }, wrist_R: { flexion: -55, abduction: 0, rotation: 0 } },
    { shoulder_L: { flexion: 91, abduction: 15.5, rotation: 36.5 }, shoulder_R: { flexion: 91, abduction: 15.5, rotation: 36.5 }, elbow_L: { flexion: 92, abduction: 0, rotation: -170 }, elbow_R: { flexion: 92, abduction: 0, rotation: -170 }, wrist_L: { flexion: -58, abduction: 0, rotation: 0 }, wrist_R: { flexion: -58, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -4, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 123.5, abduction: 5, rotation: 28.5 }, shoulder_R: { flexion: 123.5, abduction: 5, rotation: 28.5 }, elbow_L: { flexion: 64, abduction: 0, rotation: -170 }, elbow_R: { flexion: 64, abduction: 0, rotation: -170 }, wrist_L: { flexion: -60, abduction: 0, rotation: 0 }, wrist_R: { flexion: -60, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -6, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 146, abduction: 0, rotation: 25 }, shoulder_R: { flexion: 146, abduction: 0, rotation: 25 }, elbow_L: { flexion: 35, abduction: 0, rotation: -170 }, elbow_R: { flexion: 35, abduction: 0, rotation: -170 }, wrist_L: { flexion: -62, abduction: 0, rotation: 0 }, wrist_R: { flexion: -62, abduction: 0, rotation: 0 } }
  ),
  dumbbell_lateral_raise_top: makeTraj(
    'dumbbell_lateral_raise_top',
    '啞鈴側平舉軌跡',
    '體側預備',
    '外展抬起',
    '頂峰收縮',
    { elbow_L: { flexion: 15, abduction: 0, rotation: -90 }, elbow_R: { flexion: 15, abduction: 0, rotation: -90 } }
  ),
  bent_over_barbell_row: makeFiveTraj(
    'bent_over_barbell_row',
    '俯身槓鈴划船軌跡',
    '俯身懸槓',
    '向心拉起',
    '頂峰夾背',
    { pelvis: { flexion: 45, abduction: 0, rotation: 0 }, lumbar: { flexion: 10, abduction: 0, rotation: 0 }, thorax: { flexion: 6, abduction: 0, rotation: 0 }, neck: { flexion: -18, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 59.5, abduction: 22, rotation: 0.5 }, shoulder_R: { flexion: 59.5, abduction: 22, rotation: 0.5 }, elbow_L: { flexion: 10, abduction: 0, rotation: -170 }, elbow_R: { flexion: 10, abduction: 0, rotation: -170 }, hip_L: { flexion: 35, abduction: 8, rotation: 0 }, hip_R: { flexion: 35, abduction: 8, rotation: 0 }, knee_L: { flexion: 43, abduction: 0, rotation: 0 }, knee_R: { flexion: 43, abduction: 0, rotation: 0 }, ankle_L: { flexion: -8, abduction: 0, rotation: 0 }, ankle_R: { flexion: -8, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 45, abduction: 0, rotation: 0 }, lumbar: { flexion: 10, abduction: 0, rotation: 0 }, thorax: { flexion: 6, abduction: 0, rotation: 0 }, neck: { flexion: -18, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 48.5, abduction: 19, rotation: 5.5 }, shoulder_R: { flexion: 48.5, abduction: 19, rotation: 5.5 }, elbow_L: { flexion: 30, abduction: 0, rotation: -170 }, elbow_R: { flexion: 30, abduction: 0, rotation: -170 }, hip_L: { flexion: 35, abduction: 8, rotation: 0 }, hip_R: { flexion: 35, abduction: 8, rotation: 0 }, knee_L: { flexion: 43, abduction: 0, rotation: 0 }, knee_R: { flexion: 43, abduction: 0, rotation: 0 }, ankle_L: { flexion: -8, abduction: 0, rotation: 0 }, ankle_R: { flexion: -8, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 45, abduction: 0, rotation: 0 }, lumbar: { flexion: 10, abduction: 0, rotation: 0 }, thorax: { flexion: 6, abduction: 0, rotation: 0 }, neck: { flexion: -18, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 35.5, abduction: 17, rotation: 5 }, shoulder_R: { flexion: 35.5, abduction: 17, rotation: 5 }, elbow_L: { flexion: 52, abduction: 0, rotation: -170 }, elbow_R: { flexion: 52, abduction: 0, rotation: -170 }, hip_L: { flexion: 35, abduction: 8, rotation: 0 }, hip_R: { flexion: 35, abduction: 8, rotation: 0 }, knee_L: { flexion: 43, abduction: 0, rotation: 0 }, knee_R: { flexion: 43, abduction: 0, rotation: 0 }, ankle_L: { flexion: -8, abduction: 0, rotation: 0 }, ankle_R: { flexion: -8, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 45, abduction: 0, rotation: 0 }, lumbar: { flexion: 10, abduction: 0, rotation: 0 }, thorax: { flexion: 6, abduction: 0, rotation: 0 }, neck: { flexion: -18, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 19, abduction: 17, rotation: 2.5 }, shoulder_R: { flexion: 19, abduction: 17, rotation: 2.5 }, elbow_L: { flexion: 72, abduction: 0, rotation: -170 }, elbow_R: { flexion: 72, abduction: 0, rotation: -170 }, hip_L: { flexion: 35, abduction: 8, rotation: 0 }, hip_R: { flexion: 35, abduction: 8, rotation: 0 }, knee_L: { flexion: 43, abduction: 0, rotation: 0 }, knee_R: { flexion: 43, abduction: 0, rotation: 0 }, ankle_L: { flexion: -8, abduction: 0, rotation: 0 }, ankle_R: { flexion: -8, abduction: 0, rotation: 0 } }
  ),
  pull_up_peak: makeFiveTraj(
    'pull_up_peak',
    '引體向上軌跡',
    '懸垂預備',
    '拉起中段',
    '過槓頂峰',
    { thorax: { flexion: -2, abduction: 0, rotation: 0 }, neck: { flexion: -6, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 45, abduction: 152, rotation: 16.5 }, shoulder_R: { flexion: 45, abduction: 152, rotation: 16.5 }, elbow_L: { flexion: 10, abduction: 0, rotation: -165 }, elbow_R: { flexion: 10, abduction: 0, rotation: -165 }, hip_L: { flexion: 10, abduction: 0, rotation: 0 }, hip_R: { flexion: 10, abduction: 0, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 35, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { thorax: { flexion: -4, abduction: 0, rotation: 0 }, neck: { flexion: -8, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 35.5, abduction: 138, rotation: 29.5 }, shoulder_R: { flexion: 35.5, abduction: 138, rotation: 29.5 }, elbow_L: { flexion: 36, abduction: 0, rotation: -165 }, elbow_R: { flexion: 36, abduction: 0, rotation: -165 }, hip_L: { flexion: 10, abduction: 0, rotation: 0 }, hip_R: { flexion: 10, abduction: 0, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 35, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { thorax: { flexion: -6, abduction: 0, rotation: 0 }, neck: { flexion: -11, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 33, abduction: 109, rotation: 41 }, shoulder_R: { flexion: 33, abduction: 109, rotation: 41 }, elbow_L: { flexion: 64, abduction: 0, rotation: -165 }, elbow_R: { flexion: 64, abduction: 0, rotation: -165 }, hip_L: { flexion: 10, abduction: 0, rotation: 0 }, hip_R: { flexion: 10, abduction: 0, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 35, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { thorax: { flexion: -7, abduction: 0, rotation: 0 }, neck: { flexion: -13, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 32.5, abduction: 87.5, rotation: 55.5 }, shoulder_R: { flexion: 32.5, abduction: 87.5, rotation: 55.5 }, elbow_L: { flexion: 88, abduction: 0, rotation: -165 }, elbow_R: { flexion: 88, abduction: 0, rotation: -165 }, hip_L: { flexion: 10, abduction: 0, rotation: 0 }, hip_R: { flexion: 10, abduction: 0, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 35, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } }
  ),
  wide_grip_lat_pulldown: makeFiveTraj(
    'wide_grip_lat_pulldown',
    '滑輪寬握下拉軌跡',
    '上方伸展',
    '肩胛下壓',
    '鎖骨頂峰',
    { lumbar: { flexion: -2, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 14, abduction: 152, rotation: 33 }, shoulder_R: { flexion: 14, abduction: 152, rotation: 33 }, elbow_L: { flexion: 12, abduction: 0, rotation: -165 }, elbow_R: { flexion: 12, abduction: 0, rotation: -165 }, hip_L: { flexion: 88, abduction: 12, rotation: 0 }, hip_R: { flexion: 88, abduction: 12, rotation: 0 }, knee_L: { flexion: 90, abduction: 0, rotation: 0 }, knee_R: { flexion: 90, abduction: 0, rotation: 0 }, ankle_L: { flexion: -2, abduction: 0, rotation: 0 }, ankle_R: { flexion: -2, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -3, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 10.5, abduction: 138, rotation: 54 }, shoulder_R: { flexion: 10.5, abduction: 138, rotation: 54 }, elbow_L: { flexion: 36, abduction: 0, rotation: -165 }, elbow_R: { flexion: 36, abduction: 0, rotation: -165 }, hip_L: { flexion: 88, abduction: 12, rotation: 0 }, hip_R: { flexion: 88, abduction: 12, rotation: 0 }, knee_L: { flexion: 90, abduction: 0, rotation: 0 }, knee_R: { flexion: 90, abduction: 0, rotation: 0 }, ankle_L: { flexion: -2, abduction: 0, rotation: 0 }, ankle_R: { flexion: -2, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -4, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 13, abduction: 118, rotation: 65 }, shoulder_R: { flexion: 13, abduction: 118, rotation: 65 }, elbow_L: { flexion: 62, abduction: 0, rotation: -165 }, elbow_R: { flexion: 62, abduction: 0, rotation: -165 }, hip_L: { flexion: 88, abduction: 12, rotation: 0 }, hip_R: { flexion: 88, abduction: 12, rotation: 0 }, knee_L: { flexion: 90, abduction: 0, rotation: 0 }, knee_R: { flexion: 90, abduction: 0, rotation: 0 }, ankle_L: { flexion: -2, abduction: 0, rotation: 0 }, ankle_R: { flexion: -2, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -5, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 22, abduction: 92, rotation: 69.5 }, shoulder_R: { flexion: 22, abduction: 92, rotation: 69.5 }, elbow_L: { flexion: 86, abduction: 0, rotation: -165 }, elbow_R: { flexion: 86, abduction: 0, rotation: -165 }, hip_L: { flexion: 88, abduction: 12, rotation: 0 }, hip_R: { flexion: 88, abduction: 12, rotation: 0 }, knee_L: { flexion: 90, abduction: 0, rotation: 0 }, knee_R: { flexion: 90, abduction: 0, rotation: 0 }, ankle_L: { flexion: -2, abduction: 0, rotation: 0 }, ankle_R: { flexion: -2, abduction: 0, rotation: 0 } }
  ),
  dumbbell_bicep_curl_peak: makeTraj(
    'dumbbell_bicep_curl_peak',
    '二頭肌彎舉軌跡',
    '下垂預備',
    '屈肘中段',
    '頂峰收縮',
    { shoulder_L: { flexion: 5, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 5, abduction: 8, rotation: 0 }, elbow_L: { flexion: 10, abduction: 0, rotation: 0 }, elbow_R: { flexion: 10, abduction: 0, rotation: 0 } }
  ),
  overhead_tricep_extension_bottom: makeFiveTraj(
    'overhead_tricep_extension_bottom',
    '過頭三頭肌伸展軌跡',
    '頂端伸直',
    '離心下放',
    '底端極限拉伸',
    { shoulder_L: { flexion: 159.5, abduction: 10.5, rotation: -19 }, shoulder_R: { flexion: 159.5, abduction: 10.5, rotation: -19 }, elbow_L: { flexion: 12, abduction: 0, rotation: -85 }, elbow_R: { flexion: 12, abduction: 0, rotation: -85 } },
    { shoulder_L: { flexion: 158, abduction: 4.5, rotation: -22.5 }, shoulder_R: { flexion: 158, abduction: 4.5, rotation: -22.5 }, elbow_L: { flexion: 42, abduction: 0, rotation: -85 }, elbow_R: { flexion: 42, abduction: 0, rotation: -85 } },
    { shoulder_L: { flexion: 158, abduction: 2.5, rotation: -20.5 }, shoulder_R: { flexion: 158, abduction: 2.5, rotation: -20.5 }, elbow_L: { flexion: 72, abduction: 0, rotation: -85 }, elbow_R: { flexion: 72, abduction: 0, rotation: -85 } },
    { shoulder_L: { flexion: 158, abduction: 4, rotation: -19.5 }, shoulder_R: { flexion: 158, abduction: 4, rotation: -19.5 }, elbow_L: { flexion: 102, abduction: 0, rotation: -85 }, elbow_R: { flexion: 102, abduction: 0, rotation: -85 } }
  ),
  bulgarian_split_squat_bottom: makeTraj(
    'bulgarian_split_squat_bottom',
    '保加利亞分腿蹲軌跡',
    '分腿預備',
    '離心下蹲',
    '分腿蹲底端',
    { hip_L: { flexion: 12, abduction: 6, rotation: 0 }, knee_L: { flexion: 12, abduction: 0, rotation: 0 }, hip_R: { flexion: -10, abduction: 5, rotation: 0 }, knee_R: { flexion: 45, abduction: 0, rotation: 0 } }
  ),
  single_arm_dumbbell_row: makeTraj(
    'single_arm_dumbbell_row',
    '單手啞鈴划船軌跡',
    '俯身伸臂',
    '拉起中段',
    '頂峰夾背',
    { pelvis: { flexion: 42, abduction: 0, rotation: 0 }, lumbar: { flexion: 8, abduction: 0, rotation: 4 }, thorax: { flexion: 4, abduction: 0, rotation: 3 }, shoulder_L: { flexion: 58, abduction: 10, rotation: 0 }, elbow_L: { flexion: 5, abduction: 0, rotation: -90 }, shoulder_R: { flexion: 55, abduction: 10, rotation: 0 }, elbow_R: { flexion: 12, abduction: 0, rotation: -90 }, hip_L: { flexion: 34, abduction: 8, rotation: 0 }, knee_L: { flexion: 42, abduction: 0, rotation: 0 }, ankle_L: { flexion: -8, abduction: 0, rotation: 0 }, hip_R: { flexion: 30, abduction: 8, rotation: 0 }, knee_R: { flexion: 46, abduction: 0, rotation: 0 }, ankle_R: { flexion: -16, abduction: 0, rotation: 0 } }
  ),
  farmers_walk: makeTraj(
    'farmers_walk',
    '農夫走路步態軌跡',
    '負重站立',
    '抬腿跨步',
    '前腳著地',
    { elbow_L: { flexion: 5, abduction: 0, rotation: -90 }, elbow_R: { flexion: 5, abduction: 0, rotation: -90 } }
  ),
  conventional_deadlift_start: makeFiveTraj(
    'conventional_deadlift_start',
    '傳統硬舉軌跡',
    '直立鎖定',
    '屈髖下放',
    '起始拉槓',
    { shoulder_L: { flexion: 0, abduction: 5, rotation: 0 }, shoulder_R: { flexion: 0, abduction: 5, rotation: 0 }, elbow_L: { flexion: 5, abduction: 0, rotation: -170 }, elbow_R: { flexion: 5, abduction: 0, rotation: -170 }, hip_L: { flexion: 5, abduction: 8, rotation: 5 }, hip_R: { flexion: 5, abduction: 8, rotation: 5 }, knee_L: { flexion: 5, abduction: 0, rotation: 0 }, knee_R: { flexion: 5, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 12, abduction: 0, rotation: 0 }, lumbar: { flexion: 2.5, abduction: 0, rotation: 0 }, thorax: { flexion: 1.5, abduction: 0, rotation: 0 }, neck: { flexion: -4.5, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 16.5, abduction: 5.5, rotation: -1 }, shoulder_R: { flexion: 16.5, abduction: 5.5, rotation: -1 }, elbow_L: { flexion: 5, abduction: 0, rotation: -170 }, elbow_R: { flexion: 5, abduction: 0, rotation: -170 }, hip_L: { flexion: 15, abduction: 8, rotation: 5 }, hip_R: { flexion: 15, abduction: 8, rotation: 5 }, knee_L: { flexion: 18, abduction: 0, rotation: 0 }, knee_R: { flexion: 18, abduction: 0, rotation: 0 }, ankle_L: { flexion: -3.5, abduction: 0, rotation: 0 }, ankle_R: { flexion: -3.5, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 24, abduction: 0, rotation: 0 }, lumbar: { flexion: 5, abduction: 0, rotation: 0 }, thorax: { flexion: 3, abduction: 0, rotation: 0 }, neck: { flexion: -9, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 31, abduction: 6, rotation: 0 }, shoulder_R: { flexion: 31, abduction: 6, rotation: 0 }, elbow_L: { flexion: 5, abduction: 0, rotation: -170 }, elbow_R: { flexion: 5, abduction: 0, rotation: -170 }, hip_L: { flexion: 25, abduction: 8, rotation: 5 }, hip_R: { flexion: 25, abduction: 8, rotation: 5 }, knee_L: { flexion: 31.5, abduction: 0, rotation: 0 }, knee_R: { flexion: 31.5, abduction: 0, rotation: 0 }, ankle_L: { flexion: -6.5, abduction: 0, rotation: 0 }, ankle_R: { flexion: -6.5, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 36, abduction: 0, rotation: 0 }, lumbar: { flexion: 7.5, abduction: 0, rotation: 0 }, thorax: { flexion: 4.5, abduction: 0, rotation: 0 }, neck: { flexion: -13.5, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 46, abduction: 7.5, rotation: 0.5 }, shoulder_R: { flexion: 46, abduction: 7.5, rotation: 0.5 }, elbow_L: { flexion: 5, abduction: 0, rotation: -170 }, elbow_R: { flexion: 5, abduction: 0, rotation: -170 }, hip_L: { flexion: 35, abduction: 8, rotation: 5 }, hip_R: { flexion: 35, abduction: 8, rotation: 5 }, knee_L: { flexion: 44.5, abduction: 0, rotation: 0 }, knee_R: { flexion: 44.5, abduction: 0, rotation: 0 }, ankle_L: { flexion: -9.5, abduction: 0, rotation: 0 }, ankle_R: { flexion: -9.5, abduction: 0, rotation: 0 } }
  ),
  barbell_front_squat_bottom: makeTraj(
    'barbell_front_squat_bottom',
    '槓鈴前蹲舉軌跡',
    '前架站立',
    '離心半蹲',
    '前蹲底端',
    { shoulder_L: { flexion: 88, abduction: 15, rotation: 20 }, shoulder_R: { flexion: 88, abduction: 15, rotation: 20 }, elbow_L: { flexion: 130, abduction: 0, rotation: 0 }, elbow_R: { flexion: 130, abduction: 0, rotation: 0 }, wrist_L: { flexion: -55, abduction: 0, rotation: 0 }, wrist_R: { flexion: -55, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 18, abduction: 0, rotation: 0 }, lumbar: { flexion: 3, abduction: 0, rotation: 0 }, thorax: { flexion: 2, abduction: 0, rotation: 0 }, hip_L: { flexion: 48, abduction: 10, rotation: 6 }, hip_R: { flexion: 48, abduction: 10, rotation: 6 }, knee_L: { flexion: 72, abduction: 0, rotation: 0 }, knee_R: { flexion: 72, abduction: 0, rotation: 0 }, ankle_L: { flexion: -24, abduction: 0, rotation: 0 }, ankle_R: { flexion: -24, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 88, abduction: 15, rotation: 20 }, shoulder_R: { flexion: 88, abduction: 15, rotation: 20 }, elbow_L: { flexion: 130, abduction: 0, rotation: 0 }, elbow_R: { flexion: 130, abduction: 0, rotation: 0 }, wrist_L: { flexion: -55, abduction: 0, rotation: 0 }, wrist_R: { flexion: -55, abduction: 0, rotation: 0 } }
  ),
  barbell_hip_thrust_peak: makeTraj(
    'barbell_hip_thrust_peak',
    '槓鈴臀推軌跡',
    '屈髖底端',
    '推髖上頂',
    '水平鎖定',
    { pelvis: { flexion: -70, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -15, abduction: 15, rotation: 0 }, shoulder_R: { flexion: -15, abduction: 15, rotation: 0 }, elbow_L: { flexion: 20, abduction: 0, rotation: -165 }, elbow_R: { flexion: 20, abduction: 0, rotation: -165 }, hip_L: { flexion: 65, abduction: 10, rotation: 0 }, hip_R: { flexion: 65, abduction: 10, rotation: 0 }, knee_L: { flexion: 110, abduction: 0, rotation: 0 }, knee_R: { flexion: 110, abduction: 0, rotation: 0 } }
  ),
  seated_cable_row_peak: makeFiveTraj(
    'seated_cable_row_peak',
    '坐姿划船軌跡',
    '前伸拉長',
    '後拉夾背',
    '頂峰收縮',
    { shoulder_L: { flexion: 79.5, abduction: -2, rotation: -4 }, shoulder_R: { flexion: 79.5, abduction: -2, rotation: -4 }, elbow_L: { flexion: 10, abduction: 0, rotation: -90 }, elbow_R: { flexion: 10, abduction: 0, rotation: -90 }, hip_L: { flexion: 88, abduction: 8, rotation: 0 }, hip_R: { flexion: 88, abduction: 8, rotation: 0 }, knee_L: { flexion: 25, abduction: 0, rotation: 0 }, knee_R: { flexion: 25, abduction: 0, rotation: 0 }, ankle_L: { flexion: 15, abduction: 0, rotation: 0 }, ankle_R: { flexion: 15, abduction: 0, rotation: 0 } },
    { shoulder_L: { flexion: 65, abduction: 0.5, rotation: -2.5 }, shoulder_R: { flexion: 65, abduction: 0.5, rotation: -2.5 }, elbow_L: { flexion: 32, abduction: 0, rotation: -90 }, elbow_R: { flexion: 32, abduction: 0, rotation: -90 }, hip_L: { flexion: 88, abduction: 8, rotation: 0 }, hip_R: { flexion: 88, abduction: 8, rotation: 0 }, knee_L: { flexion: 25, abduction: 0, rotation: 0 }, knee_R: { flexion: 25, abduction: 0, rotation: 0 }, ankle_L: { flexion: 15, abduction: 0, rotation: 0 }, ankle_R: { flexion: 15, abduction: 0, rotation: 0 } },
    { shoulder_L: { flexion: 40, abduction: 0, rotation: -1.5 }, shoulder_R: { flexion: 40, abduction: 0, rotation: -1.5 }, elbow_L: { flexion: 56, abduction: 0, rotation: -90 }, elbow_R: { flexion: 56, abduction: 0, rotation: -90 }, hip_L: { flexion: 88, abduction: 8, rotation: 0 }, hip_R: { flexion: 88, abduction: 8, rotation: 0 }, knee_L: { flexion: 25, abduction: 0, rotation: 0 }, knee_R: { flexion: 25, abduction: 0, rotation: 0 }, ankle_L: { flexion: 15, abduction: 0, rotation: 0 }, ankle_R: { flexion: 15, abduction: 0, rotation: 0 } },
    { shoulder_L: { flexion: 18, abduction: 5, rotation: -3.5 }, shoulder_R: { flexion: 18, abduction: 5, rotation: -3.5 }, elbow_L: { flexion: 78, abduction: 0, rotation: -90 }, elbow_R: { flexion: 78, abduction: 0, rotation: -90 }, hip_L: { flexion: 88, abduction: 8, rotation: 0 }, hip_R: { flexion: 88, abduction: 8, rotation: 0 }, knee_L: { flexion: 25, abduction: 0, rotation: 0 }, knee_R: { flexion: 25, abduction: 0, rotation: 0 }, ankle_L: { flexion: 15, abduction: 0, rotation: 0 }, ankle_R: { flexion: 15, abduction: 0, rotation: 0 } }
  ),
  cable_face_pull_peak: makeTraj(
    'cable_face_pull_peak',
    '繩索臉拉軌跡',
    '前伸預備',
    '後拉外展',
    '外旋頂峰',
    { shoulder_L: { flexion: 75, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 75, abduction: 8, rotation: 0 }, elbow_L: { flexion: 15, abduction: 0, rotation: -90 }, elbow_R: { flexion: 15, abduction: 0, rotation: -90 }, hip_L: { flexion: 12, abduction: 6, rotation: 0 }, knee_L: { flexion: 15, abduction: 0, rotation: 0 }, ankle_L: { flexion: -3, abduction: 0, rotation: 0 } }
  ),
  parallel_bar_dip_bottom: makeFiveTraj(
    'parallel_bar_dip_bottom',
    '雙槓臂屈伸軌跡',
    '頂端撐直',
    '離心下放',
    '底端拉伸',
    { pelvis: { flexion: 8, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -4, abduction: 10.3, rotation: -0.2 }, shoulder_R: { flexion: -4, abduction: 10.3, rotation: -0.2 }, elbow_L: { flexion: 8, abduction: 0, rotation: -90 }, elbow_R: { flexion: 8, abduction: 0, rotation: -90 }, hip_L: { flexion: 15, abduction: 0, rotation: 0 }, hip_R: { flexion: 15, abduction: 0, rotation: 0 }, knee_L: { flexion: 55, abduction: 0, rotation: 0 }, knee_R: { flexion: 55, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 10, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -14, abduction: 10.8, rotation: -0.7 }, shoulder_R: { flexion: -14, abduction: 10.8, rotation: -0.7 }, elbow_L: { flexion: 30, abduction: 0, rotation: -90 }, elbow_R: { flexion: 30, abduction: 0, rotation: -90 }, hip_L: { flexion: 15, abduction: 0, rotation: 0 }, hip_R: { flexion: 15, abduction: 0, rotation: 0 }, knee_L: { flexion: 55, abduction: 0, rotation: 0 }, knee_R: { flexion: 55, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 13, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -24, abduction: 12.3, rotation: -1.7 }, shoulder_R: { flexion: -24, abduction: 12.3, rotation: -1.7 }, elbow_L: { flexion: 52, abduction: 0, rotation: -90 }, elbow_R: { flexion: 52, abduction: 0, rotation: -90 }, hip_L: { flexion: 15, abduction: 0, rotation: 0 }, hip_R: { flexion: 15, abduction: 0, rotation: 0 }, knee_L: { flexion: 55, abduction: 0, rotation: 0 }, knee_R: { flexion: 55, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 16, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -34, abduction: 15.3, rotation: -3.7 }, shoulder_R: { flexion: -34, abduction: 15.3, rotation: -3.7 }, elbow_L: { flexion: 74, abduction: 0, rotation: -90 }, elbow_R: { flexion: 74, abduction: 0, rotation: -90 }, hip_L: { flexion: 15, abduction: 0, rotation: 0 }, hip_R: { flexion: 15, abduction: 0, rotation: 0 }, knee_L: { flexion: 55, abduction: 0, rotation: 0 }, knee_R: { flexion: 55, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } }
  ),
  dumbbell_chest_fly_bottom: makeTraj(
    'dumbbell_chest_fly_bottom',
    '啞鈴飛鳥軌跡',
    '頂端夾胸',
    '離心開展',
    '底端拉伸',
    { pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 85, abduction: 10, rotation: 0 }, shoulder_R: { flexion: 85, abduction: 10, rotation: 0 }, elbow_L: { flexion: 20, abduction: 0, rotation: -45 }, elbow_R: { flexion: 20, abduction: 0, rotation: -45 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } }
  ),
  hammer_curl_peak: makeTraj(
    'hammer_curl_peak',
    '錘式彎舉軌跡',
    '下垂預備',
    '中段彎舉',
    '頂峰收縮',
    { shoulder_L: { flexion: 5, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 5, abduction: 8, rotation: 0 }, elbow_L: { flexion: 10, abduction: 0, rotation: -90 }, elbow_R: { flexion: 10, abduction: 0, rotation: -90 } }
  ),
  tricep_rope_pushdown_lockout: makeTraj(
    'tricep_rope_pushdown_lockout',
    '三頭肌下壓軌跡',
    '屈肘預備',
    '下壓伸展',
    '底端鎖定',
    { pelvis: { flexion: 8, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 8, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 8, abduction: 8, rotation: 0 }, elbow_L: { flexion: 110, abduction: 0, rotation: -90 }, elbow_R: { flexion: 110, abduction: 0, rotation: -90 } }
  ),
  standing_calf_raise_peak: makeTraj(
    'standing_calf_raise_peak',
    '站姿提踵軌跡',
    '平踩預備',
    '發力踮腳',
    '頂峰蹠屈',
    { ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } }
  ),

  // === 2. 徒手與核心穩定 (8 種) ===
  push_up_bottom: makeFiveTraj(
    'push_up_bottom',
    '伏地挺身軌跡',
    '高平板預備',
    '離心下降',
    '底端停頓',
    { pelvis: { flexion: 71, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 63.8, abduction: 22.3, rotation: 4.8 }, shoulder_R: { flexion: 63.8, abduction: 22.3, rotation: 4.8 }, elbow_L: { flexion: 8, abduction: 0, rotation: -170 }, elbow_R: { flexion: 8, abduction: 0, rotation: -170 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 75, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 50.8, abduction: 28.8, rotation: -4.5 }, shoulder_R: { flexion: 50.8, abduction: 28.8, rotation: -4.5 }, elbow_L: { flexion: 29, abduction: 0, rotation: -170 }, elbow_R: { flexion: 29, abduction: 0, rotation: -170 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 79, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 35.8, abduction: 37.8, rotation: -14 }, shoulder_R: { flexion: 35.8, abduction: 37.8, rotation: -14 }, elbow_L: { flexion: 50, abduction: 0, rotation: -170 }, elbow_R: { flexion: 50, abduction: 0, rotation: -170 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 83, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 20, abduction: 45.5, rotation: -22.5 }, shoulder_R: { flexion: 20, abduction: 45.5, rotation: -22.5 }, elbow_L: { flexion: 71, abduction: 0, rotation: -170 }, elbow_R: { flexion: 71, abduction: 0, rotation: -170 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } }
  ),
  standard_plank: makeTraj(
    'standard_plank',
    '棒式準備軌跡',
    '微屈肘預備',
    '核心收緊',
    '標準棒式',
    { pelvis: { flexion: 84, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 82, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 82, abduction: 8, rotation: 0 }, elbow_L: { flexion: 90, abduction: 0, rotation: -90 }, elbow_R: { flexion: 90, abduction: 0, rotation: -90 }, hip_L: { flexion: 12, abduction: 0, rotation: 0 }, hip_R: { flexion: 12, abduction: 0, rotation: 0 }, knee_L: { flexion: 15, abduction: 0, rotation: 0 }, knee_R: { flexion: 15, abduction: 0, rotation: 0 } }
  ),
  side_plank: makeTraj(
    'side_plank',
    '側棒式撐起軌跡',
    '側躺預備',
    '核心啟動',
    '側棒式穩定',
    { pelvis: { flexion: 0, abduction: -88, rotation: 0 }, lumbar: { flexion: 0, abduction: 10, rotation: 0 }, shoulder_R: { flexion: 10, abduction: 70, rotation: 0 }, elbow_R: { flexion: 90, abduction: 0, rotation: -90 }, shoulder_L: { flexion: 0, abduction: 10, rotation: 0 } }
  ),
  glute_bridge_peak: makeTraj(
    'glute_bridge_peak',
    '仰臥臀橋軌跡',
    '屈膝仰臥',
    '推髖離地',
    '臀橋頂峰',
    { pelvis: { flexion: -88, abduction: 0, rotation: 0 }, hip_L: { flexion: 75, abduction: 10, rotation: 0 }, hip_R: { flexion: 75, abduction: 10, rotation: 0 }, knee_L: { flexion: 115, abduction: 0, rotation: 0 }, knee_R: { flexion: 115, abduction: 0, rotation: 0 } }
  ),
  forward_lunge_bottom: makeTraj(
    'forward_lunge_bottom',
    '弓箭步蹲軌跡',
    '分腿站立',
    '垂直下沉',
    '90/90 底端',
    { hip_L: { flexion: -16, abduction: 5, rotation: 0 }, knee_L: { flexion: 12, abduction: 0, rotation: 0 }, hip_R: { flexion: 22, abduction: 5, rotation: 0 }, knee_R: { flexion: 12, abduction: 0, rotation: 0 } }
  ),
  russian_twist: makeTraj(
    'russian_twist',
    '俄式轉體軌跡',
    'V 字置中',
    '軀幹啟動',
    '轉體頂峰',
    { pelvis: { flexion: -35, abduction: 0, rotation: 0 }, lumbar: { flexion: 22, abduction: 0, rotation: 0 }, thorax: { flexion: 12, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 55, abduction: 15, rotation: 0 }, shoulder_R: { flexion: 55, abduction: 15, rotation: 0 }, elbow_L: { flexion: 65, abduction: 0, rotation: -90 }, elbow_R: { flexion: 65, abduction: 0, rotation: -90 }, hip_L: { flexion: 75, abduction: 8, rotation: 0 }, hip_R: { flexion: 75, abduction: 8, rotation: 0 }, knee_L: { flexion: 60, abduction: 0, rotation: 0 }, knee_R: { flexion: 60, abduction: 0, rotation: 0 } }
  ),
  superman_back_extension: makeTraj(
    'superman_back_extension',
    '超人式背伸軌跡',
    '俯臥貼地',
    '離地啟動',
    '背伸頂峰',
    { pelvis: { flexion: 88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 165, abduction: -8, rotation: 0 }, shoulder_R: { flexion: 165, abduction: -8, rotation: 0 }, elbow_L: { flexion: 5, abduction: 0, rotation: -170 }, elbow_R: { flexion: 5, abduction: 0, rotation: -170 } }
  ),
  single_leg_rdl_balance: makeTraj(
    'single_leg_rdl_balance',
    '單腳硬舉軌跡',
    '單腳預備',
    '髖鉸鏈前傾',
    '水平平衡',
    { hip_R: { flexion: 10, abduction: 4, rotation: 0 }, knee_R: { flexion: 12, abduction: 0, rotation: 0 }, ankle_R: { flexion: -2, abduction: 0, rotation: 0 }, hip_L: { flexion: -8, abduction: 4, rotation: 0 } }
  ),

  // === 3. 球類與田徑專項 (10 種) ===
  baseball_pitch_cocking: makeTraj(
    'baseball_pitch_cocking',
    '棒球投球揮臂軌跡',
    '跨步抬手',
    '後期極限外旋',
    '加速釋放',
    { shoulder_R: { flexion: 15, abduction: 70, rotation: 25 }, elbow_R: { flexion: 85, abduction: 0, rotation: 0 }, hip_L: { flexion: 35, abduction: 15, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -8, abduction: 8, rotation: -18 }, thorax: { flexion: -6, abduction: 0, rotation: -15 }, shoulder_R: { flexion: 10, abduction: 95, rotation: 90 }, elbow_R: { flexion: 92, abduction: 0, rotation: 0 }, hip_L: { flexion: 48, abduction: 20, rotation: 0 }, knee_L: { flexion: 45, abduction: 0, rotation: 0 } }
  ),
  badminton_jump_smash: makeTraj(
    'badminton_jump_smash',
    '羽球殺球揮拍軌跡',
    '架拍反弓',
    '揮拍引伸',
    '殺球擊球點',
    { lumbar: { flexion: -12, abduction: 8, rotation: -18 }, shoulder_R: { flexion: 55, abduction: 75, rotation: 45 }, elbow_R: { flexion: 95, abduction: 0, rotation: -90 }, shoulder_L: { flexion: 65, abduction: 35, rotation: 0 }, elbow_L: { flexion: 60, abduction: 0, rotation: -90 }, hip_L: { flexion: 15, abduction: 0, rotation: 0 }, hip_R: { flexion: 18, abduction: 0, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 45, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } },
    { lumbar: { flexion: -14, abduction: 8, rotation: -2 }, shoulder_R: { flexion: 108, abduction: 35, rotation: 10 }, elbow_R: { flexion: 60, abduction: 0, rotation: -90 }, shoulder_L: { flexion: 50, abduction: 38, rotation: 0 }, elbow_L: { flexion: 60, abduction: 0, rotation: -90 }, hip_L: { flexion: 16, abduction: 0, rotation: 0 }, hip_R: { flexion: 20, abduction: 0, rotation: 0 }, knee_L: { flexion: 40, abduction: 0, rotation: 0 }, knee_R: { flexion: 50, abduction: 0, rotation: 0 }, ankle_L: { flexion: -12, abduction: 0, rotation: 0 }, ankle_R: { flexion: -12, abduction: 0, rotation: 0 } }
  ),
  tennis_forehand_swing: makeTraj(
    'tennis_forehand_swing',
    '網球正手揮拍軌跡',
    '引拍蓄力',
    '轉髖引拍',
    '迎前擊球',
    { lumbar: { flexion: 10, abduction: 0, rotation: -22 }, thorax: { flexion: 5, abduction: 0, rotation: -18 }, shoulder_R: { flexion: -15, abduction: 55, rotation: 40 }, elbow_R: { flexion: 55, abduction: 0, rotation: -90 }, hip_L: { flexion: 25, abduction: 12, rotation: 0 }, knee_L: { flexion: 30, abduction: 0, rotation: 0 }, ankle_L: { flexion: -5, abduction: 0, rotation: 0 }, hip_R: { flexion: 25, abduction: 12, rotation: 0 }, knee_R: { flexion: 30, abduction: 0, rotation: 0 }, ankle_R: { flexion: -5, abduction: 0, rotation: 0 } }
  ),
  basketball_jump_shot: makeTraj(
    'basketball_jump_shot',
    '籃球跳投出手軌跡',
    '屈膝舉球',
    '起跳推舉',
    '壓腕出手',
    { shoulder_R: { flexion: 55, abduction: 15, rotation: 25 }, elbow_R: { flexion: 95, abduction: 0, rotation: -165 }, wrist_R: { flexion: -25, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 55, abduction: 18, rotation: 0 }, elbow_L: { flexion: 90, abduction: 0, rotation: -90 }, hip_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_L: { flexion: 45, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, hip_R: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 45, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 } }
  ),
  soccer_kick_windup: makeTraj(
    'soccer_kick_windup',
    '足球抽射擺腿軌跡',
    '助跑站立',
    '單腳支撐',
    '後擺蓄力',
    { hip_L: { flexion: 12, abduction: 6, rotation: 0 }, knee_L: { flexion: 15, abduction: 0, rotation: 0 }, ankle_L: { flexion: -3, abduction: 0, rotation: 0 } }
  ),
  sprint_drive_phase: makeTraj(
    'sprint_drive_phase',
    '短跑跨步驅動軌跡',
    '後蹬預備',
    '重心前移',
    '高抬腿頂峰',
    { pelvis: { flexion: 14, abduction: 0, rotation: 0 }, hip_L: { flexion: 20, abduction: 0, rotation: 0 }, knee_L: { flexion: 30, abduction: 0, rotation: 0 }, ankle_L: { flexion: -5, abduction: 0, rotation: 0 }, hip_R: { flexion: -10, abduction: 0, rotation: 0 }, knee_R: { flexion: 35, abduction: 0, rotation: 0 }, ankle_R: { flexion: 20, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -20, abduction: 10, rotation: 0 }, elbow_L: { flexion: 95, abduction: 0, rotation: -90 }, shoulder_R: { flexion: 35, abduction: 10, rotation: 0 }, elbow_R: { flexion: 95, abduction: 0, rotation: -90 } }
  ),
  volleyball_block_jump: makeTraj(
    'volleyball_block_jump',
    '排球攔網起跳軌跡',
    '下蹲蓄力',
    '蹬地展臂',
    '空中攔網',
    { hip_L: { flexion: 55, abduction: 10, rotation: 0 }, hip_R: { flexion: 55, abduction: 10, rotation: 0 }, knee_L: { flexion: 75, abduction: 0, rotation: 0 }, knee_R: { flexion: 75, abduction: 0, rotation: 0 }, ankle_L: { flexion: -20, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -10, abduction: 15, rotation: 0 }, shoulder_R: { flexion: -10, abduction: 15, rotation: 0 }, elbow_L: { flexion: 35, abduction: 0, rotation: -165 }, elbow_R: { flexion: 35, abduction: 0, rotation: -165 } },
    { hip_L: { flexion: 25, abduction: 5, rotation: 0 }, hip_R: { flexion: 25, abduction: 5, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 }, knee_R: { flexion: 35, abduction: 0, rotation: 0 }, ankle_L: { flexion: 10, abduction: 0, rotation: 0 }, ankle_R: { flexion: 10, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 78, abduction: 4, rotation: 0 }, shoulder_R: { flexion: 78, abduction: 4, rotation: 0 }, elbow_L: { flexion: 24, abduction: 0, rotation: -165 }, elbow_R: { flexion: 24, abduction: 0, rotation: -165 } }
  ),
  golf_downswing_impact: makeTraj(
    'golf_downswing_impact',
    '高爾夫揮桿擊球軌跡',
    '上桿頂點',
    '下桿轉髖',
    '擊球瞬間',
    { lumbar: { flexion: 25, abduction: 6, rotation: 24 }, thorax: { flexion: 10, abduction: 0, rotation: 20 }, neck: { flexion: 15, abduction: 0, rotation: -15 }, shoulder_L: { flexion: 95, abduction: 15, rotation: 0 }, elbow_L: { flexion: 15, abduction: 0, rotation: -90 }, shoulder_R: { flexion: 75, abduction: 45, rotation: 35 }, elbow_R: { flexion: 85, abduction: 0, rotation: -90 }, hip_L: { flexion: 25, abduction: 10, rotation: 10 }, hip_R: { flexion: 25, abduction: 10, rotation: -10 }, knee_L: { flexion: 24, abduction: 0, rotation: 0 }, knee_R: { flexion: 24, abduction: 0, rotation: 0 } }
  ),
  boxing_right_cross: makeTraj(
    'boxing_right_cross',
    '拳擊右直拳軌跡',
    '抱架預備',
    '蹬轉送肩',
    '直拳延伸',
    { lumbar: { flexion: 8, abduction: 0, rotation: 10 }, thorax: { flexion: 6, abduction: 0, rotation: 8 }, shoulder_L: { flexion: 55, abduction: 25, rotation: 0 }, elbow_L: { flexion: 115, abduction: 0, rotation: -90 }, shoulder_R: { flexion: 50, abduction: 20, rotation: 0 }, elbow_R: { flexion: 115, abduction: 0, rotation: -90 }, hip_L: { flexion: 20, abduction: 10, rotation: 0 }, knee_L: { flexion: 22, abduction: 0, rotation: 0 }, ankle_L: { flexion: -2, abduction: 0, rotation: 0 } }
  ),
  freestyle_swim_catch: makeTraj(
    'freestyle_swim_catch',
    '自由式抱水軌跡',
    '前伸入水',
    '曲腕抓水',
    '高肘抱水',
    { pelvis: { flexion: 88, abduction: 0, rotation: 15 }, shoulder_R: { flexion: 168, abduction: -8, rotation: 0 }, elbow_R: { flexion: 10, abduction: 0, rotation: -155 }, shoulder_L: { flexion: -20, abduction: 15, rotation: 0 }, elbow_L: { flexion: 25, abduction: 0, rotation: -90 } }
  ),

  // === 4. 伸展、瑜珈與活動度 (9 種) ===
  standing_forward_fold: makeTraj(
    'standing_forward_fold',
    '站姿體前彎軌跡',
    '直立吸氣',
    '半前彎',
    '深度前彎',
    {},
    { pelvis: { flexion: 24, abduction: 0, rotation: 0 }, lumbar: { flexion: 16, abduction: 0, rotation: 0 }, thorax: { flexion: 8, abduction: 0, rotation: 0 }, hip_L: { flexion: 18, abduction: 4, rotation: 0 }, hip_R: { flexion: 18, abduction: 4, rotation: 0 }, knee_L: { flexion: 18, abduction: 0, rotation: 0 }, knee_R: { flexion: 18, abduction: 0, rotation: 0 }, ankle_L: { flexion: 0, abduction: 0, rotation: 0 }, ankle_R: { flexion: 0, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 56, abduction: 5, rotation: 0 }, shoulder_R: { flexion: 56, abduction: 5, rotation: 0 } }
  ),
  kneeling_hip_flexor_stretch: makeTraj(
    'kneeling_hip_flexor_stretch',
    '跪姿髖屈肌伸展軌跡',
    '高跪直立',
    '重心前推',
    '髂腰肌伸展',
    { hip_L: { flexion: 85, abduction: 6, rotation: 0 }, knee_L: { flexion: 90, abduction: 0, rotation: 0 }, ankle_L: { flexion: -5, abduction: 0, rotation: 0 }, hip_R: { flexion: 0, abduction: 5, rotation: 0 }, knee_R: { flexion: 90, abduction: 0, rotation: 0 }, ankle_R: { flexion: -20, abduction: 0, rotation: 0 } }
  ),
  doorway_pec_stretch: makeTraj(
    'doorway_pec_stretch',
    '門框開胸伸展軌跡',
    '舉臂抵框',
    '軀幹前移',
    '胸肌伸展',
    { shoulder_L: { flexion: 10, abduction: 90, rotation: 45 }, elbow_L: { flexion: 90, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 10, abduction: 90, rotation: 45 }, elbow_R: { flexion: 90, abduction: 0, rotation: 0 } }
  ),
  cobra_pose: makeFiveTraj(
    'cobra_pose',
    '眼鏡蛇式軌跡',
    '俯臥貼地',
    '推胸半起',
    '眼鏡蛇式',
    { pelvis: { flexion: 88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 10, abduction: 23.5, rotation: -2.5 }, elbow_L: { flexion: 90, abduction: 0, rotation: -165 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 10, abduction: 23.5, rotation: -2.5 }, elbow_R: { flexion: 90, abduction: 0, rotation: -165 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 87.2, abduction: 0, rotation: 0 }, lumbar: { flexion: -6, abduction: 0, rotation: 0 }, thorax: { flexion: -4, abduction: 0, rotation: 0 }, neck: { flexion: -5, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 17.5, abduction: 19, rotation: -3.5 }, elbow_L: { flexion: 70, abduction: 0, rotation: -165 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 17.5, abduction: 19, rotation: -3.5 }, elbow_R: { flexion: 70, abduction: 0, rotation: -165 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 86.5, abduction: 0, rotation: 0 }, lumbar: { flexion: -12.5, abduction: 0, rotation: 0 }, thorax: { flexion: -8, abduction: 0, rotation: 0 }, neck: { flexion: -10, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 24.5, abduction: 15, rotation: -3.5 }, elbow_L: { flexion: 50, abduction: 0, rotation: -165 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 24.5, abduction: 15, rotation: -3.5 }, elbow_R: { flexion: 50, abduction: 0, rotation: -165 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } },
    { pelvis: { flexion: 85.8, abduction: 0, rotation: 0 }, lumbar: { flexion: -19, abduction: 0, rotation: 0 }, thorax: { flexion: -12, abduction: 0, rotation: 0 }, neck: { flexion: -15, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 31.5, abduction: 11.5, rotation: -2.5 }, elbow_L: { flexion: 30, abduction: 0, rotation: -165 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 31.5, abduction: 11.5, rotation: -2.5 }, elbow_R: { flexion: 30, abduction: 0, rotation: -165 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } }
  ),
  childs_pose: makeTraj(
    'childs_pose',
    '嬰兒式放鬆軌跡',
    '四足跪姿',
    '臀部後坐',
    '嬰兒式',
    { pelvis: { flexion: 80, abduction: 0, rotation: 0 }, hip_L: { flexion: 90, abduction: 15, rotation: 0 }, hip_R: { flexion: 90, abduction: 15, rotation: 0 }, knee_L: { flexion: 95, abduction: 0, rotation: 0 }, knee_R: { flexion: 95, abduction: 0, rotation: 0 }, ankle_L: { flexion: -10, abduction: 0, rotation: 0 }, ankle_R: { flexion: -10, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 78, abduction: 10, rotation: 0 }, shoulder_R: { flexion: 78, abduction: 10, rotation: 0 }, elbow_L: { flexion: 10, abduction: 0, rotation: -165 }, elbow_R: { flexion: 10, abduction: 0, rotation: -165 }, wrist_L: { flexion: -70, abduction: 0, rotation: 0 }, wrist_R: { flexion: -70, abduction: 0, rotation: 0 } }
  ),
  warrior_two: makeTraj(
    'warrior_two',
    '戰士二式軌跡',
    '寬站展臂',
    '轉頭下蹲',
    '戰士二式',
    { shoulder_L: { flexion: 0, abduction: 90, rotation: 0 }, shoulder_R: { flexion: 0, abduction: 90, rotation: 0 }, elbow_L: { flexion: 5, abduction: 0, rotation: -90 }, elbow_R: { flexion: 5, abduction: 0, rotation: -90 }, hip_L: { flexion: -5, abduction: 42, rotation: 0 }, ankle_L: { flexion: 5, abduction: 0, rotation: 0 }, hip_R: { flexion: 10, abduction: 42, rotation: 15 }, neck: { flexion: 0, abduction: 0, rotation: -45 } }
  ),
  asian_deep_squat: makeTraj(
    'asian_deep_squat',
    '亞洲深蹲測試軌跡',
    '站立平舉',
    '中段下蹲',
    '全蹲底端',
    { shoulder_L: { flexion: 65, abduction: 10, rotation: 0 }, shoulder_R: { flexion: 65, abduction: 10, rotation: 0 } },
    { pelvis: { flexion: 22, abduction: 0, rotation: 0 }, lumbar: { flexion: 6, abduction: 0, rotation: 0 }, hip_L: { flexion: 50, abduction: 18, rotation: 6 }, hip_R: { flexion: 50, abduction: 18, rotation: 6 }, knee_L: { flexion: 72, abduction: 0, rotation: 0 }, knee_R: { flexion: 72, abduction: 0, rotation: 0 }, ankle_L: { flexion: -22, abduction: 0, rotation: 0 }, ankle_R: { flexion: -22, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 65, abduction: 10, rotation: 0 }, shoulder_R: { flexion: 65, abduction: 10, rotation: 0 } }
  ),
  neck_lateral_stretch: makeTraj(
    'neck_lateral_stretch',
    '頸部側拉軌跡',
    '正坐抬手',
    '輕拉側彎',
    '斜方肌伸展',
    { shoulder_L: { flexion: 55, abduction: 35, rotation: 20 }, elbow_L: { flexion: 85, abduction: 0, rotation: -90 } }
  ),
  overhead_lat_side_bend: makeTraj(
    'overhead_lat_side_bend',
    '過頭側彎軌跡',
    '單臂高舉',
    '側彎啟動',
    '背闊肌拉伸',
    { shoulder_R: { flexion: 168, abduction: -8, rotation: 0 } }
  ),

  // === 5. 日常姿勢與常見工傷 (8 種) ===
  text_neck_phone: makeTraj(
    'text_neck_phone',
    '低頭滑手機演化軌跡',
    '正姿持機',
    '微低頭',
    '烏龜頸駝背',
    { shoulder_L: { flexion: 25, abduction: 10, rotation: 0 }, elbow_L: { flexion: 90, abduction: 0, rotation: -45 }, shoulder_R: { flexion: 25, abduction: 10, rotation: 0 }, elbow_R: { flexion: 90, abduction: 0, rotation: -45 } }
  ),
  single_hand_heavy_carry: makeTraj(
    'single_hand_heavy_carry',
    '單手提重側傾軌跡',
    '直立提物',
    '負荷下沉',
    '腰椎代償側彎',
    { elbow_R: { flexion: 5, abduction: 0, rotation: -90 } }
  ),
  anterior_pelvic_tilt_standing: makeTraj(
    'anterior_pelvic_tilt_standing',
    '骨盆前傾演化軌跡',
    '中立站姿',
    '骨盆前傾',
    '過度前凸',
    {}
  ),
  overhead_reach_shelf: makeTraj(
    'overhead_reach_shelf',
    '高處取物軌跡',
    '持物預備',
    '舉臂上伸',
    '高處取物',
    { shoulder_R: { flexion: 45, abduction: 12, rotation: 0 }, elbow_R: { flexion: 75, abduction: 0, rotation: -165 } },
    { lumbar: { flexion: -6, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 108, abduction: 4, rotation: 0 }, elbow_R: { flexion: 42, abduction: 0, rotation: -165 } }
  ),
  bent_over_child_lift: makeTraj(
    'bent_over_child_lift',
    '彎腰搬箱軌跡',
    '直立預備',
    '彎腰伸手',
    '極限彎腰抱起',
    { elbow_L: { flexion: 5, abduction: 0, rotation: -75 }, elbow_R: { flexion: 5, abduction: 0, rotation: -75 } }
  ),
  desk_slouch_rounded_shoulders: makeTraj(
    'desk_slouch_rounded_shoulders',
    '久坐圓肩演化軌跡',
    '端正坐姿',
    '胸椎微駝',
    '圓肩前引',
    { shoulder_L: { flexion: 25, abduction: 12, rotation: 0 }, elbow_L: { flexion: 88, abduction: 0, rotation: -165 }, shoulder_R: { flexion: 25, abduction: 12, rotation: 0 }, elbow_R: { flexion: 88, abduction: 0, rotation: -165 }, hip_L: { flexion: 88, abduction: 8, rotation: 0 }, knee_L: { flexion: 90, abduction: 0, rotation: 0 }, ankle_L: { flexion: -2, abduction: 0, rotation: 0 }, hip_R: { flexion: 88, abduction: 8, rotation: 0 }, knee_R: { flexion: 90, abduction: 0, rotation: 0 }, ankle_R: { flexion: -2, abduction: 0, rotation: 0 } }
  ),
  foosh_wrist_impact: makeTraj(
    'foosh_wrist_impact',
    '跌倒撐地瞬間軌跡',
    '失衡前傾',
    '伸手緩衝',
    '手腕背屈撞擊',
    { pelvis: { flexion: 18, abduction: 0, rotation: 0 }, shoulder_R: { flexion: 35, abduction: 15, rotation: 0 }, elbow_R: { flexion: 35, abduction: 0, rotation: -165 } }
  ),
  ankle_inversion_sprain: makeTraj(
    'ankle_inversion_sprain',
    '腳踝內翻扭傷軌跡',
    '跨步著地',
    '踩空蹠屈',
    '劇烈內翻扭傷',
    { hip_R: { flexion: 15, abduction: 5, rotation: 0 }, knee_R: { flexion: 15, abduction: 0, rotation: 0 } }
  ),
};

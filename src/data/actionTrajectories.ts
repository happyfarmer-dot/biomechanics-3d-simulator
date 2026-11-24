import { Quaternion } from 'three';
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

export const ACTION_TRAJECTORIES: Record<string, ActionTrajectory> = {
  barbell_squat_bottom: {
    presetId: 'barbell_squat_bottom',
    title: '槓鈴深蹲軌跡',
    keyframes: [
      { t: 0, label: '站立預備', pose: poseWith({ shoulder_L: { flexion: -20, abduction: 65, rotation: 55 }, shoulder_R: { flexion: -20, abduction: 65, rotation: 55 }, elbow_L: { flexion: 110, abduction: 0, rotation: 0 }, elbow_R: { flexion: 110, abduction: 0, rotation: 0 } }) },
      { t: 0.5, label: '離心半蹲', pose: poseWith({ lumbar: { flexion: 10, abduction: 0, rotation: 0 }, hip_L: { flexion: 55, abduction: 12, rotation: 6 }, hip_R: { flexion: 55, abduction: 12, rotation: 6 }, knee_L: { flexion: 60, abduction: 0, rotation: 0 }, knee_R: { flexion: 60, abduction: 0, rotation: 0 }, ankle_L: { flexion: 12, abduction: 0, rotation: 0 }, ankle_R: { flexion: 12, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -20, abduction: 65, rotation: 55 }, shoulder_R: { flexion: -20, abduction: 65, rotation: 55 }, elbow_L: { flexion: 110, abduction: 0, rotation: 0 }, elbow_R: { flexion: 110, abduction: 0, rotation: 0 } }) },
      { t: 1, label: '深蹲底端', pose: poseWith({ lumbar: { flexion: 18, abduction: 0, rotation: 0 }, thorax: { flexion: 10, abduction: 0, rotation: 0 }, neck: { flexion: -15, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -20, abduction: 65, rotation: 55 }, shoulder_R: { flexion: -20, abduction: 65, rotation: 55 }, elbow_L: { flexion: 110, abduction: 0, rotation: 0 }, elbow_R: { flexion: 110, abduction: 0, rotation: 0 }, hip_L: { flexion: 105, abduction: 18, rotation: 12 }, hip_R: { flexion: 105, abduction: 18, rotation: 12 }, knee_L: { flexion: 115, abduction: 0, rotation: 0 }, knee_R: { flexion: 115, abduction: 0, rotation: 0 }, ankle_L: { flexion: 22, abduction: 0, rotation: 0 }, ankle_R: { flexion: 22, abduction: 0, rotation: 0 } }) },
    ],
  },
  romanian_deadlift: {
    presetId: 'romanian_deadlift',
    title: '羅馬尼亞硬舉軌跡',
    keyframes: [
      { t: 0, label: '直立鎖定', pose: createNeutralPose() },
      { t: 0.5, label: '髖鉸鏈中段', pose: poseWith({ lumbar: { flexion: 8, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 28, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 28, abduction: 8, rotation: 0 }, hip_L: { flexion: 38, abduction: 6, rotation: 0 }, hip_R: { flexion: 38, abduction: 6, rotation: 0 }, knee_L: { flexion: 10, abduction: 0, rotation: 0 }, knee_R: { flexion: 10, abduction: 0, rotation: 0 } }) },
      { t: 1, label: '最低拉伸', pose: poseWith({ lumbar: { flexion: 15, abduction: 0, rotation: 0 }, thorax: { flexion: 5, abduction: 0, rotation: 0 }, neck: { flexion: -12, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 55, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 55, abduction: 8, rotation: 0 }, hip_L: { flexion: 75, abduction: 6, rotation: 0 }, hip_R: { flexion: 75, abduction: 6, rotation: 0 }, knee_L: { flexion: 15, abduction: 0, rotation: 0 }, knee_R: { flexion: 15, abduction: 0, rotation: 0 } }) },
    ],
  },
  flat_bench_press_bottom: {
    presetId: 'flat_bench_press_bottom',
    title: '平板臥推軌跡',
    keyframes: [
      { t: 0, label: '頂端鎖定', pose: poseWith({ pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 85, abduction: 15, rotation: 0 }, shoulder_R: { flexion: 85, abduction: 15, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 } }) },
      { t: 0.5, label: '下放中段', pose: poseWith({ pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 35, abduction: 45, rotation: 22 }, shoulder_R: { flexion: 35, abduction: 45, rotation: 22 }, elbow_L: { flexion: 45, abduction: 0, rotation: 0 }, elbow_R: { flexion: 45, abduction: 0, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 } }) },
      { t: 1, label: '觸胸底端', pose: poseWith({ pelvis: { flexion: -88, abduction: 0, rotation: 0 }, shoulder_L: { flexion: -20, abduction: 75, rotation: 45 }, shoulder_R: { flexion: -20, abduction: 75, rotation: 45 }, elbow_L: { flexion: 90, abduction: 0, rotation: 0 }, elbow_R: { flexion: 90, abduction: 0, rotation: 0 }, hip_L: { flexion: -10, abduction: 15, rotation: 0 }, hip_R: { flexion: -10, abduction: 15, rotation: 0 }, knee_L: { flexion: 80, abduction: 0, rotation: 0 }, knee_R: { flexion: 80, abduction: 0, rotation: 0 } }) },
    ],
  },
  standing_overhead_press: {
    presetId: 'standing_overhead_press',
    title: '過頭推舉軌跡',
    keyframes: [
      { t: 0, label: '鎖骨預備', pose: poseWith({ shoulder_L: { flexion: 45, abduction: 25, rotation: 45 }, shoulder_R: { flexion: 45, abduction: 25, rotation: 45 }, elbow_L: { flexion: 120, abduction: 0, rotation: 0 }, elbow_R: { flexion: 120, abduction: 0, rotation: 0 } }) },
      { t: 0.5, label: '過頭推起', pose: poseWith({ shoulder_L: { flexion: 105, abduction: 20, rotation: 20 }, shoulder_R: { flexion: 105, abduction: 20, rotation: 20 }, elbow_L: { flexion: 65, abduction: 0, rotation: 0 }, elbow_R: { flexion: 65, abduction: 0, rotation: 0 } }) },
      { t: 1, label: '頂峰鎖定', pose: poseWith({ lumbar: { flexion: -8, abduction: 0, rotation: 0 }, shoulder_L: { flexion: 165, abduction: 15, rotation: 0 }, shoulder_R: { flexion: 165, abduction: 15, rotation: 0 }, elbow_L: { flexion: 8, abduction: 0, rotation: 0 }, elbow_R: { flexion: 8, abduction: 0, rotation: 0 } }) },
    ],
  },
  rounded_twisted_lift: {
    presetId: 'rounded_twisted_lift',
    title: '搬重物軌跡',
    keyframes: [
      { t: 0, label: '直立預備', pose: createNeutralPose() },
      { t: 0.5, label: '前傾伸手', pose: poseWith({ lumbar: { flexion: 22, abduction: 0, rotation: 8 }, shoulder_L: { flexion: 25, abduction: 8, rotation: 0 }, shoulder_R: { flexion: 25, abduction: 8, rotation: 0 }, hip_L: { flexion: 15, abduction: 4, rotation: 0 }, hip_R: { flexion: 15, abduction: 4, rotation: 0 } }) },
      { t: 1, label: '圓背轉身極限', pose: poseWith({ lumbar: { flexion: 45, abduction: 4, rotation: 18 }, thorax: { flexion: 15, abduction: 0, rotation: 8 }, neck: { flexion: -20, abduction: 0, rotation: -10 }, shoulder_L: { flexion: 48, abduction: 10, rotation: 0 }, shoulder_R: { flexion: 48, abduction: 10, rotation: 0 }, elbow_L: { flexion: 25, abduction: 0, rotation: 0 }, elbow_R: { flexion: 25, abduction: 0, rotation: 0 }, hip_L: { flexion: 25, abduction: 5, rotation: 0 }, hip_R: { flexion: 25, abduction: 5, rotation: 0 }, knee_L: { flexion: 15, abduction: 0, rotation: 0 }, knee_R: { flexion: 15, abduction: 0, rotation: 0 } }) },
    ],
  },
  baseball_pitch_cocking: {
    presetId: 'baseball_pitch_cocking',
    title: '棒球投球揮臂軌跡',
    keyframes: [
      { t: 0, label: '跨步抬手', pose: poseWith({ shoulder_R: { flexion: 15, abduction: 70, rotation: 25 }, elbow_R: { flexion: 85, abduction: 0, rotation: 0 }, hip_L: { flexion: 35, abduction: 15, rotation: 0 }, knee_L: { flexion: 35, abduction: 0, rotation: 0 } }) },
      { t: 0.5, label: '後期極限外旋', pose: poseWith({ lumbar: { flexion: -8, abduction: 8, rotation: -18 }, thorax: { flexion: -6, abduction: 0, rotation: -15 }, shoulder_R: { flexion: 10, abduction: 95, rotation: 90 }, elbow_R: { flexion: 92, abduction: 0, rotation: 0 }, hip_L: { flexion: 48, abduction: 20, rotation: 0 }, knee_L: { flexion: 45, abduction: 0, rotation: 0 } }) },
      { t: 1, label: '加速釋放', pose: poseWith({ lumbar: { flexion: 18, abduction: 0, rotation: 20 }, thorax: { flexion: 10, abduction: 0, rotation: 18 }, shoulder_R: { flexion: 95, abduction: 45, rotation: -35 }, elbow_R: { flexion: 22, abduction: 0, rotation: 0 }, hip_L: { flexion: 55, abduction: 15, rotation: 0 }, knee_L: { flexion: 30, abduction: 0, rotation: 0 } }) },
    ],
  },
};

const _qA = new Quaternion();
const _qB = new Quaternion();
const _qOut = new Quaternion();
const _refAngles: AnatomicalAngles = { flexion: 0, abduction: 0, rotation: 0 };

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

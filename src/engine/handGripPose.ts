import { Euler, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../types/biomechanics';

export type HandGripMode = 'open' | 'bar' | 'fist' | 'ball';

export type FingerName = 'first' | 'second' | 'third' | 'fourth' | 'fifth';
export type PhalanxPart = 'metacarpal' | 'proximal' | 'middle' | 'distal';

export interface FingerRestOffsets {
  metacarpal?: Vec3;
  proximal?: Vec3;
  middle?: Vec3;
  distal?: Vec3;
}

export type HandSkeletonRestMap = Record<
  'L' | 'R',
  Partial<Record<FingerName, FingerRestOffsets>>
>;

export interface HandBoneTag {
  side: 'L' | 'R';
  finger: FingerName;
  part: PhalanxPart;
}

export interface PhalanxTransform {
  localOffset: Vec3;
  localQuaternion: [number, number, number, number];
}

const DEG2RAD = Math.PI / 180;

const BOTH_BAR_GRIP_PRESETS = new Set([
  'sumo_deadlift_start',
  'conventional_deadlift_start',
  'romanian_deadlift',
  'flat_bench_press_bottom',
  'incline_dumbbell_press_bottom',
  'standing_overhead_press',
  'bent_over_barbell_row',
  'barbell_squat_bottom',
  'barbell_front_squat_bottom',
  'standing_calf_raise_peak',
  'barbell_hip_thrust_peak',
  'pull_up_peak',
  'wide_grip_lat_pulldown',
  'parallel_bar_dip_bottom',
  'seated_cable_row_peak',
  'cable_face_pull_peak',
  'tricep_rope_pushdown_lockout',
  'dumbbell_lateral_raise_top',
  'dumbbell_bicep_curl_peak',
  'dumbbell_chest_fly_bottom',
  'hammer_curl_peak',
  'farmers_walk',
  'overhead_tricep_extension_bottom',
  'shoulder_impingement_press',
  'rounded_twisted_lift',
  'golf_downswing_impact',
  'bent_over_child_lift',
]);

const RIGHT_BAR_GRIP_PRESETS = new Set([
  'single_arm_dumbbell_row',
  'single_hand_heavy_carry',
  'tennis_forehand_swing',
  'badminton_jump_smash',
]);

const BALL_GRIP_PRESETS = new Set([
  'basketball_jump_shot',
  'baseball_pitch_cocking',
]);

export function getPresetHandGripModes(
  activePresetId: string | null | undefined
): { L: HandGripMode; R: HandGripMode } {
  if (!activePresetId) return { L: 'open', R: 'open' };
  if (BOTH_BAR_GRIP_PRESETS.has(activePresetId)) return { L: 'bar', R: 'bar' };
  if (RIGHT_BAR_GRIP_PRESETS.has(activePresetId)) return { L: 'open', R: 'bar' };
  if (activePresetId === 'boxing_right_cross') return { L: 'fist', R: 'fist' };
  if (BALL_GRIP_PRESETS.has(activePresetId)) {
    return activePresetId === 'baseball_pitch_cocking'
      ? { L: 'open', R: 'ball' }
      : { L: 'ball', R: 'ball' };
  }
  return { L: 'open', R: 'open' };
}

export function parseHandBoneTag(meshName: string): HandBoneTag | null {
  const nl = meshName.toLowerCase();
  const sideMatch = nl.match(/bone__wrist_(l|r)__/);
  if (!sideMatch) return null;
  const side = sideMatch[1].toUpperCase() as 'L' | 'R';

  const fingers: FingerName[] = ['first', 'second', 'third', 'fourth', 'fifth'];
  const finger = fingers.find((f) => nl.includes(f));
  if (!finger) return null;

  let part: PhalanxPart | null = null;
  if (nl.includes('metacarpal')) part = 'metacarpal';
  else if (nl.includes('proximal_phalanx')) part = 'proximal';
  else if (nl.includes('middle_phalanx')) part = 'middle';
  else if (nl.includes('distal_phalanx')) part = 'distal';
  if (!part) return null;

  return { side, finger, part };
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vector3 {
  return new Vector3(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  );
}

const GRIP_FLEX_ANGLES: Record<
  Exclude<HandGripMode, 'open'>,
  { finger: [number, number, number]; thumbX: number; thumbOppZ: number; thumbIp: number }
> = {
  bar: { finger: [-68, -82, -52], thumbX: -38, thumbOppZ: 42, thumbIp: -52 },
  fist: { finger: [-82, -95, -65], thumbX: -45, thumbOppZ: 48, thumbIp: -58 },
  ball: { finger: [-36, -42, -26], thumbX: -22, thumbOppZ: 26, thumbIp: -25 },
};

const ALL_FINGERS: FingerName[] = ['first', 'second', 'third', 'fourth', 'fifth'];

/**
 * Computes hierarchical MCP -> PIP -> DIP phalanx transforms inside wrist_L / wrist_R local space
 * so fingers curl anatomically around barbells, dumbbells, pull-up bars, and fists.
 */
export function computeHandPhalanxTransforms(
  restMap: HandSkeletonRestMap,
  modes: { L: HandGripMode; R: HandGripMode }
): Partial<Record<string, PhalanxTransform>> {
  const result: Partial<Record<string, PhalanxTransform>> = {};

  for (const side of ['L', 'R'] as const) {
    const mode = modes[side];
    if (mode === 'open') continue;

    const spec = GRIP_FLEX_ANGLES[mode];
    const sideSign = side === 'L' ? 1 : -1;

    for (const finger of ALL_FINGERS) {
      const rest = restMap[side][finger];
      if (!rest?.metacarpal || !rest.proximal || !rest.distal) continue;

      const vM = new Vector3(...rest.metacarpal);
      const vP = new Vector3(...rest.proximal);
      const vD = new Vector3(...rest.distal);
      const mcp = lerpVec3(rest.metacarpal, rest.proximal, 0.58);

      if (finger === 'first') {
        const ip = lerpVec3(rest.proximal, rest.distal, 0.55);
        const q1 = new Quaternion().setFromEuler(
          new Euler(spec.thumbX * DEG2RAD, 0, -sideSign * spec.thumbOppZ * DEG2RAD, 'ZXY')
        );
        const q2 = new Quaternion().setFromEuler(
          new Euler(spec.thumbIp * DEG2RAD, 0, 0, 'ZXY')
        );
        const q12 = q1.clone().multiply(q2);

        const pPos = mcp.clone().add(vP.clone().sub(mcp).applyQuaternion(q1));
        const ipWorld = mcp.clone().add(ip.clone().sub(mcp).applyQuaternion(q1));
        const dPos = ipWorld.clone().add(vD.clone().sub(ip).applyQuaternion(q12));

        result[`${side}_${finger}_proximal`] = {
          localOffset: [pPos.x, pPos.y, pPos.z],
          localQuaternion: [q1.x, q1.y, q1.z, q1.w],
        };
        result[`${side}_${finger}_distal`] = {
          localOffset: [dPos.x, dPos.y, dPos.z],
          localQuaternion: [q12.x, q12.y, q12.z, q12.w],
        };
      } else {
        if (!rest.middle) continue;
        const vMid = new Vector3(...rest.middle);
        const pip = lerpVec3(rest.proximal, rest.middle, 0.52);
        const dip = lerpVec3(rest.middle, rest.distal, 0.52);

        // Slight natural finger-to-finger progression (pinky curls slightly deeper)
        const pinkyBias = finger === 'fifth' ? 1.08 : finger === 'fourth' ? 1.04 : 1.0;
        const q1 = new Quaternion().setFromEuler(
          new Euler(spec.finger[0] * pinkyBias * DEG2RAD, 0, 0, 'ZXY')
        );
        const q2 = new Quaternion().setFromEuler(
          new Euler(spec.finger[1] * pinkyBias * DEG2RAD, 0, 0, 'ZXY')
        );
        const q3 = new Quaternion().setFromEuler(
          new Euler(spec.finger[2] * pinkyBias * DEG2RAD, 0, 0, 'ZXY')
        );

        const q12 = q1.clone().multiply(q2);
        const q123 = q12.clone().multiply(q3);

        const pPos = mcp.clone().add(vP.clone().sub(mcp).applyQuaternion(q1));
        const pipWorld = mcp.clone().add(pip.clone().sub(mcp).applyQuaternion(q1));
        const midPos = pipWorld.clone().add(vMid.clone().sub(pip).applyQuaternion(q12));
        const dipWorld = pipWorld.clone().add(dip.clone().sub(pip).applyQuaternion(q12));
        const dPos = dipWorld.clone().add(vD.clone().sub(dip).applyQuaternion(q123));

        result[`${side}_${finger}_proximal`] = {
          localOffset: [pPos.x, pPos.y, pPos.z],
          localQuaternion: [q1.x, q1.y, q1.z, q1.w],
        };
        result[`${side}_${finger}_middle`] = {
          localOffset: [midPos.x, midPos.y, midPos.z],
          localQuaternion: [q12.x, q12.y, q12.z, q12.w],
        };
        result[`${side}_${finger}_distal`] = {
          localOffset: [dPos.x, dPos.y, dPos.z],
          localQuaternion: [q123.x, q123.y, q123.z, q123.w],
        };
      }
      void vM;
    }
  }

  return result;
}

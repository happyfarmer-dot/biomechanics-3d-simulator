import { describe, expect, it } from 'vitest';
import { ACTION_TRAJECTORIES, interpolatePoseSlerp } from '../../data/actionTrajectories';
import { PRESET_POSES } from '../../data/presetPoses';
import { JOINT_ORDER } from '../../data/skeletonConfig';
import { computeMomentArmGeometry } from '../../components/scene/MomentArmOverlay';
import { computeKinematics } from '../kinematics';
import { decodeSimStateFromHash, encodeSimStateToHash } from '../../utils/urlState';

describe('Flagship Upgrade Suite', () => {
  it('loads all 54 preset poses with zero NaN in kinematics', () => {
    expect(PRESET_POSES.length).toBeGreaterThanOrEqual(54);
    for (const preset of PRESET_POSES) {
      const kin = computeKinematics(preset.pose, 1.75);
      for (const jId of JOINT_ORDER) {
        const j = kin.joints[jId];
        expect(j.worldPosition.every(Number.isFinite)).toBe(true);
        expect(j.worldQuaternion.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('computes accurate 3D moment arm perpendicular distance and torque tau = F * d', () => {
    const res = computeMomentArmGeometry([0, 1.0, 0], [0.3, 1.0, 0], [0, -200, 0]);
    expect(res).not.toBeNull();
    expect(res!.momentArmM).toBeCloseTo(0.3, 5);
    expect(res!.forceMagN).toBeCloseTo(200, 5);
    expect(res!.torqueNm).toBeCloseTo(60, 4);
  });

  it('round-trips URL hash state encoding/decoding and rejects invalid hashes', () => {
    const sample = PRESET_POSES[0];
    const hash = encodeSimStateToHash({
      pose: sample.pose,
      forces: sample.forces,
      dynamicLoadFactor: 1.8,
      muscleEffectMode: 'strain',
      muscleStrainSubMode: 'activeTension',
    });
    expect(hash.startsWith('#state=')).toBe(true);
    const decoded = decodeSimStateFromHash(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.dynamicLoadFactor).toBe(1.8);
    expect(decoded!.muscleStrainSubMode).toBe('activeTension');
    expect(decodeSimStateFromHash('#state=invalid!!!')).toBeNull();
    expect(decodeSimStateFromHash('')).toBeNull();
  });

  it('interpolates all 6 action trajectories via SLERP at t=0, 0.25, 0.5, 0.75, 1.0 with zero NaN', () => {
    const keys = Object.keys(ACTION_TRAJECTORIES);
    expect(keys.length).toBe(6);
    for (const k of keys) {
      const traj = ACTION_TRAJECTORIES[k];
      for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
        const pose = interpolatePoseSlerp(traj.keyframes, t);
        for (const jId of JOINT_ORDER) {
          expect(Number.isFinite(pose[jId].flexion)).toBe(true);
          expect(Number.isFinite(pose[jId].abduction)).toBe(true);
          expect(Number.isFinite(pose[jId].rotation)).toBe(true);
        }
      }
    }
  });
});

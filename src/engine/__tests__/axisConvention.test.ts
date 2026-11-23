import { describe, expect, it } from 'vitest';
import { createNeutralPose } from '../../data/skeletonConfig';
import { computeKinematics } from '../kinematics';

describe('Anatomical Axis Convention Truth Table', () => {
  it('shoulder_L/R flexion > 0 lifts arm forward (+Z) and up (+Y)', () => {
    const pose = createNeutralPose();
    pose.shoulder_L.flexion = 45;
    pose.shoulder_R.flexion = 45;
    const kin = computeKinematics(pose, 1.75);
    expect(kin.joints.elbow_L.worldPosition[2]).toBeGreaterThan(kin.joints.shoulder_L.worldPosition[2] + 0.1);
    expect(kin.joints.elbow_R.worldPosition[2]).toBeGreaterThan(kin.joints.shoulder_R.worldPosition[2] + 0.1);
  });

  it('shoulder_L/R abduction > 0 lifts arm laterally (L:+X, R:-X)', () => {
    const pose = createNeutralPose();
    pose.shoulder_L.abduction = 45;
    pose.shoulder_R.abduction = 45;
    const kin = computeKinematics(pose, 1.75);
    expect(kin.joints.elbow_L.worldPosition[0]).toBeGreaterThan(kin.joints.shoulder_L.worldPosition[0] + 0.1);
    expect(kin.joints.elbow_R.worldPosition[0]).toBeLessThan(kin.joints.shoulder_R.worldPosition[0] - 0.1);
  });

  it('shoulder_L/R external rotation (rotation > 0) with elbow flexed 90° points forearm outward/upward, not inward', () => {
    const pose = createNeutralPose();
    pose.shoulder_L = { flexion: 0, abduction: 75, rotation: 75 };
    pose.elbow_L = { flexion: 90, abduction: 0, rotation: 0 };
    pose.shoulder_R = { flexion: 0, abduction: 75, rotation: 75 };
    pose.elbow_R = { flexion: 90, abduction: 0, rotation: 0 };
    const kin = computeKinematics(pose, 1.75);
    // With 75° abduction + 75° external rotation + 90° elbow flexion, wrist should be HIGHER than elbow
    expect(kin.joints.wrist_L.worldPosition[1]).toBeGreaterThan(kin.joints.elbow_L.worldPosition[1]);
    expect(kin.joints.wrist_R.worldPosition[1]).toBeGreaterThan(kin.joints.elbow_R.worldPosition[1]);
  });

  it('elbow_L/R flexion > 0 bends forearm forward (+Z)', () => {
    const pose = createNeutralPose();
    pose.elbow_L.flexion = 60;
    pose.elbow_R.flexion = 60;
    const kin = computeKinematics(pose, 1.75);
    expect(kin.joints.wrist_L.worldPosition[2]).toBeGreaterThan(kin.joints.elbow_L.worldPosition[2] + 0.1);
    expect(kin.joints.wrist_R.worldPosition[2]).toBeGreaterThan(kin.joints.elbow_R.worldPosition[2] + 0.1);
  });

  it('hip_L/R flexion > 0 lifts thigh forward (+Z) and abduction > 0 opens laterally', () => {
    const pose = createNeutralPose();
    pose.hip_L = { flexion: 45, abduction: 30, rotation: 0 };
    pose.hip_R = { flexion: 45, abduction: 30, rotation: 0 };
    const kin = computeKinematics(pose, 1.75);
    expect(kin.joints.knee_L.worldPosition[2]).toBeGreaterThan(kin.joints.hip_L.worldPosition[2] + 0.1);
    expect(kin.joints.knee_R.worldPosition[2]).toBeGreaterThan(kin.joints.hip_R.worldPosition[2] + 0.1);
    expect(kin.joints.knee_L.worldPosition[0]).toBeGreaterThan(kin.joints.hip_L.worldPosition[0] + 0.1);
    expect(kin.joints.knee_R.worldPosition[0]).toBeLessThan(kin.joints.hip_R.worldPosition[0] - 0.1);
  });

  it('knee_L/R flexion > 0 bends shin backward (-Z)', () => {
    const pose = createNeutralPose();
    pose.knee_L.flexion = 60;
    pose.knee_R.flexion = 60;
    const kin = computeKinematics(pose, 1.75);
    expect(kin.joints.ankle_L.worldPosition[2]).toBeLessThan(kin.joints.knee_L.worldPosition[2] - 0.1);
    expect(kin.joints.ankle_R.worldPosition[2]).toBeLessThan(kin.joints.knee_R.worldPosition[2] - 0.1);
  });

  it('lumbar flexion > 0 bends torso forward (+Z) and flexion < 0 extends backward (-Z)', () => {
    const poseFlex = createNeutralPose();
    poseFlex.lumbar.flexion = 30;
    const kinFlex = computeKinematics(poseFlex, 1.75);
    expect(kinFlex.joints.thorax.worldPosition[2]).toBeGreaterThan(kinFlex.joints.lumbar.worldPosition[2] + 0.05);

    const poseExt = createNeutralPose();
    poseExt.lumbar.flexion = -25;
    const kinExt = computeKinematics(poseExt, 1.75);
    expect(kinExt.joints.thorax.worldPosition[2]).toBeLessThan(kinExt.joints.lumbar.worldPosition[2] - 0.03);
  });
});

import { describe, expect, it } from 'vitest';
import { createNeutralPose, DEFAULT_HEIGHT_M } from '../../data/skeletonConfig';
import { anatomicalToEuler, computeKinematics, eulerToAnatomical } from '../kinematics';
import { mapJointSoftTissueLoads } from '../ligamentLoadMapper';
import { evaluateMuscles } from '../muscleEvaluator';
import { evaluateAllInjuries, evaluateCompositeRules } from '../romEvaluator';
import { computeStatics } from '../staticsEngine';
import type { SpatialForce } from '../../types/biomechanics';

describe('Kinematics & Mirror Symmetry', () => {
  it('ensures left and right shoulder abduction are mirror-symmetric (+X vs -X)', () => {
    const pose = createNeutralPose();
    pose.shoulder_L.abduction = 90;
    pose.shoulder_R.abduction = 90;

    const kin = computeKinematics(pose, DEFAULT_HEIGHT_M);
    const sL = kin.joints.shoulder_L.worldPosition;
    const wL = kin.joints.wrist_L.worldPosition;
    const sR = kin.joints.shoulder_R.worldPosition;
    const wR = kin.joints.wrist_R.worldPosition;

    expect(wL[0] - sL[0]).toBeCloseTo(0.6, 5);
    expect(wL[1] - sL[1]).toBeCloseTo(0, 5);
    expect(wL[2] - sL[2]).toBeCloseTo(0, 5);

    expect(wR[0] - sR[0]).toBeCloseTo(-0.6, 5);
    expect(wR[1] - sR[1]).toBeCloseTo(0, 5);
    expect(wR[2] - sR[2]).toBeCloseTo(0, 5);
  });

  it('ensures left and right internal rotation both turn toward midline', () => {
    const pose = createNeutralPose();
    pose.elbow_L.flexion = 90;
    pose.elbow_R.flexion = 90;
    pose.shoulder_L.rotation = 45;
    pose.shoulder_R.rotation = 45;

    const kin = computeKinematics(pose, DEFAULT_HEIGHT_M);
    const eL = kin.joints.elbow_L.worldPosition;
    const wL = kin.joints.wrist_L.worldPosition;
    const eR = kin.joints.elbow_R.worldPosition;
    const wR = kin.joints.wrist_R.worldPosition;

    expect(wL[0] - eL[0]).toBeLessThan(-0.15);
    expect(wR[0] - eR[0]).toBeGreaterThan(0.15);
    expect((wL[0] - eL[0]) + (wR[0] - eR[0])).toBeCloseTo(0, 5);
  });

  it('round-trips anatomicalToEuler and eulerToAnatomical', () => {
    const input = { flexion: 35, abduction: 72, rotation: -28 };
    const euler = anatomicalToEuler('shoulder_R', input);
    const output = eulerToAnatomical('shoulder_R', euler);
    expect(output.flexion).toBeCloseTo(input.flexion, 5);
    expect(output.abduction).toBeCloseTo(input.abduction, 5);
    expect(output.rotation).toBeCloseTo(input.rotation, 5);
  });
});

describe('Statics Engine & Ligament Load Mapper', () => {
  it('(a) right arm abducted 0.6m to -X with (0, -100, 0) N at wrist produces exact (0, 0, +60) N·m at shoulder_R', () => {
    const pose = createNeutralPose();
    pose.shoulder_R.abduction = 90;

    const kin = computeKinematics(pose, DEFAULT_HEIGHT_M);
    const forces: SpatialForce[] = [
      {
        id: 'test_a',
        targetJoint: 'wrist_R',
        positionRatio: 0,
        forceVectorWorld: [0, -100, 0],
        scaleNpm: 1000,
      },
    ];

    const loads = computeStatics(kin, forces, { includeGravity: false });
    const shoulderTorque = loads.shoulder_R.worldTorque;

    expect(shoulderTorque[0]).toBeCloseTo(0, 4);
    expect(shoulderTorque[1]).toBeCloseTo(0, 4);
    expect(shoulderTorque[2]).toBeCloseTo(60, 4);
  });

  it('(b) lateral (-X) push toward +X on distal right shin creates valgus > 45 N·m: MCL & ACL critical, LCL normal; reverse push makes LCL critical', () => {
    const pose = createNeutralPose();
    const kin = computeKinematics(pose, DEFAULT_HEIGHT_M);

    // 1. Lateral (-X) to medial (+X) push -> Valgus on right knee
    const valgusForce: SpatialForce[] = [
      {
        id: 'valgus_push',
        targetJoint: 'knee_R',
        positionRatio: 0.75,
        surfaceAngleDeg: -90,
        forceVectorWorld: [300, 0, 0],
        scaleNpm: 1000,
      },
    ];
    const valgusLoads = computeStatics(kin, valgusForce, { includeGravity: false });
    expect(valgusLoads.knee_R.coronalMomentNm).toBeGreaterThan(45);

    const valgusTissues = mapJointSoftTissueLoads('knee_R', pose, valgusLoads);
    const mcl = valgusTissues.find((t) => t.id === 'MCL')!;
    const acl = valgusTissues.find((t) => t.id === 'ACL')!;
    const lcl = valgusTissues.find((t) => t.id === 'LCL')!;
    expect(mcl.status).toBe('critical');
    expect(acl.status).toBe('critical');
    expect(lcl.status).toBe('normal');

    // 2. Medial (+X) to lateral (-X) push -> Varus on right knee
    const varusForce: SpatialForce[] = [
      {
        id: 'varus_push',
        targetJoint: 'knee_R',
        positionRatio: 0.75,
        surfaceAngleDeg: 90,
        forceVectorWorld: [-300, 0, 0],
        scaleNpm: 1000,
      },
    ];
    const varusLoads = computeStatics(kin, varusForce, { includeGravity: false });
    const varusTissues = mapJointSoftTissueLoads('knee_R', pose, varusLoads);
    expect(varusTissues.find((t) => t.id === 'LCL')!.status).toBe('critical');
    expect(varusTissues.find((t) => t.id === 'MCL')!.status).toBe('normal');
  });

  it('(c) hand reaching 0.5m forward bearing 200 N downward produces lumbar compression > 2200 N', () => {
    const pose = createNeutralPose();
    pose.shoulder_R.flexion = 60;
    const kin = computeKinematics(pose, DEFAULT_HEIGHT_M);

    const forces: SpatialForce[] = [
      {
        id: 'test_c',
        targetJoint: 'wrist_R',
        positionRatio: 0,
        surfaceAngleDeg: 0,
        forceVectorWorld: [0, -200, 0],
        scaleNpm: 1000,
      },
    ];

    const loads = computeStatics(kin, forces, { includeGravity: true, bodyMassKg: 70 });
    const compression = loads.lumbar.lumbarEstimatedCompressionN ?? 0;
    expect(compression).toBeGreaterThan(2200);
  });
});

describe('Composite Posture & Force Rules', () => {
  it('(d) triggers all 5 composite posture rules accurately by rule ID', () => {
    const p1 = createNeutralPose();
    p1.shoulder_L = { flexion: 0, abduction: 95, rotation: 50 };
    expect(evaluateCompositeRules(p1).map((a) => a.id)).toContain(
      'composite_shoulder_impingement_shoulder_L'
    );

    const p2 = createNeutralPose();
    p2.shoulder_R = { flexion: -20, abduction: 95, rotation: -90 };
    expect(evaluateCompositeRules(p2).map((a) => a.id)).toContain(
      'composite_shoulder_anterior_instability_shoulder_R'
    );

    const p3 = createNeutralPose();
    p3.knee_L = { flexion: 35, abduction: 15, rotation: -12 };
    expect(evaluateCompositeRules(p3).map((a) => a.id)).toContain(
      'composite_dynamic_knee_valgus_knee_L'
    );

    const p4 = createNeutralPose();
    p4.knee_R = { flexion: -8, abduction: 0, rotation: 0 };
    expect(evaluateCompositeRules(p4).map((a) => a.id)).toContain(
      'composite_knee_hyperextension_knee_R'
    );

    const p5 = createNeutralPose();
    p5.lumbar = { flexion: 42, abduction: 0, rotation: 15 };
    expect(evaluateCompositeRules(p5).map((a) => a.id)).toContain(
      'composite_lumbar_disc_herniation_lumbar'
    );
  });

  it('triggers NIOSH > 3400 N force overload rule on heavy forward lift', () => {
    const pose = createNeutralPose();
    pose.lumbar.flexion = 45;
    pose.shoulder_L.flexion = 55;
    pose.shoulder_R.flexion = 55;
    const kin = computeKinematics(pose, DEFAULT_HEIGHT_M);
    const forces: SpatialForce[] = [
      { id: 'fL', targetJoint: 'wrist_L', positionRatio: 0.5, surfaceAngleDeg: 0, forceVectorWorld: [0, -150, 0], scaleNpm: 1000 },
      { id: 'fR', targetJoint: 'wrist_R', positionRatio: 0.5, surfaceAngleDeg: 0, forceVectorWorld: [0, -150, 0], scaleNpm: 1000 },
    ];
    const loads = computeStatics(kin, forces, { includeGravity: true, bodyMassKg: 70 });
    const alerts = evaluateAllInjuries(pose, loads);
    expect(alerts.map((a) => a.id)).toContain('force_lumbar_compression_niosh_lumbar');
  });
});

describe('Muscle Evaluator', () => {
  it('caches neutral rest length L0 (strain = 0) and detects elongation strain under flexion', () => {
    const neutralKin = computeKinematics(createNeutralPose(), DEFAULT_HEIGHT_M);
    const neutralMuscles = evaluateMuscles(neutralKin, DEFAULT_HEIGHT_M);
    expect(neutralMuscles.length).toBe(46);
    for (const m of neutralMuscles) {
      expect(m.strain).toBeCloseTo(0, 6);
      expect(m.status).toBe('normal');
    }

    const flexedPose = createNeutralPose();
    flexedPose.lumbar.flexion = 55;
    const flexedKin = computeKinematics(flexedPose, DEFAULT_HEIGHT_M);
    const flexedMuscles = evaluateMuscles(flexedKin, DEFAULT_HEIGHT_M);
    const erectorL = flexedMuscles.find((m) => m.id === 'erector_spinae_L');
    expect(erectorL).toBeDefined();
    expect(erectorL!.strain).toBeGreaterThan(0.05);
  });
});

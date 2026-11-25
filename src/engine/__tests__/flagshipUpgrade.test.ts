import { describe, expect, it } from 'vitest';
import { ACTION_TRAJECTORIES, interpolatePoseSlerp } from '../../data/actionTrajectories';
import { PRESET_POSES } from '../../data/presetPoses';
import { createNeutralPose, JOINT_ORDER, SKELETON_CONFIG } from '../../data/skeletonConfig';
import {
  computeCombinedMomentArmGeometry,
  computeMomentArmGeometry,
} from '../../components/scene/MomentArmOverlay';
import { computeClavicleWorldState, computeKinematics } from '../kinematics';
import { computeActiveTensionScore } from '../muscleStrainTracker';
import { evaluateAllInjuries } from '../romEvaluator';
import { computeStatics } from '../staticsEngine';
import { useSimStore } from '../../store/useSimStore';
import { decodeSimStateFromHash, encodeSimStateToHash } from '../../utils/urlState';

describe('Flagship Upgrade Suite', () => {
  it('loads all 64 preset poses with zero NaN in kinematics', () => {
    expect(PRESET_POSES.length).toBeGreaterThanOrEqual(64);
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

  it('computes combined resultant torque and centered equivalent line of action for bilateral symmetric loads', () => {
    const res = computeCombinedMomentArmGeometry([0, 1.0, 0], [
      { position: [0.2, 1.0, 0.4], force: [0, -100, 0] },
      { position: [-0.2, 1.0, 0.4], force: [0, -100, 0] },
    ]);
    expect(res).not.toBeNull();
    expect(res!.forceMagN).toBeCloseTo(200, 4);
    expect(res!.momentArmM).toBeCloseTo(0.4, 4);
    expect(res!.torqueNm).toBeCloseTo(80, 4);
    expect(res!.footPoint[0]).toBeCloseTo(0, 4);
    expect(res!.footPoint[2]).toBeCloseTo(0.4, 4);
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

  it('hydrates shared URL state and synchronously recomputes kinematics, loads, and alerts', () => {
    const lift = PRESET_POSES.find((p) => p.id === 'rounded_twisted_lift')!;
    useSimStore.getState().resetPose();
    const neutralLumbar = useSimStore.getState().loads.lumbar.lumbarEstimatedCompressionN ?? 0;

    useSimStore.getState().hydrateSharedState({
      pose: lift.pose,
      forces: lift.forces,
      dynamicLoadFactor: 1.5,
      muscleEffectMode: 'strain',
      muscleStrainSubMode: 'activeTension',
    });

    const st = useSimStore.getState();
    expect(st.dynamicLoadFactor).toBe(1.5);
    expect(st.muscleEffectMode).toBe('strain');
    expect(st.muscleStrainSubMode).toBe('activeTension');
    expect((st.loads.lumbar.lumbarEstimatedCompressionN ?? 0)).toBeGreaterThan(neutralLumbar + 1500);
    expect(st.alerts.length).toBeGreaterThan(0);

    // Reset back to neutral after test
    useSimStore.getState().setDynamicLoadFactor(1.0);
    useSimStore.getState().resetPose();
  });

  it('interpolates all 63 non-neutral action trajectories via SLERP without gimbal lock > 90 deg or ±180 deg jumps', () => {
    const keys = Object.keys(ACTION_TRAJECTORIES);
    expect(keys.length).toBe(63);
    for (const k of keys) {
      const traj = ACTION_TRAJECTORIES[k];
      for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
        const pose = interpolatePoseSlerp(traj.keyframes, t);
        for (const jId of JOINT_ORDER) {
          expect(Number.isFinite(pose[jId].flexion)).toBe(true);
          expect(Number.isFinite(pose[jId].abduction)).toBe(true);
          expect(Number.isFinite(pose[jId].rotation)).toBe(true);
          // No ±180° gimbal-lock wrap jumps on abduction/rotation
          expect(Math.abs(pose[jId].abduction)).toBeLessThan(155);
          expect(Math.abs(pose[jId].rotation)).toBeLessThan(178);
        }
      }
    }

    // Specifically verify standing_overhead_press crosses flexion > 90° smoothly up to 165°
    const ohpTraj = ACTION_TRAJECTORIES.standing_overhead_press.keyframes;
    const midHigh = interpolatePoseSlerp(ohpTraj, 0.75);
    expect(midHigh.shoulder_R.flexion).toBeGreaterThan(120);
    expect(midHigh.shoulder_R.flexion).toBeLessThan(165);
    expect(Math.abs(midHigh.shoulder_R.abduction)).toBeLessThan(30);
  });

  it('ensures all 6 bodyweight core presets include gravity and produce non-zero joint moments', () => {
    const coreIds = [
      'push_up_bottom',
      'standard_plank',
      'side_plank',
      'glute_bridge_peak',
      'russian_twist',
      'superman_back_extension',
    ];
    for (const id of coreIds) {
      const preset = PRESET_POSES.find((p) => p.id === id);
      expect(preset).toBeDefined();
      expect(preset!.includeGravity).toBe(true);
      const kin = computeKinematics(preset!.pose, 1.75);
      const loads = computeStatics(kin, preset!.forces, {
        includeGravity: preset!.includeGravity,
        bodyMassKg: 70,
        heightM: 1.75,
      });
      expect(loads.lumbar.bendingMomentNm).toBeGreaterThan(5);
    }

    // side_plank: right elbow/forearm supports on floor below pelvis
    const sidePlank = PRESET_POSES.find((p) => p.id === 'side_plank')!;
    const sideKin = computeKinematics(sidePlank.pose, 1.75);
    expect(sideKin.joints.elbow_R.worldPosition[1]).toBeLessThan(0.12);
    expect(sideKin.joints.pelvis.worldPosition[1]).toBeGreaterThan(
      sideKin.joints.elbow_R.worldPosition[1] + 0.25
    );

    // glute_bridge_peak: head/shoulders rest low on floor while pelvis is bridged upward
    const bridge = PRESET_POSES.find((p) => p.id === 'glute_bridge_peak')!;
    const bridgeKin = computeKinematics(bridge.pose, 1.75);
    expect(bridgeKin.joints.head.worldPosition[1]).toBeLessThan(0.15);
    expect(bridgeKin.joints.pelvis.worldPosition[1]).toBeGreaterThan(
      bridgeKin.joints.head.worldPosition[1] + 0.15
    );
  });

  it('verifies corrected external/internal rotation signs, shoulder ROM limits, and bench press leg orientation', () => {
    expect(SKELETON_CONFIG.shoulder_L.romLimits.rotation).toEqual([-70, 90]);
    expect(SKELETON_CONFIG.shoulder_R.romLimits.rotation).toEqual([-70, 90]);

    const squat = PRESET_POSES.find((p) => p.id === 'barbell_squat_bottom')!;
    const sumo = PRESET_POSES.find((p) => p.id === 'sumo_deadlift_start')!;
    const warrior = PRESET_POSES.find((p) => p.id === 'warrior_two')!;
    const asian = PRESET_POSES.find((p) => p.id === 'asian_deep_squat')!;
    const smash = PRESET_POSES.find((p) => p.id === 'badminton_jump_smash')!;
    const bench = PRESET_POSES.find((p) => p.id === 'flat_bench_press_bottom')!;

    expect(squat.pose.hip_L.rotation).toBeGreaterThan(0);
    expect(sumo.pose.hip_R.rotation).toBeGreaterThan(0);
    expect(warrior.pose.hip_R.rotation).toBeGreaterThan(0);
    expect(asian.pose.hip_L.rotation).toBeGreaterThan(0);
    expect(smash.pose.shoulder_R.rotation).toBeLessThan(0);

    // Flat bench press: feet planted BELOW pelvis/hips (not pointing up toward sky)
    const benchKin = computeKinematics(bench.pose, 1.75);
    expect(benchKin.joints.ankle_R.worldPosition[1]).toBeLessThan(
      benchKin.joints.hip_R.worldPosition[1] - 0.3
    );
  });

  it('auto-grounds neutral standing with 0.000 mm drift and grounds kneeling/lying poses without clipping', () => {
    const neutral = computeKinematics(createNeutralPose(), 1.75);
    const expectedNeutralPelvisY = SKELETON_CONFIG.pelvis.offsetRatio[1] * 1.75;
    expect(Math.abs(neutral.joints.pelvis.worldPosition[1] - expectedNeutralPelvisY)).toBeLessThan(1e-6);

    const plank = PRESET_POSES.find((p) => p.id === 'standard_plank')!;
    const plankKin = computeKinematics(plank.pose, 1.75);
    // All joints stay above floor (y >= 0) and lowest support is near floor (y < 0.25m)
    const minPlankY = Math.min(...JOINT_ORDER.map((id) => plankKin.joints[id].worldPosition[1]));
    expect(minPlankY).toBeGreaterThan(0.02);
    expect(minPlankY).toBeLessThan(0.2);

    const kneel = PRESET_POSES.find((p) => p.id === 'kneeling_hip_flexor_stretch')!;
    const kneelKin = computeKinematics(kneel.pose, 1.75);
    const minKneelY = Math.min(
      kneelKin.joints.ankle_L.worldPosition[1],
      kneelKin.joints.knee_R.worldPosition[1]
    );
    expect(minKneelY).toBeGreaterThan(0.03);
    expect(minKneelY).toBeLessThan(0.15);
  });

  it('computes scapulohumeral rhythm using calibrated thorax rest position', () => {
    const pose = createNeutralPose();
    pose.shoulder_R.abduction = 90;
    const kin = computeKinematics(pose, 1.75);
    const clav = computeClavicleWorldState(
      'R',
      pose,
      kin.joints.thorax,
      [-0.19, 1.41, -0.03],
      [0, 1.24, 0],
      1.0
    );
    expect(clav.worldPosition.every(Number.isFinite)).toBe(true);
    // Elevated rotation quaternion must differ from identity
    expect(Math.abs(clav.worldQuaternion[2])).toBeGreaterThan(0.05);
  });

  it('wires dynamicLoadFactor, activeTension, sexProfile, and romToleranceBoost into statics & injury alerts', () => {
    const pose = createNeutralPose();
    pose.lumbar.flexion = 40;
    pose.shoulder_L.flexion = 50;
    pose.shoulder_R.flexion = 50;
    const kin = computeKinematics(pose, 1.75);
    const forces = [
      { id: 'fL', targetJoint: 'wrist_L' as const, positionRatio: 0.5, forceVectorWorld: [0, -100, 0] as [number, number, number], scaleNpm: 1000 as const },
      { id: 'fR', targetJoint: 'wrist_R' as const, positionRatio: 0.5, forceVectorWorld: [0, -100, 0] as [number, number, number], scaleNpm: 1000 as const },
    ];

    const loads1x = computeStatics(kin, forces, { includeGravity: true, bodyMassKg: 70, dynamicLoadFactor: 1.0 });
    const loads2x = computeStatics(kin, forces, { includeGravity: true, bodyMassKg: 70, dynamicLoadFactor: 2.0 });
    expect(loads2x.lumbar.bendingMomentNm).toBeCloseTo(loads1x.lumbar.bendingMomentNm * 2, 3);
    expect(loads2x.lumbar.lumbarEstimatedCompressionN!).toBeCloseTo(
      loads1x.lumbar.lumbarEstimatedCompressionN! * 2,
      2
    );

    // Active tension score distinguishes unloaded vs loaded
    const unloadedScore = computeActiveTensionScore(0.15, {
      ...loads1x.lumbar,
      bendingMomentNm: 0,
      axialForceN: 0,
    });
    const loadedScore = computeActiveTensionScore(0.15, loads2x.lumbar);
    expect(unloadedScore).toBe(0);
    expect(loadedScore).toBeGreaterThan(0.1);

    // sexProfile 'female' lowers lumbar compression threshold from 3400 N to 3000 N
    const syntheticLoads = {
      ...loads1x,
      lumbar: { ...loads1x.lumbar, lumbarEstimatedCompressionN: 3200 },
    };
    const maleAlerts = evaluateAllInjuries(createNeutralPose(), syntheticLoads, { sexProfile: 'male' });
    const femaleAlerts = evaluateAllInjuries(createNeutralPose(), syntheticLoads, { sexProfile: 'female' });
    expect(maleAlerts.some((a) => a.id === 'force_lumbar_compression_niosh_lumbar')).toBe(false);
    expect(femaleAlerts.some((a) => a.id === 'force_lumbar_compression_niosh_lumbar')).toBe(true);

    // romToleranceBoost clears borderline ROM critical alert (e.g. hip flexion 128° vs default max 120°)
    const flexPose = createNeutralPose();
    flexPose.hip_R.flexion = 128;
    const baseRomAlerts = evaluateAllInjuries(flexPose, loads1x, { romToleranceBoost: false });
    const boostedRomAlerts = evaluateAllInjuries(flexPose, loads1x, { romToleranceBoost: true });
    expect(baseRomAlerts.some((a) => a.id === 'rom_critical_hip_R_flexion')).toBe(true);
    expect(boostedRomAlerts.some((a) => a.id === 'rom_critical_hip_R_flexion')).toBe(false);
  });

  it('preserves activePresetId and layers user limb adjustments live during trajectory playback', () => {
    const store = useSimStore.getState();
    store.applyPreset('barbell_squat_bottom');
    expect(useSimStore.getState().activePresetId).toBe('barbell_squat_bottom');

    const traj = ACTION_TRAJECTORIES.barbell_squat_bottom.keyframes;
    const midPose = interpolatePoseSlerp(traj, 0.5);
    useSimStore.getState().setTrajectoryPose(midPose);
    const baseLumbar = useSimStore.getState().pose.lumbar.flexion;

    // User adjusts lumbar flexion by +15 deg while animation is playing
    useSimStore.getState().setJointAngles('lumbar', { flexion: baseLumbar + 15 });
    expect(useSimStore.getState().activePresetId).toBe('barbell_squat_bottom');
    expect(useSimStore.getState().pose.lumbar.flexion).toBeCloseTo(baseLumbar + 15, 2);

    // Subsequent trajectory frame preserves the +15 deg user offset on top of the new frame
    const nextPose = interpolatePoseSlerp(traj, 0.8);
    useSimStore.getState().setTrajectoryPose(nextPose);
    expect(useSimStore.getState().activePresetId).toBe('barbell_squat_bottom');
    expect(useSimStore.getState().pose.lumbar.flexion).toBeCloseTo(nextPose.lumbar.flexion + 15, 2);

    useSimStore.getState().resetPose();
  });
});

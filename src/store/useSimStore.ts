import { create } from 'zustand';
import { PRESET_POSES } from '../data/presetPoses';
import {
  createNeutralPose,
  DEFAULT_HEIGHT_M,
  DEFAULT_MASS_KG,
  getJointSliderLimits,
} from '../data/skeletonConfig';
import { computeKinematics } from '../engine/kinematics';
import { mapJointSoftTissueLoads } from '../engine/ligamentLoadMapper';
import { evaluateMuscles } from '../engine/muscleEvaluator';
import type { MuscleStrainSummary } from '../engine/muscleStrainTracker';
import type { RigIntegrityReport } from '../engine/rigIntegrityCheck';
import { evaluateAllInjuries, getJointRiskMap } from '../engine/romEvaluator';
import { computeStatics } from '../engine/staticsEngine';
import type {
  AnatomicalAngles,
  InjuryAlert,
  InteractionMode,
  JointId,
  JointLoadResult,
  KinematicsResult,
  LayerVisibility,
  MuscleState,
  PoseMap,
  RiskSeverity,
  SoftTissueLoad,
  SpatialForce,
  Vec3,
} from '../types/biomechanics';

export interface CameraVectors {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

interface SimState {
  pose: PoseMap;
  selectedJoint: JointId | null;
  focusedJointId: JointId | null;
  interactionMode: InteractionMode;
  selectedForceId: string | null;
  heightM: number;
  bodyMassKg: number;
  includeGravity: boolean;
  forces: SpatialForce[];
  layers: LayerVisibility;
  isDraggingGizmo: boolean;
  useTouchPad: boolean;
  showJointHandles: boolean;
  muscleEffectMode: 'anatomy' | 'strain';
  muscleStrainSubMode: 'geometric' | 'activeTension';
  dynamicLoadFactor: number;
  sexProfile: 'male' | 'female';
  romToleranceBoost: boolean;
  skinOpacity: number;
  muscleStrainSummary: MuscleStrainSummary;
  activePresetId: string | null;
  modelStatus: { state: 'loading' | 'loaded' | 'error'; message?: string };
  calibratedOffsets: Record<JointId, Vec3> | null;
  integrityReport: RigIntegrityReport | null;
  cameraVectors: CameraVectors;

  // Derived simulation outputs
  kinematics: KinematicsResult;
  muscles: MuscleState[];
  loads: Record<JointId, JointLoadResult>;
  alerts: InjuryAlert[];
  jointRiskMap: Record<JointId, RiskSeverity>;
  focusedSoftTissues: SoftTissueLoad[];

  // Actions
  setModelStatus: (status: { state: 'loading' | 'loaded' | 'error'; message?: string }) => void;
  setCalibratedOffsets: (offsets: Record<JointId, Vec3> | null) => void;
  setIntegrityReport: (report: RigIntegrityReport | null) => void;
  setCameraVectors: (vecs: CameraVectors) => void;
  setUseTouchPad: (use: boolean) => void;
  setShowJointHandles: (show: boolean) => void;
  setMuscleEffectMode: (mode: 'anatomy' | 'strain') => void;
  setMuscleStrainSubMode: (mode: 'geometric' | 'activeTension') => void;
  setDynamicLoadFactor: (factor: number) => void;
  setSexProfile: (sex: 'male' | 'female') => void;
  setRomToleranceBoost: (boost: boolean) => void;
  setSkinOpacity: (opacity: number) => void;
  setMuscleStrainSummary: (summary: MuscleStrainSummary) => void;
  selectNearestJointAtPoint: (worldPoint: Vec3) => void;
  setSelectedJoint: (jointId: JointId | null) => void;
  setFocusedJoint: (jointId: JointId | null) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setSelectedForceId: (id: string | null) => void;
  setJointAngles: (jointId: JointId, angles: Partial<AnatomicalAngles>) => void;
  applyPosePatch: (patch: Partial<PoseMap>) => void;
  placeForceAtPoint: (targetJoint: JointId, worldPoint: Vec3) => void;
  setForceVector: (id: string, vec: Vec3) => void;
  setPose: (pose: PoseMap, preservePreset?: boolean) => void;
  hydrateSharedState: (payload: {
    pose: PoseMap;
    forces: SpatialForce[];
    dynamicLoadFactor?: number;
    muscleEffectMode?: 'anatomy' | 'strain';
    muscleStrainSubMode?: 'geometric' | 'activeTension';
  }) => void;
  applyPreset: (presetId: string) => void;
  resetPose: () => void;
  setAnthropometry: (heightM: number, bodyMassKg: number) => void;
  setIncludeGravity: (include: boolean) => void;
  addForce: (force: Omit<SpatialForce, 'id'>) => void;
  updateForce: (id: string, patch: Partial<SpatialForce>) => void;
  invertForce: (id: string) => void;
  removeForce: (id: string) => void;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  setIsDraggingGizmo: (dragging: boolean) => void;
}

function evaluateAll(
  pose: PoseMap,
  forces: SpatialForce[],
  heightM: number,
  bodyMassKg: number,
  includeGravity: boolean,
  focusedJointId: JointId | null,
  selectedJoint: JointId | null,
  calibratedOffsets: Record<JointId, Vec3> | null,
  dynamicLoadFactor: number = 1.0,
  sexProfile: 'male' | 'female' = 'male',
  romToleranceBoost: boolean = false
) {
  const kinematics = computeKinematics(pose, heightM, calibratedOffsets);
  const muscles = evaluateMuscles(kinematics, heightM);
  const loads = computeStatics(kinematics, forces, {
    includeGravity,
    bodyMassKg,
    heightM,
    dynamicLoadFactor,
  });
  const alerts = evaluateAllInjuries(pose, loads, {
    sexProfile,
    romToleranceBoost,
  });
  const jointRiskMap = getJointRiskMap(alerts);
  const macroJoint = focusedJointId ?? selectedJoint;
  const focusedSoftTissues = macroJoint
    ? mapJointSoftTissueLoads(macroJoint, pose, loads)
    : [];
  return { kinematics, muscles, loads, alerts, jointRiskMap, focusedSoftTissues };
}

const initialPose = createNeutralPose();
const initialDerived = evaluateAll(
  initialPose,
  [],
  DEFAULT_HEIGHT_M,
  DEFAULT_MASS_KG,
  true,
  null,
  'knee_R',
  null,
  1.0,
  'male',
  false
);

export const useSimStore = create<SimState>((set, get) => ({
  pose: initialPose,
  selectedJoint: 'knee_R',
  focusedJointId: null,
  interactionMode: 'pose',
  selectedForceId: null,
  heightM: DEFAULT_HEIGHT_M,
  bodyMassKg: DEFAULT_MASS_KG,
  includeGravity: true,
  forces: [],
  layers: {
    skin: false,
    skeleton: true,
    muscles: true,
    macroLigaments: true,
    jointCapsule: true,
    spatialComponents: true,
    axesDebug: false,
  },
  isDraggingGizmo: false,
  useTouchPad: true,
  showJointHandles: false,
  muscleEffectMode: 'anatomy',
  muscleStrainSubMode: 'geometric',
  dynamicLoadFactor: 1.0,
  sexProfile: 'male',
  romToleranceBoost: false,
  skinOpacity: 0.45,
  muscleStrainSummary: { topContracting: [], topStretching: [] },
  activePresetId: 'neutral_standing',
  modelStatus: { state: 'loading' },
  calibratedOffsets: null,
  integrityReport: null,
  cameraVectors: {
    right: [1, 0, 0],
    up: [0, 1, 0],
    forward: [0, 0, -1],
  },
  ...initialDerived,

  setModelStatus: (modelStatus) => set({ modelStatus }),
  setIntegrityReport: (integrityReport) => set({ integrityReport }),
  setCameraVectors: (cameraVectors) => set({ cameraVectors }),
  setUseTouchPad: (useTouchPad) => set({ useTouchPad }),
  setShowJointHandles: (showJointHandles) => set({ showJointHandles }),
  setMuscleEffectMode: (muscleEffectMode) => set({ muscleEffectMode }),
  setMuscleStrainSubMode: (muscleStrainSubMode) => set({ muscleStrainSubMode }),
  setDynamicLoadFactor: (factor) => {
    const s = get();
    const dynamicLoadFactor = Math.max(1.0, Math.min(3.0, factor));
    const derived = evaluateAll(
      s.pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ dynamicLoadFactor, ...derived });
  },
  setSexProfile: (sexProfile) => {
    const s = get();
    const derived = evaluateAll(
      s.pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      sexProfile,
      s.romToleranceBoost
    );
    set({ sexProfile, ...derived });
  },
  setRomToleranceBoost: (romToleranceBoost) => {
    const s = get();
    const derived = evaluateAll(
      s.pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      romToleranceBoost
    );
    set({ romToleranceBoost, ...derived });
  },
  setSkinOpacity: (skinOpacity) => set({ skinOpacity: Math.max(0.15, Math.min(1, skinOpacity)) }),
  setMuscleStrainSummary: (muscleStrainSummary) => set({ muscleStrainSummary }),

  selectNearestJointAtPoint: (worldPoint) => {
    const s = get();
    const CONTROL_JOINTS: JointId[] = [
      'pelvis', 'lumbar', 'neck',
      'shoulder_L', 'elbow_L', 'wrist_L',
      'shoulder_R', 'elbow_R', 'wrist_R',
      'hip_L', 'knee_L', 'ankle_L',
      'hip_R', 'knee_R', 'ankle_R',
    ];
    let bestJoint: JointId = s.selectedJoint ?? 'knee_R';
    let bestDistSq = Infinity;
    for (const jId of CONTROL_JOINTS) {
      const jp = s.kinematics.joints[jId].worldPosition;
      const dx = jp[0] - worldPoint[0];
      const dy = jp[1] - worldPoint[1];
      const dz = jp[2] - worldPoint[2];
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestJoint = jId;
      }
    }
    const macroJoint = s.focusedJointId ?? bestJoint;
    const focusedSoftTissues = macroJoint
      ? mapJointSoftTissueLoads(macroJoint, s.pose, s.loads)
      : [];
    set({
      showJointHandles: true,
      selectedJoint: bestJoint,
      focusedSoftTissues,
    });
  },

  setCalibratedOffsets: (calibratedOffsets) => {
    const s = get();
    const derived = evaluateAll(
      s.pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ calibratedOffsets, ...derived });
  },

  setSelectedJoint: (jointId) => {
    const s = get();
    const macroJoint = s.focusedJointId ?? jointId;
    const focusedSoftTissues = macroJoint
      ? mapJointSoftTissueLoads(macroJoint, s.pose, s.loads)
      : [];
    set({ selectedJoint: jointId, focusedSoftTissues });
  },

  setFocusedJoint: (jointId) => {
    const s = get();
    const macroJoint = jointId ?? s.selectedJoint;
    const focusedSoftTissues = macroJoint
      ? mapJointSoftTissueLoads(macroJoint, s.pose, s.loads)
      : [];
    set({
      focusedJointId: jointId,
      selectedJoint: jointId ?? s.selectedJoint,
      focusedSoftTissues,
    });
  },

  setInteractionMode: (interactionMode) => set({ interactionMode }),

  setSelectedForceId: (selectedForceId) => set({ selectedForceId }),

  setJointAngles: (jointId, patch) => {
    const s = get();
    const cur = s.pose[jointId];
    const limits = getJointSliderLimits(jointId);
    const clampVal = (v: number, [min, max]: [number, number]) =>
      Math.max(min, Math.min(max, v));

    const nextAngles: AnatomicalAngles = {
      flexion: clampVal(patch.flexion ?? cur.flexion, limits.flexion),
      abduction: clampVal(patch.abduction ?? cur.abduction, limits.abduction),
      rotation: clampVal(patch.rotation ?? cur.rotation, limits.rotation),
    };

    const nextPose: PoseMap = {
      ...s.pose,
      [jointId]: nextAngles,
    };
    const derived = evaluateAll(
      nextPose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ pose: nextPose, activePresetId: null, ...derived });
  },

  applyPosePatch: (patch) => {
    const s = get();
    const nextPose: PoseMap = { ...s.pose, ...patch };
    const derived = evaluateAll(
      nextPose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ pose: nextPose, activePresetId: null, ...derived });
  },

  placeForceAtPoint: (targetJoint, worldPoint) => {
    const s = get();
    const j = s.kinematics.joints[targetJoint];
    if (!j) return;

    const dx = j.distalWorldPosition[0] - j.worldPosition[0];
    const dy = j.distalWorldPosition[1] - j.worldPosition[1];
    const dz = j.distalWorldPosition[2] - j.worldPosition[2];
    const lenSq = dx * dx + dy * dy + dz * dz;

    let ratio = 0.5;
    if (lenSq > 1e-6) {
      const px = worldPoint[0] - j.worldPosition[0];
      const py = worldPoint[1] - j.worldPosition[1];
      const pz = worldPoint[2] - j.worldPosition[2];
      ratio = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / lenSq));
    }

    const rx = worldPoint[0] - j.worldPosition[0];
    const rz = worldPoint[2] - j.worldPosition[2];
    const surfaceAngleDeg = Math.round((Math.atan2(rx, rz) * 180) / Math.PI);

    const activeId = s.selectedForceId;
    const hasActive = activeId && s.forces.some((f) => f.id === activeId);

    let nextForces: SpatialForce[];
    let nextSelectedId: string;

    if (hasActive) {
      nextSelectedId = activeId!;
      nextForces = s.forces.map((f) =>
        f.id === activeId
          ? { ...f, targetJoint, positionRatio: ratio, surfaceAngleDeg }
          : f
      );
    } else {
      const sideSign = worldPoint[0] >= 0 ? -1 : 1; // push inward toward midline
      const newForce: SpatialForce = {
        id: `force_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        targetJoint,
        positionRatio: ratio,
        surfaceAngleDeg,
        forceVectorWorld: [sideSign * 196.2, 0, 0],
        scaleNpm: 1000,
        label: '表面施力',
      };
      nextForces = [...s.forces, newForce];
      nextSelectedId = newForce.id;
    }

    const derived = evaluateAll(
      s.pose,
      nextForces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({
      forces: nextForces,
      selectedForceId: nextSelectedId,
      selectedJoint: targetJoint,
      activePresetId: null,
      ...derived,
    });
  },

  setForceVector: (id, vec) => {
    get().updateForce(id, { forceVectorWorld: vec });
  },

  setPose: (pose, preservePreset = false) => {
    const s = get();
    const derived = evaluateAll(
      pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({
      pose,
      activePresetId: preservePreset ? s.activePresetId : null,
      ...derived,
    });
  },

  hydrateSharedState: (payload) => {
    const s = get();
    const nextPose = structuredClone(payload.pose);
    const nextForces = structuredClone(payload.forces);
    const nextDaf = Math.max(1.0, Math.min(3.0, payload.dynamicLoadFactor ?? s.dynamicLoadFactor));
    const nextEffectMode = payload.muscleEffectMode ?? s.muscleEffectMode;
    const nextSubMode = payload.muscleStrainSubMode ?? s.muscleStrainSubMode;
    const nextSelectedForce = nextForces.length > 0 ? nextForces[0].id : null;

    const derived = evaluateAll(
      nextPose,
      nextForces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      nextDaf,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({
      pose: nextPose,
      forces: nextForces,
      dynamicLoadFactor: nextDaf,
      muscleEffectMode: nextEffectMode,
      muscleStrainSubMode: nextSubMode,
      selectedForceId: nextSelectedForce,
      activePresetId: null,
      ...derived,
    });
  },

  applyPreset: (presetId) => {
    const preset = PRESET_POSES.find((p) => p.id === presetId);
    if (!preset) return;
    const s = get();
    const clonedPose = structuredClone(preset.pose);
    const clonedForces = structuredClone(preset.forces);
    const nextFocus = preset.focusJointId ?? null;
    const nextSelected = nextFocus ?? s.selectedJoint ?? 'knee_R';
    const nextMode = preset.interactionMode ?? 'pose';
    const nextSelectedForce = clonedForces.length > 0 ? clonedForces[0].id : null;

    const derived = evaluateAll(
      clonedPose,
      clonedForces,
      s.heightM,
      s.bodyMassKg,
      preset.includeGravity,
      nextFocus,
      nextSelected,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({
      pose: clonedPose,
      forces: clonedForces,
      includeGravity: preset.includeGravity,
      focusedJointId: nextFocus,
      selectedJoint: nextSelected,
      interactionMode: nextMode,
      selectedForceId: nextSelectedForce,
      activePresetId: presetId,
      ...derived,
    });
  },

  resetPose: () => {
    get().applyPreset('neutral_standing');
  },

  setAnthropometry: (heightM, bodyMassKg) => {
    const s = get();
    const clampedH = Math.max(1.2, Math.min(2.2, heightM));
    const clampedM = Math.max(35, Math.min(180, bodyMassKg));
    const derived = evaluateAll(
      s.pose,
      s.forces,
      clampedH,
      clampedM,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ heightM: clampedH, bodyMassKg: clampedM, ...derived });
  },

  setIncludeGravity: (includeGravity) => {
    const s = get();
    const derived = evaluateAll(
      s.pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ includeGravity, ...derived });
  },

  addForce: (force) => {
    const s = get();
    const newForce: SpatialForce = {
      ...force,
      id: `force_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    const nextForces = [...s.forces, newForce];
    const derived = evaluateAll(
      s.pose,
      nextForces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({
      forces: nextForces,
      selectedForceId: newForce.id,
      interactionMode: 'force',
      activePresetId: null,
      ...derived,
    });
  },

  updateForce: (id, patch) => {
    const s = get();
    const nextForces = s.forces.map((f) => (f.id === id ? { ...f, ...patch } : f));
    const derived = evaluateAll(
      s.pose,
      nextForces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ forces: nextForces, activePresetId: null, ...derived });
  },

  invertForce: (id) => {
    const s = get();
    const nextForces = s.forces.map((f) =>
      f.id === id
        ? {
            ...f,
            forceVectorWorld: [
              -f.forceVectorWorld[0],
              -f.forceVectorWorld[1],
              -f.forceVectorWorld[2],
            ] as [number, number, number],
          }
        : f
    );
    const derived = evaluateAll(
      s.pose,
      nextForces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({ forces: nextForces, activePresetId: null, ...derived });
  },

  removeForce: (id) => {
    const s = get();
    const nextForces = s.forces.filter((f) => f.id !== id);
    const nextSelected =
      s.selectedForceId === id ? (nextForces[0]?.id ?? null) : s.selectedForceId;
    const derived = evaluateAll(
      s.pose,
      nextForces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint,
      s.calibratedOffsets,
      s.dynamicLoadFactor,
      s.sexProfile,
      s.romToleranceBoost
    );
    set({
      forces: nextForces,
      selectedForceId: nextSelected,
      activePresetId: null,
      ...derived,
    });
  },

  toggleLayer: (layer) =>
    set((s) => ({
      layers: {
        ...s.layers,
        [layer]: !s.layers[layer],
      },
    })),

  setIsDraggingGizmo: (isDraggingGizmo) => set({ isDraggingGizmo }),
}));

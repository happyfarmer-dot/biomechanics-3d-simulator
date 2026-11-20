import { create } from 'zustand';
import { PRESET_POSES } from '../data/presetPoses';
import {
  createNeutralPose,
  DEFAULT_HEIGHT_M,
  DEFAULT_MASS_KG,
} from '../data/skeletonConfig';
import { computeKinematics } from '../engine/kinematics';
import { mapJointSoftTissueLoads } from '../engine/ligamentLoadMapper';
import { evaluateMuscles } from '../engine/muscleEvaluator';
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
} from '../types/biomechanics';

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
  activePresetId: string | null;

  // Derived simulation outputs
  kinematics: KinematicsResult;
  muscles: MuscleState[];
  loads: Record<JointId, JointLoadResult>;
  alerts: InjuryAlert[];
  jointRiskMap: Record<JointId, RiskSeverity>;
  focusedSoftTissues: SoftTissueLoad[];

  // Actions
  setSelectedJoint: (jointId: JointId | null) => void;
  setFocusedJoint: (jointId: JointId | null) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setSelectedForceId: (id: string | null) => void;
  setJointAngles: (jointId: JointId, angles: Partial<AnatomicalAngles>) => void;
  setPose: (pose: PoseMap) => void;
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
  selectedJoint: JointId | null
) {
  const kinematics = computeKinematics(pose, heightM);
  const muscles = evaluateMuscles(kinematics, heightM);
  const loads = computeStatics(kinematics, forces, { includeGravity, bodyMassKg, heightM });
  const alerts = evaluateAllInjuries(pose, loads);
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
  'knee_R'
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
    skin: true,
    skeleton: true,
    muscles: true,
    macroLigaments: true,
    jointCapsule: true,
    spatialComponents: true,
    axesDebug: false,
  },
  isDraggingGizmo: false,
  activePresetId: 'neutral_standing',
  ...initialDerived,

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
    const nextPose: PoseMap = {
      ...s.pose,
      [jointId]: {
        ...s.pose[jointId],
        ...patch,
      },
    };
    const derived = evaluateAll(
      nextPose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint
    );
    set({ pose: nextPose, activePresetId: null, ...derived });
  },

  setPose: (pose) => {
    const s = get();
    const derived = evaluateAll(
      pose,
      s.forces,
      s.heightM,
      s.bodyMassKg,
      s.includeGravity,
      s.focusedJointId,
      s.selectedJoint
    );
    set({ pose, activePresetId: null, ...derived });
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
      nextSelected
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
      s.selectedJoint
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
      s.selectedJoint
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
      s.selectedJoint
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
      s.selectedJoint
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
      s.selectedJoint
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
      s.selectedJoint
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

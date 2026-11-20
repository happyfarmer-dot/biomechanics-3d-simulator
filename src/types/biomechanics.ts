export type JointId =
  | 'pelvis'
  | 'lumbar'
  | 'thorax'
  | 'neck'
  | 'head'
  | 'shoulder_L'
  | 'elbow_L'
  | 'wrist_L'
  | 'shoulder_R'
  | 'elbow_R'
  | 'wrist_R'
  | 'hip_L'
  | 'knee_L'
  | 'ankle_L'
  | 'hip_R'
  | 'knee_R'
  | 'ankle_R';

export type InteractionMode = 'pose' | 'force';

export interface AnatomicalAngles {
  flexion: number;
  abduction: number;
  rotation: number;
}

export type PoseMap = Record<JointId, AnatomicalAngles>;

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]

export type EulerOrder = 'ZXY' | 'XYZ' | 'YXZ';

export interface LocalEuler {
  x: number;
  y: number;
  z: number;
  order: EulerOrder;
}

export interface JointConfig {
  id: JointId;
  nameZh: string;
  parentId: JointId | null;
  offsetRatio: Vec3;
  distalRatio: Vec3;
  massRatio: number;
  comRatio: number;
  boneRadius: number;
  romLimits: {
    flexion: [number, number];
    abduction: [number, number];
    rotation: [number, number];
  };
}

export interface JointWorldState {
  id: JointId;
  parentId: JointId | null;
  worldPosition: Vec3;
  worldQuaternion: Quat;
  localEuler: LocalEuler;
  distalWorldPosition: Vec3;
  comWorldPosition: Vec3;
}

export interface KinematicsResult {
  joints: Record<JointId, JointWorldState>;
}

export interface MuscleAttachment {
  jointId: JointId;
  localOffset: Vec3;
}

export interface MuscleDefinition {
  id: string;
  groupId: string;
  name: string;
  nameZh: string;
  side: 'L' | 'R' | 'C';
  origin: MuscleAttachment;
  viaPoints: MuscleAttachment[];
  insertion: MuscleAttachment;
}

export interface MuscleState {
  id: string;
  groupId: string;
  name: string;
  nameZh: string;
  side: 'L' | 'R' | 'C';
  restLength: number;
  currentLength: number;
  strain: number;
  status: 'normal' | 'warning' | 'critical';
  pointsWorld: Vec3[];
}

export type ForceScaleNpm = 500 | 1000 | 2000;

export interface SpatialForce {
  id: string;
  targetJoint: JointId;
  /** Position along the bone segment from joint origin (0) to distal end (1) */
  positionRatio: number;
  /** Optional azimuth around the bone surface in degrees (0 = +Z front, 90 = +X left, -90 = -X right). If omitted, applies at bone centerline. */
  surfaceAngleDeg?: number;
  /** Force vector in world coordinates (N), computed as scaleNpm * (P_tip - P_app) */
  forceVectorWorld: Vec3;
  /** Visual vector scale in N/m (default 1000) */
  scaleNpm: ForceScaleNpm;
  label?: string;
}

export interface JointLoadResult {
  jointId: JointId;
  worldForce: Vec3;
  worldTorque: Vec3;
  localForce: Vec3;
  localTorque: Vec3;
  axialForceN: number;
  shearForceN: number;
  apShearN: number;
  mlShearN: number;
  bendingMomentNm: number;
  sagittalMomentNm: number;
  coronalMomentNm: number;
  torsionMomentNm: number;
  lumbarEstimatedCompressionN?: number;
}

export type RiskSeverity = 'normal' | 'warning' | 'critical';

export interface SoftTissueDef {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  /** Local attachment start/end relative to joint (for procedural 3D LOD rendering) */
  localStart: Vec3;
  localEnd: Vec3;
  radius: number;
  shape: 'ligament' | 'disc' | 'capsule' | 'meniscus';
}

export interface SoftTissueLoad {
  id: string;
  jointId: JointId;
  name: string;
  nameZh: string;
  /** Normalized load ratio: 0 = unloaded, 0.65~0.99 = warning, >= 1.0 = critical */
  loadRatio: number;
  status: RiskSeverity;
  mechanism: string;
}

export interface InjuryAlert {
  id: string;
  category: 'rom' | 'composite' | 'force';
  jointId: JointId;
  severity: 'warning' | 'critical';
  title: string;
  tissue: string;
  mechanism: string;
  recommendation: string;
  valueText?: string;
}

export interface PresetPose {
  id: string;
  name: string;
  description: string;
  pose: PoseMap;
  forces: SpatialForce[];
  includeGravity: boolean;
  focusJointId?: JointId | null;
  interactionMode?: InteractionMode;
}

export interface LayerVisibility {
  skin: boolean;
  skeleton: boolean;
  muscles: boolean;
  macroLigaments: boolean;
  spatialComponents: boolean;
  axesDebug: boolean;
}

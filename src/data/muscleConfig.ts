import type { JointId, MuscleDefinition, Vec3 } from '../types/biomechanics';

function mirrorSide(side: 'L' | 'R', jointBase: string): JointId {
  return `${jointBase}_${side}` as JointId;
}

function mirrorVec(side: 'L' | 'R', v: Vec3): Vec3 {
  return [side === 'L' ? v[0] : -v[0], v[1], v[2]];
}

function createBilateralMuscle(
  groupId: string,
  name: string,
  nameZh: string,
  build: (side: 'L' | 'R') => Omit<MuscleDefinition, 'id' | 'groupId' | 'name' | 'nameZh' | 'side'>
): MuscleDefinition[] {
  return (['L', 'R'] as const).map((side) => ({
    id: `${groupId}_${side}`,
    groupId,
    name: `${name} (${side})`,
    nameZh: `${side === 'L' ? '左' : '右'}${nameZh}`,
    side,
    ...build(side),
  }));
}

/**
 * 10 bilateral key muscle groups (20 muscle strands) with anatomical attachment points
 * and viaPoints around major joints to prevent bone penetration during large ROM.
 * Coordinates are in meters at reference height = 1.75 m.
 */
export const MUSCLE_CONFIG: MuscleDefinition[] = [
  // 1. Supraspinatus (棘上肌)
  ...createBilateralMuscle('supraspinatus', 'Supraspinatus', '棘上肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.10, 0.21, -0.04]) },
    viaPoints: [
      { jointId: 'thorax', localOffset: mirrorVec(side, [0.18, 0.20, 0.0]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.035, -0.02, 0.01]) },
  })),

  // 2. Middle Deltoid (三角肌中束)
  ...createBilateralMuscle('deltoid_mid', 'Middle Deltoid', '三角肌中束', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.19, 0.19, 0.0]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.045, -0.03, 0.0]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.025, -0.14, 0.0]) },
  })),

  // 3. Pectoralis Major (胸大肌)
  ...createBilateralMuscle('pectoralis_major', 'Pectoralis Major', '胸大肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.03, 0.12, 0.085]) },
    viaPoints: [
      { jointId: 'thorax', localOffset: mirrorVec(side, [0.13, 0.14, 0.065]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.01, -0.07, 0.03]) },
  })),

  // 4. Biceps Brachii (肱二頭肌)
  ...createBilateralMuscle('biceps_brachii', 'Biceps Brachii', '肱二頭肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, 0.01, 0.03]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, -0.16, 0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.0, -0.05, 0.025]) },
  })),

  // 5. Triceps Brachii (肱三頭肌)
  ...createBilateralMuscle('triceps_brachii', 'Triceps Brachii', '肱三頭肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, -0.04, -0.032]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.0, 0.02, -0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.0, -0.04, -0.028]) },
  })),

  // 6. Erector Spinae (豎脊肌)
  ...createBilateralMuscle('erector_spinae', 'Erector Spinae', '豎脊肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.04, 0.02, -0.065]) },
    viaPoints: [
      { jointId: 'lumbar', localOffset: mirrorVec(side, [0.035, 0.08, -0.065]) },
    ],
    insertion: { jointId: 'thorax', localOffset: mirrorVec(side, [0.035, 0.14, -0.065]) },
  })),

  // 7. Rectus Femoris (股直肌)
  ...createBilateralMuscle('rectus_femoris', 'Rectus Femoris', '股直肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.085, 0.01, 0.055]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.0, -0.20, 0.052]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, 0.01, 0.048]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, -0.06, 0.035]) },
  })),

  // 8. Hamstrings (膕繩肌)
  ...createBilateralMuscle('hamstrings', 'Hamstrings', '膕繩肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.075, -0.05, -0.055]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.0, -0.22, -0.052]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, 0.01, -0.045]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, -0.07, -0.032]) },
  })),

  // 9. Gluteus Medius (臀中肌)
  ...createBilateralMuscle('gluteus_medius', 'Gluteus Medius', '臀中肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.115, 0.05, -0.02]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.06, 0.01, -0.01]) },
    ],
    insertion: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.045, -0.08, 0.0]) },
  })),

  // 10. Gastrocnemius (腓腸肌)
  ...createBilateralMuscle('gastrocnemius', 'Gastrocnemius', '腓腸肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.0, -0.39, -0.038]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, -0.14, -0.048]) },
      { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [0.0, 0.02, -0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [0.0, -0.03, -0.04]) },
  })),
];

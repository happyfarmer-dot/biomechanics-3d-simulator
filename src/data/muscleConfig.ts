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
 * Peak mid-belly radius (in meters at height = 1.75m) for each muscle group.
 */
export const MUSCLE_BELLY_RADIUS: Record<string, number> = {
  deltoid_ant: 0.024,
  deltoid_mid: 0.028,
  deltoid_post: 0.024,
  supraspinatus: 0.015,
  pectoralis_major: 0.034,
  latissimus_dorsi: 0.032,
  biceps_brachii: 0.026,
  triceps_brachii: 0.027,
  forearm_flexors: 0.021,
  forearm_extensors: 0.019,
  rectus_abdominis: 0.024,
  external_oblique: 0.026,
  erector_spinae: 0.024,
  gluteus_maximus: 0.044,
  gluteus_medius: 0.032,
  rectus_femoris: 0.03,
  vastus_lateralis: 0.033,
  vastus_medialis: 0.029,
  biceps_femoris: 0.028,
  semitendinosus: 0.026,
  gastrocnemius_lat: 0.024,
  gastrocnemius_med: 0.025,
  soleus: 0.027,
};

/**
 * 23 bilateral 3D muscle groups (46 fusiform muscle bellies) with viaPoints
 * to wrap cleanly around joints without bone penetration.
 */
export const MUSCLE_CONFIG: MuscleDefinition[] = [
  // 1. Anterior Deltoid (前三角肌)
  ...createBilateralMuscle('deltoid_ant', 'Anterior Deltoid', '前三角肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.13, 0.21, 0.055]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.025, -0.02, 0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.022, -0.13, 0.012]) },
  })),

  // 2. Middle Deltoid (中三角肌)
  ...createBilateralMuscle('deltoid_mid', 'Middle Deltoid', '中三角肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.19, 0.20, 0.0]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.048, -0.025, 0.0]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.026, -0.145, 0.0]) },
  })),

  // 3. Posterior Deltoid (後三角肌)
  ...createBilateralMuscle('deltoid_post', 'Posterior Deltoid', '後三角肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.13, 0.20, -0.065]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.025, -0.02, -0.042]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.022, -0.13, -0.014]) },
  })),

  // 4. Supraspinatus (棘上肌)
  ...createBilateralMuscle('supraspinatus', 'Supraspinatus', '棘上肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.08, 0.215, -0.045]) },
    viaPoints: [
      { jointId: 'thorax', localOffset: mirrorVec(side, [0.175, 0.20, -0.005]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.035, -0.015, 0.008]) },
  })),

  // 5. Pectoralis Major (胸大肌)
  ...createBilateralMuscle('pectoralis_major', 'Pectoralis Major', '胸大肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.025, 0.11, 0.088]) },
    viaPoints: [
      { jointId: 'thorax', localOffset: mirrorVec(side, [0.115, 0.145, 0.072]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.012, -0.075, 0.03]) },
  })),

  // 6. Latissimus Dorsi (背闊肌)
  ...createBilateralMuscle('latissimus_dorsi', 'Latissimus Dorsi', '背闊肌', (side) => ({
    origin: { jointId: 'lumbar', localOffset: mirrorVec(side, [0.04, 0.04, -0.065]) },
    viaPoints: [
      { jointId: 'thorax', localOffset: mirrorVec(side, [0.115, 0.06, -0.075]) },
    ],
    insertion: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [-0.008, -0.075, -0.015]) },
  })),

  // 7. Biceps Brachii (肱二頭肌)
  ...createBilateralMuscle('biceps_brachii', 'Biceps Brachii', '肱二頭肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, 0.01, 0.03]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, -0.155, 0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.0, -0.05, 0.024]) },
  })),

  // 8. Triceps Brachii (肱三頭肌)
  ...createBilateralMuscle('triceps_brachii', 'Triceps Brachii', '肱三頭肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, -0.035, -0.032]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'shoulder'), localOffset: mirrorVec(side, [0.0, -0.17, -0.038]) },
      { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.0, 0.015, -0.036]) },
    ],
    insertion: { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.0, -0.035, -0.026]) },
  })),

  // 9. Forearm Flexors (前臂屈肌群)
  ...createBilateralMuscle('forearm_flexors', 'Forearm Flexors', '前臂屈肌群', (side) => ({
    origin: { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [-0.018, 0.0, 0.02]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [-0.01, -0.13, 0.028]) },
    ],
    insertion: { jointId: mirrorSide(side, 'wrist'), localOffset: mirrorVec(side, [0.0, -0.02, 0.018]) },
  })),

  // 10. Forearm Extensors (前臂伸肌群)
  ...createBilateralMuscle('forearm_extensors', 'Forearm Extensors', '前臂伸肌群', (side) => ({
    origin: { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.018, 0.0, -0.02]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'elbow'), localOffset: mirrorVec(side, [0.01, -0.13, -0.026]) },
    ],
    insertion: { jointId: mirrorSide(side, 'wrist'), localOffset: mirrorVec(side, [0.0, -0.02, -0.018]) },
  })),

  // 11. Rectus Abdominis (腹直肌)
  ...createBilateralMuscle('rectus_abdominis', 'Rectus Abdominis', '腹直肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.035, -0.01, 0.078]) },
    viaPoints: [
      { jointId: 'lumbar', localOffset: mirrorVec(side, [0.035, 0.06, 0.088]) },
    ],
    insertion: { jointId: 'thorax', localOffset: mirrorVec(side, [0.04, 0.03, 0.09]) },
  })),

  // 12. External Oblique (腹外斜肌)
  ...createBilateralMuscle('external_oblique', 'External Oblique', '腹外斜肌', (side) => ({
    origin: { jointId: 'thorax', localOffset: mirrorVec(side, [0.125, 0.04, 0.035]) },
    viaPoints: [
      { jointId: 'lumbar', localOffset: mirrorVec(side, [0.11, 0.04, 0.05]) },
    ],
    insertion: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.105, 0.02, 0.045]) },
  })),

  // 13. Erector Spinae (豎脊肌)
  ...createBilateralMuscle('erector_spinae', 'Erector Spinae', '豎脊肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.038, 0.02, -0.065]) },
    viaPoints: [
      { jointId: 'lumbar', localOffset: mirrorVec(side, [0.036, 0.08, -0.068]) },
    ],
    insertion: { jointId: 'thorax', localOffset: mirrorVec(side, [0.036, 0.14, -0.068]) },
  })),

  // 14. Gluteus Maximus (臀大肌)
  ...createBilateralMuscle('gluteus_maximus', 'Gluteus Maximus', '臀大肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.045, 0.03, -0.075]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.02, -0.02, -0.068]) },
    ],
    insertion: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.038, -0.14, -0.035]) },
  })),

  // 15. Gluteus Medius (臀中肌)
  ...createBilateralMuscle('gluteus_medius', 'Gluteus Medius', '臀中肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.115, 0.045, -0.015]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.058, 0.01, -0.01]) },
    ],
    insertion: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.045, -0.085, 0.0]) },
  })),

  // 16. Rectus Femoris (股直肌)
  ...createBilateralMuscle('rectus_femoris', 'Rectus Femoris', '股直肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.085, 0.005, 0.055]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.0, -0.20, 0.054]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, 0.01, 0.05]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, -0.06, 0.036]) },
  })),

  // 17. Vastus Lateralis (股外側肌)
  ...createBilateralMuscle('vastus_lateralis', 'Vastus Lateralis', '股外側肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.042, -0.06, 0.02]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.045, -0.22, 0.035]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.022, 0.01, 0.045]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.01, -0.055, 0.036]) },
  })),

  // 18. Vastus Medialis (股內側肌)
  ...createBilateralMuscle('vastus_medialis', 'Vastus Medialis', '股內側肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [-0.025, -0.10, 0.025]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [-0.035, -0.28, 0.038]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [-0.02, 0.01, 0.044]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [-0.01, -0.055, 0.036]) },
  })),

  // 19. Biceps Femoris (股二頭肌)
  ...createBilateralMuscle('biceps_femoris', 'Biceps Femoris', '股二頭肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.075, -0.05, -0.055]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.028, -0.22, -0.052]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.03, 0.01, -0.042]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.03, -0.065, -0.028]) },
  })),

  // 20. Semitendinosus (半腱肌)
  ...createBilateralMuscle('semitendinosus', 'Semitendinosus', '半腱肌', (side) => ({
    origin: { jointId: 'pelvis', localOffset: mirrorVec(side, [0.065, -0.05, -0.055]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [-0.025, -0.22, -0.052]) },
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [-0.026, 0.01, -0.042]) },
    ],
    insertion: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [-0.026, -0.07, -0.026]) },
  })),

  // 21. Gastrocnemius Lateral Head (腓腸肌外側頭)
  ...createBilateralMuscle('gastrocnemius_lat', 'Gastrocnemius Lateral', '腓腸肌外側頭', (side) => ({
    origin: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [0.024, -0.39, -0.036]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.022, -0.14, -0.052]) },
      { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [0.005, 0.02, -0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [0.0, -0.03, -0.042]) },
  })),

  // 22. Gastrocnemius Medial Head (腓腸肌內側頭)
  ...createBilateralMuscle('gastrocnemius_med', 'Gastrocnemius Medial', '腓腸肌內側頭', (side) => ({
    origin: { jointId: mirrorSide(side, 'hip'), localOffset: mirrorVec(side, [-0.024, -0.39, -0.036]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [-0.022, -0.14, -0.052]) },
      { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [-0.005, 0.02, -0.038]) },
    ],
    insertion: { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [0.0, -0.03, -0.042]) },
  })),

  // 23. Soleus (比目魚肌)
  ...createBilateralMuscle('soleus', 'Soleus', '比目魚肌', (side) => ({
    origin: { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, -0.11, -0.035]) },
    viaPoints: [
      { jointId: mirrorSide(side, 'knee'), localOffset: mirrorVec(side, [0.0, -0.25, -0.044]) },
    ],
    insertion: { jointId: mirrorSide(side, 'ankle'), localOffset: mirrorVec(side, [0.0, -0.03, -0.042]) },
  })),
];

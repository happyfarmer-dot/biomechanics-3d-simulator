import type { JointId, SoftTissueDef } from '../types/biomechanics';

function buildKneeTissues(side: 'L' | 'R'): SoftTissueDef[] {
  // For right knee (-X side of body): medial is +X, lateral is -X
  // For left knee (+X side of body): medial is -X, lateral is +X
  const medX = side === 'R' ? 0.032 : -0.032;
  const latX = -medX;

  return [
    {
      id: 'ACL',
      name: 'Anterior Cruciate Ligament',
      nameZh: '前十字韌帶 (ACL)',
      description: '限制脛骨前移、膝外翻與過度內外旋',
      localStart: [latX * 0.35, 0.024, -0.014],
      localEnd: [medX * 0.2, -0.024, 0.016],
      radius: 0.0045,
      shape: 'ligament',
    },
    {
      id: 'PCL',
      name: 'Posterior Cruciate Ligament',
      nameZh: '後十字韌帶 (PCL)',
      description: '限制脛骨向後移位',
      localStart: [medX * 0.3, 0.024, 0.014],
      localEnd: [latX * 0.15, -0.024, -0.016],
      radius: 0.005,
      shape: 'ligament',
    },
    {
      id: 'MCL',
      name: 'Medial Collateral Ligament',
      nameZh: '內側副韌帶 (MCL)',
      description: '抵抗膝外翻（Valgus）應力',
      localStart: [medX, 0.035, 0],
      localEnd: [medX, -0.04, 0],
      radius: 0.005,
      shape: 'ligament',
    },
    {
      id: 'LCL',
      name: 'Lateral Collateral Ligament',
      nameZh: '外側副韌帶 (LCL)',
      description: '抵抗膝內翻（Varus）應力',
      localStart: [latX, 0.034, -0.004],
      localEnd: [latX, -0.038, -0.006],
      radius: 0.0045,
      shape: 'ligament',
    },
    {
      id: 'medial_meniscus',
      name: 'Medial Meniscus',
      nameZh: '內側半月板',
      description: '緩衝內側脛股關節壓縮與剪力',
      localStart: [medX * 0.55, -0.004, 0],
      localEnd: [medX * 0.55, 0.004, 0],
      radius: 0.015,
      shape: 'meniscus',
    },
    {
      id: 'lateral_meniscus',
      name: 'Lateral Meniscus',
      nameZh: '外側半月板',
      description: '緩衝外側脛股關節壓縮與剪力',
      localStart: [latX * 0.55, -0.004, 0],
      localEnd: [latX * 0.55, 0.004, 0],
      radius: 0.015,
      shape: 'meniscus',
    },
  ];
}

function buildShoulderTissues(side: 'L' | 'R'): SoftTissueDef[] {
  const latX = side === 'L' ? 0.032 : -0.032;
  const medX = -latX;
  return [
    {
      id: 'supraspinatus_tendon',
      name: 'Supraspinatus Tendon',
      nameZh: '棘上肌肌腱',
      description: '肩外展啟動與肱骨頭上壓穩定',
      localStart: [medX * 0.7, 0.025, 0],
      localEnd: [latX * 0.9, 0.006, 0.005],
      radius: 0.006,
      shape: 'ligament',
    },
    {
      id: 'acromion',
      name: 'Subacromial Arch',
      nameZh: '肩峰下間隙',
      description: '外展 > 90° 合併內旋時易夾擠棘上肌腱',
      localStart: [medX * 0.3, 0.042, -0.01],
      localEnd: [latX * 1.1, 0.038, 0.012],
      radius: 0.009,
      shape: 'disc',
    },
    {
      id: 'anterior_capsule',
      name: 'Anterior Capsule / Labrum',
      nameZh: '前關節囊 / 前盂唇',
      description: '外展外旋合併水平伸展時承受前向推擠張力',
      localStart: [medX * 0.4, 0.0, 0.028],
      localEnd: [latX * 0.5, -0.012, 0.026],
      radius: 0.012,
      shape: 'capsule',
    },
  ];
}

function buildLumbarTissues(): SoftTissueDef[] {
  return [
    {
      id: 'intervertebral_disc',
      name: 'L4-L5 / L5-S1 Disc',
      nameZh: '腰椎間盤髓核',
      description: '承受軸向壓縮負荷 (NIOSH 基準 3400 N)',
      localStart: [0, -0.014, 0],
      localEnd: [0, 0.014, 0],
      radius: 0.034,
      shape: 'disc',
    },
    {
      id: 'posterolateral_annulus',
      name: 'Posterolateral Annulus Fibrosus',
      nameZh: '後外側纖維環',
      description: '腰椎屈曲合併軸向旋轉與剪力時最易突出撕裂',
      localStart: [-0.022, -0.012, -0.028],
      localEnd: [0.022, 0.012, -0.028],
      radius: 0.008,
      shape: 'ligament',
    },
  ];
}

function buildElbowTissues(side: 'L' | 'R'): SoftTissueDef[] {
  const medX = side === 'R' ? 0.024 : -0.024;
  const latX = -medX;
  return [
    {
      id: 'UCL',
      name: 'Ulnar Collateral Ligament',
      nameZh: '尺側副韌帶 (UCL)',
      description: '抵抗肘外翻應力',
      localStart: [medX, 0.025, 0],
      localEnd: [medX, -0.028, 0],
      radius: 0.004,
      shape: 'ligament',
    },
    {
      id: 'RCL',
      name: 'Radial Collateral Ligament',
      nameZh: '橈側副韌帶 (RCL)',
      description: '抵抗肘內翻應力',
      localStart: [latX, 0.025, 0],
      localEnd: [latX, -0.028, 0],
      radius: 0.004,
      shape: 'ligament',
    },
  ];
}

function buildAnkleTissues(side: 'L' | 'R'): SoftTissueDef[] {
  const medX = side === 'R' ? 0.024 : -0.024;
  const latX = -medX;
  return [
    {
      id: 'ATFL',
      name: 'Anterior Talofibular Ligament',
      nameZh: '前距腓韌帶 (ATFL)',
      description: '踝內翻扭傷時最常受損之外側韌帶',
      localStart: [latX, 0.018, -0.006],
      localEnd: [latX * 0.7, -0.015, 0.024],
      radius: 0.004,
      shape: 'ligament',
    },
    {
      id: 'deltoid_ligament',
      name: 'Deltoid Ligament',
      nameZh: '內側三角韌帶',
      description: '抵抗踝關節外翻應力',
      localStart: [medX, 0.02, 0],
      localEnd: [medX * 0.85, -0.02, 0.006],
      radius: 0.005,
      shape: 'ligament',
    },
  ];
}

export const JOINT_MACRO_ANATOMY: Partial<Record<JointId, SoftTissueDef[]>> = {
  knee_L: buildKneeTissues('L'),
  knee_R: buildKneeTissues('R'),
  shoulder_L: buildShoulderTissues('L'),
  shoulder_R: buildShoulderTissues('R'),
  lumbar: buildLumbarTissues(),
  elbow_L: buildElbowTissues('L'),
  elbow_R: buildElbowTissues('R'),
  ankle_L: buildAnkleTissues('L'),
  ankle_R: buildAnkleTissues('R'),
};

export function isMacroCoreJoint(jointId: JointId): boolean {
  return Boolean(JOINT_MACRO_ANATOMY[jointId]);
}

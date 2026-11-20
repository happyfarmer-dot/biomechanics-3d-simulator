import { getKneeValgusMomentNm } from '../data/injuryRules';
import { JOINT_MACRO_ANATOMY } from '../data/jointMacroAnatomy';
import type {
  AnatomicalAngles,
  JointId,
  JointLoadResult,
  PoseMap,
  RiskSeverity,
  SoftTissueLoad,
} from '../types/biomechanics';

function toSeverity(ratio: number): RiskSeverity {
  if (ratio >= 1.0) return 'critical';
  if (ratio >= 0.6) return 'warning';
  return 'normal';
}

function computeTissueRatio(
  jointId: JointId,
  tissueId: string,
  angles: AnatomicalAngles,
  load: JointLoadResult
): { ratio: number; mechanism: string } {
  if (jointId === 'knee_L' || jointId === 'knee_R') {
    const valgus = getKneeValgusMomentNm(jointId, load.coronalMomentNm);
    const varus = -valgus;
    const isDynamicValgus =
      angles.flexion >= 15 &&
      angles.flexion <= 60 &&
      angles.abduction > 10 &&
      angles.rotation < -10;

    switch (tissueId) {
      case 'MCL': {
        const r = Math.max(valgus / 45, isDynamicValgus ? 1.05 : 0);
        return {
          ratio: Math.max(0, r),
          mechanism:
            valgus > 0
              ? `外翻彎矩 ${valgus.toFixed(1)} N·m 撐開內側關節間隙`
              : '內側處於卸載/壓縮狀態',
        };
      }
      case 'LCL': {
        const r = varus / 45;
        return {
          ratio: Math.max(0, r),
          mechanism:
            varus > 0
              ? `內翻彎矩 ${varus.toFixed(1)} N·m 撐開外側關節間隙`
              : '外側處於卸載/壓縮狀態',
        };
      }
      case 'ACL': {
        const shearRatio = Math.max(0, load.apShearN) / 300;
        const valgusRatio = Math.max(0, valgus) / 45;
        const hyperExt = angles.flexion < -5 ? 1.05 : 0;
        const r = Math.max(shearRatio, valgusRatio, isDynamicValgus ? 1.1 : 0, hyperExt);
        return {
          ratio: r,
          mechanism:
            valgus > 20
              ? `外翻彎矩 (${valgus.toFixed(1)} N·m) 與前向剪力共同牽拉 ACL`
              : `前向剪力 ${Math.max(0, load.apShearN).toFixed(0)} N`,
        };
      }
      case 'PCL': {
        const r = Math.max(0, -load.apShearN) / 300;
        return {
          ratio: r,
          mechanism: `後向剪力 ${Math.max(0, -load.apShearN).toFixed(0)} N`,
        };
      }
      case 'lateral_meniscus': {
        const r = Math.max(0, valgus) / 60;
        return {
          ratio: r,
          mechanism: valgus > 0 ? '外翻力矩導致外側脛股關節壓縮負荷升高' : '正常緩衝',
        };
      }
      case 'medial_meniscus': {
        const r = Math.max(0, varus) / 60;
        return {
          ratio: r,
          mechanism: varus > 0 ? '內翻力矩導致內側脛股關節壓縮負荷升高' : '正常緩衝',
        };
      }
    }
  }

  if (jointId === 'shoulder_L' || jointId === 'shoulder_R') {
    const isImpinged = angles.abduction > 90 && angles.rotation > 45;
    const isAnteriorInstab =
      angles.abduction > 90 && angles.rotation < -85 && angles.flexion < -15;
    const isLargeAngle = angles.abduction > 60 || angles.flexion > 60;

    switch (tissueId) {
      case 'supraspinatus_tendon': {
        const momentRatio = isLargeAngle ? load.bendingMomentNm / 50 : load.bendingMomentNm / 80;
        const r = Math.max(momentRatio, isImpinged ? 1.15 : 0);
        return {
          ratio: r,
          mechanism: isImpinged
            ? '外展 > 90° 且內旋 > 45° 夾擠棘上肌腱'
            : `肩關節彎矩 ${load.bendingMomentNm.toFixed(1)} N·m`,
        };
      }
      case 'acromion': {
        const r = isImpinged ? 1.2 : Math.max(0, angles.abduction / 135);
        return {
          ratio: r,
          mechanism: isImpinged ? '肱骨大結節撞擊肩峰下間隙' : '肩峰下空間正常',
        };
      }
      case 'anterior_capsule': {
        const r = isAnteriorInstab ? 1.2 : Math.max(0, -load.apShearN) / 250;
        return {
          ratio: r,
          mechanism: isAnteriorInstab ? '外展外旋水平伸展推擠前關節囊' : '前關節囊穩定',
        };
      }
    }
  }

  if (jointId === 'lumbar') {
    const comp = load.lumbarEstimatedCompressionN ?? load.axialForceN;
    const isHivd = angles.flexion > 35 && Math.abs(angles.rotation) > 12;
    switch (tissueId) {
      case 'intervertebral_disc':
        return {
          ratio: comp / 3400,
          mechanism: `估算壓縮力 ${Math.round(comp)} N (NIOSH 基準 3400 N)`,
        };
      case 'posterolateral_annulus': {
        const r = Math.max(load.shearForceN / 500, isHivd ? 1.15 : 0);
        return {
          ratio: r,
          mechanism: isHivd
            ? '腰椎屈曲 > 35° 合併軸向旋轉 > 12° 擠壓後外側纖維環'
            : `水平剪力 ${Math.round(load.shearForceN)} N`,
        };
      }
    }
  }

  if (jointId === 'elbow_L' || jointId === 'elbow_R') {
    const valgus = jointId === 'elbow_R' ? load.coronalMomentNm : -load.coronalMomentNm;
    if (tissueId === 'UCL') {
      return {
        ratio: Math.max(0, valgus) / 35,
        mechanism: valgus > 0 ? `肘外翻力矩 ${valgus.toFixed(1)} N·m` : '正常',
      };
    }
    if (tissueId === 'RCL') {
      return {
        ratio: Math.max(0, -valgus) / 35,
        mechanism: valgus < 0 ? `肘內翻力矩 ${Math.abs(valgus).toFixed(1)} N·m` : '正常',
      };
    }
  }

  if (jointId === 'ankle_L' || jointId === 'ankle_R') {
    const inversion = jointId === 'ankle_R' ? -load.coronalMomentNm : load.coronalMomentNm;
    if (tissueId === 'ATFL') {
      return {
        ratio: Math.max(Math.max(0, inversion) / 30, Math.max(0, -angles.abduction) / 25),
        mechanism: '踝內翻力矩或內翻角度牽拉 ATFL',
      };
    }
    if (tissueId === 'deltoid_ligament') {
      return {
        ratio: Math.max(Math.max(0, -inversion) / 35, Math.max(0, angles.abduction) / 25),
        mechanism: '踝外翻力矩牽拉三角韌帶',
      };
    }
  }

  return { ratio: 0, mechanism: '正常' };
}

export function mapJointSoftTissueLoads(
  jointId: JointId,
  pose: PoseMap,
  loads: Record<JointId, JointLoadResult>
): SoftTissueLoad[] {
  const defs = JOINT_MACRO_ANATOMY[jointId];
  if (!defs) return [];
  const angles = pose[jointId];
  const load = loads[jointId];

  return defs.map((def) => {
    const { ratio, mechanism } = computeTissueRatio(jointId, def.id, angles, load);
    return {
      id: def.id,
      jointId,
      name: def.name,
      nameZh: def.nameZh,
      loadRatio: ratio,
      status: toSeverity(ratio),
      mechanism,
    };
  });
}

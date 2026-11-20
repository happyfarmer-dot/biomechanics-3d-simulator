import {
  COMPOSITE_POSTURE_RULES,
  FORCE_OVERLOAD_RULES,
} from '../data/injuryRules';
import { JOINT_ORDER, SKELETON_CONFIG } from '../data/skeletonConfig';
import type {
  AnatomicalAngles,
  InjuryAlert,
  JointId,
  JointLoadResult,
  PoseMap,
  RiskSeverity,
} from '../types/biomechanics';

const AXIS_LABELS: Record<keyof AnatomicalAngles, string> = {
  flexion: '屈曲/伸展',
  abduction: '外展/內收',
  rotation: '軸向旋轉',
};

export function evaluateSingleAxisRom(pose: PoseMap): InjuryAlert[] {
  const alerts: InjuryAlert[] = [];

  for (const jointId of JOINT_ORDER) {
    const cfg = SKELETON_CONFIG[jointId];
    const angles = pose[jointId];
    if (!angles) continue;

    for (const axis of ['flexion', 'abduction', 'rotation'] as const) {
      const val = angles[axis];
      const [min, max] = cfg.romLimits[axis];

      if (val < min || val > max) {
        alerts.push({
          id: `rom_critical_${jointId}_${axis}`,
          category: 'rom',
          jointId,
          severity: 'critical',
          title: `${cfg.nameZh} ${AXIS_LABELS[axis]} 超出安全活動度`,
          tissue: '關節囊、韌帶與關節軟骨',
          mechanism: `當前角度 ${val.toFixed(1)}° 超出安全範圍 [${min}°, ${max}°]，可能造成關節囊過度牽拉或骨性撞擊。`,
          recommendation: `將 ${cfg.nameZh} 角度調整回 [${min}°, ${max}°] 安全區間內。`,
          valueText: `${val.toFixed(1)}° (限值 ${min}°~${max}°)`,
        });
      } else {
        const nearMin = min !== 0 && val - min <= 5;
        const nearMax = max !== 0 && max - val <= 5;
        if (nearMin || nearMax) {
          alerts.push({
            id: `rom_warning_${jointId}_${axis}`,
            category: 'rom',
            jointId,
            severity: 'warning',
            title: `${cfg.nameZh} ${AXIS_LABELS[axis]} 接近極限邊界`,
            tissue: '關節周圍軟組織與韌帶',
            mechanism: `當前角度 ${val.toFixed(1)}° 距離活動度極限 [${min}°, ${max}°] 不足 5°。`,
            recommendation: `留意末端角度負荷，避免再施加額外外力。`,
            valueText: `${val.toFixed(1)}° (接近極限)`,
          });
        }
      }
    }
  }

  return alerts;
}

export function evaluateCompositeRules(pose: PoseMap): InjuryAlert[] {
  const alerts: InjuryAlert[] = [];

  for (const rule of COMPOSITE_POSTURE_RULES) {
    const joints = rule.check(pose);
    for (const jointId of joints) {
      alerts.push({
        id: `composite_${rule.id}_${jointId}`,
        category: 'composite',
        jointId,
        severity: 'critical',
        title: rule.title,
        tissue: rule.tissue,
        mechanism: rule.mechanism,
        recommendation: rule.recommendation,
      });
    }
  }

  return alerts;
}

export function evaluateForceRules(
  pose: PoseMap,
  loads: Record<JointId, JointLoadResult>
): InjuryAlert[] {
  const alerts: InjuryAlert[] = [];

  for (const rule of FORCE_OVERLOAD_RULES) {
    const hits = rule.check(pose, loads);
    for (const hit of hits) {
      alerts.push({
        id: `force_${rule.id}_${hit.jointId}`,
        category: 'force',
        jointId: hit.jointId,
        severity: 'critical',
        title: rule.title,
        tissue: rule.tissue,
        mechanism: rule.mechanism,
        recommendation: rule.recommendation,
        valueText: hit.valueText,
      });
    }
  }

  return alerts;
}

export function evaluateAllInjuries(
  pose: PoseMap,
  loads: Record<JointId, JointLoadResult>
): InjuryAlert[] {
  return [
    ...evaluateCompositeRules(pose),
    ...evaluateForceRules(pose, loads),
    ...evaluateSingleAxisRom(pose),
  ];
}

export function getJointRiskMap(alerts: InjuryAlert[]): Record<JointId, RiskSeverity> {
  const map = {} as Record<JointId, RiskSeverity>;
  for (const id of JOINT_ORDER) {
    map[id] = 'normal';
  }
  for (const alert of alerts) {
    const current = map[alert.jointId];
    if (alert.severity === 'critical') {
      map[alert.jointId] = 'critical';
    } else if (alert.severity === 'warning' && current === 'normal') {
      map[alert.jointId] = 'warning';
    }
  }
  return map;
}

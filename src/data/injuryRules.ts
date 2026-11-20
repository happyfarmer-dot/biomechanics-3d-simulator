import type { JointId, JointLoadResult, PoseMap, InjuryAlert } from '../types/biomechanics';

export interface CompositeRuleDef {
  id: string;
  title: string;
  tissue: string;
  mechanism: string;
  recommendation: string;
  check: (pose: PoseMap) => JointId[];
}

export interface ForceRuleDef {
  id: string;
  title: string;
  tissue: string;
  mechanism: string;
  recommendation: string;
  check: (
    pose: PoseMap,
    loads: Record<JointId, JointLoadResult>
  ) => Array<{ jointId: JointId; valueText: string }>;
}

const SIDES: Array<'L' | 'R'> = ['L', 'R'];

/**
 * Returns signed valgus moment for a knee joint (+ = Valgus, - = Varus):
 * - Right knee: +localTorque.z is valgus (push from -X lateral toward +X medial on distal shin)
 * - Left knee: -localTorque.z is valgus (push from +X lateral toward -X medial on distal shin)
 */
export function getKneeValgusMomentNm(jointId: 'knee_L' | 'knee_R', coronalMomentNm: number): number {
  return jointId === 'knee_R' ? coronalMomentNm : -coronalMomentNm;
}

export const COMPOSITE_POSTURE_RULES: CompositeRuleDef[] = [
  {
    id: 'shoulder_impingement',
    title: '肩峰下夾擠症候群風險 (Subacromial Impingement)',
    tissue: '棘上肌肌腱、肩峰下滑囊、肱二頭肌長頭肌腱',
    mechanism: '肩外展 > 90° 合併內旋 > 45° 時，肱骨大結節向肩峰下間隙逼近並擠壓棘上肌腱，造成反覆機械性夾擠。',
    recommendation: '降低肩外展至 75°–85° 以下，或增加肩外旋（大拇指朝上/朝後）以打開肩峰下空間。',
    check: (pose) => {
      const triggered: JointId[] = [];
      for (const s of SIDES) {
        const j: JointId = `shoulder_${s}`;
        const a = pose[j];
        if (a.abduction > 90 && a.rotation > 45) triggered.push(j);
      }
      return triggered;
    },
  },
  {
    id: 'shoulder_anterior_instability',
    title: '肩前關節囊 / 盂唇撕裂風險 (Anterior Instability / SLAP)',
    tissue: '前下盂肱韌帶、前關節囊、上盂唇 (SLAP)',
    mechanism: '肩外展 > 90° 且外旋 > 85°（rotation < -85°）並伴隨水平伸展 > 15°（flexion < -15°），使肱骨頭向前推擠關節囊與盂唇。',
    recommendation: '避免手臂落於身體冠狀面後方（保持在肩胛骨平面內，flexion ≥ 0°），並限制極端外旋。',
    check: (pose) => {
      const triggered: JointId[] = [];
      for (const s of SIDES) {
        const j: JointId = `shoulder_${s}`;
        const a = pose[j];
        if (a.abduction > 90 && a.rotation < -85 && a.flexion < -15) triggered.push(j);
      }
      return triggered;
    },
  },
  {
    id: 'dynamic_knee_valgus',
    title: '動態膝內扣 / ACL 與 MCL 高風險 (Dynamic Knee Valgus)',
    tissue: '前十字韌帶 (ACL)、內側副韌帶 (MCL)、外側半月板',
    mechanism: '膝屈曲 15°–60° 時股四頭肌產生高前向剪力，若同時發生膝外翻 > 10° 與脛骨外旋 > 10°（rotation < -10°），將對 ACL 與 MCL 施加極端複合張力。',
    recommendation: '強化臀中肌與髖外旋肌群控制，維持膝蓋對準第二腳趾方向，避免膝關節向內塌陷。',
    check: (pose) => {
      const triggered: JointId[] = [];
      for (const s of SIDES) {
        const j: JointId = `knee_${s}`;
        const a = pose[j];
        if (a.flexion >= 15 && a.flexion <= 60 && a.abduction > 10 && a.rotation < -10) {
          triggered.push(j);
        }
      }
      return triggered;
    },
  },
  {
    id: 'knee_hyperextension',
    title: '膝關節過伸損傷風險 (Knee Hyperextension)',
    tissue: '後關節囊、前/後十字韌帶 (ACL/PCL)、膕肌',
    mechanism: '膝關節伸展角度 < -5° 時，股骨與脛骨前緣撞擊，同時過度拉扯後關節囊與十字韌帶。',
    recommendation: '站立或負重時保持膝關節微彎（0°–5° 軟鎖定），避免將膝蓋完全鎖死向後頂。',
    check: (pose) => {
      const triggered: JointId[] = [];
      for (const s of SIDES) {
        const j: JointId = `knee_${s}`;
        if (pose[j].flexion < -5) triggered.push(j);
      }
      return triggered;
    },
  },
  {
    id: 'lumbar_disc_herniation',
    title: '腰椎間盤突出高風險 (Lumbar Disc Herniation)',
    tissue: 'L4-L5 / L5-S1 椎間盤後外側纖維環、後縱韌帶',
    mechanism: '腰椎屈曲 > 35° 使髓核向後推擠纖維環，若同時疊加軸向旋轉 > 12°（|rotation| > 12°），斜向纖維環將承受雙倍剪切應力。',
    recommendation: '搬運重物時改用髖關節鉸鏈（Hip Hinge）取代彎腰，保持腰椎中立位，並以雙腳轉向代替軀幹扭轉。',
    check: (pose) => {
      const a = pose.lumbar;
      if (a.flexion > 35 && Math.abs(a.rotation) > 12) return ['lumbar'];
      return [];
    },
  },
];

export const FORCE_OVERLOAD_RULES: ForceRuleDef[] = [
  {
    id: 'lumbar_compression_niosh',
    title: '腰椎壓縮力超標 (NIOSH > 3400 N)',
    tissue: 'L5-S1 椎間盤終板、椎體鬆質骨',
    mechanism: '軀幹前傾或手部遠距負重產生龐大屈曲力矩，迫使豎脊肌（力臂 0.05 m）產生數倍張力平衡，導致椎間盤軸向壓縮力突破 NIOSH 3400 N 基準。',
    recommendation: '將負重貼近身體重心縮短力臂、減輕負荷重量，或改以蹲姿維持軀幹直立。',
    check: (_pose, loads) => {
      const lumbar = loads.lumbar;
      if (lumbar?.lumbarEstimatedCompressionN !== undefined && lumbar.lumbarEstimatedCompressionN > 3400) {
        return [{ jointId: 'lumbar', valueText: `${Math.round(lumbar.lumbarEstimatedCompressionN)} N (> 3400 N)` }];
      }
      return [];
    },
  },
  {
    id: 'lumbar_shear_overload',
    title: '腰椎水平剪力過載 (> 500 N)',
    tissue: '腰椎小面關節、椎弓峽部、椎間盤纖維環',
    mechanism: '高水平推拉力或軀幹大角度前屈負重，使腰椎橫向剪力超過 500 N，易誘發椎弓解離或脊椎滑脫。',
    recommendation: '避免在彎腰狀態下進行水平推拉，改以核心穩定並利用下肢發力。',
    check: (_pose, loads) => {
      const lumbar = loads.lumbar;
      if (lumbar && lumbar.shearForceN > 500) {
        return [{ jointId: 'lumbar', valueText: `${Math.round(lumbar.shearForceN)} N (> 500 N)` }];
      }
      return [];
    },
  },
  {
    id: 'knee_valgus_moment_overload',
    title: '膝外翻彎矩過載 (傷 MCL / ACL > 45 N·m)',
    tissue: '內側副韌帶 (MCL)、前十字韌帶 (ACL)、外側半月板',
    mechanism: '外側向內撞擊或強力外翻力矩（> 45 N·m）使膝關節內側間隙被強行撐開，直接對 MCL 與 ACL 施加撕裂張力。',
    recommendation: '避免外側橫向撞擊力作用於遠端小腿，或縮短力臂並強化膝關節動態穩定。',
    check: (_pose, loads) => {
      const hits: Array<{ jointId: JointId; valueText: string }> = [];
      for (const s of SIDES) {
        const j: JointId = `knee_${s}`;
        const l = loads[j];
        if (!l) continue;
        const valgus = getKneeValgusMomentNm(j, l.coronalMomentNm);
        if (valgus > 45) {
          hits.push({ jointId: j, valueText: `外翻 ${valgus.toFixed(1)} N·m (> 45)` });
        }
      }
      return hits;
    },
  },
  {
    id: 'knee_varus_moment_overload',
    title: '膝內翻彎矩過載 (傷 LCL > 45 N·m)',
    tissue: '外側副韌帶 (LCL)、內側半月板、後外側角複合體',
    mechanism: '內側向外推擠或強力內翻力矩（> 45 N·m）使膝關節外側間隙被撐開，對 LCL 施加高張力。',
    recommendation: '減少由內側向外側施加的橫向推力與內翻力臂。',
    check: (_pose, loads) => {
      const hits: Array<{ jointId: JointId; valueText: string }> = [];
      for (const s of SIDES) {
        const j: JointId = `knee_${s}`;
        const l = loads[j];
        if (!l) continue;
        const valgus = getKneeValgusMomentNm(j, l.coronalMomentNm);
        if (valgus < -45) {
          hits.push({ jointId: j, valueText: `內翻 ${Math.abs(valgus).toFixed(1)} N·m (> 45)` });
        }
      }
      return hits;
    },
  },
  {
    id: 'knee_ap_shear_overload',
    title: '膝前後向剪力過載 (ACL / PCL > 300 N)',
    tissue: '前十字韌帶 (ACL) / 後十字韌帶 (PCL)',
    mechanism: '脛骨相對股骨的前後方向剪力超過 300 N，使十字韌帶承受過高抗剪張力。',
    recommendation: '避免急停變向時膝蓋過度前移或承受前後向撞擊。',
    check: (_pose, loads) => {
      const hits: Array<{ jointId: JointId; valueText: string }> = [];
      for (const s of SIDES) {
        const j: JointId = `knee_${s}`;
        const l = loads[j];
        if (l && Math.abs(l.apShearN) > 300) {
          hits.push({ jointId: j, valueText: `${Math.abs(l.apShearN).toFixed(0)} N (> 300 N)` });
        }
      }
      return hits;
    },
  },
  {
    id: 'shoulder_rotator_cuff_overload',
    title: '大角度肩關節力矩過載 (旋轉肌袖 > 50 N·m)',
    tissue: '旋轉肌袖（棘上肌、棘下肌、肩胛下肌）',
    mechanism: '肩關節處於大角度抬舉（外展或屈曲 > 60°）且淨外力矩超過 50 N·m 時，旋轉肌袖需承受極高張力以維持肱骨頭於關節盂內。',
    recommendation: '縮短手部負重槓桿（屈肘貼近軀幹），或降低手臂抬舉高度與負荷重量。',
    check: (pose, loads) => {
      const hits: Array<{ jointId: JointId; valueText: string }> = [];
      for (const s of SIDES) {
        const j: JointId = `shoulder_${s}`;
        const a = pose[j];
        const l = loads[j];
        if (l && (a.abduction > 60 || a.flexion > 60) && l.bendingMomentNm > 50) {
          hits.push({ jointId: j, valueText: `${l.bendingMomentNm.toFixed(1)} N·m (> 50 N·m)` });
        }
      }
      return hits;
    },
  },
];

export type { InjuryAlert };

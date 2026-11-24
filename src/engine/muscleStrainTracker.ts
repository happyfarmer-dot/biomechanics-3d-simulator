import { Color, Vector3, type BufferAttribute, type InterleavedBufferAttribute } from 'three';
import { DEFAULT_HEIGHT_M } from '../data/skeletonConfig';
import type { JointLoadResult } from '../types/biomechanics';
import { evaluateSkinnedVertexFromTable, type SkinnedMuscleData } from './muscleSkinning';

export interface MuscleStrainTracker {
  name: string;
  zhName: string;
  originIndices: Uint32Array;
  insertionIndices: Uint32Array;
  L0: number;
  skip: boolean;
}

export interface MuscleStrainItem {
  name: string;
  zhName: string;
  strain: number; // e.g. -0.22 or +0.19
  percentText: string; // e.g. "-22%" or "+19%"
}

export interface MuscleStrainSummary {
  topContracting: MuscleStrainItem[];
  topStretching: MuscleStrainItem[];
}

export interface StrainHeatmapVisual {
  color: Color;
  emissive: Color;
  emissiveIntensity: number;
  isOverstretched: boolean;
}

const MUSCLE_ZH_MAP: Array<[string, string]> = [
  ['pectoralis_major', '胸大肌'],
  ['pectoralis major', '胸大肌'],
  ['pectoralis_minor', '胸小肌'],
  ['pectoralis minor', '胸小肌'],
  ['latissimus_dorsi', '背闊肌'],
  ['latissimus dorsi', '背闊肌'],
  ['latissimus', '背闊肌'],
  ['deltoid', '三角肌'],
  ['trapezius', '斜方肌'],
  ['biceps_brachii', '肱二頭肌'],
  ['biceps brachii', '肱二頭肌'],
  ['triceps_brachii', '肱三頭肌'],
  ['triceps', '肱三頭肌'],
  ['brachioradialis', '肱橈肌'],
  ['brachialis', '肱肌'],
  ['rectus_abdominis', '腹直肌'],
  ['rectus abdominis', '腹直肌'],
  ['external_oblique', '腹外斜肌'],
  ['external oblique', '腹外斜肌'],
  ['internal_oblique', '腹內斜肌'],
  ['erector_spinae', '豎脊肌'],
  ['erector spinae', '豎脊肌'],
  ['iliocostalis', '豎脊肌(髂肋肌)'],
  ['longissimus', '豎脊肌(最長肌)'],
  ['spinalis', '豎脊肌(棘肌)'],
  ['gluteus_maximus', '臀大肌'],
  ['gluteus maximus', '臀大肌'],
  ['gluteus_medius', '臀中肌'],
  ['gluteus medius', '臀中肌'],
  ['gluteus_minimus', '臀小肌'],
  ['quadriceps', '股四頭肌'],
  ['rectus_femoris', '股四頭肌(股直肌)'],
  ['rectus femoris', '股四頭肌(股直肌)'],
  ['vastus_lateralis', '股四頭肌(股外側肌)'],
  ['vastus_medialis', '股四頭肌(股內側肌)'],
  ['vastus_intermedius', '股四頭肌(股中間肌)'],
  ['biceps_femoris', '膕繩肌(股二頭肌)'],
  ['biceps femoris', '膕繩肌(股二頭肌)'],
  ['semitendinosus', '膕繩肌(半腱肌)'],
  ['semimembranosus', '膕繩肌(半膜肌)'],
  ['hamstring', '膕繩肌'],
  ['gastrocnemius', '腓腸肌'],
  ['soleus', '比目魚肌'],
  ['tibialis_anterior', '脛前肌'],
  ['tibialis anterior', '脛前肌'],
  ['sartorius', '縫匠肌'],
  ['gracilis', '股薄肌'],
  ['tensor_fascia', '闊筋膜張肌'],
  ['iliopsoas', '髂腰肌'],
  ['psoas', '腰大肌'],
  ['adductor_longus', '內收長肌'],
  ['adductor_magnus', '內收大肌'],
  ['sternocleidomastoid', '胸鎖乳突肌'],
  ['splenius', '頭夾肌'],
  ['supraspinatus', '棘上肌'],
  ['infraspinatus', '棘下肌'],
  ['subscapularis', '肩胛下肌'],
  ['teres_major', '大圓肌'],
  ['teres_minor', '小圓肌'],
  ['serratus_anterior', '前鋸肌'],
  ['rhomboid', '菱形肌'],
  ['pronator_teres', '旋前圓肌'],
  ['flexor_carpi_radialis', '橈側腕屈肌'],
  ['flexor_carpi_ulnaris', '尺側腕屈肌'],
  ['extensor_carpi', '伸腕肌'],
  ['flexor_digitorum', '屈指肌'],
  ['extensor_digitorum', '伸指肌'],
];

export function getMuscleZhName(rawName: string, sideHint?: 'L' | 'R'): string {
  const nl = rawName.toLowerCase();
  const stripped = nl.replace(/^(?:bone|muscle)__[a-z0-9_]+__/, '');
  const isLeft = sideHint === 'L' || nl.includes('.l') || nl.includes('_l__');
  const isRight = sideHint === 'R' || nl.includes('.r') || nl.includes('_r__');
  const sidePrefix = isLeft ? '左' : isRight ? '右' : '';

  for (const [key, zh] of MUSCLE_ZH_MAP) {
    if (stripped.includes(key)) {
      return `${sidePrefix}${zh}`;
    }
  }
  const cleanFallback = stripped.replace(/\.(l|r)\.\d+$/i, '').replace(/_/g, ' ').trim();
  return sidePrefix ? `${sidePrefix}${cleanFallback}` : cleanFallback;
}

/**
 * Builds rest-pose origin/insertion vertex index anchors for a skinned muscle.
 * Takes top 15% proximal (lowest weightsB) and top 15% distal (highest weightsB) vertices.
 */
export function createMuscleStrainTracker(m: SkinnedMuscleData): MuscleStrainTracker {
  const sideHint: 'L' | 'R' | undefined =
    m.zone === 'arm_L' || m.zone === 'leg_L'
      ? 'L'
      : m.zone === 'arm_R' || m.zone === 'leg_R'
      ? 'R'
      : undefined;
  const zhName = getMuscleZhName(m.name, sideHint);

  if (m.vertexCount < 4) {
    return {
      name: m.name,
      zhName,
      originIndices: new Uint32Array(0),
      insertionIndices: new Uint32Array(0),
      L0: 0,
      skip: true,
    };
  }

  // Sample up to 320 vertices evenly so sorting is fast even for dense meshes
  const maxSamples = 320;
  const step = Math.max(1, Math.floor(m.vertexCount / maxSamples));
  const samples: Array<{ idx: number; w: number }> = [];
  let minW = Infinity;
  let maxW = -Infinity;

  for (let i = 0; i < m.vertexCount; i += step) {
    const w = m.weightsB[i];
    if (w < minW) minW = w;
    if (w > maxW) maxW = w;
    samples.push({ idx: i, w });
  }

  // If the entire muscle is rigidly bound to a single joint (no weight spread), L is constant -> skip
  if (maxW - minW < 0.02 || samples.length < 4) {
    return {
      name: m.name,
      zhName,
      originIndices: new Uint32Array(0),
      insertionIndices: new Uint32Array(0),
      L0: 0,
      skip: true,
    };
  }

  samples.sort((a, b) => a.w - b.w);
  const k = Math.max(1, Math.floor(samples.length * 0.15));

  const originIndices = new Uint32Array(k);
  const insertionIndices = new Uint32Array(k);

  let ox = 0, oy = 0, oz = 0;
  let ix = 0, iy = 0, iz = 0;

  for (let j = 0; j < k; j++) {
    const oIdx = samples[j].idx;
    const iIdx = samples[samples.length - 1 - j].idx;
    originIndices[j] = oIdx;
    insertionIndices[j] = iIdx;

    const o3 = oIdx * 3;
    const i3 = iIdx * 3;
    ox += m.restPositions[o3];
    oy += m.restPositions[o3 + 1];
    oz += m.restPositions[o3 + 2];
    ix += m.restPositions[i3];
    iy += m.restPositions[i3 + 1];
    iz += m.restPositions[i3 + 2];
  }

  ox /= k; oy /= k; oz /= k;
  ix /= k; iy /= k; iz /= k;

  const L0 = Math.hypot(ix - ox, iy - oy, iz - oz);
  if (!Number.isFinite(L0) || L0 < 0.02) {
    return {
      name: m.name,
      zhName,
      originIndices,
      insertionIndices,
      L0: 0,
      skip: true,
    };
  }

  return {
    name: m.name,
    zhName,
    originIndices,
    insertionIndices,
    L0,
    skip: false,
  };
}

// Pre-allocated scratch vectors for zero-GC per-frame strain calculation
const _orig = new Vector3();
const _ins = new Vector3();
const _vTmp = new Vector3();

/**
 * Computes current geometric strain = (L - L0) / L0 using zero-GC scratch vectors.
 * Returns 0 if tracker is skipped or L0 is too small.
 */
export function computeMuscleStrain(
  tracker: MuscleStrainTracker,
  posAttr: BufferAttribute | InterleavedBufferAttribute,
  heightM: number = DEFAULT_HEIGHT_M
): number {
  if (tracker.skip) return 0;
  const L0Scaled = tracker.L0 * (heightM / DEFAULT_HEIGHT_M);
  if (!Number.isFinite(L0Scaled) || L0Scaled < 0.02) return 0;

  const { originIndices, insertionIndices } = tracker;
  const oLen = originIndices.length;
  const iLen = insertionIndices.length;
  if (oLen === 0 || iLen === 0) return 0;

  _orig.set(0, 0, 0);
  for (let j = 0; j < oLen; j++) {
    const idx = originIndices[j];
    _orig.x += posAttr.getX(idx);
    _orig.y += posAttr.getY(idx);
    _orig.z += posAttr.getZ(idx);
  }
  _orig.divideScalar(oLen);

  _ins.set(0, 0, 0);
  for (let j = 0; j < iLen; j++) {
    const idx = insertionIndices[j];
    _ins.x += posAttr.getX(idx);
    _ins.y += posAttr.getY(idx);
    _ins.z += posAttr.getZ(idx);
  }
  _ins.divideScalar(iLen);

  const L = _orig.distanceTo(_ins);
  const strain = (L - L0Scaled) / L0Scaled;
  return Number.isFinite(strain) ? strain : 0;
}

/**
 * Anchor-only DQS strain evaluation (used when full-mesh skinning runs on GPU).
 * Requires `buildJointDualQuaternions` to have been called for the current frame.
 */
export function computeMuscleStrainFromDqsTable(
  tracker: MuscleStrainTracker,
  skinned: SkinnedMuscleData,
  heightM: number = DEFAULT_HEIGHT_M
): number {
  if (tracker.skip) return 0;
  const hScale = heightM / DEFAULT_HEIGHT_M;
  const L0Scaled = tracker.L0 * hScale;
  if (!Number.isFinite(L0Scaled) || L0Scaled < 0.02) return 0;

  const { originIndices, insertionIndices } = tracker;
  const oLen = originIndices.length;
  const iLen = insertionIndices.length;
  if (oLen === 0 || iLen === 0) return 0;

  _orig.set(0, 0, 0);
  for (let j = 0; j < oLen; j++) {
    evaluateSkinnedVertexFromTable(skinned, originIndices[j], hScale, _vTmp);
    _orig.add(_vTmp);
  }
  _orig.divideScalar(oLen);

  _ins.set(0, 0, 0);
  for (let j = 0; j < iLen; j++) {
    evaluateSkinnedVertexFromTable(skinned, insertionIndices[j], hScale, _vTmp);
    _ins.add(_vTmp);
  }
  _ins.divideScalar(iLen);

  const L = _orig.distanceTo(_ins);
  const strain = (L - L0Scaled) / L0Scaled;
  return Number.isFinite(strain) ? strain : 0;
}

/**
 * Computes active muscle tension score combining geometric strain with joint biomechanical demand
 * (used when muscleStrainSubMode === 'activeTension').
 */
export function computeActiveTensionScore(
  geometricStrain: number,
  jointLoad: JointLoadResult | undefined
): number {
  if (!jointLoad || !Number.isFinite(geometricStrain)) return 0;
  const loadDemand = Math.min(
    1.5,
    jointLoad.bendingMomentNm / 55 + (jointLoad.axialForceN / 900) * 0.3
  );
  if (loadDemand < 0.06) return 0;
  const engagement = 0.35 + 0.65 * Math.min(1, Math.abs(geometricStrain) / 0.15);
  if (geometricStrain > 0.03) {
    // Eccentric loading under tension (positive -> blue / magenta overload)
    return 0.04 + loadDemand * engagement * 0.3;
  }
  // Concentric / isometric active contraction under load (negative -> amber / orange-red heat)
  return -(0.04 + loadDemand * engagement * 0.26);
}

const COLOR_NEUTRAL = new Color('#5c3f3e');
const COLOR_AMBER = new Color('#f59e0b');
const COLOR_ORANGE = new Color('#ea580c');
const COLOR_CYAN = new Color('#06b6d4');
const COLOR_BLUE = new Color('#2563eb');
const COLOR_MAGENTA = new Color('#db2777');
const COLOR_BLACK = new Color('#000000');

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Pure color interpolation for Muscle Strain Heatmap Mode:
 * - Neutral [-0.03, +0.03]: desaturated dark grey-red #5c3f3e, emissive 0
 * - Contracting (< -0.03): #5c3f3e -> Amber Gold (#f59e0b) -> Bright Orange-Red (#ea580c), emissive 0~0.45
 * - Stretching (0.03 ~ 0.30): #5c3f3e -> Bright Cyan (#06b6d4) -> Electric Blue (#2563eb), emissive 0~0.45
 * - Overstretched (> 0.30): Electric Blue -> Warning Magenta (#db2777) with breathing pulse
 */
export function getStrainHeatmapVisual(
  strain: number,
  outColor: Color = new Color(),
  outEmissive: Color = new Color(),
  pulsePhase: number = 0
): StrainHeatmapVisual {
  const safeStrain = Number.isFinite(strain) ? strain : 0;

  if (safeStrain >= -0.03 && safeStrain <= 0.03) {
    outColor.copy(COLOR_NEUTRAL);
    outEmissive.copy(COLOR_BLACK);
    return {
      color: outColor,
      emissive: outEmissive,
      emissiveIntensity: 0,
      isOverstretched: false,
    };
  }

  if (safeStrain < -0.03) {
    const t = clamp01((-safeStrain - 0.03) / 0.25);
    if (t <= 0.5) {
      outColor.copy(COLOR_NEUTRAL).lerp(COLOR_AMBER, t * 2);
    } else {
      outColor.copy(COLOR_AMBER).lerp(COLOR_ORANGE, (t - 0.5) * 2);
    }
    outEmissive.copy(outColor);
    return {
      color: outColor,
      emissive: outEmissive,
      emissiveIntensity: t * 0.45,
      isOverstretched: false,
    };
  }

  if (safeStrain <= 0.3) {
    const t = clamp01((safeStrain - 0.03) / 0.25);
    if (t <= 0.5) {
      outColor.copy(COLOR_NEUTRAL).lerp(COLOR_CYAN, t * 2);
    } else {
      outColor.copy(COLOR_CYAN).lerp(COLOR_BLUE, (t - 0.5) * 2);
    }
    outEmissive.copy(outColor);
    return {
      color: outColor,
      emissive: outEmissive,
      emissiveIntensity: t * 0.45,
      isOverstretched: false,
    };
  }

  // Overstretched > 30%
  const u = clamp01((safeStrain - 0.3) / 0.12);
  outColor.copy(COLOR_BLUE).lerp(COLOR_MAGENTA, u);
  outEmissive.copy(COLOR_MAGENTA);
  const pulse = 0.5 + 0.5 * Math.sin(pulsePhase);
  return {
    color: outColor,
    emissive: outEmissive,
    emissiveIntensity: 0.45 + 0.18 * pulse,
    isOverstretched: true,
  };
}

/**
 * Aggregates per-mesh strains into top 3 contracting and top 3 stretching muscle groups.
 */
export function buildMuscleStrainSummary(
  entries: Array<{ zhName: string; name: string; strain: number }>
): MuscleStrainSummary {
  const bestByLabel = new Map<string, { name: string; zhName: string; strain: number }>();

  for (const e of entries) {
    if (!Number.isFinite(e.strain) || Math.abs(e.strain) <= 0.03) continue;
    const prev = bestByLabel.get(e.zhName);
    if (!prev || Math.abs(e.strain) > Math.abs(prev.strain)) {
      bestByLabel.set(e.zhName, e);
    }
  }

  const contracting: MuscleStrainItem[] = [];
  const stretching: MuscleStrainItem[] = [];

  for (const item of bestByLabel.values()) {
    const pct = Math.round(item.strain * 100);
    if (item.strain < -0.03) {
      contracting.push({
        name: item.name,
        zhName: item.zhName,
        strain: item.strain,
        percentText: `${pct}%`,
      });
    } else if (item.strain > 0.03) {
      stretching.push({
        name: item.name,
        zhName: item.zhName,
        strain: item.strain,
        percentText: `+${pct}%`,
      });
    }
  }

  contracting.sort((a, b) => a.strain - b.strain);
  stretching.sort((a, b) => b.strain - a.strain);

  return {
    topContracting: contracting.slice(0, 3),
    topStretching: stretching.slice(0, 3),
  };
}

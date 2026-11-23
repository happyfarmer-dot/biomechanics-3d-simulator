import { describe, it, expect } from 'vitest';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { SkinnedMuscleData } from '../muscleSkinning';
import {
  buildMuscleStrainSummary,
  computeMuscleStrain,
  createMuscleStrainTracker,
  getMuscleZhName,
  getStrainHeatmapVisual,
} from '../muscleStrainTracker';

function makeMockMuscle(L0: number): SkinnedMuscleData {
  // 10 vertices: first 5 at y=1.0 (w=0), last 5 at y=1.0 - L0 (w=1)
  const count = 10;
  const restPositions = new Float32Array(count * 3);
  const restNormals = new Float32Array(count * 3);
  const weightsB = new Float32Array(count);
  const jointAIndices = new Uint8Array(count);
  const jointBIndices = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const isDistal = i >= 5;
    restPositions[i * 3] = 0.2;
    restPositions[i * 3 + 1] = isDistal ? 1.0 - L0 : 1.0;
    restPositions[i * 3 + 2] = 0;
    weightsB[i] = isDistal ? 1.0 : 0.0;
    jointAIndices[i] = 5;
    jointBIndices[i] = 6;
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(restPositions), 3));

  return {
    name: 'MUSCLE__elbow_R__Biceps_brachii.r.001',
    geometry: geo,
    zone: 'arm_R',
    primaryJoint: 'shoulder_R',
    secondaryJoint: 'elbow_R',
    vertexCount: count,
    jointAIndices,
    jointBIndices,
    weightsB,
    restPositions,
    restNormals,
    restLength: L0,
    restDiagLength: L0,
    restCenter: [0.2, 1.0 - L0 * 0.5, 0],
    usedJoints: ['shoulder_R', 'elbow_R'],
  };
}

describe('muscleStrainTracker', () => {
  it('computes negative strain when shortened and maps to warm amber/orange', () => {
    const m = makeMockMuscle(0.2);
    const tracker = createMuscleStrainTracker(m);
    expect(tracker.skip).toBe(false);
    expect(tracker.L0).toBeCloseTo(0.2, 4);

    // Shorten distance from 0.20m to 0.15m (-25% strain)
    const pos = m.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 5; i < 10; i++) {
      pos.setY(i, 1.0 - 0.15);
    }
    const strain = computeMuscleStrain(tracker, pos);
    expect(strain).toBeCloseTo(-0.25, 4);

    const vis = getStrainHeatmapVisual(strain, new Color(), new Color(), 0);
    expect(vis.isOverstretched).toBe(false);
    // Warm orange has R >> B
    expect(vis.color.r).toBeGreaterThan(0.75);
    expect(vis.color.b).toBeLessThan(0.2);
    expect(vis.emissiveIntensity).toBeGreaterThan(0.3);
  });

  it('computes positive strain when stretched and maps to cool cyan/blue', () => {
    const m = makeMockMuscle(0.2);
    const tracker = createMuscleStrainTracker(m);

    // Stretch distance from 0.20m to 0.24m (+20% strain)
    const pos = m.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 5; i < 10; i++) {
      pos.setY(i, 1.0 - 0.24);
    }
    const strain = computeMuscleStrain(tracker, pos);
    expect(strain).toBeCloseTo(0.2, 4);

    const vis = getStrainHeatmapVisual(strain, new Color(), new Color(), 0);
    expect(vis.isOverstretched).toBe(false);
    // Cool blue/cyan has B > R
    expect(vis.color.b).toBeGreaterThan(0.6);
    expect(vis.color.r).toBeLessThan(0.3);
    expect(vis.emissiveIntensity).toBeGreaterThan(0.25);
  });

  it('maps overstretched > 30% to warning magenta and avoids NaN on tiny L0', () => {
    const tiny = makeMockMuscle(0.005);
    const tinyTracker = createMuscleStrainTracker(tiny);
    expect(tinyTracker.skip).toBe(true);
    const tinyStrain = computeMuscleStrain(tinyTracker, tiny.geometry.getAttribute('position'));
    expect(Number.isNaN(tinyStrain)).toBe(false);
    expect(tinyStrain).toBe(0);

    const vis = getStrainHeatmapVisual(0.42, new Color(), new Color(), Math.PI * 0.5);
    expect(vis.isOverstretched).toBe(true);
    // Magenta (#db2777 in linear space: r~0.70, g~0.02, b~0.18)
    expect(vis.color.r).toBeGreaterThan(0.65);
    expect(vis.color.b).toBeGreaterThan(0.15);
    expect(vis.color.g).toBeLessThan(0.1);
    expect(vis.emissiveIntensity).toBeGreaterThan(0.5);
  });

  it('maps Traditional Chinese muscle names and builds top 3 summary', () => {
    expect(getMuscleZhName('MUSCLE__elbow_R__Biceps_brachii.r.001')).toBe('右肱二頭肌');
    expect(getMuscleZhName('MUSCLE__knee_L__Rectus_femoris.l.001')).toBe('左股四頭肌(股直肌)');

    const summary = buildMuscleStrainSummary([
      { name: 'a', zhName: '右肱二頭肌', strain: -0.22 },
      { name: 'b', zhName: '右肱三頭肌', strain: 0.19 },
      { name: 'c', zhName: '左股四頭肌', strain: 0.01 },
    ]);
    expect(summary.topContracting[0].zhName).toBe('右肱二頭肌');
    expect(summary.topContracting[0].percentText).toBe('-22%');
    expect(summary.topStretching[0].zhName).toBe('右肱三頭肌');
    expect(summary.topStretching[0].percentText).toBe('+19%');
  });
});

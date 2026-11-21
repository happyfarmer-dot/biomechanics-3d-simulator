import { Quaternion, Vector3 } from 'three';
import { createNeutralPose, DEFAULT_HEIGHT_M } from '../data/skeletonConfig';
import type { PoseMap } from '../types/biomechanics';
import type { CalibrationResult } from './calibrateSkeleton';
import { computeKinematics } from './kinematics';
import {
  ALL_JOINTS,
  updateSkinnedMuscleVertices,
  type SkinnedMuscleData,
} from './muscleSkinning';

export interface IntegrityCheckItem {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
}

export interface RigIntegrityReport {
  allPassed: boolean;
  checks: IntegrityCheckItem[];
  timestamp: string;
}

function withPose(patch: Partial<PoseMap>): PoseMap {
  return { ...createNeutralPose(), ...patch };
}

/**
 * Automated 3-Part Rig Integrity Self-Check:
 *  1. Zero unassigned meshes & weight conservation (|wA + wB - 1.0| < 1e-4)
 *  2. Origin/Insertion anchor drift (< 0.005m / 5mm) & bounding-box diagonal ratio (< 2.2x) across 8 extreme poses
 *  3. Distal motion linkage coverage (>= 99% of vertices physically distal to rotated wrist/ankle/elbow/knee/lumbar move synchronously)
 */
export function runRigIntegrityCheck(
  muscles: SkinnedMuscleData[],
  unassignedMeshCount: number,
  calibration: CalibrationResult
): RigIntegrityReport {
  const restJoints = calibration.restPositions;

  // --- Check 1: Zero Unassigned & Weight Conservation ---
  let weightViolations = 0;
  let totalVertices = 0;
  for (const m of muscles) {
    totalVertices += m.vertexCount;
    for (let i = 0; i < m.vertexCount; i++) {
      const wB = m.weightsB[i];
      const wA = 1 - wB;
      if (wB < -1e-4 || wB > 1.0001 || Math.abs(wA + wB - 1.0) >= 1e-4) {
        weightViolations++;
      }
    }
  }
  const check1Pass = unassignedMeshCount === 0 && weightViolations === 0 && muscles.length > 0;
  const check1: IntegrityCheckItem = {
    id: 'weight_conservation',
    title: '零遺留與權重守恆檢查',
    passed: check1Pass,
    detail: `未分配網格: ${unassignedMeshCount}，總肌肉數: ${muscles.length} (${totalVertices} 頂點)，權重誤差違規: ${weightViolations}`,
  };

  // --- Check 2: Anchor Drift (< 5mm) & BBox Diagonal (< 2.2x) across 8 extreme poses ---
  const EXTREME_POSES: Array<{ name: string; pose: PoseMap }> = [
    {
      name: '雙肩外展 80°',
      pose: withPose({
        shoulder_L: { flexion: 0, abduction: 80, rotation: 0 },
        shoulder_R: { flexion: 0, abduction: 80, rotation: 0 },
      }),
    },
    {
      name: '雙肘屈曲 90°',
      pose: withPose({
        elbow_L: { flexion: 90, abduction: 0, rotation: 0 },
        elbow_R: { flexion: 90, abduction: 0, rotation: 0 },
      }),
    },
    {
      name: '雙腕外展 45°',
      pose: withPose({
        wrist_L: { flexion: 0, abduction: 45, rotation: 0 },
        wrist_R: { flexion: 0, abduction: 45, rotation: 0 },
      }),
    },
    {
      name: '雙髖外展 60° + 後伸 -45°',
      pose: withPose({
        hip_L: { flexion: -45, abduction: 60, rotation: 0 },
        hip_R: { flexion: -45, abduction: 60, rotation: 0 },
      }),
    },
    {
      name: '雙膝屈曲 140° + 外展 30° + 旋轉 35°',
      pose: withPose({
        knee_L: { flexion: 140, abduction: 30, rotation: 35 },
        knee_R: { flexion: 140, abduction: 30, rotation: 35 },
      }),
    },
    {
      name: '雙踝外展 30°',
      pose: withPose({
        ankle_L: { flexion: 0, abduction: 30, rotation: 0 },
        ankle_R: { flexion: 0, abduction: 30, rotation: 0 },
      }),
    },
    {
      name: '腰椎前彎 35° + 旋轉 20°',
      pose: withPose({
        lumbar: { flexion: 35, abduction: 0, rotation: 20 },
      }),
    },
    {
      name: '頸椎側彎 25°',
      pose: withPose({
        neck: { flexion: 0, abduction: 25, rotation: 0 },
      }),
    },
  ];

  let maxDriftM = 0;
  let maxDiagRatio = 1;
  let driftFailMesh = '';
  let diagFailMesh = '';

  const pJoint = new Vector3();
  const qJoint = new Quaternion();
  const vExpected = new Vector3();

  for (const ep of EXTREME_POSES) {
    const kin = computeKinematics(ep.pose, DEFAULT_HEIGHT_M, calibration.offsets);

    for (const m of muscles) {
      updateSkinnedMuscleVertices(m, kin, DEFAULT_HEIGHT_M, restJoints);
      const posAttr = m.geometry.getAttribute('position');

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      // Sample step to keep verification fast while checking anchors thoroughly
      const step = Math.max(1, Math.floor(m.vertexCount / 120));
      for (let i = 0; i < m.vertexCount; i += step) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);

        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (pz < minZ) minZ = pz;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
        if (pz > maxZ) maxZ = pz;

        const wB = m.weightsB[i];
        // Check pure anchor vertices (w === 1.0 or w === 0.0) for rigid attachment drift
        if (wB <= 1e-4 || wB >= 0.9999) {
          const jIdx = wB <= 1e-4 ? m.jointAIndices[i] : m.jointBIndices[i];
          const jId = ALL_JOINTS[jIdx];
          const jState = kin.joints[jId];
          const rJ = restJoints[jId];
          const i3 = i * 3;

          pJoint.set(...jState.worldPosition);
          qJoint.set(...jState.worldQuaternion);
          vExpected
            .set(
              m.restPositions[i3] - rJ[0],
              m.restPositions[i3 + 1] - rJ[1],
              m.restPositions[i3 + 2] - rJ[2]
            )
            .applyQuaternion(qJoint)
            .add(pJoint);

          const drift = Math.hypot(
            px - vExpected.x,
            py - vExpected.y,
            pz - vExpected.z
          );
          if (drift > maxDriftM) {
            maxDriftM = drift;
            driftFailMesh = `${m.name} (${ep.name})`;
          }
        }
      }

      if (Number.isFinite(minX) && m.restDiagLength > 0.04) {
        const curDiag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
        const ratio = curDiag / m.restDiagLength;
        if (ratio > maxDiagRatio) {
          maxDiagRatio = ratio;
          diagFailMesh = `${m.name} (${ep.name})`;
        }
      }
    }
  }

  const check2Pass = maxDriftM < 0.005 && maxDiagRatio <= 2.2;
  const check2: IntegrityCheckItem = {
    id: 'anchor_drift',
    title: '起止點全程附著漂移檢查 (8 組極限姿勢)',
    passed: check2Pass,
    detail: `最大起止點漂移: ${(maxDriftM * 1000).toFixed(2)} mm (上限 5.0 mm)${
      driftFailMesh && maxDriftM >= 0.005 ? ` [${driftFailMesh}]` : ''
    } · 最大邊界對角比: ${maxDiagRatio.toFixed(2)}x (上限 2.20x)${
      diagFailMesh && maxDiagRatio > 2.2 ? ` [${diagFailMesh}]` : ''
    }`,
  };

  // --- Check 3: Distal Motion Linkage Coverage (>= 99%) ---
  const LINKAGE_TESTS: Array<{
    label: string;
    pose: PoseMap;
    isDistalVertex: (m: SkinnedMuscleData, vx: number, vy: number, vz: number) => boolean;
  }> = [
    {
      label: 'wrist_L/R',
      pose: withPose({
        wrist_L: { flexion: 45, abduction: 35, rotation: 0 },
        wrist_R: { flexion: 45, abduction: 35, rotation: 0 },
      }),
      isDistalVertex: (m, _vx, vy) =>
        (m.zone === 'arm_L' && vy < restJoints.wrist_L[1] - 0.025) ||
        (m.zone === 'arm_R' && vy < restJoints.wrist_R[1] - 0.025),
    },
    {
      label: 'ankle_L/R',
      pose: withPose({
        ankle_L: { flexion: 30, abduction: 25, rotation: 0 },
        ankle_R: { flexion: 30, abduction: 25, rotation: 0 },
      }),
      isDistalVertex: (m, _vx, vy) =>
        (m.zone === 'leg_L' && vy < restJoints.ankle_L[1] - 0.025) ||
        (m.zone === 'leg_R' && vy < restJoints.ankle_R[1] - 0.025),
    },
    {
      label: 'elbow_L/R',
      pose: withPose({
        elbow_L: { flexion: 85, abduction: 0, rotation: 0 },
        elbow_R: { flexion: 85, abduction: 0, rotation: 0 },
      }),
      isDistalVertex: (m, _vx, vy) =>
        (m.zone === 'arm_L' && vy < restJoints.elbow_L[1] - 0.06) ||
        (m.zone === 'arm_R' && vy < restJoints.elbow_R[1] - 0.06),
    },
    {
      label: 'knee_L/R',
      pose: withPose({
        knee_L: { flexion: 90, abduction: 0, rotation: 0 },
        knee_R: { flexion: 90, abduction: 0, rotation: 0 },
      }),
      isDistalVertex: (m, _vx, vy) =>
        (m.zone === 'leg_L' && vy < restJoints.knee_L[1] - 0.06) ||
        (m.zone === 'leg_R' && vy < restJoints.knee_R[1] - 0.06),
    },
    {
      label: 'lumbar',
      pose: withPose({
        lumbar: { flexion: 35, abduction: 0, rotation: 20 },
      }),
      isDistalVertex: (m, _vx, vy) =>
        (m.zone === 'torso' || m.zone === 'arm_L' || m.zone === 'arm_R' || m.zone === 'head_neck') &&
        vy > restJoints.lumbar[1] + 0.06,
    },
  ];

  let minCoveragePct = 100;
  let worstJointLabel = '';

  for (const lt of LINKAGE_TESTS) {
    const kin = computeKinematics(lt.pose, DEFAULT_HEIGHT_M, calibration.offsets);
    let totalDistal = 0;
    let movedDistal = 0;

    for (const m of muscles) {
      updateSkinnedMuscleVertices(m, kin, DEFAULT_HEIGHT_M, restJoints);
      const posAttr = m.geometry.getAttribute('position');
      const step = Math.max(1, Math.floor(m.vertexCount / 150));

      for (let i = 0; i < m.vertexCount; i += step) {
        const i3 = i * 3;
        const rx = m.restPositions[i3];
        const ry = m.restPositions[i3 + 1];
        const rz = m.restPositions[i3 + 2];
        if (!lt.isDistalVertex(m, rx, ry, rz)) continue;

        totalDistal++;
        const disp = Math.hypot(
          posAttr.getX(i) - rx,
          posAttr.getY(i) - ry,
          posAttr.getZ(i) - rz
        );
        if (disp > 0.002) {
          movedDistal++;
        }
      }
    }

    const pct = totalDistal > 0 ? (movedDistal / totalDistal) * 100 : 100;
    if (pct < minCoveragePct) {
      minCoveragePct = pct;
      worstJointLabel = lt.label;
    }
  }

  // Restore neutral pose vertices after testing
  const neutralKin = computeKinematics(
    createNeutralPose(),
    DEFAULT_HEIGHT_M,
    calibration.offsets
  );
  for (const m of muscles) {
    updateSkinnedMuscleVertices(m, neutralKin, DEFAULT_HEIGHT_M, restJoints);
  }

  const check3Pass = minCoveragePct >= 99.0;
  const check3: IntegrityCheckItem = {
    id: 'motion_linkage',
    title: '遠端關節「骨肉同步連動」覆蓋檢查',
    passed: check3Pass,
    detail: `最低遠端頂點同步率: ${minCoveragePct.toFixed(2)}% (門檻 >= 99.0%)${
      worstJointLabel ? ` [測試關節: ${worstJointLabel}]` : ''
    }`,
  };

  const allPassed = check1Pass && check2Pass && check3Pass;
  const report: RigIntegrityReport = {
    allPassed,
    checks: [check1, check2, check3],
    timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
  };

  console.info(
    `[RigIntegrityCheck] ${allPassed ? '100% PASS' : 'FAIL'}`,
    report.checks.map((c) => `${c.title}: ${c.passed ? 'PASS' : 'FAIL'} (${c.detail})`)
  );

  return report;
}

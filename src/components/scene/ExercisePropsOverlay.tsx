import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import { useSimStore } from '../../store/useSimStore';
import type { Vec3 } from '../../types/biomechanics';

const NOOP_RAYCAST = () => null;
const UP_AXIS = new Vector3(0, 1, 0);

function computeSegmentTransform(
  a: Vec3,
  b: Vec3
): { position: Vec3; quaternion: [number, number, number, number]; length: number } {
  const va = new Vector3(a[0], a[1], a[2]);
  const vb = new Vector3(b[0], b[1], b[2]);
  const dir = vb.clone().sub(va);
  const len = Math.max(dir.length(), 0.01);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const q = new Quaternion();
  if (dir.lengthSq() > 1e-6) {
    q.setFromUnitVectors(UP_AXIS, dir.normalize());
  }
  return {
    position: [mid.x, mid.y, mid.z],
    quaternion: [q.x, q.y, q.z, q.w],
    length: len,
  };
}

function TranslucentBarbell({
  leftPos,
  rightPos,
  plateRadius = 0.17,
}: {
  leftPos: Vec3;
  rightPos: Vec3;
  plateRadius?: number;
}) {
  const vL = new Vector3(...leftPos);
  const vR = new Vector3(...rightPos);
  const dir = vL.clone().sub(vR);
  const span = Math.max(dir.length(), 0.2);
  const unit = dir.lengthSq() > 1e-6 ? dir.normalize() : new Vector3(1, 0, 0);
  const mid = vL.clone().add(vR).multiplyScalar(0.5);
  const barLen = Math.max(1.5, span + 0.72);
  const q = new Quaternion().setFromUnitVectors(UP_AXIS, unit);

  const plateOffset = barLen * 0.5 - 0.1;
  const pLeft = mid.clone().addScaledVector(unit, plateOffset);
  const pRight = mid.clone().addScaledVector(unit, -plateOffset);
  const qArr: [number, number, number, number] = [q.x, q.y, q.z, q.w];

  return (
    <group>
      {/* Shaft */}
      <mesh position={[mid.x, mid.y, mid.z]} quaternion={qArr} raycast={NOOP_RAYCAST}>
        <cylinderGeometry args={[0.014, 0.014, barLen, 12]} />
        <meshStandardMaterial
          color="#94a3b8"
          transparent
          opacity={0.34}
          depthWrite={false}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>
      {/* Left & Right Plates */}
      {[pLeft, pRight].map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} quaternion={qArr}>
          <mesh raycast={NOOP_RAYCAST}>
            <cylinderGeometry args={[plateRadius, plateRadius, 0.045, 24]} />
            <meshStandardMaterial
              color="#38bdf8"
              transparent
              opacity={0.22}
              depthWrite={false}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, i === 0 ? -0.055 : 0.055, 0]} raycast={NOOP_RAYCAST}>
            <cylinderGeometry args={[plateRadius * 0.82, plateRadius * 0.82, 0.032, 24]} />
            <meshStandardMaterial
              color="#64748b"
              transparent
              opacity={0.22}
              depthWrite={false}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TranslucentDumbbell({
  wristPos,
  elbowPos,
}: {
  wristPos: Vec3;
  elbowPos: Vec3;
}) {
  const vw = new Vector3(...wristPos);
  const ve = new Vector3(...elbowPos);
  const foreDir = vw.clone().sub(ve);
  if (foreDir.lengthSq() < 1e-6) foreDir.set(0, -1, 0);
  foreDir.normalize();
  const gripPos = vw.clone().addScaledVector(foreDir, 0.045);

  // Orient dumbbell handle roughly perpendicular to forearm (along local X/Z)
  const axis = new Vector3(1, 0, 0);
  if (Math.abs(foreDir.dot(axis)) > 0.9) axis.set(0, 0, 1);
  const handleDir = new Vector3().crossVectors(foreDir, axis).normalize();
  const q = new Quaternion().setFromUnitVectors(UP_AXIS, handleDir);
  const qArr: [number, number, number, number] = [q.x, q.y, q.z, q.w];

  return (
    <group position={[gripPos.x, gripPos.y, gripPos.z]} quaternion={qArr}>
      <mesh raycast={NOOP_RAYCAST}>
        <cylinderGeometry args={[0.014, 0.014, 0.24, 10]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.095, 0]} raycast={NOOP_RAYCAST}>
        <cylinderGeometry args={[0.068, 0.068, 0.05, 8]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.26} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.095, 0]} raycast={NOOP_RAYCAST}>
        <cylinderGeometry args={[0.068, 0.068, 0.05, 8]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.26} depthWrite={false} />
      </mesh>
    </group>
  );
}

function TranslucentBench({
  pelvisPos,
  thoraxPos,
  mode,
}: {
  pelvisPos: Vec3;
  thoraxPos: Vec3;
  mode: 'flat' | 'incline' | 'hip_thrust';
}) {
  if (mode === 'hip_thrust') {
    const benchY = Math.max(0.28, thoraxPos[1] - 0.09);
    const benchZ = thoraxPos[2] - 0.14;
    return (
      <group>
        <mesh position={[0, benchY, benchZ]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.65, 0.08, 0.42]} />
          <meshStandardMaterial color="#475569" transparent opacity={0.24} depthWrite={false} />
        </mesh>
        <mesh position={[0, benchY * 0.5, benchZ]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.52, benchY, 0.34]} />
          <meshStandardMaterial color="#334155" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  if (mode === 'incline') {
    const seg = computeSegmentTransform(
      [pelvisPos[0], Math.max(0.2, pelvisPos[1] - 0.08), pelvisPos[2] - 0.06],
      [thoraxPos[0], thoraxPos[1] - 0.04, thoraxPos[2] - 0.14]
    );
    const seatY = Math.max(0.26, pelvisPos[1] - 0.1);
    return (
      <group>
        {/* Inclined backrest */}
        <mesh position={seg.position} quaternion={seg.quaternion} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.3, Math.max(0.75, seg.length + 0.3), 0.07]} />
          <meshStandardMaterial color="#475569" transparent opacity={0.24} depthWrite={false} />
        </mesh>
        {/* Seat pad */}
        <mesh position={[0, seatY, pelvisPos[2] + 0.08]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.3, 0.07, 0.34]} />
          <meshStandardMaterial color="#475569" transparent opacity={0.24} depthWrite={false} />
        </mesh>
        {/* Support pillar */}
        <mesh position={[0, seatY * 0.5, pelvisPos[2] - 0.06]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.1, seatY, 0.1]} />
          <meshStandardMaterial color="#334155" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Flat bench
  const padY = Math.max(0.32, (pelvisPos[1] + thoraxPos[1]) * 0.5 - 0.11);
  const centerZ = (pelvisPos[2] + thoraxPos[2]) * 0.5 - 0.14;
  return (
    <group>
      <mesh position={[0, padY, centerZ]} raycast={NOOP_RAYCAST}>
        <boxGeometry args={[0.32, 0.08, 1.18]} />
        <meshStandardMaterial color="#475569" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <mesh position={[0, padY * 0.5, centerZ + 0.42]} raycast={NOOP_RAYCAST}>
        <boxGeometry args={[0.08, padY, 0.08]} />
        <meshStandardMaterial color="#334155" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0, padY * 0.5, centerZ - 0.42]} raycast={NOOP_RAYCAST}>
        <boxGeometry args={[0.08, padY, 0.08]} />
        <meshStandardMaterial color="#334155" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}

const FLOOR_MAT_PRESETS = new Set([
  'push_up_bottom',
  'standard_plank',
  'side_plank',
  'glute_bridge_peak',
  'russian_twist',
  'superman_back_extension',
  'cobra_pose',
  'childs_pose',
  'kneeling_hip_flexor_stretch',
  'barbell_squat_bottom',
  'barbell_front_squat_bottom',
  'sumo_deadlift_start',
  'conventional_deadlift_start',
  'romanian_deadlift',
  'asian_deep_squat',
  'barbell_hip_thrust_peak',
  'flat_bench_press_bottom',
  'incline_dumbbell_press_bottom',
  'dumbbell_chest_fly_bottom',
]);

const BARBELL_HAND_PRESETS = new Set([
  'sumo_deadlift_start',
  'conventional_deadlift_start',
  'romanian_deadlift',
  'flat_bench_press_bottom',
  'standing_overhead_press',
  'bent_over_barbell_row',
]);

const BACK_BARBELL_PRESETS = new Set([
  'barbell_squat_bottom',
  'standing_calf_raise_peak',
]);

const BOTH_DUMBBELL_PRESETS = new Set([
  'incline_dumbbell_press_bottom',
  'dumbbell_lateral_raise_top',
  'dumbbell_bicep_curl_peak',
  'dumbbell_chest_fly_bottom',
  'hammer_curl_peak',
  'farmers_walk',
]);

export function ExercisePropsOverlay() {
  const activePresetId = useSimStore((s) => s.activePresetId);
  const kinematics = useSimStore((s) => s.kinematics);

  const propsConfig = useMemo(() => {
    if (!activePresetId) return null;
    const j = kinematics.joints;
    return {
      showFloorMat: FLOOR_MAT_PRESETS.has(activePresetId),
      benchMode:
        activePresetId === 'flat_bench_press_bottom' ||
        activePresetId === 'dumbbell_chest_fly_bottom'
          ? ('flat' as const)
          : activePresetId === 'incline_dumbbell_press_bottom'
          ? ('incline' as const)
          : activePresetId === 'barbell_hip_thrust_peak'
          ? ('hip_thrust' as const)
          : null,
      showHandBarbell: BARBELL_HAND_PRESETS.has(activePresetId),
      showBackBarbell: BACK_BARBELL_PRESETS.has(activePresetId),
      showFrontBarbell: activePresetId === 'barbell_front_squat_bottom',
      showHipBarbell: activePresetId === 'barbell_hip_thrust_peak',
      showBothDumbbells: BOTH_DUMBBELL_PRESETS.has(activePresetId),
      showRightDumbbell:
        activePresetId === 'single_arm_dumbbell_row' ||
        activePresetId === 'overhead_tricep_extension_bottom',
      showPullupBar: activePresetId === 'pull_up_peak',
      showDipBars: activePresetId === 'parallel_bar_dip_bottom',
      showCablePulldown:
        activePresetId === 'wide_grip_lat_pulldown' ||
        activePresetId === 'tricep_rope_pushdown_lockout',
      showCableHorizontal:
        activePresetId === 'seated_cable_row_peak' ||
        activePresetId === 'cable_face_pull_peak',
      j,
    };
  }, [activePresetId, kinematics]);

  if (!propsConfig) return null;

  const { j } = propsConfig;
  const wL = j.wrist_L.worldPosition;
  const wR = j.wrist_R.worldPosition;
  const eL = j.elbow_L.worldPosition;
  const eR = j.elbow_R.worldPosition;
  const shL = j.shoulder_L.worldPosition;
  const shR = j.shoulder_R.worldPosition;
  const pel = j.pelvis.worldPosition;
  const thx = j.thorax.worldPosition;

  return (
    <group name="exercise-translucent-props">
      {/* 半透明地板／訓練墊 (y = 0) */}
      {propsConfig.showFloorMat && (
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
          <planeGeometry args={[1.6, 2.2]} />
          <meshStandardMaterial
            color="#38bdf8"
            transparent
            opacity={0.13}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 半透明重訓躺椅 / 上斜椅 / 臀推靠椅 */}
      {propsConfig.benchMode && (
        <TranslucentBench
          pelvisPos={pel}
          thoraxPos={thx}
          mode={propsConfig.benchMode}
        />
      )}

      {/* 手持槓鈴 */}
      {propsConfig.showHandBarbell && (
        <TranslucentBarbell leftPos={wL} rightPos={wR} />
      )}

      {/* 背蹲 / 提踵 槓鈴（架於上背肩峰後方） */}
      {propsConfig.showBackBarbell && (
        <TranslucentBarbell
          leftPos={[shL[0], shL[1] + 0.05, shL[2] - 0.06]}
          rightPos={[shR[0], shR[1] + 0.05, shR[2] - 0.06]}
        />
      )}

      {/* 前蹲 槓鈴（架於前三角肌上方） */}
      {propsConfig.showFrontBarbell && (
        <TranslucentBarbell
          leftPos={[shL[0], shL[1] + 0.05, shL[2] + 0.07]}
          rightPos={[shR[0], shR[1] + 0.05, shR[2] + 0.07]}
        />
      )}

      {/* 臀推 槓鈴（置於骨盆前側） */}
      {propsConfig.showHipBarbell && (
        <TranslucentBarbell
          leftPos={[pel[0] + 0.35, pel[1] + 0.09, pel[2]]}
          rightPos={[pel[0] - 0.35, pel[1] + 0.09, pel[2]]}
        />
      )}

      {/* 雙手啞鈴 */}
      {propsConfig.showBothDumbbells && (
        <>
          <TranslucentDumbbell wristPos={wL} elbowPos={eL} />
          <TranslucentDumbbell wristPos={wR} elbowPos={eR} />
        </>
      )}

      {/* 單手啞鈴 */}
      {propsConfig.showRightDumbbell && (
        <TranslucentDumbbell wristPos={wR} elbowPos={eR} />
      )}

      {/* 引體向上單槓 */}
      {propsConfig.showPullupBar && (
        <mesh
          position={[0, (wL[1] + wR[1]) * 0.5 + 0.03, (wL[2] + wR[2]) * 0.5]}
          rotation={[0, 0, Math.PI / 2]}
          raycast={NOOP_RAYCAST}
        >
          <cylinderGeometry args={[0.018, 0.018, 1.4, 12]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}

      {/* 雙槓臂屈伸平行槓 */}
      {propsConfig.showDipBars && (
        <>
          {[wL, wR].map((w, i) => (
            <group key={i}>
              <mesh position={[w[0], w[1] - 0.02, w[2]]} rotation={[Math.PI / 2, 0, 0]} raycast={NOOP_RAYCAST}>
                <cylinderGeometry args={[0.02, 0.02, 0.9, 12]} />
                <meshStandardMaterial color="#38bdf8" transparent opacity={0.28} depthWrite={false} />
              </mesh>
              <mesh position={[w[0], (w[1] - 0.02) * 0.5, w[2] - 0.35]} raycast={NOOP_RAYCAST}>
                <cylinderGeometry args={[0.02, 0.02, Math.max(0.2, w[1] - 0.02), 10]} />
                <meshStandardMaterial color="#475569" transparent opacity={0.2} depthWrite={false} />
              </mesh>
            </group>
          ))}
        </>
      )}

      {/* 滑輪下拉 / 三頭下壓 握把與垂直纜繩 */}
      {propsConfig.showCablePulldown && (
        <group>
          <mesh
            position={[(wL[0] + wR[0]) * 0.5, (wL[1] + wR[1]) * 0.5, (wL[2] + wR[2]) * 0.5]}
            rotation={[0, 0, Math.PI / 2]}
            raycast={NOOP_RAYCAST}
          >
            <cylinderGeometry args={[0.014, 0.014, Math.max(0.35, Math.hypot(wL[0] - wR[0], wL[1] - wR[1]) + 0.16), 10]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.32} depthWrite={false} />
          </mesh>
          <mesh
            position={[(wL[0] + wR[0]) * 0.5, (wL[1] + wR[1]) * 0.5 + 0.45, (wL[2] + wR[2]) * 0.5]}
            raycast={NOOP_RAYCAST}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.9, 8]} />
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.26} depthWrite={false} />
          </mesh>
        </group>
      )}

      {/* 坐姿划船 / 臉拉 水平纜繩 */}
      {propsConfig.showCableHorizontal && (
        <group>
          <mesh
            position={[(wL[0] + wR[0]) * 0.5, (wL[1] + wR[1]) * 0.5, (wL[2] + wR[2]) * 0.5 + 0.55]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={NOOP_RAYCAST}
          >
            <cylinderGeometry args={[0.007, 0.007, 1.1, 8]} />
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.26} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

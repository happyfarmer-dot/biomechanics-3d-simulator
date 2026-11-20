import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Mesh, Quaternion, Vector3 } from 'three';
import { JOINT_ORDER, SKELETON_CONFIG } from '../../data/skeletonConfig';
import { useSimStore } from '../../store/useSimStore';
import type { JointId, RiskSeverity } from '../../types/biomechanics';

const UP_VEC = new Vector3(0, 1, 0);

function PulsingRiskHalo({ severity }: { severity: RiskSeverity }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current || severity === 'normal') return;
    const t = clock.getElapsedTime();
    const pulse = 1 + 0.25 * Math.sin(t * (severity === 'critical' ? 7 : 3.5));
    meshRef.current.scale.setScalar(pulse);
  });

  if (severity === 'normal') return null;

  const color = severity === 'critical' ? '#ef4444' : '#f59e0b';
  const opacity = severity === 'critical' ? 0.45 : 0.3;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.056, 20, 20]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function BoneSegment({
  jointId,
  start,
  end,
  radius,
  showSkeleton,
  showSkin,
  isGhosted,
}: {
  jointId: JointId;
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  showSkeleton: boolean;
  showSkin: boolean;
  isGhosted: boolean;
}) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const p0 = new Vector3(...start);
    const p1 = new Vector3(...end);
    const diff = p1.clone().sub(p0);
    const len = Math.max(diff.length(), 0.001);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(UP_VEC, diff.normalize());
    return {
      midpoint: [mid.x, mid.y, mid.z] as [number, number, number],
      length: len,
      quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
    };
  }, [start, end]);

  const isHead = jointId === 'head';
  const isThorax = jointId === 'thorax';
  const isPelvis = jointId === 'pelvis';
  const skinRadius = isHead
    ? radius * 1.45
    : isThorax
    ? radius * 1.65
    : isPelvis
    ? radius * 1.6
    : radius * 1.95;

  const boneOpacity = isGhosted ? 0.12 : 1;
  const skinOpacity = isGhosted ? 0.04 : 0.18;

  return (
    <group position={midpoint} quaternion={quaternion}>
      {showSkeleton && (
        <>
          {isHead ? (
            <mesh castShadow={!isGhosted}>
              <sphereGeometry args={[radius * 1.15, 24, 24]} />
              <meshStandardMaterial
                color="#e8e2d5"
                roughness={0.45}
                metalness={0.05}
                transparent={isGhosted}
                opacity={boneOpacity}
                depthWrite={!isGhosted}
              />
            </mesh>
          ) : isThorax ? (
            <mesh castShadow={!isGhosted}>
              <cylinderGeometry args={[radius * 1.15, radius * 0.85, length, 18]} />
              <meshStandardMaterial
                color="#e8e2d5"
                roughness={0.45}
                metalness={0.05}
                transparent={isGhosted}
                opacity={boneOpacity}
                depthWrite={!isGhosted}
              />
            </mesh>
          ) : isPelvis ? (
            <mesh castShadow={!isGhosted}>
              <cylinderGeometry args={[radius * 1.05, radius * 1.2, length, 16]} />
              <meshStandardMaterial
                color="#e8e2d5"
                roughness={0.45}
                metalness={0.05}
                transparent={isGhosted}
                opacity={boneOpacity}
                depthWrite={!isGhosted}
              />
            </mesh>
          ) : (
            <mesh castShadow={!isGhosted}>
              <cylinderGeometry args={[radius * 0.85, radius * 0.72, length, 14]} />
              <meshStandardMaterial
                color="#e8e2d5"
                roughness={0.42}
                metalness={0.05}
                transparent={isGhosted}
                opacity={boneOpacity}
                depthWrite={!isGhosted}
              />
            </mesh>
          )}
        </>
      )}

      {showSkin && (
        <mesh>
          {isHead ? (
            <sphereGeometry args={[skinRadius, 24, 24]} />
          ) : (
            <capsuleGeometry args={[skinRadius, Math.max(length * 0.65, 0.02), 8, 16]} />
          )}
          <meshStandardMaterial
            color="#94a3b8"
            transparent
            opacity={skinOpacity}
            depthWrite={false}
            roughness={0.7}
          />
        </mesh>
      )}
    </group>
  );
}

export function HumanRig() {
  const kinematics = useSimStore((s) => s.kinematics);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setSelectedJoint = useSimStore((s) => s.setSelectedJoint);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);
  const layers = useSimStore((s) => s.layers);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const heightM = useSimStore((s) => s.heightM);

  const scale = heightM / 1.75;

  // Adjacent joints remain visible during macro focus; all others fade to 0.12
  const activeMacroSet = useMemo(() => {
    if (!focusedJointId) return null;
    const set = new Set<JointId>([focusedJointId]);
    const focusedParent = SKELETON_CONFIG[focusedJointId].parentId;
    if (focusedParent) set.add(focusedParent);
    for (const id of JOINT_ORDER) {
      if (SKELETON_CONFIG[id].parentId === focusedJointId) {
        set.add(id);
      }
    }
    return set;
  }, [focusedJointId]);

  return (
    <group name="human-rig">
      {JOINT_ORDER.map((id) => {
        const j = kinematics.joints[id];
        const cfg = SKELETON_CONFIG[id];
        const isSelected = selectedJoint === id;
        const isFocused = focusedJointId === id;
        const risk = jointRiskMap[id];

        // Segment belongs to id: visible if id === focusedJointId or id === focusedParent
        const isSegmentVisible =
          !activeMacroSet ||
          id === focusedJointId ||
          id === SKELETON_CONFIG[focusedJointId!].parentId;
        const isJointVisible = !activeMacroSet || activeMacroSet.has(id);

        return (
          <group key={id}>
            <BoneSegment
              jointId={id}
              start={j.worldPosition}
              end={j.distalWorldPosition}
              radius={cfg.boneRadius * scale}
              showSkeleton={layers.skeleton}
              showSkin={layers.skin}
              isGhosted={!isSegmentVisible}
            />

            <group position={j.worldPosition} quaternion={j.worldQuaternion}>
              {layers.skeleton && (
                <mesh
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedJoint(id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setFocusedJoint(id);
                  }}
                >
                  <sphereGeometry args={[cfg.boneRadius * scale * 0.95 + 0.008, 16, 16]} />
                  <meshStandardMaterial
                    color={
                      isSelected
                        ? '#38bdf8'
                        : risk === 'critical'
                        ? '#ef4444'
                        : risk === 'warning'
                        ? '#f59e0b'
                        : '#cbd5e1'
                    }
                    emissive={
                      isSelected
                        ? '#0284c7'
                        : risk === 'critical'
                        ? '#991b1b'
                        : '#000000'
                    }
                    emissiveIntensity={isSelected || risk === 'critical' ? 0.8 : 0}
                    roughness={0.3}
                    transparent={!isJointVisible || isFocused}
                    opacity={!isJointVisible ? 0.12 : isFocused ? 0.28 : 1}
                    depthWrite={isJointVisible && !isFocused}
                  />
                </mesh>
              )}

              {isJointVisible && !isFocused && <PulsingRiskHalo severity={risk} />}
              {layers.axesDebug && isJointVisible && <axesHelper args={[0.14]} />}
            </group>
          </group>
        );
      })}
    </group>
  );
}

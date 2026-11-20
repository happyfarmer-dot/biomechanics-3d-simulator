import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import { Mesh, Quaternion, Vector3 } from 'three';
import { JOINT_ORDER, SKELETON_CONFIG } from '../../data/skeletonConfig';
import { useSimStore } from '../../store/useSimStore';
import type { JointId, RiskSeverity } from '../../types/biomechanics';
import {
  getBoneMaterial,
  getCartilageMaterial,
  getJointCapsuleMaterial,
  getSkinFresnelMaterial,
} from '../../utils/anatomyTextures';

const UP_VEC = new Vector3(0, 1, 0);

function GlbBoneOverride({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone()} />;
}

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
  const opacity = severity === 'critical' ? 0.42 : 0.28;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.056, 20, 20]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function SpineStack({
  count,
  length,
  radius,
  boneMat,
  discMat,
}: {
  count: number;
  length: number;
  radius: number;
  boneMat: ReturnType<typeof getBoneMaterial>;
  discMat: ReturnType<typeof getCartilageMaterial>;
}) {
  const step = length / count;
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => {
        const y = -length / 2 + step * (i + 0.5);
        return (
          <group key={i} position={[0, y, 0]}>
            {/* Vertebral body */}
            <mesh material={boneMat} castShadow>
              <cylinderGeometry args={[radius * 0.52, radius * 0.56, step * 0.68, 12]} />
            </mesh>
            {/* Posterior spinous process */}
            <mesh position={[0, -step * 0.05, -radius * 0.65]} rotation={[0.35, 0, 0]} material={boneMat}>
              <boxGeometry args={[radius * 0.18, step * 0.42, radius * 0.6]} />
            </mesh>
            {/* Intervertebral disc */}
            {i < count - 1 && (
              <mesh position={[0, step * 0.48, 0]} material={discMat}>
                <cylinderGeometry args={[radius * 0.5, radius * 0.5, step * 0.24, 12]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function AnatomicalBoneMesh({
  jointId,
  length,
  radius,
  scale,
  isGhosted,
}: {
  jointId: JointId;
  length: number;
  radius: number;
  scale: number;
  isGhosted: boolean;
}) {
  const boneMat = getBoneMaterial(isGhosted);
  const cartMat = getCartilageMaterial(isGhosted);

  // 1. Skull with Eye Sockets (Orbits), Nasal Bridge & Contoured Mandible
  if (jointId === 'head') {
    return (
      <group>
        {/* Cranium dome */}
        <mesh position={[0, length * 0.16, -0.014 * scale]} scale={[0.9, 1.06, 1.08]} material={boneMat} castShadow={!isGhosted}>
          <sphereGeometry args={[radius * 1.08, 24, 24]} />
        </mesh>
        {/* Brow / Supraorbital Ridge */}
        <mesh position={[0, length * 0.08, 0.056 * scale]} material={boneMat}>
          <boxGeometry args={[radius * 1.15, 0.012 * scale, 0.024 * scale]} />
        </mesh>
        {/* Left & Right Eye Sockets (Recessed Orbits) */}
        {([-1, 1] as const).map((s) => (
          <mesh key={s} position={[s * 0.025 * scale, length * 0.01, 0.062 * scale]} rotation={[0.1, 0, 0]}>
            <cylinderGeometry args={[0.015 * scale, 0.012 * scale, 0.022 * scale, 12]} />
            <meshStandardMaterial color="#1e293b" roughness={0.8} transparent={isGhosted} opacity={isGhosted ? 0.1 : 0.9} />
          </mesh>
        ))}
        {/* Nasal Bridge & Cheekbones */}
        <mesh position={[0, -length * 0.05, 0.068 * scale]} rotation={[-0.25, 0, 0]} material={boneMat}>
          <boxGeometry args={[0.012 * scale, 0.028 * scale, 0.018 * scale]} />
        </mesh>
        {/* Contoured Mandible (Jaw) */}
        <mesh position={[0, -length * 0.25, 0.028 * scale]} rotation={[0.12, 0, 0]} material={boneMat} castShadow={!isGhosted}>
          <cylinderGeometry args={[radius * 0.56, radius * 0.36, length * 0.36, 12]} />
        </mesh>
      </group>
    );
  }

  // 2. Cervical Spine (7 vertebrae)
  if (jointId === 'neck') {
    return <SpineStack count={7} length={length} radius={radius} boneMat={boneMat} discMat={cartMat} />;
  }

  // 3. Lumbar Spine (5 vertebrae)
  if (jointId === 'lumbar') {
    return <SpineStack count={5} length={length} radius={radius * 0.85} boneMat={boneMat} discMat={cartMat} />;
  }

  // 4. Thorax: 12 Thoracic Vertebrae + 12 Pairs of Independent Curved Ribs + Manubrium & Sternum
  if (jointId === 'thorax') {
    const ribPairs = 12;
    return (
      <group>
        <group position={[0, 0, -0.058 * scale]}>
          <SpineStack count={12} length={length} radius={radius * 0.4} boneMat={boneMat} discMat={cartMat} />
        </group>
        {/* Manubrium (upper sternum) */}
        <mesh position={[0, length * 0.28, 0.072 * scale]} rotation={[-0.18, 0, 0]} material={boneMat} castShadow={!isGhosted}>
          <boxGeometry args={[0.036 * scale, 0.034 * scale, 0.011 * scale]} />
        </mesh>
        {/* Sternum body */}
        <mesh position={[0, length * 0.04, 0.078 * scale]} rotation={[-0.08, 0, 0]} material={boneMat} castShadow={!isGhosted}>
          <boxGeometry args={[0.022 * scale, length * 0.48, 0.01 * scale]} />
        </mesh>
        {/* 12 Pairs of Independent Left & Right Curved Ribs */}
        {Array.from({ length: ribPairs }).map((_, i) => {
          const t = i / (ribPairs - 1);
          const y = length * (0.38 - t * 0.78);
          const profile = Math.sin(t * Math.PI * 0.85 + 0.22);
          const rx = (0.062 + profile * 0.068) * scale;
          const rz = (0.052 + profile * 0.032) * scale;
          const arcAngle = i >= 10 ? Math.PI * 0.55 : Math.PI * 0.84; // Floating ribs 11-12 shorter
          return (
            <group key={i} position={[0, y, 0.008 * scale]}>
              {/* Left Rib Arc (+X) */}
              <mesh
                rotation={[Math.PI / 2 + 0.14, 0, -Math.PI * 0.44]}
                scale={[rx, rz, 1]}
                material={boneMat}
              >
                <torusGeometry args={[1, 0.0042 / Math.max(rx, 0.01), 6, 16, arcAngle]} />
              </mesh>
              {/* Right Rib Arc (-X) */}
              <mesh
                rotation={[Math.PI / 2 + 0.14, Math.PI, -Math.PI * 0.44]}
                scale={[rx, rz, 1]}
                material={boneMat}
              >
                <torusGeometry args={[1, 0.0042 / Math.max(rx, 0.01), 6, 16, arcAngle]} />
              </mesh>
            </group>
          );
        })}
        {/* Bilateral Clavicles & Acromion Arch */}
        {([-1, 1] as const).map((s) => (
          <group key={s}>
            <mesh
              position={[s * 0.095 * scale, length * 0.35, 0.045 * scale]}
              rotation={[0, s * 0.25, s * 1.48]}
              material={boneMat}
            >
              <capsuleGeometry args={[0.0075 * scale, 0.14 * scale, 6, 10]} />
            </mesh>
            <mesh position={[s * 0.195 * scale, length * 0.32, 0]} material={boneMat}>
              <boxGeometry args={[0.032 * scale, 0.011 * scale, 0.034 * scale]} />
            </mesh>
            <mesh position={[s * 0.198 * scale, length * 0.22, 0]} rotation={[0, 0, Math.PI / 2]} material={cartMat}>
              <cylinderGeometry args={[0.023 * scale, 0.023 * scale, 0.01 * scale, 14]} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  // 5. Pelvis: Sacrum + Curved Flared Iliac Wings + Pubic Symphysis + Acetabulum
  if (jointId === 'pelvis') {
    return (
      <group>
        {/* Sacrum */}
        <mesh position={[0, 0.01 * scale, -0.048 * scale]} rotation={[0.18, 0, 0]} material={boneMat} castShadow={!isGhosted}>
          <cylinderGeometry args={[0.042 * scale, 0.016 * scale, length * 0.9, 10]} />
        </mesh>
        {/* Left & Right Flared Curved Iliac Wings */}
        {([-1, 1] as const).map((s) => (
          <group key={s}>
            {/* Curved Iliac Crest Arch */}
            <mesh
              position={[s * 0.072 * scale, 0.01 * scale, -0.01 * scale]}
              rotation={[0.25, s * 0.45, s * -0.45]}
              scale={[0.068 * scale, 0.052 * scale, 0.02 * scale]}
              material={boneMat}
              castShadow={!isGhosted}
            >
              <sphereGeometry args={[1, 14, 14]} />
            </mesh>
            {/* Acetabular Cartilage Socket */}
            <mesh position={[s * 0.092 * scale, -length * 0.35, 0]} material={cartMat}>
              <sphereGeometry args={[0.026 * scale, 14, 14]} />
            </mesh>
            {/* Ischial Tuberosity */}
            <mesh position={[s * 0.065 * scale, -length * 0.52, -0.025 * scale]} material={boneMat}>
              <sphereGeometry args={[0.016 * scale, 10, 10]} />
            </mesh>
          </group>
        ))}
        {/* Pubic Symphysis Arch */}
        <mesh position={[0, -length * 0.42, 0.048 * scale]} rotation={[0, 0, Math.PI / 2]} material={boneMat}>
          <capsuleGeometry args={[0.011 * scale, 0.1 * scale, 6, 10]} />
        </mesh>
      </group>
    );
  }

  // 6. Forearm (Ulna + Radius) & Lower Leg (Tibia + Fibula)
  const isForearm = jointId.startsWith('elbow_');
  const isShank = jointId.startsWith('knee_');
  const isSideL = jointId.endsWith('_L');
  const latSign = isSideL ? 1 : -1;

  if (isForearm || isShank) {
    const condyleSpread = radius * 0.82;
    return (
      <group>
        {/* Main bone (Ulna / Tibia) */}
        <mesh position={[-latSign * radius * 0.25, 0, 0]} material={boneMat} castShadow={!isGhosted}>
          <cylinderGeometry args={[radius * 0.56, radius * 0.48, length * 0.88, 12]} />
        </mesh>
        {/* Companion bone (Radius / Fibula) */}
        <mesh position={[latSign * radius * 0.42, 0, -radius * 0.1]} material={boneMat} castShadow={!isGhosted}>
          <cylinderGeometry args={[radius * 0.36, radius * 0.34, length * 0.86, 10]} />
        </mesh>
        {/* Proximal Condyles / Plateau */}
        {([-1, 1] as const).map((s) => (
          <mesh key={`p_${s}`} position={[s * condyleSpread * 0.65, length * 0.45, 0]} material={boneMat}>
            <sphereGeometry args={[radius * 0.66, 12, 12]} />
          </mesh>
        ))}
        {/* Proximal Articular Cartilage */}
        <mesh position={[0, length * 0.48, 0]} material={cartMat}>
          <cylinderGeometry args={[radius * 1.15, radius * 1.15, 0.008 * scale, 16]} />
        </mesh>
        {/* Distal Condyles / Malleoli */}
        {([-1, 1] as const).map((s) => (
          <mesh key={`d_${s}`} position={[s * condyleSpread * 0.55, -length * 0.45, 0]} material={boneMat}>
            <sphereGeometry args={[radius * 0.54, 12, 12]} />
          </mesh>
        ))}
        {/* Olecranon process for elbow */}
        {isForearm && (
          <mesh position={[0, length * 0.47, -radius * 0.65]} material={boneMat}>
            <sphereGeometry args={[radius * 0.55, 10, 10]} />
          </mesh>
        )}
      </group>
    );
  }

  // 7. Single Long Bones (Humerus / Femur) with Proximal Head & Distal Epicondyles
  const isUpperArm = jointId.startsWith('shoulder_');
  const isThigh = jointId.startsWith('hip_');
  if (isUpperArm || isThigh) {
    return (
      <group>
        {/* Diaphysis shaft */}
        <mesh material={boneMat} castShadow={!isGhosted}>
          <cylinderGeometry args={[radius * 0.64, radius * 0.58, length * 0.86, 14]} />
        </mesh>
        {/* Proximal Humeral/Femoral Head + Articular Cartilage */}
        <mesh position={[-latSign * radius * 0.32, length * 0.46, 0]} material={cartMat}>
          <sphereGeometry args={[radius * 0.92, 16, 16]} />
        </mesh>
        {/* Greater Tubercle / Trochanter */}
        <mesh position={[latSign * radius * 0.52, length * 0.42, 0]} material={boneMat}>
          <sphereGeometry args={[radius * 0.65, 12, 12]} />
        </mesh>
        {/* Distal Medial & Lateral Condyles */}
        {([-1, 1] as const).map((s) => (
          <mesh key={s} position={[s * radius * 0.62, -length * 0.45, 0]} material={boneMat}>
            <sphereGeometry args={[radius * 0.72, 14, 14]} />
          </mesh>
        ))}
        {/* Distal Cartilage surface */}
        <mesh position={[0, -length * 0.48, 0]} material={cartMat}>
          <cylinderGeometry args={[radius * 1.1, radius * 1.1, 0.008 * scale, 16]} />
        </mesh>
      </group>
    );
  }

  // 8. Hands & Feet
  return (
    <mesh material={boneMat} castShadow={!isGhosted}>
      <capsuleGeometry args={[radius * 0.68, Math.max(length * 0.65, 0.015), 8, 12]} />
    </mesh>
  );
}

function BoneSegment({
  jointId,
  start,
  end,
  radius,
  scale,
  showSkeleton,
  showSkin,
  isGhosted,
}: {
  jointId: JointId;
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  scale: number;
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

  const glbUrl = SKELETON_CONFIG[jointId].glbUrl;
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

  return (
    <group position={midpoint} quaternion={quaternion}>
      {showSkeleton && (
        glbUrl ? (
          <Suspense fallback={null}>
            <GlbBoneOverride url={glbUrl} />
          </Suspense>
        ) : (
          <AnatomicalBoneMesh
            jointId={jointId}
            length={length}
            radius={radius}
            scale={scale}
            isGhosted={isGhosted}
          />
        )
      )}

      {showSkin && (
        <mesh material={getSkinFresnelMaterial(isGhosted)}>
          {isHead ? (
            <sphereGeometry args={[skinRadius, 24, 24]} />
          ) : (
            <capsuleGeometry args={[skinRadius, Math.max(length * 0.65, 0.02), 8, 16]} />
          )}
        </mesh>
      )}
    </group>
  );
}

/**
 * Visible internal joint structures (Patella + Patellar Tendon, Menisci, Joint Capsule)
 */
function JointInternalStructures({
  jointId,
  scale,
  showCapsule,
  isGhosted,
}: {
  jointId: JointId;
  scale: number;
  showCapsule: boolean;
  isGhosted: boolean;
}) {
  const boneMat = getBoneMaterial(isGhosted);
  const cartMat = getCartilageMaterial(isGhosted);
  const capsuleMat = getJointCapsuleMaterial();

  const isKnee = jointId.startsWith('knee_');
  const isMajorJoint =
    isKnee ||
    jointId.startsWith('shoulder_') ||
    jointId.startsWith('elbow_') ||
    jointId.startsWith('ankle_') ||
    jointId.startsWith('hip_');

  if (!isMajorJoint) return null;

  const capsuleRadius =
    jointId.startsWith('hip_') || jointId.startsWith('shoulder_')
      ? 0.048 * scale
      : isKnee
      ? 0.046 * scale
      : 0.032 * scale;

  return (
    <group>
      {/* Patella & Patellar Tendon for Knee */}
      {isKnee && (
        <group>
          <mesh position={[0, 0.008 * scale, 0.038 * scale]} scale={[1, 1.15, 0.55]} material={boneMat}>
            <sphereGeometry args={[0.018 * scale, 16, 16]} />
          </mesh>
          <mesh position={[0, -0.026 * scale, 0.035 * scale]} rotation={[0.1, 0, 0]} material={cartMat}>
            <capsuleGeometry args={[0.0055 * scale, 0.045 * scale, 6, 10]} />
          </mesh>
          {/* Baseline Menisci pads */}
          {([-1, 1] as const).map((s) => (
            <mesh
              key={s}
              position={[s * 0.017 * scale, -0.002 * scale, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={cartMat}
            >
              <torusGeometry args={[0.013 * scale, 0.004 * scale, 8, 16, Math.PI * 1.25]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Translucent Joint Capsule */}
      {showCapsule && !isGhosted && (
        <mesh material={capsuleMat}>
          <sphereGeometry args={[capsuleRadius, 20, 20]} />
        </mesh>
      )}
    </group>
  );
}

export function HumanRig({ hideProceduralBones = false }: { hideProceduralBones?: boolean }) {
  const kinematics = useSimStore((s) => s.kinematics);
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setSelectedJoint = useSimStore((s) => s.setSelectedJoint);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);
  const layers = useSimStore((s) => s.layers);
  const jointRiskMap = useSimStore((s) => s.jointRiskMap);
  const heightM = useSimStore((s) => s.heightM);

  const scale = heightM / 1.75;

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
              scale={scale}
              showSkeleton={!hideProceduralBones && layers.skeleton}
              showSkin={layers.skin}
              isGhosted={!isSegmentVisible}
            />

            <group position={j.worldPosition} quaternion={j.worldQuaternion}>
              {layers.skeleton && (
                <>
                  {/* Clickable Joint Core */}
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
                    <sphereGeometry args={[cfg.boneRadius * scale * 0.72 + 0.006, 16, 16]} />
                    <meshStandardMaterial
                      color={
                        isSelected
                          ? '#38bdf8'
                          : risk === 'critical'
                          ? '#ef4444'
                          : risk === 'warning'
                          ? '#f59e0b'
                          : '#dbeafe'
                      }
                      emissive={
                        isSelected
                          ? '#0284c7'
                          : risk === 'critical'
                          ? '#991b1b'
                          : '#000000'
                      }
                      emissiveIntensity={isSelected || risk === 'critical' ? 0.75 : 0}
                      roughness={0.22}
                      transparent
                      opacity={!isJointVisible ? 0.12 : isFocused ? 0.2 : 0.75}
                      depthWrite={false}
                    />
                  </mesh>

                  <JointInternalStructures
                    jointId={id}
                    scale={scale}
                    showCapsule={layers.jointCapsule}
                    isGhosted={!isJointVisible}
                  />
                </>
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

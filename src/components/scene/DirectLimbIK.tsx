import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { solveTwoBoneLimbIK, type LimbId } from '../../engine/ikSolver';
import { useSimStore } from '../../store/useSimStore';
import type { JointId } from '../../types/biomechanics';

const LIMB_HANDLES: Array<{ limb: LimbId; jointId: JointId }> = [
  { limb: 'arm_L', jointId: 'wrist_L' },
  { limb: 'arm_R', jointId: 'wrist_R' },
  { limb: 'leg_L', jointId: 'ankle_L' },
  { limb: 'leg_R', jointId: 'ankle_R' },
];

export function DirectLimbIK() {
  const { camera, gl } = useThree();
  const interactionMode = useSimStore((s) => s.interactionMode);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const kinematics = useSimStore((s) => s.kinematics);
  const heightM = useSimStore((s) => s.heightM);
  const setIsDraggingGizmo = useSimStore((s) => s.setIsDraggingGizmo);
  const setSelectedJoint = useSimStore((s) => s.setSelectedJoint);
  const applyPosePatch = useSimStore((s) => s.applyPosePatch);

  const [draggingLimb, setDraggingLimb] = useState<LimbId | null>(null);
  const activeDragRef = useRef<{
    limb: LimbId;
    plane: Plane;
  } | null>(null);

  const raycasterRef = useRef(new Raycaster());
  const ndcRef = useRef(new Vector2());

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndcRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndcRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(ndcRef.current, camera);
      const hit = new Vector3();
      if (raycasterRef.current.ray.intersectPlane(drag.plane, hit)) {
        const st = useSimStore.getState();
        const patch = solveTwoBoneLimbIK(
          drag.limb,
          [hit.x, hit.y, hit.z],
          st.pose,
          st.heightM,
          st.calibratedOffsets,
          st.activePresetId
        );
        applyPosePatch(patch);
      }
    };

    const onPointerUp = () => {
      if (!activeDragRef.current) return;
      activeDragRef.current = null;
      setDraggingLimb(null);
      setIsDraggingGizmo(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [camera, gl, applyPosePatch, setIsDraggingGizmo]);

  if (interactionMode !== 'pose' || focusedJointId) return null;

  const scale = heightM / 1.75;

  return (
    <group name="direct-limb-ik">
      {LIMB_HANDLES.map(({ limb, jointId }) => {
        const pos = kinematics.joints[jointId].worldPosition;
        const isActive = draggingLimb === limb;
        return (
          <group key={limb} position={pos}>
            {/* Enlarged invisible/soft touch-friendly hit sphere */}
            <mesh
              renderOrder={998}
              onPointerDown={(e) => {
                e.stopPropagation();
                const camDir = new Vector3();
                camera.getWorldDirection(camDir);
                const plane = new Plane().setFromNormalAndCoplanarPoint(
                  camDir.negate(),
                  new Vector3(...pos)
                );
                activeDragRef.current = { limb, plane };
                setDraggingLimb(limb);
                setIsDraggingGizmo(true);
                setSelectedJoint(
                  (limb.startsWith('arm_')
                    ? `shoulder_${limb.endsWith('_L') ? 'L' : 'R'}`
                    : `hip_${limb.endsWith('_L') ? 'L' : 'R'}`) as JointId
                );
              }}
            >
              <sphereGeometry args={[0.044 * scale, 14, 14]} />
              <meshBasicMaterial
                color={isActive ? '#f59e0b' : '#38bdf8'}
                transparent
                opacity={isActive ? 0.25 : 0.14}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            {/* Visible inner core */}
            <mesh renderOrder={999}>
              <sphereGeometry args={[0.022 * scale, 16, 16]} />
              <meshStandardMaterial
                color={isActive ? '#fbbf24' : '#38bdf8'}
                emissive={isActive ? '#d97706' : '#0284c7'}
                emissiveIntensity={isActive ? 1.1 : 0.75}
                transparent
                opacity={0.85}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

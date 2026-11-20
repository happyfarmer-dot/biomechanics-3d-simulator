import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
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
        const currentPose = useSimStore.getState().pose;
        const patch = solveTwoBoneLimbIK(
          drag.limb,
          [hit.x, hit.y, hit.z],
          currentPose,
          useSimStore.getState().heightM
        );
        applyPosePatch(patch);
      }
    };

    const onPointerUp = () => {
      if (!activeDragRef.current) return;
      activeDragRef.current = null;
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
        return (
          <mesh
            key={limb}
            position={pos}
            onPointerDown={(e) => {
              e.stopPropagation();
              const camDir = new Vector3();
              camera.getWorldDirection(camDir);
              const plane = new Plane().setFromNormalAndCoplanarPoint(
                camDir.negate(),
                new Vector3(...pos)
              );
              activeDragRef.current = { limb, plane };
              setIsDraggingGizmo(true);
              setSelectedJoint(
                (limb.startsWith('arm_')
                  ? `shoulder_${limb.endsWith('_L') ? 'L' : 'R'}`
                  : `hip_${limb.endsWith('_L') ? 'L' : 'R'}`) as JointId
              );
            }}
          >
            <sphereGeometry args={[0.032 * scale, 16, 16]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#0284c7"
              emissiveIntensity={0.6}
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

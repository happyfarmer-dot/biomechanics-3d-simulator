import { CameraControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { useSimStore } from '../../store/useSimStore';

export function CameraRig() {
  const controlsRef = useRef<CameraControls>(null);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);
  const isDraggingGizmo = useSimStore((s) => s.isDraggingGizmo);
  const kinematics = useSimStore((s) => s.kinematics);

  // Esc key exits macro focus back to full-body view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useSimStore.getState().focusedJointId !== null) {
        setFocusedJoint(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setFocusedJoint]);

  // Smoothly animate camera when focusedJointId changes
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (!focusedJointId) {
      ctrl.setLookAt(1.55, 1.35, 2.35, 0, 0.92, 0, true);
      return;
    }

    const j = kinematics.joints[focusedJointId];
    if (!j) return;
    const [tx, ty, tz] = j.worldPosition;

    // Oblique-anterior 0.55m offset, mirrored slightly for L/R limbs
    const sideSign = focusedJointId.endsWith('_L') ? 1 : focusedJointId.endsWith('_R') ? -1 : 0.35;
    const camX = tx + sideSign * 0.24;
    const camY = ty + 0.08;
    const camZ = tz + 0.49;

    ctrl.setLookAt(camX, camY, camZ, tx, ty, tz, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedJointId]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      enabled={!isDraggingGizmo}
      minDistance={0.22}
      maxDistance={7}
      smoothTime={0.35}
    />
  );
}

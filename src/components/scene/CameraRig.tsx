import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useSimStore } from '../../store/useSimStore';

const _right = new Vector3();
const _up = new Vector3();
const _forward = new Vector3();

export function CameraRig() {
  const controlsRef = useRef<CameraControls>(null);
  const { camera } = useThree();
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const setFocusedJoint = useSimStore((s) => s.setFocusedJoint);
  const isDraggingGizmo = useSimStore((s) => s.isDraggingGizmo);
  const kinematics = useSimStore((s) => s.kinematics);
  const setCameraVectors = useSimStore((s) => s.setCameraVectors);

  const lastRightXRef = useRef(1);
  const lastRightZRef = useRef(0);

  // Sync camera right/up/forward vectors to store whenever camera rotates
  useFrame(() => {
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

    if (
      Math.abs(_right.x - lastRightXRef.current) > 0.015 ||
      Math.abs(_right.z - lastRightZRef.current) > 0.015
    ) {
      lastRightXRef.current = _right.x;
      lastRightZRef.current = _right.z;
      setCameraVectors({
        right: [_right.x, _right.y, _right.z],
        up: [_up.x, _up.y, _up.z],
        forward: [_forward.x, _forward.y, _forward.z],
      });
    }
  });

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

import { TransformControls } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { Euler, Group, Quaternion } from 'three';
import { SKELETON_CONFIG } from '../../data/skeletonConfig';
import { eulerToAnatomical } from '../../engine/kinematics';
import { useSimStore } from '../../store/useSimStore';

export function JointGizmo() {
  const selectedJoint = useSimStore((s) => s.selectedJoint);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const kinematics = useSimStore((s) => s.kinematics);
  const isDraggingGizmo = useSimStore((s) => s.isDraggingGizmo);
  const setIsDraggingGizmo = useSimStore((s) => s.setIsDraggingGizmo);
  const setJointAngles = useSimStore((s) => s.setJointAngles);

  const [proxyObj, setProxyObj] = useState<Group | null>(null);
  const parentQuatRef = useRef(new Quaternion());

  useEffect(() => {
    if (!selectedJoint || !proxyObj || isDraggingGizmo) return;
    const j = kinematics.joints[selectedJoint];
    proxyObj.position.set(...j.worldPosition);
    proxyObj.quaternion.set(...j.worldQuaternion);
  }, [selectedJoint, kinematics, isDraggingGizmo, proxyObj]);

  if (!selectedJoint || interactionMode !== 'pose') return null;

  const handleMouseDown = () => {
    setIsDraggingGizmo(true);
    const parentId = SKELETON_CONFIG[selectedJoint].parentId;
    if (parentId) {
      parentQuatRef.current.set(...kinematics.joints[parentId].worldQuaternion);
    } else {
      parentQuatRef.current.identity();
    }
  };

  const handleMouseUp = () => {
    setIsDraggingGizmo(false);
  };

  const handleObjectChange = () => {
    if (!proxyObj) return;
    const localQuat = parentQuatRef.current
      .clone()
      .invert()
      .multiply(proxyObj.quaternion);
    const euler = new Euler().setFromQuaternion(localQuat, 'ZXY');
    const angles = eulerToAnatomical(selectedJoint, euler);
    setJointAngles(selectedJoint, {
      flexion: Math.round(angles.flexion * 10) / 10,
      abduction: Math.round(angles.abduction * 10) / 10,
      rotation: Math.round(angles.rotation * 10) / 10,
    });
  };

  return (
    <>
      <group ref={setProxyObj} />
      {proxyObj && (
        <TransformControls
          object={proxyObj}
          mode="rotate"
          space="local"
          size={0.55}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onObjectChange={handleObjectChange}
        />
      )}
    </>
  );
}

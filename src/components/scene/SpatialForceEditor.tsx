import { Html, Line, TransformControls } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { Group, Quaternion, Vector3 } from 'three';
import { GRAVITY_MPS2 } from '../../data/skeletonConfig';
import {
  getForceApplicationPoint,
  getForceMagnitudeN,
  getForceTipPoint,
} from '../../engine/staticsEngine';
import { useSimStore } from '../../store/useSimStore';
import type { SpatialForce, Vec3 } from '../../types/biomechanics';

const UP = new Vector3(0, 1, 0);

function SingleSpatialForce({
  force,
  isEditable,
}: {
  force: SpatialForce;
  isEditable: boolean;
}) {
  const kinematics = useSimStore((s) => s.kinematics);
  const heightM = useSimStore((s) => s.heightM);
  const focusedJointId = useSimStore((s) => s.focusedJointId);
  const loads = useSimStore((s) => s.loads);
  const showComponents = useSimStore((s) => s.layers.spatialComponents);
  const isDraggingGizmo = useSimStore((s) => s.isDraggingGizmo);
  const setIsDraggingGizmo = useSimStore((s) => s.setIsDraggingGizmo);
  const updateForce = useSimStore((s) => s.updateForce);
  const setSelectedForceId = useSimStore((s) => s.setSelectedForceId);

  const [tipProxy, setTipProxy] = useState<Group | null>(null);

  const pApp = getForceApplicationPoint(force, kinematics, heightM);
  const pTip = getForceTipPoint(force, kinematics, heightM);
  const magN = getForceMagnitudeN(force);

  const targetRefJointId = focusedJointId ?? force.targetJoint;
  const refJoint = kinematics.joints[targetRefJointId];
  const refLoad = loads[targetRefJointId];

  useEffect(() => {
    if (!tipProxy || isDraggingGizmo) return;
    tipProxy.position.set(...pTip);
  }, [pTip, tipProxy, isDraggingGizmo]);

  const { midpoint, length, quaternion } = useMemo(() => {
    const a = new Vector3(...pApp);
    const b = new Vector3(...pTip);
    const diff = b.sub(a);
    const len = diff.length();
    if (len < 1e-4) {
      return {
        midpoint: pApp,
        length: 0,
        quaternion: [0, 0, 0, 1] as [number, number, number, number],
      };
    }
    const mid = new Vector3(...pApp).add(new Vector3(...pTip)).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(UP, diff.clone().normalize());
    return {
      midpoint: [mid.x, mid.y, mid.z] as Vec3,
      length: len,
      quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
    };
  }, [pApp, pTip]);

  // Projection guide lines onto reference joint's horizontal/coronal planes
  const projHorizontal: Vec3 = [pTip[0], refJoint.worldPosition[1], pTip[2]];
  const projOrigin: Vec3 = refJoint.worldPosition;

  // Local force decomposition arrows at reference joint center
  const componentArrows = useMemo(() => {
    if (!showComponents || !refLoad) return null;
    const jPos = new Vector3(...refJoint.worldPosition);
    const jQuat = new Quaternion(...refJoint.worldQuaternion);
    const scale = 0.00055; // 300 N -> ~0.165 m

    const mkTip = (localVec: Vector3): Vec3 => {
      const world = jPos.clone().add(localVec.multiplyScalar(scale).applyQuaternion(jQuat));
      return [world.x, world.y, world.z];
    };

    return {
      origin: refJoint.worldPosition,
      axialTip: mkTip(new Vector3(0, refLoad.localForce[1], 0)),
      mlTip: mkTip(new Vector3(refLoad.localForce[0], 0, 0)),
      apTip: mkTip(new Vector3(0, 0, refLoad.localForce[2])),
    };
  }, [showComponents, refLoad, refJoint]);

  const handleTipChange = () => {
    if (!tipProxy) return;
    const s = force.scaleNpm || 1000;
    const newVec: Vec3 = [
      Math.round((tipProxy.position.x - pApp[0]) * s * 10) / 10,
      Math.round((tipProxy.position.y - pApp[1]) * s * 10) / 10,
      Math.round((tipProxy.position.z - pApp[2]) * s * 10) / 10,
    ];
    updateForce(force.id, { forceVectorWorld: newVec });
  };

  const headLen = Math.min(0.06, Math.max(0.025, length * 0.25));
  const shaftLen = Math.max(0.01, length - headLen);

  return (
    <group>
      {/* Blue Application Point P_app */}
      <mesh
        position={pApp}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedForceId(force.id);
        }}
      >
        <sphereGeometry args={[0.016, 14, 14]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.6} />
      </mesh>

      {/* Shaft & Cone Arrow */}
      {length > 0.005 && (
        <group position={midpoint} quaternion={quaternion}>
          <mesh position={[0, -headLen / 2, 0]}>
            <cylinderGeometry args={[0.006, 0.006, shaftLen, 10]} />
            <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, shaftLen / 2, 0]}>
            <coneGeometry args={[0.02, headLen, 14]} />
            <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.6} />
          </mesh>
        </group>
      )}

      {/* Bright Red Tip Control Sphere P_tip */}
      <mesh
        position={pTip}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedForceId(force.id);
        }}
      >
        <sphereGeometry args={[0.018, 14, 14]} />
        <meshStandardMaterial color="#ff4d4d" emissive="#ef4444" emissiveIntensity={0.85} />
      </mesh>

      {/* Dual-unit Floating Label */}
      <Html position={pTip} center distanceFactor={1.8} style={{ pointerEvents: 'none' }}>
        <div className="mt-6 whitespace-nowrap rounded bg-red-950/90 px-1.5 py-0.5 text-[10px] font-mono text-red-100 border border-red-500/60 shadow">
          {force.label ? `${force.label} · ` : ''}
          {magN.toFixed(0)} N ({(magN / GRAVITY_MPS2).toFixed(1)} kgf)
        </div>
      </Html>

      {/* Spatial Depth Guides, Lever Arm r, and 3-Color Local Force Components */}
      {showComponents && (
        <>
          {/* Yellow dashed lever arm r from joint center to P_app */}
          <Line
            points={[projOrigin, pApp]}
            color="#facc15"
            lineWidth={1.5}
            dashed
            dashSize={0.025}
            gapSize={0.015}
          />
          {/* Depth projection guide lines from P_tip */}
          <Line
            points={[pTip, projHorizontal, projOrigin]}
            color="#64748b"
            lineWidth={1}
            dashed
            dashSize={0.02}
            gapSize={0.02}
            transparent
            opacity={0.7}
          />
          {/* Local Force Decomposition at Joint Center */}
          {componentArrows && (
            <>
              <Line
                points={[componentArrows.origin, componentArrows.axialTip]}
                color="#22d3ee"
                lineWidth={2.5}
                dashed
                dashSize={0.018}
                gapSize={0.01}
              />
              <Line
                points={[componentArrows.origin, componentArrows.mlTip]}
                color="#c084fc"
                lineWidth={2.5}
                dashed
                dashSize={0.018}
                gapSize={0.01}
              />
              <Line
                points={[componentArrows.origin, componentArrows.apTip]}
                color="#fb923c"
                lineWidth={2.5}
                dashed
                dashSize={0.018}
                gapSize={0.01}
              />
            </>
          )}
          {/* 3D Bending Moment Arc at Joint Center */}
          {refLoad && refLoad.bendingMomentNm > 5 && (
            <mesh position={refJoint.worldPosition} quaternion={refJoint.worldQuaternion}>
              <torusGeometry args={[0.055, 0.0025, 8, 24, Math.PI * 1.2]} />
              <meshBasicMaterial color="#facc15" transparent opacity={0.85} />
            </mesh>
          )}
        </>
      )}

      {/* TransformControls on P_tip when in Force Mode */}
      <group ref={setTipProxy} position={pTip} />
      {isEditable && tipProxy && (
        <TransformControls
          object={tipProxy}
          mode="translate"
          size={0.45}
          onMouseDown={() => setIsDraggingGizmo(true)}
          onMouseUp={() => setIsDraggingGizmo(false)}
          onObjectChange={handleTipChange}
        />
      )}
    </group>
  );
}

export function SpatialForceEditor() {
  const forces = useSimStore((s) => s.forces);
  const interactionMode = useSimStore((s) => s.interactionMode);
  const selectedForceId = useSimStore((s) => s.selectedForceId);

  if (forces.length === 0) return null;

  return (
    <group name="spatial-force-editor">
      {forces.map((f, idx) => {
        const isEditable =
          interactionMode === 'force' &&
          (selectedForceId === f.id || (!selectedForceId && idx === 0));
        return <SingleSpatialForce key={f.id} force={f} isEditable={isEditable} />;
      })}
    </group>
  );
}

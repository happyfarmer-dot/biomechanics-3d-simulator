import { Environment, Grid, Lightformer } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { useSimStore } from '../../store/useSimStore';
import { CameraRig } from './CameraRig';
import { ExercisePropsOverlay } from './ExercisePropsOverlay';
import { GlbAnatomyLoader } from './GlbAnatomyLoader';
import { HumanRig } from './HumanRig';
import { MomentArmOverlay } from './MomentArmOverlay';
import { JointGizmo } from './JointGizmo';
import { JointMacroDetail } from './JointMacroDetail';
import { MuscleMeshes } from './MuscleMeshes';
import { SpatialForceEditor } from './SpatialForceEditor';

export function SceneCanvas() {
  const [contextLost, setContextLost] = useState(false);
  const [externalGlbActive, setExternalGlbActive] = useState(false);
  const setShowJointHandles = useSimStore((s) => s.setShowJointHandles);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="relative h-full w-full bg-[#090d16]"
      onPointerDown={(e) => {
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      }}
    >
      {contextLost && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center">
          <p className="text-sm font-semibold text-amber-300">圖形渲染環境暫時中斷</p>
          <p className="mt-1 text-xs text-slate-400">系統正在嘗試恢復視圖，或可點擊下方按鈕重新載入。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/20 px-4 py-1.5 text-xs font-medium text-sky-200 cursor-pointer"
          >
            重新載入畫面
          </button>
        </div>
      )}

      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [1.55, 1.35, 2.35], fov: 42, near: 0.01, far: 50 }}
        onPointerMissed={(e) => {
          const down = pointerDownPosRef.current;
          if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6) {
            return;
          }
          setShowJointHandles(false);
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          canvas.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
        }}
      >
        <color attach="background" args={['#090d16']} />
        <fog attach="fog" args={['#090d16', 6, 16]} />

        {/* 程式化攝影棚環境貼圖 (無外部網路依賴，提供溫潤骨質與肌膜高光) */}
        <Environment resolution={128}>
          <Lightformer
            form="rect"
            intensity={2.2}
            color="#fff7ed"
            position={[3, 4, 3]}
            scale={[4, 4, 1]}
            target={[0, 1, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.6}
            color="#bae6fd"
            position={[-3, 2, -2]}
            scale={[4, 4, 1]}
            target={[0, 1, 0]}
          />
          <Lightformer
            form="ring"
            intensity={0.9}
            color="#e2e8f0"
            position={[0, -2, 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[5, 5, 1]}
          />
        </Environment>

        {/* 三點攝影棚打光 + 平衡半球光，確保左右半身肌群明暗均勻 */}
        <ambientLight intensity={0.4} />
        <hemisphereLight args={['#f8fafc', '#475569', 0.55]} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.25}
          color="#fffaf0"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-3.5, 2.5, 3]} intensity={0.75} color="#e2e8f0" />
        <directionalLight position={[-3.5, 2.5, -2.5]} intensity={0.55} color="#7dd3fc" />
        <directionalLight position={[0, -2.5, 2]} intensity={0.35} color="#cbd5e1" />

        <Grid
          position={[0, 0, 0]}
          args={[8, 8]}
          cellSize={0.25}
          cellThickness={0.5}
          cellColor="#1e293b"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#334155"
          fadeDistance={9}
          infiniteGrid
        />

        <GlbAnatomyLoader onExternalActive={setExternalGlbActive} />
        <HumanRig hideProceduralBones={externalGlbActive} />
        <ExercisePropsOverlay />
        <MomentArmOverlay />
        {!externalGlbActive && <MuscleMeshes />}

        <JointMacroDetail />
        <SpatialForceEditor />
        <JointGizmo />

        <CameraRig />
      </Canvas>
    </div>
  );
}

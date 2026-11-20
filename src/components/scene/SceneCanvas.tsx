import { Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { CameraRig } from './CameraRig';
import { HumanRig } from './HumanRig';
import { JointGizmo } from './JointGizmo';
import { JointMacroDetail } from './JointMacroDetail';
import { MuscleMeshes } from './MuscleMeshes';
import { SpatialForceEditor } from './SpatialForceEditor';

export function SceneCanvas() {
  const [contextLost, setContextLost] = useState(false);

  return (
    <div className="relative h-full w-full bg-[#090d16]">
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

        <ambientLight intensity={0.48} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.35}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-3, 2, -2]} intensity={0.45} color="#7dd3fc" />
        <pointLight position={[0, 2.2, 2.5]} intensity={0.4} color="#e2e8f0" />

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

        <HumanRig />
        <JointMacroDetail />
        <MuscleMeshes />
        <SpatialForceEditor />
        <JointGizmo />

        <CameraRig />
      </Canvas>
    </div>
  );
}

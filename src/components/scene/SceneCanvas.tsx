import { Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { CameraRig } from './CameraRig';
import { HumanRig } from './HumanRig';
import { JointGizmo } from './JointGizmo';
import { JointMacroDetail } from './JointMacroDetail';
import { MuscleMeshes } from './MuscleMeshes';
import { SpatialForceEditor } from './SpatialForceEditor';

export function SceneCanvas() {
  return (
    <div className="h-full w-full bg-[#090d16]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.55, 1.35, 2.35], fov: 42, near: 0.01, far: 50 }}
      >
        <color attach="background" args={['#090d16']} />
        <fog attach="fog" args={['#090d16', 6, 16]} />

        <ambientLight intensity={0.45} />
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

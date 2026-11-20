import { Line } from '@react-three/drei';
import { useSimStore } from '../../store/useSimStore';

const STATUS_COLORS = {
  normal: '#34d399',   // Emerald: ε <= 0.15
  warning: '#facc15',  // Yellow: 0.15 < ε <= 0.30
  critical: '#ef4444', // Red: ε > 0.30
} as const;

export function MuscleLines() {
  const showMuscles = useSimStore((s) => s.layers.muscles);
  const muscles = useSimStore((s) => s.muscles);

  if (!showMuscles) return null;

  return (
    <group name="muscle-lines">
      {muscles.map((m) => {
        const color = STATUS_COLORS[m.status];
        const lineWidth = m.status === 'critical' ? 3.5 : m.status === 'warning' ? 2.8 : 2.0;

        return (
          <group key={m.id}>
            <Line
              points={m.pointsWorld}
              color={color}
              lineWidth={lineWidth}
              transparent
              opacity={m.status === 'normal' ? 0.8 : 0.95}
            />
            {m.pointsWorld.map((pt, idx) => (
              <mesh key={idx} position={pt}>
                <sphereGeometry args={[idx === 0 || idx === m.pointsWorld.length - 1 ? 0.008 : 0.005, 8, 8]} />
                <meshBasicMaterial color={color} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

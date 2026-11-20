import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Vector3,
} from 'three';
import { MUSCLE_BELLY_RADIUS } from '../../data/muscleConfig';
import { useSimStore } from '../../store/useSimStore';
import { getMuscleMaterial } from '../../utils/anatomyTextures';

function buildFusiformGeometry(
  points: [number, number, number][],
  baseRadius: number,
  strain: number
): BufferGeometry {
  const vecs = points.map((p) => new Vector3(...p));
  const curve = new CatmullRomCurve3(vecs, false, 'centripetal', 0.5);

  const tubularSegments = 14;
  const radialSegments = 8;
  const frames = curve.computeFrenetFrames(tubularSegments, false);

  const contractionSwell = strain < 0 ? 1 + Math.min(0.25, -strain * 0.65) : 1;

  const ringCount = tubularSegments + 1;
  const vertsPerRing = radialSegments + 1;
  const positions = new Float32Array(ringCount * vertsPerRing * 3);
  const normals = new Float32Array(ringCount * vertsPerRing * 3);
  const uvs = new Float32Array(ringCount * vertsPerRing * 2);
  const indices: number[] = [];

  const P = new Vector3();
  const N = new Vector3();
  const v = new Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);

    const bellyCurve = Math.pow(Math.sin(Math.PI * t), 0.65);
    const radius = baseRadius * (0.22 + 0.78 * bellyCurve * contractionSwell);

    const normal = frames.normals[i];
    const binormal = frames.binormals[i];

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const theta = u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = -Math.cos(theta);

      N.x = cos * normal.x + sin * binormal.x;
      N.y = cos * normal.y + sin * binormal.y;
      N.z = cos * normal.z + sin * binormal.z;
      N.normalize();

      v.x = P.x + radius * N.x;
      v.y = P.y + radius * N.y;
      v.z = P.z + radius * N.z;

      const idx = i * vertsPerRing + j;
      positions[idx * 3] = v.x;
      positions[idx * 3 + 1] = v.y;
      positions[idx * 3 + 2] = v.z;

      normals[idx * 3] = N.x;
      normals[idx * 3 + 1] = N.y;
      normals[idx * 3 + 2] = N.z;

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = t;
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * vertsPerRing + j;
      const b = (i + 1) * vertsPerRing + j;
      const c = (i + 1) * vertsPerRing + (j + 1);
      const d = i * vertsPerRing + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function SingleMuscleMesh({
  groupId,
  pointsWorld,
  strain,
  status,
  heightScale,
  isGhosted,
}: {
  groupId: string;
  pointsWorld: [number, number, number][];
  strain: number;
  status: 'normal' | 'warning' | 'critical';
  heightScale: number;
  isGhosted: boolean;
}) {
  const baseRadius = (MUSCLE_BELLY_RADIUS[groupId] ?? 0.024) * heightScale;

  const geometry = useMemo(
    () => buildFusiformGeometry(pointsWorld, baseRadius, strain),
    [pointsWorld, baseRadius, strain]
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const material = getMuscleMaterial(status, isGhosted);

  return <mesh geometry={geometry} material={material} castShadow={!isGhosted} />;
}

export function MuscleMeshes() {
  const showMuscles = useSimStore((s) => s.layers.muscles);
  const muscles = useSimStore((s) => s.muscles);
  const heightM = useSimStore((s) => s.heightM);
  const focusedJointId = useSimStore((s) => s.focusedJointId);

  if (!showMuscles) return null;

  const heightScale = heightM / 1.75;

  return (
    <group name="muscle-meshes">
      {muscles.map((m) => (
        <SingleMuscleMesh
          key={m.id}
          groupId={m.groupId}
          pointsWorld={m.pointsWorld}
          strain={m.strain}
          status={m.status}
          heightScale={heightScale}
          isGhosted={Boolean(focusedJointId)}
        />
      ))}
    </group>
  );
}

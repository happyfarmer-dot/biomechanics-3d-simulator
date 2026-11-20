import {
  CanvasTexture,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three';

export interface TextureSet {
  albedoMap: CanvasTexture;
  bumpMap: CanvasTexture;
  roughnessMap: CanvasTexture;
}

let cachedMuscleTex: TextureSet | null = null;
let cachedBoneTex: TextureSet | null = null;

let matBoneSolid: MeshStandardMaterial | null = null;
let matBoneGhost: MeshStandardMaterial | null = null;
let matCartilageSolid: MeshStandardMaterial | null = null;
let matCartilageGhost: MeshStandardMaterial | null = null;
let matJointCapsule: MeshStandardMaterial | null = null;

const muscleMatCache = new Map<string, MeshStandardMaterial>();

function pseudoNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Generates seamless 256x256 striated muscle textures (mobile GPU friendly).
 */
export function getMuscleTextures(): TextureSet {
  if (cachedMuscleTex) return cachedMuscleTex;

  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  albedoCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  albedoCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    const distFromEnd = Math.min(v, 1 - v);
    const tRaw = Math.max(0, Math.min(1, (distFromEnd - 0.06) / 0.14));
    const muscleMask = tRaw * tRaw * (3 - 2 * tRaw);

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const angle = u * Math.PI * 2;
      const majorBundles = 0.5 + 0.5 * Math.sin(angle * 16 + Math.sin(v * 6) * 0.4);
      const fineFibers = 0.5 + 0.5 * Math.sin(angle * 48 + Math.cos(v * 12) * 0.5);
      const grain = pseudoNoise(x * 0.5, y * 0.12);

      const fiberHeight = majorBundles * 0.55 + fineFibers * 0.3 + grain * 0.15;

      const mR = 115 + fiberHeight * 88;
      const mG = 16 + fiberHeight * 28;
      const mB = 22 + fiberHeight * 24;

      const tR = 218 + fiberHeight * 28;
      const tG = 213 + fiberHeight * 28;
      const tB = 202 + fiberHeight * 26;

      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.min(255, mR * muscleMask + tR * (1 - muscleMask));
      aImg.data[idx + 1] = Math.min(255, mG * muscleMask + tG * (1 - muscleMask));
      aImg.data[idx + 2] = Math.min(255, mB * muscleMask + tB * (1 - muscleMask));
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.floor(fiberHeight * 255);
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      const rough =
        muscleMask * (0.36 + (1 - fiberHeight) * 0.14) +
        (1 - muscleMask) * (0.26 + (1 - fiberHeight) * 0.08);
      const roughVal = Math.floor(rough * 255);
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const albedoMap = new CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = SRGBColorSpace;
  albedoMap.wrapS = RepeatWrapping;
  albedoMap.needsUpdate = true;

  const bumpMap = new CanvasTexture(bumpCanvas);
  bumpMap.wrapS = RepeatWrapping;
  bumpMap.needsUpdate = true;

  const roughnessMap = new CanvasTexture(roughCanvas);
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.needsUpdate = true;

  cachedMuscleTex = { albedoMap, bumpMap, roughnessMap };
  return cachedMuscleTex;
}

/**
 * Generates seamless 256x256 cortical bone textures.
 */
export function getBoneTextures(): TextureSet {
  if (cachedBoneTex) return cachedBoneTex;

  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  albedoCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  albedoCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = pseudoNoise(x * 0.15, y * 0.05);
      const n2 = pseudoNoise(x * 0.5, y * 0.25);
      const streak = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 16 + n1 * 2);
      const val = n1 * 0.5 + n2 * 0.3 + streak * 0.2;

      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.floor(220 + val * 22);
      aImg.data[idx + 1] = Math.floor(212 + val * 22);
      aImg.data[idx + 2] = Math.floor(194 + val * 20);
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.floor(val * 255);
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      const roughVal = Math.floor((0.46 + (1 - val) * 0.18) * 255);
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const albedoMap = new CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = SRGBColorSpace;
  albedoMap.wrapS = RepeatWrapping;
  albedoMap.wrapT = RepeatWrapping;
  albedoMap.needsUpdate = true;

  const bumpMap = new CanvasTexture(bumpCanvas);
  bumpMap.wrapS = RepeatWrapping;
  bumpMap.wrapT = RepeatWrapping;
  bumpMap.needsUpdate = true;

  const roughnessMap = new CanvasTexture(roughCanvas);
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.needsUpdate = true;

  cachedBoneTex = { albedoMap, bumpMap, roughnessMap };
  return cachedBoneTex;
}

/**
 * Shared singleton MeshStandardMaterial instances (no MeshPhysicalMaterial/transmission).
 */
export function getBoneMaterial(isGhosted: boolean): MeshStandardMaterial {
  if (isGhosted) {
    if (!matBoneGhost) {
      const tex = getBoneTextures();
      matBoneGhost = new MeshStandardMaterial({
        map: tex.albedoMap,
        bumpMap: tex.bumpMap,
        bumpScale: 0.0025,
        roughnessMap: tex.roughnessMap,
        roughness: 0.42,
        metalness: 0.05,
        envMapIntensity: 0.7,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
    }
    return matBoneGhost;
  }
  if (!matBoneSolid) {
    const tex = getBoneTextures();
    matBoneSolid = new MeshStandardMaterial({
      map: tex.albedoMap,
      bumpMap: tex.bumpMap,
      bumpScale: 0.0025,
      roughnessMap: tex.roughnessMap,
      roughness: 0.42,
      metalness: 0.05,
      envMapIntensity: 0.75,
    });
  }
  return matBoneSolid;
}

export function getCartilageMaterial(isGhosted: boolean): MeshStandardMaterial {
  if (isGhosted) {
    if (!matCartilageGhost) {
      matCartilageGhost = new MeshStandardMaterial({
        color: '#dbeafe',
        roughness: 0.15,
        metalness: 0.05,
        envMapIntensity: 0.9,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      });
    }
    return matCartilageGhost;
  }
  if (!matCartilageSolid) {
    matCartilageSolid = new MeshStandardMaterial({
      color: '#dbeafe',
      roughness: 0.15,
      metalness: 0.05,
      envMapIntensity: 0.95,
      transparent: true,
      opacity: 0.88,
    });
  }
  return matCartilageSolid;
}

export function getJointCapsuleMaterial(): MeshStandardMaterial {
  if (!matJointCapsule) {
    matJointCapsule = new MeshStandardMaterial({
      color: '#93c5fd',
      roughness: 0.22,
      metalness: 0.0,
      envMapIntensity: 0.8,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
  }
  return matJointCapsule;
}

export function getMuscleMaterial(
  status: 'normal' | 'warning' | 'critical',
  isGhosted: boolean
): MeshStandardMaterial {
  const key = `${status}_${isGhosted ? 'ghost' : 'solid'}`;
  const existing = muscleMatCache.get(key);
  if (existing) return existing;

  const tex = getMuscleTextures();
  const emissive =
    status === 'critical' ? '#ef4444' : status === 'warning' ? '#eab308' : '#000000';
  const emissiveIntensity =
    status === 'critical' ? 0.78 : status === 'warning' ? 0.42 : 0;

  const mat = new MeshStandardMaterial({
    map: tex.albedoMap,
    bumpMap: tex.bumpMap,
    bumpScale: 0.004,
    roughnessMap: tex.roughnessMap,
    roughness: 0.35,
    metalness: 0.05,
    envMapIntensity: 0.9,
    emissive,
    emissiveIntensity,
    transparent: isGhosted,
    opacity: isGhosted ? 0.14 : 1,
    depthWrite: !isGhosted,
  });

  muscleMatCache.set(key, mat);
  return mat;
}

let matSkinFresnelSolid: ShaderMaterial | null = null;
let matSkinFresnelGhost: ShaderMaterial | null = null;

function createFresnelMaterial(maxAlpha: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMinAlpha: { value: 0.02 },
      uMaxAlpha: { value: maxAlpha },
      uRimColor: { value: [0.78, 0.86, 0.94] },
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uMinAlpha;
      uniform float uMaxAlpha;
      uniform vec3 uRimColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;
      void main() {
        float ndotv = clamp(abs(dot(normalize(vViewNormal), normalize(vViewDir))), 0.0, 1.0);
        float rim = pow(1.0 - ndotv, 2.4);
        float alpha = mix(uMinAlpha, uMaxAlpha, rim);
        gl_FragColor = vec4(uRimColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
  });
}

/**
 * Fresnel Rim ShaderMaterial for outer skin contour:
 * 0.02 alpha at perpendicular center, smoothly rising to 0.35 at grazing silhouette edges.
 */
export function getSkinFresnelMaterial(isGhosted: boolean): ShaderMaterial {
  if (isGhosted) {
    if (!matSkinFresnelGhost) {
      matSkinFresnelGhost = createFresnelMaterial(0.08);
    }
    return matSkinFresnelGhost;
  }
  if (!matSkinFresnelSolid) {
    matSkinFresnelSolid = createFresnelMaterial(0.35);
  }
  return matSkinFresnelSolid;
}

let matZBoneSolid: MeshStandardMaterial | null = null;
let matZBoneGhost: MeshStandardMaterial | null = null;
const zMuscleMatCache = new Map<string, MeshStandardMaterial>();

export function getZAnatomyBoneMaterial(isGhosted: boolean): MeshStandardMaterial {
  if (isGhosted) {
    if (!matZBoneGhost) {
      matZBoneGhost = new MeshStandardMaterial({
        color: '#ede6d6',
        metalness: 0.0,
        roughness: 0.55,
        envMapIntensity: 0.7,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
    }
    return matZBoneGhost;
  }
  if (!matZBoneSolid) {
    matZBoneSolid = new MeshStandardMaterial({
      color: '#ede6d6',
      metalness: 0.0,
      roughness: 0.55,
      envMapIntensity: 0.75,
    });
  }
  return matZBoneSolid;
}

export function getZAnatomyMuscleMaterial(
  status: 'normal' | 'warning' | 'critical',
  isGhosted: boolean
): MeshStandardMaterial {
  const key = `${status}_${isGhosted ? 'ghost' : 'solid'}`;
  const existing = zMuscleMatCache.get(key);
  if (existing) return existing;

  const tex = getMuscleTextures();
  const emissive =
    status === 'critical' ? '#ef4444' : status === 'warning' ? '#eab308' : '#000000';
  const emissiveIntensity =
    status === 'critical' ? 0.8 : status === 'warning' ? 0.45 : 0;

  const mat = new MeshStandardMaterial({
    color: '#a82020',
    bumpMap: tex.bumpMap,
    bumpScale: 0.004,
    metalness: 0.0,
    roughness: 0.42,
    envMapIntensity: 0.85,
    side: DoubleSide,
    emissive,
    emissiveIntensity,
    transparent: isGhosted,
    opacity: isGhosted ? 0.14 : 1,
    depthWrite: !isGhosted,
  });

  zMuscleMatCache.set(key, mat);
  return mat;
}

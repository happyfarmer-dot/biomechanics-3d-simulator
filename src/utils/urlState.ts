import type { PoseMap, SpatialForce } from '../types/biomechanics';

export interface ShareableSimState {
  pose: PoseMap;
  forces: SpatialForce[];
  dynamicLoadFactor?: number;
  muscleEffectMode?: 'anatomy' | 'strain';
  muscleStrainSubMode?: 'geometric' | 'activeTension';
}

export function encodeSimStateToHash(state: ShareableSimState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#state=${b64}`;
}

export function decodeSimStateFromHash(hash: string): ShareableSimState | null {
  try {
    if (!hash || !hash.startsWith('#state=')) return null;
    const b64url = hash.slice('#state='.length).trim();
    if (!b64url) return null;
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as ShareableSimState;
    if (!parsed || typeof parsed !== 'object' || !parsed.pose || !Array.isArray(parsed.forces)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

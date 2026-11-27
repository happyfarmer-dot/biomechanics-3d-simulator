import { Material, Quaternion, Vector3, Vector4 } from 'three';
import { JOINT_ORDER } from '../data/skeletonConfig';
import { computeClavicleWorldState, computeForearmTwistState } from './kinematics';
import type { JointId, KinematicsResult, PoseMap, Vec3 } from '../types/biomechanics';

export const MAX_DQS_BONES = 23; // 17 joints + clavicle L/R (17,18) + elbow_hinge L/R (19,20) + forearm_mid L/R (21,22)
export const CLAVICLE_L_BONE_INDEX = 17;
export const CLAVICLE_R_BONE_INDEX = 18;
export const ELBOW_HINGE_L_BONE_INDEX = 19;
export const ELBOW_HINGE_R_BONE_INDEX = 20;
export const FOREARM_MID_L_BONE_INDEX = 21;
export const FOREARM_MID_R_BONE_INDEX = 22;

export interface GpuDqsUniforms {
  uBoneDqReal: { value: Vector4[] };
  uBoneDqDual: { value: Vector4[] };
  uHeightScale: { value: number };
}

export function createGpuDqsUniforms(): GpuDqsUniforms {
  const uBoneDqReal: Vector4[] = [];
  const uBoneDqDual: Vector4[] = [];
  for (let i = 0; i < MAX_DQS_BONES; i++) {
    uBoneDqReal.push(new Vector4(0, 0, 0, 1));
    uBoneDqDual.push(new Vector4(0, 0, 0, 0));
  }
  return {
    uBoneDqReal: { value: uBoneDqReal },
    uBoneDqDual: { value: uBoneDqDual },
    uHeightScale: { value: 1.0 },
  };
}

const _q = new Quaternion();
const _restV = new Vector3();
const _worldV = new Vector3();
const _rotRest = new Vector3();
const _t = new Vector3();

function writeDqToUniform(
  idx: number,
  worldQuat: Quaternion,
  worldPos: Vec3,
  restPos: Vec3,
  hScale: number,
  outReal: Vector4[],
  outDual: Vector4[]
) {
  _q.copy(worldQuat).normalize();
  _restV.set(restPos[0] * hScale, restPos[1] * hScale, restPos[2] * hScale);
  _worldV.set(worldPos[0], worldPos[1], worldPos[2]);
  _rotRest.copy(_restV).applyQuaternion(_q);
  _t.copy(_worldV).sub(_rotRest);

  outReal[idx].set(_q.x, _q.y, _q.z, _q.w);
  outDual[idx].set(
    0.5 * (_t.x * _q.w + _t.y * _q.z - _t.z * _q.y),
    0.5 * (-_t.x * _q.z + _t.y * _q.w + _t.z * _q.x),
    0.5 * (_t.x * _q.y - _t.y * _q.x + _t.z * _q.w),
    0.5 * (-_t.x * _q.x - _t.y * _q.y - _t.z * _q.z)
  );
}

const _wq = new Quaternion();

export function updateGpuDqsUniforms(
  uniforms: GpuDqsUniforms,
  kinematics: KinematicsResult,
  restPositions: Record<JointId, Vec3>,
  hScale: number,
  pose: PoseMap
): void {
  uniforms.uHeightScale.value = hScale;
  const realArr = uniforms.uBoneDqReal.value;
  const dualArr = uniforms.uBoneDqDual.value;

  for (let i = 0; i < JOINT_ORDER.length; i++) {
    const jId = JOINT_ORDER[i];
    const j = kinematics.joints[jId];
    _wq.set(j.worldQuaternion[0], j.worldQuaternion[1], j.worldQuaternion[2], j.worldQuaternion[3]);
    writeDqToUniform(i, _wq, j.worldPosition, restPositions[jId], hScale, realArr, dualArr);
  }

  // Scapulohumeral Rhythm virtual bones: 17 = clavicle_L, 18 = clavicle_R
  const thoraxState = kinematics.joints.thorax;
  const clavL = computeClavicleWorldState(
    'L',
    pose,
    thoraxState,
    restPositions.shoulder_L,
    restPositions.thorax,
    hScale
  );
  _wq.set(...clavL.worldQuaternion);
  writeDqToUniform(CLAVICLE_L_BONE_INDEX, _wq, clavL.worldPosition, clavL.restPosition, hScale, realArr, dualArr);

  const clavR = computeClavicleWorldState(
    'R',
    pose,
    thoraxState,
    restPositions.shoulder_R,
    restPositions.thorax,
    hScale
  );
  _wq.set(...clavR.worldQuaternion);
  writeDqToUniform(CLAVICLE_R_BONE_INDEX, _wq, clavR.worldPosition, clavR.restPosition, hScale, realArr, dualArr);

  // Progressive forearm pronation virtual bones: 19/20 elbow hinges (0% twist), 21/22 mid forearms (50% twist)
  const hingeL = computeForearmTwistState('L', pose, kinematics, 0, restPositions.elbow_L, restPositions.wrist_L);
  _wq.set(...hingeL.worldQuaternion);
  writeDqToUniform(ELBOW_HINGE_L_BONE_INDEX, _wq, hingeL.worldPosition, hingeL.restPosition, hScale, realArr, dualArr);

  const hingeR = computeForearmTwistState('R', pose, kinematics, 0, restPositions.elbow_R, restPositions.wrist_R);
  _wq.set(...hingeR.worldQuaternion);
  writeDqToUniform(ELBOW_HINGE_R_BONE_INDEX, _wq, hingeR.worldPosition, hingeR.restPosition, hScale, realArr, dualArr);

  const midL = computeForearmTwistState('L', pose, kinematics, 0.5, restPositions.elbow_L, restPositions.wrist_L);
  _wq.set(...midL.worldQuaternion);
  writeDqToUniform(FOREARM_MID_L_BONE_INDEX, _wq, midL.worldPosition, midL.restPosition, hScale, realArr, dualArr);

  const midR = computeForearmTwistState('R', pose, kinematics, 0.5, restPositions.elbow_R, restPositions.wrist_R);
  _wq.set(...midR.worldQuaternion);
  writeDqToUniform(FOREARM_MID_R_BONE_INDEX, _wq, midR.worldPosition, midR.restPosition, hScale, realArr, dualArr);
}

export function applyGpuDqsToMaterial(
  material: Material,
  uniforms: GpuDqsUniforms,
  cacheKeySuffix: string = 'dqs_v1'
): void {
  material.customProgramCacheKey = () => cacheKeySuffix;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBoneDqReal = uniforms.uBoneDqReal;
    shader.uniforms.uBoneDqDual = uniforms.uBoneDqDual;
    shader.uniforms.uHeightScale = uniforms.uHeightScale;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aBoneIndex;
attribute vec2 aBoneWeight;
uniform vec4 uBoneDqReal[${MAX_DQS_BONES}];
uniform vec4 uBoneDqDual[${MAX_DQS_BONES}];
uniform float uHeightScale;

vec3 dqRotateVec(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void computeBlendedDq(vec2 idx, vec2 w, out vec4 outR, out vec4 outD) {
  int i0 = int(idx.x + 0.5);
  int i1 = int(idx.y + 0.5);
  vec4 r0 = uBoneDqReal[i0];
  vec4 d0 = uBoneDqDual[i0];
  vec4 r1 = uBoneDqReal[i1];
  vec4 d1 = uBoneDqDual[i1];
  if (dot(r0, r1) < 0.0) {
    r1 = -r1;
    d1 = -d1;
  }
  outR = r0 * w.x + r1 * w.y;
  outD = d0 * w.x + d1 * w.y;
  float len = length(outR);
  if (len > 1e-6) {
    outR /= len;
    outD /= len;
  }
}
`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
vec4 dqsReal;
vec4 dqsDual;
computeBlendedDq(aBoneIndex, aBoneWeight, dqsReal, dqsDual);
objectNormal = dqRotateVec(dqsReal, objectNormal);
`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 dqsTrans = 2.0 * (dqsReal.w * dqsDual.xyz - dqsDual.w * dqsReal.xyz + cross(dqsReal.xyz, dqsDual.xyz));
transformed = dqRotateVec(dqsReal, transformed * uHeightScale) + dqsTrans;
`
      );
  };
  material.needsUpdate = true;
}

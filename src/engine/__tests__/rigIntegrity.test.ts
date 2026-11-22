import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Scene, Mesh, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';
import { calibrateSkeletonFromScene } from '../calibrateSkeleton';
import {
  classifyMeshZone,
  findNearestBoneJointInZone,
  isMicroDebrisMesh,
  prepareAutoSkinnedMuscle,
} from '../muscleSkinning';
import { runRigIntegrityCheck } from '../rigIntegrityCheck';

const require = createRequire(import.meta.url);

describe('Real Z-Anatomy GLB RigIntegrityCheck (3 Automated Checks)', () => {
  it('passes 100% on weight_conservation, anchor_drift, and motion_linkage', async () => {
    const glbPath = path.resolve(__dirname, '../../../public/models/anatomy_rigged.glb');
    expect(fs.existsSync(glbPath)).toBe(true);

    const dracoPath = path.resolve(__dirname, '../../../node_modules/three/examples/jsm/libs/draco/draco_decoder.js');
    const dracoCode = fs.readFileSync(dracoPath, 'utf8');
    const dracoFactory = new Function('require', '__dirname', '__filename', `${dracoCode}\nreturn DracoDecoderModule;`)(
      require,
      path.dirname(dracoPath),
      dracoPath
    );

    const buf = fs.readFileSync(glbPath);
    // Parse binary GLB header
    const magic = buf.readUInt32LE(0);
    expect(magic).toBe(0x46546c67); // 'glTF'
    const jsonChunkLen = buf.readUInt32LE(12);
    const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
    const gltfJson = JSON.parse(jsonStr);

    const binChunkOffset = 20 + jsonChunkLen + 8;
    const binChunkLen = buf.readUInt32LE(20 + jsonChunkLen);
    const binBuffer = buf.subarray(binChunkOffset, binChunkOffset + binChunkLen);

    const decoderModule = await dracoFactory();

    const scene = new Scene();

    for (const node of gltfJson.nodes || []) {
      if (node.mesh === undefined) continue;
      const meshDef = gltfJson.meshes[node.mesh];
      if (!meshDef || !meshDef.primitives || meshDef.primitives.length === 0) continue;
      const prim = meshDef.primitives[0];

      const geo = new BufferGeometry();
      const dracoExt = prim.extensions?.KHR_draco_mesh_compression;

      if (dracoExt) {
        const bv = gltfJson.bufferViews[dracoExt.bufferView];
        const byteOffset = bv.byteOffset || 0;
        const byteLength = bv.byteLength;
        const compressedData = binBuffer.subarray(byteOffset, byteOffset + byteLength);

        const decoder = new decoderModule.Decoder();
        const decodeBuffer = new decoderModule.DecoderBuffer();
        decodeBuffer.Init(new Int8Array(compressedData), compressedData.length);

        const geometryType = decoder.GetEncodedGeometryType(decodeBuffer);
        let dracoGeo;
        if (geometryType === decoderModule.TRIANGULAR_MESH) {
          dracoGeo = new decoderModule.Mesh();
          decoder.DecodeBufferToMesh(decodeBuffer, dracoGeo);
        }

        if (dracoGeo) {
          const numPoints = dracoGeo.num_points();
          const numFaces = dracoGeo.num_faces();
          const posAttrId = dracoExt.attributes.POSITION;
          const posAttr = decoder.GetAttributeByUniqueId(dracoGeo, posAttrId);
          const posData = new decoderModule.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(dracoGeo, posAttr, posData);

          const positions = new Float32Array(numPoints * 3);
          for (let i = 0; i < numPoints * 3; i++) {
            positions[i] = posData.GetValue(i);
          }
          geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
          decoderModule.destroy(posData);

          const indices = new Uint32Array(numFaces * 3);
          const ia = new decoderModule.DracoInt32Array();
          for (let i = 0; i < numFaces; i++) {
            decoder.GetFaceFromMesh(dracoGeo, i, ia);
            indices[i * 3] = ia.GetValue(0);
            indices[i * 3 + 1] = ia.GetValue(1);
            indices[i * 3 + 2] = ia.GetValue(2);
          }
          geo.setIndex(new Uint32BufferAttribute(indices, 1));
          decoderModule.destroy(ia);
          decoderModule.destroy(dracoGeo);
        }
        decoderModule.destroy(decodeBuffer);
        decoderModule.destroy(decoder);
      } else if (prim.attributes?.POSITION !== undefined) {
        const acc = gltfJson.accessors[prim.attributes.POSITION];
        const bv = gltfJson.bufferViews[acc.bufferView];
        const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const count = acc.count * 3;
        const arr = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          arr[i] = binBuffer.readFloatLE(offset + i * 4);
        }
        geo.setAttribute('position', new Float32BufferAttribute(arr, 3));
      }

      geo.computeVertexNormals();
      const mesh = new Mesh(geo);
      mesh.name = node.name || meshDef.name || `mesh_${node.mesh}`;
      if (node.translation) {
        mesh.position.set(node.translation[0], node.translation[1], node.translation[2]);
      }
      if (node.rotation) {
        mesh.quaternion.set(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]);
      }
      if (node.scale) {
        mesh.scale.set(node.scale[0], node.scale[1], node.scale[2]);
      }
      scene.add(mesh);
    }

    scene.updateMatrixWorld(true);
    const calibration = calibrateSkeletonFromScene(scene);
    console.log('--- CALIBRATED REST POSITIONS ---');
    for (const [k, v] of Object.entries(calibration.restPositions)) {
      console.log(`  ${k}: [${v.map((n) => n.toFixed(4)).join(', ')}]`);
    }

    let unassigned = 0;
    const skinnedMuscles = [];
    let boneCount = 0;
    let debrisCount = 0;

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      if (isMicroDebrisMesh(obj, calibration)) {
        debrisCount++;
        return;
      }
      const nl = obj.name.toLowerCase();
      const zone = classifyMeshZone(obj, calibration);
      if (nl.startsWith('muscle__') || nl.includes('muscle')) {
        skinnedMuscles.push(prepareAutoSkinnedMuscle(obj, zone, calibration));
      } else {
        const jointId = findNearestBoneJointInZone(obj, zone, calibration);
        if (!jointId) unassigned++;
        boneCount++;
      }
    });

    console.log(
      `Decoded ${boneCount} bones, ${skinnedMuscles.length} muscles, hidden ${debrisCount} micro-debris from anatomy_rigged.glb`
    );
    const report = runRigIntegrityCheck(skinnedMuscles, unassigned, calibration);
    for (const item of report.checks) {
      console.log(`[Check] ${item.id} (${item.title}): ${item.passed ? 'PASS' : 'FAIL'} -> ${item.detail}`);
      expect(item.passed).toBe(true);
    }
    expect(report.checks.length).toBe(6);
    expect(report.allPassed).toBe(true);
  }, 60000);
});

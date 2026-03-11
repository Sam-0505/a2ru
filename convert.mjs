import fs from 'fs';
import { JSDOM } from 'jsdom';
const { window } = new JSDOM();
global.window = window;
global.document = window.document;
global.self = window;
Object.defineProperty(global, 'navigator', {
    value: window.navigator,
    configurable: true
});

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const loader = new FBXLoader();
const fbxData = fs.readFileSync('panda_try_3.fbx');

try {
    const object = loader.parse(fbxData.buffer, '');
    let positions = [];
    let normals = [];
    let indices = [];

    let vertexOffset = 0;

    object.traverse((child) => {
        if (child.isMesh) {
            const geo = child.geometry;
            if(!geo.isBufferGeometry) return;
            
            const pos = geo.attributes.position.array;
            const norm = geo.attributes.normal ? geo.attributes.normal.array : [];
            let inds = geo.index ? geo.index.array : null;
            
            // push raw arrays into JS native arrays
            for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
            
            if (norm.length > 0) {
                for (let i = 0; i < norm.length; i++) normals.push(norm[i]);
            } else {
                for (let i = 0; i < pos.length; i++) normals.push(0);
            }

            if (inds) {
                for (let i = 0; i < inds.length; i++) indices.push(inds[i] + vertexOffset);
            } else {
                for (let i = 0; i < pos.length / 3; i++) indices.push(i + vertexOffset);
            }

            vertexOffset += pos.length / 3;
        }
    });

    const outData = { positions, normals, indices };
    fs.writeFileSync('public/panda.json', JSON.stringify(outData));
    console.log(`Success: Exported ${positions.length/3} vertices to public/panda.json`);

} catch (e) {
    console.error("Failed to parse", e);
}

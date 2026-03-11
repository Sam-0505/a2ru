const fs = require('fs');
const { JSDOM } = require('jsdom');
const { window } = new JSDOM();
global.window = window;
global.document = window.document;
global.self = window;
global.navigator = window.navigator;

const THREE = require('three');
const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');

const loader = new FBXLoader();
const fbxData = fs.readFileSync('panda_try_3.fbx');

try {
    const object = loader.parse(fbxData.buffer, '');
    let positions = [];
    let normals = [];
    let colors = [];
    let indices = [];

    let vertexOffset = 0;

    object.traverse((child) => {
        if (child.isMesh) {
            const geo = child.geometry;
            if (!geo.isBufferGeometry) return;

            const pos = geo.attributes.position.array;
            const norm = geo.attributes.normal ? geo.attributes.normal.array : [];
            const vCols = geo.attributes.color ? geo.attributes.color.array : null;
            let inds = geo.index ? geo.index.array : null;

            // Prepare local color array for this mesh
            const meshColors = new Float32Array(pos.length);
            meshColors.fill(1.0); // Default to white

            if (vCols) {
                // Case 1: Vertex Colors are present
                console.log(`[Mesh: ${child.name}] Using Vertex Colors`);
                for (let i = 0; i < pos.length; i++) {
                    meshColors[i] = vCols[i];
                }
            } else if (geo.groups && geo.groups.length > 0 && child.material) {
                // Case 2: Multi-material Groups
                console.log(`[Mesh: ${child.name}] Using Groups (${geo.groups.length})`);
                const materials = Array.isArray(child.material) ? child.material : [child.material];

                geo.groups.forEach(group => {
                    const mat = materials[group.materialIndex] || materials[0];
                    const r = mat.color ? mat.color.r : 1;
                    const g = mat.color ? mat.color.g : 1;
                    const b = mat.color ? mat.color.b : 1;

                    // Map material color to the vertices in this group
                    // Note: This logic assumes triangles are not shared between groups with different colors
                    // (FBXLoader usually splits vertices for us if they have different attributes)
                    const end = group.start + group.count;
                    for (let i = group.start; i < end; i++) {
                        const vIndex = inds ? inds[i] : i;
                        meshColors[vIndex * 3 + 0] = r;
                        meshColors[vIndex * 3 + 1] = g;
                        meshColors[vIndex * 3 + 2] = b;
                    }
                });
            } else if (child.material) {
                // Case 3: Simple single material
                const mat = Array.isArray(child.material) ? child.material[0] : child.material;
                const r = mat.color ? mat.color.r : 1;
                const g = mat.color ? mat.color.g : 1;
                const b = mat.color ? mat.color.b : 1;
                for (let i = 0; i < pos.length / 3; i++) {
                    meshColors[i * 3 + 0] = r;
                    meshColors[i * 3 + 1] = g;
                    meshColors[i * 3 + 2] = b;
                }
            }

            positions.push(...pos);
            colors.push(...meshColors);

            if (norm.length > 0) normals.push(...norm);
            else {
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

    const outData = { positions, normals, colors, indices };
    fs.writeFileSync('public/panda.json', JSON.stringify(outData));
    console.log(`Success: Exported ${positions.length / 3} vertices to public/panda.json`);

} catch (e) {
    console.error("Failed to parse", e);
}

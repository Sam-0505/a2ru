import { mat4, vec3, quat, mat3 } from 'gl-matrix';

const socket = io('http://localhost:3000');
socket.on('connect', () => console.log('[sim] connected to backend'));

// ── Variables Counters ──
let treeTimer = 0, houseTimer = 0, factoryTimer = 0, pandaTimer = 0, fireBurnTimer = 0, pandaStarveTimer = 0;
const maxTreeCount = 25, maxHouseCount = 20, maxFactoryCount = 12;
const EARTH_RADIUS = 1.0;

const state = {
    bamboo: [], pandas: [], houses: [], factories: [], humans: [], trees: [], fires: [],
    isFireActive: false, extinctionThreshold: 3
};

// ── WebGL State ──
let canvas, gl;
let defaultProgram;
let geometries = {};
let lastTime = 0;

// Configs for Holographic effect
const effect = {
    cameraDistance: 2.3,
    centerGap: 141,
    viewScale: 1.45,
    curvature: 1.16
};

// ── Shaders ──
const vsSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uWorldNormalMatrix;

out vec3 vWorldNormal;
out vec3 vColor;
out vec3 vWorldPos;

void main() {
    vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
    vWorldNormal = uWorldNormalMatrix * aNormal;
    vColor = aColor;
    vWorldPos = vec3(worldPos);
}`;

const fsSource = `#version 300 es
precision mediump float;

in vec3 vWorldNormal;
in vec3 vColor;
in vec3 vWorldPos;

out vec4 fragColor;

void main() {
    vec3 normal = normalize(vWorldNormal);
    
    // Sun
    vec3 sunPos = vec3(5.0, 5.0, 5.0);
    vec3 sunDir = normalize(sunPos - vWorldPos);
    float sunDiff = max(dot(normal, sunDir), 0.0) * 1.5;
    
    // Fill
    vec3 fillPos = vec3(-5.0, -5.0, -5.0);
    vec3 fillDir = normalize(fillPos - vWorldPos);
    float fillDiff = max(dot(normal, fillDir), 0.0) * 0.8;
    
    float ambient = 0.3;
    vec3 lightColor = vec3(1.0) * sunDiff + vec3(1.0, 0.86, 0.66) * fillDiff + vec3(ambient);
    
    vec3 color = vColor * lightColor;
    // Basic gamma
    color = pow(color, vec3(1.0/2.2));
    
    fragColor = vec4(color, 1.0);
}`;

init();
requestAnimationFrame(animate);

// ── Init ──
function init() {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    gl = canvas.getContext('webgl2');

    if (!gl) { alert('WebGL2 not supported'); return; }

    resize();
    window.addEventListener('resize', resize);

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    defaultProgram = gl.createProgram();
    gl.attachShader(defaultProgram, vs);
    gl.attachShader(defaultProgram, fs);
    gl.linkProgram(defaultProgram);

    // Geometry buffers
    geometries.earth = createSphere(EARTH_RADIUS, 32, 16, [0.36, 0.25, 0.21], effect.curvature); // Brown
    geometries.tree = createTree(0.06, 0.15, [0.18, 0.49, 0.19]); // Trunk + Cone foliage
    geometries.bamboo = createCylinder(0.01, 0.2, [0.48, 0.7, 0.26]); // Light Green
    geometries.panda = createCube(0.08, 0.08, 0.08, [1.0, 1.0, 1.0]); // White cube fallback
    loadPandaMesh();
    geometries.house = createMinecraftHouse([1.0, 0.8, 0.5]); // Minecraft house
    geometries.factory = createMinecraftFactory(); // Minecraft factory
    geometries.human = createMinecraftCharacter([0.1, 0.46, 0.82]); // Minecraft-style character
    geometries.fire = createCone(0.05, 0.15, [1.0, 0.24, 0.0]); // Red

    // Events
    document.getElementById('start-btn').addEventListener('click', () => {
        const docElm = document.documentElement;
        try {
            if (docElm.requestFullscreen) {
                docElm.requestFullscreen().catch(e => console.warn(e));
            } else if (docElm.webkitRequestFullscreen) {
                docElm.webkitRequestFullscreen();
            } else if (docElm.mozRequestFullScreen) {
                docElm.mozRequestFullScreen();
            } else if (docElm.msRequestFullscreen) {
                docElm.msRequestFullscreen();
            }
        } catch (error) {
            console.error('Fullscreen request failed', error);
        }
        document.getElementById('start-btn').style.display = 'none';
    });
    setTimeout(() => { document.getElementById('info').style.opacity = '0'; }, 3000);

    // Socket binds
    socket.on('add-object', d => spawnByType(d.type, d.coords));
    socket.on('trigger-fire', () => triggerGlobalFire());
    socket.on('stop-fire', () => stopGlobalFire());

    socket.on('update-display', d => {
        if (d.cameraDistance !== undefined) effect.cameraDistance = d.cameraDistance;
        if (d.spreadDistance !== undefined) effect.centerGap = d.spreadDistance;
        if (d.projectionSize !== undefined) effect.viewScale = d.projectionSize;
        if (d.curvature !== undefined && d.curvature !== effect.curvature) {
            effect.curvature = d.curvature;
            // Clean up old WebGL buffers for Earth
            if (geometries.earth) {
                gl.deleteBuffer(geometries.earth.ibo);
                for (const b of geometries.earth.vbos) gl.deleteBuffer(b);
                gl.deleteVertexArray(geometries.earth.vao);
            }
            geometries.earth = createSphere(EARTH_RADIUS, 32, 16, [0.36, 0.25, 0.21], effect.curvature);
        }
    });

    setInterval(() => {
        socket.emit('state-update', {
            pandas: state.pandas.length, bamboo: state.bamboo.length, trees: state.trees.length,
            houses: state.houses.length, factories: state.factories.length, humans: state.humans.length,
            fire: state.isFireActive
        });
    }, 2000);

    updateHUD();
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

async function loadPandaMesh() {
    try {
        const response = await fetch('public/panda.json');
        if (!response.ok) throw new Error('Mesh not found');
        const data = await response.json();

        // --- 0. Rotation Fix (Common for FBX) ---
        // Rotate -90 on X: y' = z, z' = -y
        const rotateX = true;
        const rawPos = data.positions;
        const rawNorm = data.normals;
        const rotatedPos = new Float32Array(rawPos.length);
        const rotatedNorm = new Float32Array(rawNorm.length);

        if (rotateX) {
            for (let i = 0; i < rawPos.length; i += 3) {
                rotatedPos[i] = rawPos[i];
                rotatedPos[i + 1] = rawPos[i + 2];
                rotatedPos[i + 2] = -rawPos[i + 1];

                if (rawNorm && rawNorm.length > i + 2) {
                    rotatedNorm[i] = rawNorm[i];
                    rotatedNorm[i + 1] = rawNorm[i + 2];
                    rotatedNorm[i + 2] = -rawNorm[i + 1];
                }
            }
        } else {
            rotatedPos.set(rawPos);
            rotatedNorm.set(rawNorm);
        }

        // 1. Calculate Bounding Box for Normalization
        let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < rotatedPos.length; i += 3) {
            for (let j = 0; j < 3; j++) {
                min[j] = Math.min(min[j], rotatedPos[i + j]);
                max[j] = Math.max(max[j], rotatedPos[i + j]);
            }
        }

        // 2. Center and Scale
        const pandaSize = 0.12;
        const sizeY = max[1] - min[1];
        const scale = pandaSize / (sizeY || 1);
        const centerX = (min[0] + max[0]) / 2;
        const centerZ = (min[2] + max[2]) / 2;
        const centerY = min[1]; // Pivot at feet

        const finalPositions = new Float32Array(rotatedPos.length);
        for (let i = 0; i < rotatedPos.length; i += 3) {
            finalPositions[i] = (rotatedPos[i] - centerX) * scale;
            finalPositions[i + 1] = (rotatedPos[i + 1] - centerY) * scale;
            finalPositions[i + 2] = (rotatedPos[i + 2] - centerZ) * scale;
        }

        // Use the colors from the FBX if available
        const colors = data.colors && data.colors.length === finalPositions.length
            ? data.colors
            : new Float32Array(finalPositions.length).fill(1.0);

        geometries.panda = setupVAO(finalPositions, rotatedNorm, colors, data.indices);
        console.log("[sim] Panda mesh loaded and rotated");

    } catch (e) {
        console.warn("[sim] Could not load FBX-JSON:", e.message);
    }
}

function compileShader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
    }
    return s;
}

// ── Geometry Helpers ──
function createBuffer(data, usage = gl.STATIC_DRAW) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage);
    return b;
}

function createIndexBuffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
    return b;
}

function setupVAO(positions, normals, colors, indices) {
    const vao = gl.createVertexArray();
    const vbos = [];
    gl.bindVertexArray(vao);

    const posBuf = createBuffer(positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    vbos.push(posBuf);

    const normBuf = createBuffer(normals);
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(1);
    vbos.push(normBuf);

    const colorBuf = createBuffer(colors);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(2);
    vbos.push(colorBuf);

    const ibo = createIndexBuffer(indices);
    gl.bindVertexArray(null);
    return { vao, length: indices.length, ibo, vbos };
}

function createCube(w, h, d, color) {
    const pos = [
        -w / 2, -h / 2, d / 2, w / 2, -h / 2, d / 2, w / 2, h / 2, d / 2, -w / 2, h / 2, d / 2, // Front
        -w / 2, -h / 2, -d / 2, -w / 2, h / 2, -d / 2, w / 2, h / 2, -d / 2, w / 2, -h / 2, -d / 2, // Back
        -w / 2, h / 2, -d / 2, -w / 2, h / 2, d / 2, w / 2, h / 2, d / 2, w / 2, h / 2, -d / 2, // Top
        -w / 2, -h / 2, -d / 2, w / 2, -h / 2, -d / 2, w / 2, -h / 2, d / 2, -w / 2, -h / 2, d / 2, // Bottom
        w / 2, -h / 2, -d / 2, w / 2, h / 2, -d / 2, w / 2, h / 2, d / 2, w / 2, -h / 2, d / 2, // Right
        -w / 2, -h / 2, -d / 2, -w / 2, -h / 2, d / 2, -w / 2, h / 2, d / 2, -w / 2, h / 2, -d / 2  // Left
    ];
    const nor = [
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, // Front
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, // Back
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, // Top
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, // Bottom
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, // Right
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0  // Left
    ];
    const col = [];
    for (let i = 0; i < 24; i++) col.push(...color);
    const ind = [
        0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11,
        12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
    ];
    // Offset cube to bottom center (pivot base)
    for (let i = 1; i < pos.length; i += 3) pos[i] += h / 2;
    return setupVAO(pos, nor, col, ind);
}

function addCylinderToArrays(pos, nor, col, ind, radius, height, x, y, z, color) {
    const start = pos.length / 3;
    const segments = 12;
    // Top & Bottom centers
    pos.push(x, y + height, z); nor.push(0, 1, 0); col.push(...color);
    pos.push(x, y, z); nor.push(0, -1, 0); col.push(...color);

    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const s = Math.sin(a), c = Math.cos(a);
        // Top ring
        pos.push(x + c * radius, y + height, z + s * radius);
        nor.push(0, 1, 0);
        col.push(...color);
        // Bottom ring
        pos.push(x + c * radius, y, z + s * radius);
        nor.push(0, -1, 0);
        col.push(...color);
        // Side top
        pos.push(x + c * radius, y + height, z + s * radius);
        nor.push(c, 0, s);
        col.push(...color);
        // Side bottom
        pos.push(x + c * radius, y, z + s * radius);
        nor.push(c, 0, s);
        col.push(...color);
    }

    for (let i = 0; i < segments; i++) {
        const base = start + 2 + i * 4;
        // Top cap
        ind.push(start, base, base + 4);
        // Bottom cap
        ind.push(start + 1, base + 5, base + 1);
        // Sides
        ind.push(base + 2, base + 3, base + 7);
        ind.push(base + 2, base + 7, base + 6);
    }
}

function addConeToArrays(pos, nor, col, ind, radius, height, x, y, z, color) {
    const start = pos.length / 3;
    const segments = 12;
    // Tip
    pos.push(x, y + height, z); nor.push(0, 1, 0); col.push(...color);
    // Base center
    pos.push(x, y, z); nor.push(0, -1, 0); col.push(...color);

    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const s = Math.sin(a), c = Math.cos(a);
        // Base ring
        pos.push(x + c * radius, y, z + s * radius);
        nor.push(0, -1, 0);
        col.push(...color);
        // Side face
        pos.push(x + c * radius, y, z + s * radius);
        nor.push(c, 0.5, s);
        col.push(...color);
    }

    for (let i = 0; i < segments; i++) {
        const base = start + 2 + i * 2;
        // Base cap
        ind.push(start + 1, base + 2, base);
        // Side face
        ind.push(start, base + 1, base + 3);
    }
}

function createTree(radius, height, foliageColor) {
    const pos = [], nor = [], col = [], ind = [];
    const trunkRadius = radius * 0.3;
    const trunkHeight = height * 0.4;
    const trunkColor = [0.4, 0.25, 0.15]; // Brown

    addCylinderToArrays(pos, nor, col, ind, trunkRadius, trunkHeight, 0, 0, 0, trunkColor);
    addConeToArrays(pos, nor, col, ind, radius, height - trunkHeight, 0, trunkHeight, 0, foliageColor);

    return setupVAO(pos, nor, col, ind);
}

function createCone(radius, height, color) {
    const pos = [], nor = [], col = [], ind = [];
    addConeToArrays(pos, nor, col, ind, radius, height, 0, 0, 0, color);
    return setupVAO(pos, nor, col, ind);
}

function addBoxToArrays(pos, nor, col, ind, w, h, d, x, y, z, c) {
    const start = pos.length / 3;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const p = [
        -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd, // Front
        -hw, -hh, -hd, -hw, hh, -hd, hw, hh, -hd, hw, -hh, -hd, // Back
        -hw, hh, -hd, -hw, hh, hd, hw, hh, hd, hw, hh, -hd, // Top
        -hw, -hh, -hd, hw, -hh, -hd, hw, -hh, hd, -hw, -hh, hd, // Bottom
        hw, -hh, -hd, hw, hh, -hd, hw, hh, hd, hw, -hh, hd, // Right
        -hw, -hh, -hd, -hw, -hh, hd, -hw, hh, hd, -hw, hh, -hd  // Left
    ];
    const n = [
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
    ];
    for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i] + x, p[i + 1] + y, p[i + 2] + z);
        nor.push(n[i], n[i + 1], n[i + 2]);
        col.push(...c);
    }
    const indices = [
        0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11,
        12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
    ];
    for (let i = 0; i < indices.length; i++) {
        ind.push(indices[i] + start);
    }
}

function createMinecraftCharacter(color) {
    const pos = [], nor = [], col = [], ind = [];
    const s = 0.1 / 32;

    const skinColor = [0.94, 0.72, 0.63];
    const shirtColor = color;
    const pantsColor = [0.22, 0.22, 0.65];

    addBoxToArrays(pos, nor, col, ind, 4 * s, 12 * s, 4 * s, -2 * s, 6 * s, 0, pantsColor);
    addBoxToArrays(pos, nor, col, ind, 4 * s, 12 * s, 4 * s, 2 * s, 6 * s, 0, pantsColor);
    addBoxToArrays(pos, nor, col, ind, 8 * s, 12 * s, 4 * s, 0, 18 * s, 0, shirtColor);
    addBoxToArrays(pos, nor, col, ind, 4 * s, 12 * s, 4 * s, -6 * s, 18 * s, 0, skinColor);
    addBoxToArrays(pos, nor, col, ind, 4 * s, 12 * s, 4 * s, 6 * s, 18 * s, 0, skinColor);
    addBoxToArrays(pos, nor, col, ind, 8 * s, 8 * s, 8 * s, 0, 28 * s, 0, skinColor);

    return setupVAO(pos, nor, col, ind);
}

function createMinecraftHouse(color) {
    const pos = [], nor = [], col = [], ind = [];
    const s = 0.1 / 32;

    const wallColor = [0.6, 0.46, 0.33]; // Wood planks
    const roofColor = [0.45, 0.25, 0.05]; // Dark wood
    const doorColor = [0.35, 0.2, 0.05];
    const windowColor = [0.7, 0.9, 1.0];

    // Main walls
    addBoxToArrays(pos, nor, col, ind, 24 * s, 16 * s, 20 * s, 0, 8 * s, 0, wallColor);
    // Roof (flat-ish Minecraft style)
    addBoxToArrays(pos, nor, col, ind, 28 * s, 4 * s, 24 * s, 0, 18 * s, 0, roofColor);
    // Door
    addBoxToArrays(pos, nor, col, ind, 4 * s, 8 * s, 1 * s, 0, 4 * s, 10 * s, doorColor);
    // Windows
    addBoxToArrays(pos, nor, col, ind, 4 * s, 4 * s, 1 * s, -6 * s, 10 * s, 10 * s, windowColor);
    addBoxToArrays(pos, nor, col, ind, 4 * s, 4 * s, 1 * s, 6 * s, 10 * s, 10 * s, windowColor);

    return setupVAO(pos, nor, col, ind);
}

function createMinecraftFactory() {
    const pos = [], nor = [], col = [], ind = [];
    const s = 0.1 / 32;

    const stoneColor = [0.55, 0.55, 0.55];
    const brickColor = [0.5, 0.2, 0.2];
    const darkColor = [0.2, 0.2, 0.2];

    // Main hall
    addBoxToArrays(pos, nor, col, ind, 32 * s, 20 * s, 24 * s, 0, 10 * s, 0, stoneColor);
    // Side building
    addBoxToArrays(pos, nor, col, ind, 16 * s, 12 * s, 16 * s, 20 * s, 6 * s, 0, stoneColor);
    // Large Smokestack
    addBoxToArrays(pos, nor, col, ind, 8 * s, 40 * s, 8 * s, -8 * s, 20 * s, -4 * s, brickColor);
    // Smokestack top
    addBoxToArrays(pos, nor, col, ind, 10 * s, 4 * s, 10 * s, -8 * s, 42 * s, -4 * s, darkColor);

    return setupVAO(pos, nor, col, ind);
}

function createCylinder(radius, height, color) {
    return createCube(radius * 2, height, radius * 2, color); // Simple fallback for cylinder until detailed mesh generator needed
}

function createSphere(radius, widthSegments, heightSegments, color, thetaLength = Math.PI) {
    const pos = [], nor = [], col = [], ind = [];
    for (let y = 0; y <= heightSegments; y++) {
        const v = y / heightSegments;
        for (let x = 0; x <= widthSegments; x++) {
            const u = x / widthSegments;
            const px = radius * Math.sin(v * thetaLength) * Math.cos(u * Math.PI * 2);
            const py = radius * Math.cos(v * thetaLength);
            const pz = radius * Math.sin(v * thetaLength) * Math.sin(u * Math.PI * 2);
            pos.push(px, py, pz);
            let n = vec3.normalize(vec3.create(), [px, py, pz]);
            nor.push(n[0], n[1], n[2]);
            col.push(...color);
        }
    }
    for (let y = 0; y < heightSegments; y++) {
        for (let x = 0; x < widthSegments; x++) {
            const a = x + (widthSegments + 1) * y;
            const b = x + (widthSegments + 1) * (y + 1);
            const c = (x + 1) + (widthSegments + 1) * (y + 1);
            const d = (x + 1) + (widthSegments + 1) * y;
            ind.push(a, b, d);
            ind.push(b, c, d);
        }
    }
    // Offset sphere bottom to Y = 0 (origin) 
    for (let i = 1; i < pos.length; i += 3) pos[i] -= radius;
    return setupVAO(pos, nor, col, ind);
}

// ── Math & Transformation ──
function surfacePointFrom2D(nx, ny) {
    const r = Math.min(Math.sqrt(nx * nx + ny * ny), 1.0);
    const theta = r * (Math.PI / 2.5);
    const phi = Math.atan2(ny, nx);
    const pos = [
        EARTH_RADIUS * Math.sin(theta) * Math.cos(phi),
        EARTH_RADIUS * Math.cos(theta) - EARTH_RADIUS,
        EARTH_RADIUS * Math.sin(theta) * Math.sin(phi)
    ];
    const normal = vec3.normalize(vec3.create(), [
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi)
    ]);
    return { pos, normal };
}

// ── Spawning Objects ──
class WorldObject {
    constructor(type, coords) {
        this.type = type;
        this.coords = coords;
        const { pos, normal } = surfacePointFrom2D(coords.x, coords.y);
        this.position = pos;
        this.normal = normal;
        this.scale = 0.001;
        this.targetScale = 1.0;

        // Calculate quaternion to rotate 'up' (0,1,0) to surface normal
        this.quat = quat.create();
        quat.rotationTo(this.quat, [0, 1, 0], this.normal);

        this.matrix = mat4.create();
    }
    update(delta) {
        if (this.scale < this.targetScale) {
            this.scale += (this.targetScale - this.scale) * 0.06;
        }
        mat4.fromRotationTranslationScale(
            this.matrix,
            this.quat,
            this.position,
            [this.scale, this.scaleY !== undefined ? this.scaleY : this.scale, this.scale]
        );
    }
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function nearbyCoords(base, spread = 0.12) {
    return {
        x: Math.max(-0.9, Math.min(0.9, base.x + rand(-spread, spread))),
        y: Math.max(-0.9, Math.min(0.9, base.y + rand(-spread, spread)))
    };
}
function spreadingCoords(base, count, minSpread = 0.08, maxSpread = 0.45, scale = 12) {
    const spread = Math.min(maxSpread, minSpread + count / scale * (maxSpread - minSpread));
    return nearbyCoords(base, spread);
}

function spawnOnSurface(type, stateArray, coords = null) {
    const finalCoords = coords || { x: rand(-0.9, 0.9), y: rand(-0.9, 0.9) };
    const obj = new WorldObject(type, finalCoords);
    stateArray.push(obj);
    return obj;
}

export function spawnByType(type, coords = null) {
    switch (type) {
        case 'bamboo': spawnOnSurface(type, state.bamboo, coords); break;
        case 'panda': spawnOnSurface(type, state.pandas, coords); break;
        case 'tree': if (state.trees.length < maxTreeCount) spawnOnSurface(type, state.trees, coords); break;
        case 'house': spawnOnSurface(type, state.houses, coords); break;
        case 'factory': spawnOnSurface(type, state.factories, coords); break;
        case 'human':
            spawnOnSurface(type, state.humans, coords);
            if (state.trees.length > 0) state.trees.pop();
            break;
    }
    updateHUD();
}

function triggerGlobalFire() {
    if (state.isFireActive) return;
    state.isFireActive = true;
    for (let i = 0; i < 18; i++) {
        if (state.factories.length > 0) {
            const factory = state.factories[Math.floor(Math.random() * state.factories.length)];
            spawnOnSurface('fire', state.fires, spreadingCoords(factory.coords, state.fires.length, 0.12, 0.5, 10));
        }
    }
    showAlert('Forest fire ignited by climate change!', 'fire');
    updateHUD();
}

function stopGlobalFire() {
    if (!state.isFireActive) return;
    state.isFireActive = false;
    state.fires.length = 0;
    const humansLost = Math.min(state.humans.length, 8 + Math.floor(Math.random() * 3));
    for (let i = 0; i < humansLost; i++) state.humans.pop();
    showAlert('Fire extinguished! The surviving ecosystem remains.', 'safe');
    updateHUD();
}

// ── Rendering Loop ──
function drawObject(modelMatrix, viewMatrix, projectionMatrix, geometry) {
    gl.bindVertexArray(geometry.vao);

    const normalMatrix = mat3.create();
    mat3.normalFromMat4(normalMatrix, modelMatrix);

    gl.uniformMatrix4fv(gl.getUniformLocation(defaultProgram, "uModelMatrix"), false, modelMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(defaultProgram, "uViewMatrix"), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(defaultProgram, "uProjectionMatrix"), false, projectionMatrix);
    gl.uniformMatrix3fv(gl.getUniformLocation(defaultProgram, "uWorldNormalMatrix"), false, normalMatrix);

    gl.drawElements(gl.TRIANGLES, geometry.length, gl.UNSIGNED_SHORT, 0);
}

function renderSceneFromCamera(viewMatrix, projectionMatrix) {
    gl.useProgram(defaultProgram);

    const groupMatrix = mat4.create();
    mat4.translate(groupMatrix, groupMatrix, [0, 0.45, 0]);

    // Draw Earth
    drawObject(groupMatrix, viewMatrix, projectionMatrix, geometries.earth);

    // Draw all objects
    const all = [
        ...state.bamboo, ...state.pandas, ...state.houses,
        ...state.factories, ...state.humans, ...state.trees, ...state.fires
    ];
    for (const obj of all) {
        const objMod = mat4.create();
        mat4.multiply(objMod, groupMatrix, obj.matrix);
        drawObject(objMod, viewMatrix, projectionMatrix, geometries[obj.type]);
    }
}

function animate(time = 0) {
    requestAnimationFrame(animate);
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    // Logic update
    const all = [
        ...state.bamboo, ...state.pandas, ...state.houses, ...state.factories,
        ...state.humans, ...state.trees, ...state.fires
    ];
    all.forEach(obj => obj.update(delta));

    // Ecosystem simulation
    if (delta > 0) {
        const fireThreshold = 5 + Math.floor(state.trees.length / 5);
        if (!state.isFireActive && state.factories.length >= fireThreshold) triggerGlobalFire();
        if (state.isFireActive && state.humans.length >= 10) stopGlobalFire();

        if (state.isFireActive) {
            state.fires.forEach(f => {
                f.pulsePhase = (f.pulsePhase || 0) + delta * 6;
                f.scaleY = Math.max(0.3, 1 + Math.sin(f.pulsePhase) * 0.3);
            });

            fireBurnTimer += delta;
            if (fireBurnTimer >= 0.3) {
                fireBurnTimer = 0;
                if (state.trees.length > 0) state.trees.pop();
                else if (state.bamboo.length > 0) state.bamboo.pop();
                else if (state.pandas.length > 0) state.pandas.pop();
                else if (state.houses.length > 0) state.houses.pop();
                else if (state.factories.length > 0) state.factories.pop();
            }
        } else {
            if (state.trees.length > 0 && state.trees.length < maxTreeCount) {
                treeTimer += delta;
                if (treeTimer >= 3) {
                    treeTimer = 0;
                    const p = state.trees[Math.floor(Math.random() * state.trees.length)];
                    spawnOnSurface('tree', state.trees, spreadingCoords(p.coords, state.trees.length));
                }
            }
            if (state.humans.length > 0) {
                houseTimer += delta;
                if (houseTimer >= 5) {
                    houseTimer = 0;
                    for (let i = 0; i < state.humans.length && state.houses.length < maxHouseCount; i++) {
                        spawnOnSurface('house', state.houses, spreadingCoords(state.humans[i].coords, state.houses.length, 0.06, 0.35, 10));
                    }
                }
                factoryTimer += delta;
                if (factoryTimer >= 20) {
                    factoryTimer = 0;
                    for (let i = 0; i < state.humans.length && state.factories.length < maxFactoryCount; i++) {
                        spawnOnSurface('factory', state.factories, spreadingCoords(state.humans[i].coords, state.factories.length, 0.06, 0.35, 8));
                    }
                }
            }
            if (state.pandas.length > 0) {
                pandaTimer += delta;
                if (pandaTimer >= 3) {
                    pandaTimer = 0;

                    // 1 tree per panda
                    for (let i = 0; i < state.pandas.length; i++) {
                        if (state.trees.length < maxTreeCount) {
                            const panda = state.pandas[i];
                            spawnOnSurface('tree', state.trees, spreadingCoords(panda.coords, state.trees.length, 0.08, 0.5, 14));
                        }
                    }

                    // 1 bamboo removed per 2 pandas
                    const bambooToRemove = Math.floor(state.pandas.length / 2);
                    for (let i = 0; i < bambooToRemove; i++) {
                        if (state.bamboo.length > 0) state.bamboo.pop();
                    }

                    // breeding: if 2 or more pandas, make 1 new panda
                    if (state.pandas.length >= 2 && state.bamboo.length > 0) {
                        const parentPanda = state.pandas[Math.floor(Math.random() * state.pandas.length)];
                        spawnOnSurface('panda', state.pandas, spreadingCoords(parentPanda.coords, state.pandas.length, 0.05, 0.25, 10));
                    }
                }

                if (state.bamboo.length === 0 && state.pandas.length > 0) {
                    pandaStarveTimer += delta;
                    if (pandaStarveTimer >= 3) {
                        pandaStarveTimer = 0;
                        state.pandas.pop();
                    }
                } else {
                    pandaStarveTimer = 0;
                }
            }
        }
    }

    // Holographic rendering logic
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);

    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const q = Math.min(w, h) / 3;
    const s = q * effect.viewScale;
    const hs = s / 2;
    const gap = effect.centerGap;

    const projMatrix = mat4.create();
    mat4.perspective(projMatrix, Math.PI / 3, 1.0, 0.1, 1000.0);

    // A simplified, physically accurate camera orientation for Pepper's Ghost
    // The view matrix maps the world into the camera's local viewport correctly framing the object.
    const createCameraViewMatrix = (tx, ty, tz, ux, uy, uz) => {
        const eye = vec3.fromValues(tx, ty, tz);

        // Target is the origin (matches Three.js scene position default 0,0,0)
        const center = vec3.fromValues(0, 0, 0);
        const up = vec3.fromValues(ux, uy, uz);

        const viewMat = mat4.create();
        mat4.lookAt(viewMat, eye, center, up);
        return viewMat;
    };

    const renderQuad = (viewMatrix, x, y) => {
        gl.viewport(x, y, s, s);
        gl.scissor(x, y, s, s);
        renderSceneFromCamera(viewMatrix, projMatrix);
    };

    const d = effect.cameraDistance;

    // TOP
    // Camera at +Z (Front), ground (-Y) faces the bottom of the viewport 
    // Since viewport bottom is closer to screen center, the image projects exactly inwards.
    renderQuad(createCameraViewMatrix(0, 0, d, 0, 1, 0), cx - hs, cy + gap);

    // BOTTOM
    // Camera at -Z (Back), ground (-Y) faces the top of the viewport
    // Since viewport top is closer to screen center, we map world +Y to screen -Y.
    renderQuad(createCameraViewMatrix(0, 0, -d, 0, -1, 0), cx - hs, cy - s - gap);

    // LEFT
    // Camera at -X, ground (-Y) faces the right of the viewport
    // 'up' assigned to Z maps scene +Y to screen Left, causing ground to point right toward center.
    renderQuad(createCameraViewMatrix(-d, 0, 0, 0, 0, 1), cx - s - gap, cy - hs);

    // RIGHT
    // Camera at +X, ground (-Y) faces the left of the viewport
    // 'up' assigned to Z maps scene +Y to screen Right, causing ground to point left toward center.
    renderQuad(createCameraViewMatrix(d, 0, 0, 0, 0, 1), cx + gap, cy - hs);

    gl.disable(gl.SCISSOR_TEST);
}

// ── HUD ──
function updateHUD() {
    document.getElementById('hud-bamboo').textContent = state.bamboo.length;
    document.getElementById('hud-pandas').textContent = state.pandas.length;
    document.getElementById('hud-trees').textContent = state.trees.length;
    document.getElementById('hud-houses').textContent = state.houses.length;
    document.getElementById('hud-factories').textContent = state.factories.length;
    document.getElementById('hud-humans').textContent = state.humans.length;
    const fireEl = document.getElementById('hud-fire');
    fireEl.textContent = state.isFireActive ? '🔥 ACTIVE' : '✅ Safe';
    fireEl.style.color = state.isFireActive ? '#FF3D00' : '#66BB6A';
}

function showAlert(msg, type) {
    const el = document.getElementById('eco-alert');
    if (!el) return;
    el.textContent = msg;
    el.className = 'eco-alert show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 4000);
}
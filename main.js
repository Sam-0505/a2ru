import * as THREE from 'three';
import { CustomPeppersGhostEffect } from './CustomPeppersGhostEffect.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// ── Socket.IO — connect to backend on port 3000 ───────────────────────────────
const socket = io('http://172.22.34.78:3000');
socket.on('connect', () => console.log('[sim] connected to backend'));


// Variable counters 
var treeTimer = 0;
var houseTimer = 0;
var factoryTimer = 0;
var pandaTimer = 0;
var fireBurnTimer = 0;
const maxTreeCount = 25;
const maxHouseCount = 20;
const maxFactoryCount = 12;
var pandaStarveTimer = 0;

// ─── ECOSYSTEM STATE ──────────────────────────────────────────────────────────
const EARTH_RADIUS = 1.0;
const state = {
    bamboo: [],
    pandas: [],
    houses: [],
    factories: [],
    humans: [],
    trees: [],
    fires: [],
    isFireActive: false,
    extinctionThreshold: 3,
};

let container, camera, scene, renderer, effect, group, earthSlice;
let lastTime = 0;
let pandaFBXTemplate = null;   // preloaded FBX, cloned per spawn

init();
animate();

// ─── SURFACE HELPERS ─────────────────────────────────────────────────────────

function randomSurfacePoint() {
    return surfacePointFrom2D(
        (Math.random() - 0.5) * 2 * 0.9, // random x between -0.9 and 0.9
        (Math.random() - 0.5) * 2 * 0.9  // random y between -0.9 and 0.9
    );
}

function surfacePointFrom2D(nx, ny) {
    // Distance from center, capped at 1.0 (the edge of the dome)
    const r = Math.min(Math.sqrt(nx * nx + ny * ny), 1.0);
    // map to theta up to max angle PI/2.5
    const theta = r * (Math.PI / 2.5);
    const phi = Math.atan2(ny, nx);
    return {
        pos: new THREE.Vector3(
            EARTH_RADIUS * Math.sin(theta) * Math.cos(phi),
            EARTH_RADIUS * Math.cos(theta) - EARTH_RADIUS,
            EARTH_RADIUS * Math.sin(theta) * Math.sin(phi)
        ),
        normal: new THREE.Vector3(
            Math.sin(theta) * Math.cos(phi),
            Math.cos(theta),
            Math.sin(theta) * Math.sin(phi)
        ).normalize()
    };
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

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

function spawnOnSurface(mesh, stateArray, coords = null) {
    const finalCoords = coords || {
        x: rand(-0.9, 0.9),
        y: rand(-0.9, 0.9)
    };

    const { pos, normal } = surfacePointFrom2D(finalCoords.x, finalCoords.y);

    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    mesh.userData.targetScale = new THREE.Vector3(1, 1, 1);
    mesh.userData.coords = finalCoords;   // save area on object
    mesh.scale.set(0.001, 0.001, 0.001);

    group.add(mesh);
    stateArray.push(mesh);
    return mesh;
}

function killLast(arr) {
    if (!arr.length) return;
    const v = arr.pop();
    group.remove(v);
    v.traverse(c => {
        if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); }
    });
}

// ─── OBJECT BUILDERS ─────────────────────────────────────────────────────────

function buildTree() {
    const g = new THREE.Group();
    const tGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.12, 6);
    tGeo.translate(0, 0.06, 0);
    const cGeo = new THREE.ConeGeometry(0.07, 0.15, 7);
    cGeo.translate(0, 0.20, 0);
    g.add(
        new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ color: 0x5D4037 })),
        new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ color: 0x2E7D32 }))
    );
    return g;
}

function buildBamboo() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const sGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.072, 6);
        sGeo.translate(0, 0.036 + i * 0.082, 0);
        const lGeo = new THREE.PlaneGeometry(0.045, 0.016);
        lGeo.translate(0.028, 0.028 + i * 0.082, 0);
        g.add(
            new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ color: 0x7CB342 })),
            new THREE.Mesh(lGeo, new THREE.MeshStandardMaterial({ color: 0x9CCC65, side: THREE.DoubleSide }))
        );
    }
    return g;
}

function buildPanda() {
    if (pandaFBXTemplate) {
        const clone = pandaFBXTemplate.clone();
        clone.scale.setScalar(0.0008);   // FBX is huge — scale way down
        clone.traverse(c => {
            if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = false;
            }
        });
        return clone;
    }
    // Fallback: procedural panda while FBX is loading
    const g = new THREE.Group();
    const bGeo = new THREE.SphereGeometry(0.048, 12, 12); bGeo.translate(0, 0.048, 0);
    const hGeo = new THREE.SphereGeometry(0.032, 12, 12); hGeo.translate(0, 0.114, 0);
    const wMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8 });
    const bMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    g.add(new THREE.Mesh(bGeo, wMat), new THREE.Mesh(hGeo, wMat));
    for (const sx of [-1, 1]) {
        const eGeo = new THREE.SphereGeometry(0.013, 6, 6); eGeo.translate(sx * 0.029, 0.138, 0);
        g.add(new THREE.Mesh(eGeo, bMat));
    }
    return g;
}

function buildHouse() {
    const g = new THREE.Group();
    const wGeo = new THREE.BoxGeometry(0.13, 0.10, 0.13); wGeo.translate(0, 0.05, 0);
    const rGeo = new THREE.ConeGeometry(0.10, 0.075, 4); rGeo.rotateY(Math.PI / 4); rGeo.translate(0, 0.138, 0);
    const dGeo = new THREE.BoxGeometry(0.028, 0.042, 0.006); dGeo.translate(0, 0.021, 0.066);
    g.add(
        new THREE.Mesh(wGeo, new THREE.MeshStandardMaterial({ color: 0xFFCC80 })),
        new THREE.Mesh(rGeo, new THREE.MeshStandardMaterial({ color: 0xD84315 })),
        new THREE.Mesh(dGeo, new THREE.MeshStandardMaterial({ color: 0x6D4C41 }))
    );
    return g;
}

function buildFactory() {
    const g = new THREE.Group();
    const bGeo = new THREE.BoxGeometry(0.17, 0.19, 0.15); bGeo.translate(0, 0.095, 0);
    g.add(new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0x616161 })));
    for (const [ox, h] of [[-0.045, 0.13], [0.04, 0.10]]) {
        const cGeo = new THREE.CylinderGeometry(0.019, 0.021, h, 6); cGeo.translate(ox, 0.19 + h / 2, 0);
        const sGeo = new THREE.SphereGeometry(0.024, 6, 6); sGeo.translate(ox, 0.19 + h + 0.026, 0);
        g.add(
            new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ color: 0x424242 })),
            new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ color: 0x9E9E9E, transparent: true, opacity: 0.55 }))
        );
    }
    return g;
}

function buildHuman() {
    const g = new THREE.Group();
    const tGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.065, 6); tGeo.translate(0, 0.082, 0);
    const hGeo = new THREE.SphereGeometry(0.019, 8, 8); hGeo.translate(0, 0.135, 0);
    for (const ox of [-0.011, 0.011]) {
        const lGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5); lGeo.translate(ox, 0.025, 0);
        g.add(new THREE.Mesh(lGeo, new THREE.MeshStandardMaterial({ color: 0x1565C0 })));
    }
    g.add(
        new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ color: 0x1976D2 })),
        new THREE.Mesh(hGeo, new THREE.MeshStandardMaterial({ color: 0xFFCC80 }))
    );
    return g;
}

function buildFire() {
    const g = new THREE.Group();
    const cols = [0xFF3D00, 0xFF6D00, 0xFFAB00];
    for (let i = 0; i < 3; i++) {
        const h = 0.075 + Math.random() * 0.065;
        const cGeo = new THREE.ConeGeometry(0.026, h, 6);
        cGeo.translate((Math.random() - 0.5) * 0.035, h / 2, (Math.random() - 0.5) * 0.035);
        g.add(new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({ color: cols[i] })));
    }
    g.userData.isFire = true;
    g.userData.pulsePhase = Math.random() * Math.PI * 2;
    return g;
}

// ─── ECOSYSTEM ACTIONS ────────────────────────────────────────────────────────

export function spawnByType(type, coords = null) {
    switch (type) {
        case 'bamboo': spawnOnSurface(buildBamboo(), state.bamboo, coords); break;
        case 'panda': spawnOnSurface(buildPanda(), state.pandas, coords); break;
        case 'tree':
    if (state.trees.length < maxTreeCount) {spawnOnSurface(buildTree(), state.trees, coords);}break;
        case 'house': spawnOnSurface(buildHouse(), state.houses, coords); break;
        case 'factory':spawnOnSurface(buildFactory(), state.factories, coords);break;
        case 'human': spawnOnSurface(buildHuman(), state.humans, coords); // humans remove one tree when immedietly places
            if (state.trees.length > 0) killLast(state.trees); break;
    }
    updateHUD();
}

function triggerGlobalFire() {
    if (state.isFireActive) return;
    state.isFireActive = true;

    for (let i = 0; i < 18; i++) {
        if (state.factories.length > 0) {
            const factory = state.factories[Math.floor(Math.random() * state.factories.length)];
            spawnOnSurface(
                buildFire(),
                state.fires,
                spreadingCoords(factory.userData.coords, state.fires.length, 0.12, 0.5, 10)
            );
        }
    }

    showAlert('Forest fire ignited by climate change!', 'fire');
    updateHUD();
}

function stopGlobalFire() {
    if (!state.isFireActive) return;
    state.isFireActive = false;

    while (state.fires.length) killLast(state.fires);

    // stopping the fire costs most humans
    const humansLost = Math.min(state.humans.length, 8 + Math.floor(Math.random() * 3)); // 8, 9, or 10
    for (let i = 0; i < humansLost; i++) {
        if (state.humans.length > 0) killLast(state.humans);
    }

    showAlert('Fire extinguished! The surviving ecosystem remains.', 'safe');

    updateHUD();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

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
    el.textContent = msg;
    el.className = 'eco-alert show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 4000);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    group = new THREE.Group();
    // Shift group 'up' (which flips to 'down' towards the outer edges) 
    // to give objects (the 'sky') more headroom before the center frame crops them.
    group.position.y = 0.45;
    scene.add(group);

    // ── Earth cap ─────────────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2.5);
    earthGeo.translate(0, -EARTH_RADIUS, 0);

    const earthMat = new THREE.MeshStandardMaterial({
        color: 0x5D4037, // Fallback base brown
        roughness: 1.0,
        metalness: 0.0
    });

    earthMat.onBeforeCompile = (shader) => {
        earthMat.userData.shader = shader;
        shader.uniforms.noiseScale = { value: 15.0 };
        shader.uniforms.color1 = { value: new THREE.Color(0x8D6E63) }; // Light dirt/rock
        shader.uniforms.color2 = { value: new THREE.Color(0x3E2723) }; // Dark soil

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
             varying vec3 vObjPos;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vObjPos = position;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
             uniform float noiseScale;
             uniform vec3 color1;
             uniform vec3 color2;
             varying vec3 vObjPos;
             
             // Ashima 3D Simplex Noise
             vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
             vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
             vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
             vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
             float snoise(vec3 v) {
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i); 
                vec4 p = permute( permute( permute( 
                           i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                         + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                         + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                float n_ = 0.142857142857;
                vec3  ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_ );
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
             }
             float fbm(vec3 p) {
                 float f = 0.0;
                 f += 0.5000 * snoise(p); p = p * 2.02;
                 f += 0.2500 * snoise(p); p = p * 2.03;
                 f += 0.1250 * snoise(p); p = p * 2.01;
                 f += 0.0625 * snoise(p);
                 return f + 0.5;
             }`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             float n = fbm(vObjPos * noiseScale);
             diffuseColor.rgb = mix(color2, color1, clamp(n, 0.0, 1.0));`
        );
    };

    earthSlice = new THREE.Mesh(earthGeo, earthMat);
    group.add(earthSlice);

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.PointLight(0xffffff, 10, 100); sun.position.set(5, 5, 5); scene.add(sun);
    const fill = new THREE.PointLight(0xffddaa, 8, 100); fill.position.set(-5, -5, -5); scene.add(fill);

    // ── Renderer ──────────────────────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // ── Effect ────────────────────────────────────────────────────────────────
    effect = new CustomPeppersGhostEffect(renderer);
    effect.setSize(window.innerWidth, window.innerHeight);
    effect.cameraDistance = 2.3;
    effect.centerGap = 141;
    effect.viewScale = 1.45;
    // Also update earth curvature default
    {
        const cg = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32, 0, Math.PI * 2, 0, 1.162732);
        cg.translate(0, -EARTH_RADIUS, 0);
        earthSlice.geometry = cg;
    }

    // ── Socket.IO event listeners ─────────────────────────────────────────────
    socket.on('add-object', d => spawnByType(d.type, d.coords));
    socket.on('trigger-fire', () => triggerGlobalFire());
    socket.on('stop-fire', () => stopGlobalFire());

    // Display controls remotely from controller
    socket.on('update-display', d => {
        if (d.cameraDistance !== undefined) effect.cameraDistance = d.cameraDistance;
        if (d.spreadDistance !== undefined) effect.centerGap = d.spreadDistance;
        if (d.projectionSize !== undefined) effect.viewScale = d.projectionSize;
        if (d.noiseScale !== undefined && earthSlice.material.userData.shader) {
            earthSlice.material.userData.shader.uniforms.noiseScale.value = d.noiseScale;
        }
        if (d.curvature !== undefined) {
            earthSlice.geometry.dispose();
            const g = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32, 0, Math.PI * 2, 0, d.curvature);
            g.translate(0, -EARTH_RADIUS, 0);
            earthSlice.geometry = g;
        }
    });
    // Broadcast live state to controller every 2 seconds
    setInterval(() => {
        socket.emit('state-update', {
            pandas: state.pandas.length,
            bamboo: state.bamboo.length,
            trees: state.trees.length,
            houses: state.houses.length,
            factories: state.factories.length,
            humans: state.humans.length,
            fire: state.isFireActive
        });
    }, 2000);

    // ── Preload panda FBX ─────────────────────────────────────────────────────
    new FBXLoader().load(
        'panda_try_3.fbx',
        (fbx) => {
            // Hide any helper/rig/camera objects that FBX may have exported
            fbx.traverse(c => {
                if (!c.isMesh && !c.isGroup && c !== fbx) c.visible = false;
            });
            fbx.scale.setScalar(0.0008);   // pandasquare1 is very large — scale down
            fbx.updateMatrixWorld(true);
            pandaFBXTemplate = fbx;
            console.log('Panda FBX loaded ✅');
        },
        undefined,
        (err) => console.warn('Could not load pandasquare1.fbx – using fallback geometry', err)
    );

    // ── Window resize ─────────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        effect.setSize(window.innerWidth, window.innerHeight);
    });

    // ── Fade title ────────────────────────────────────────────────────────────
    setTimeout(() => { document.getElementById('info').style.opacity = '0'; }, 5000);

    document.getElementById('start-btn').addEventListener('click', () => {
        document.documentElement.requestFullscreen?.();
        document.getElementById('start-btn').style.display = 'none';
    });

    updateHUD();
}

// ─── ANIMATE ─────────────────────────────────────────────────────────────────

function animate(time = 0) {
    requestAnimationFrame(animate);
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    group.rotation.set(0, 0, 0);

    // Grow-in animations
    const all = [...state.bamboo, ...state.pandas, ...state.houses,
    ...state.factories, ...state.humans, ...state.trees, ...state.fires];
    all.forEach(obj => {
        if (obj.userData.targetScale && obj.scale.x < 0.99)
            obj.scale.lerp(obj.userData.targetScale, 0.06);
    });

    // ── Ecosystem logic ───────────────────────────────────────────────────────
    if (delta > 0) {

        // more trees = ecosystem can absorb more factory impact
        const fireThreshold = 5 + Math.floor(state.trees.length / 5);

        if (!state.isFireActive && state.factories.length >= fireThreshold) {
            triggerGlobalFire();
        }

        // fire stops at 10 humans
        if (state.isFireActive && state.humans.length >= 10) {
            stopGlobalFire();
        }

        if (state.isFireActive) {
            state.fires.forEach(f => {
                f.userData.pulsePhase = (f.userData.pulsePhase || 0) + delta * 6;
                f.scale.y = Math.max(0.3, 1 + Math.sin(f.userData.pulsePhase) * 0.3);
            });

            // burn everything gradually
            fireBurnTimer += delta;

        if (fireBurnTimer >= 0.3) {
        fireBurnTimer = 0;

        if (state.trees.length > 0) killLast(state.trees);
        else if (state.bamboo.length > 0) killLast(state.bamboo);
        else if (state.pandas.length > 0) killLast(state.pandas);
        else if (state.houses.length > 0) killLast(state.houses);
        else if (state.factories.length > 0) killLast(state.factories);
    }
        } else {
            // tree multiplies: 1 tree every 3 seconds
            if (state.trees.length > 0 && state.trees.length < maxTreeCount) {
            treeTimer += delta;
            if (treeTimer >= 3) {
                treeTimer = 0;
                const parentTree = state.trees[Math.floor(Math.random() * state.trees.length)];
                spawnOnSurface(buildTree(),state.trees,spreadingCoords(parentTree.userData.coords, state.trees.length)
                );
            }
        }

            // human creates 1 house every 3 seconds
            if (state.humans.length > 0) {
    houseTimer += delta;
    if (houseTimer >= 5) {
        houseTimer = 0;
        for (let i = 0; i < state.humans.length; i++) {
            if (state.houses.length < maxHouseCount) {
                const human = state.humans[i];
                spawnOnSurface(
                    buildHouse(),
                    state.houses,
                    spreadingCoords(human.userData.coords, state.houses.length, 0.06, 0.35, 10)
                );
            }
        }
    }

    factoryTimer += delta;
    if (factoryTimer >= 20) {
        factoryTimer = 0;
        for (let i = 0; i < state.humans.length; i++) {
            if (state.factories.length < maxFactoryCount) {
                const human = state.humans[i];
                spawnOnSurface(
                    buildFactory(),
                    state.factories,
                    spreadingCoords(human.userData.coords, state.factories.length, 0.06, 0.35, 8)
                );
            }
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
                spawnOnSurface(
                    buildTree(),
                    state.trees,
                    spreadingCoords(panda.userData.coords, state.trees.length, 0.08, 0.5, 14)
                );
            }
        }

        // 1 bamboo removed per 2 pandas
        const bambooToRemove = Math.floor(state.pandas.length / 2);
        for (let i = 0; i < bambooToRemove; i++) {
            if (state.bamboo.length > 0) killLast(state.bamboo);
        }

        // breeding: if 2 or more pandas, make 1 new panda
        if (state.pandas.length >= 2 && state.bamboo.length > 0) {
            const parentPanda = state.pandas[Math.floor(Math.random() * state.pandas.length)];
            spawnOnSurface(
                buildPanda(),
                state.pandas,
                spreadingCoords(parentPanda.userData.coords, state.pandas.length, 0.05, 0.25, 10)
            );
        }
    }
}

if (state.bamboo.length === 0 && state.pandas.length > 0) {
    pandaStarveTimer += delta;

    if (pandaStarveTimer >= 3) {
        pandaStarveTimer = 0;
        killLast(state.pandas);
    }
} else {
    pandaStarveTimer = 0;
}
        }
        updateHUD();
    }

    effect.render(scene, camera);
}
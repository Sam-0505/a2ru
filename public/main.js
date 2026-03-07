import * as THREE from 'three';
import { PeppersGhostEffect } from 'three/addons/effects/PeppersGhostEffect.js';

// --- ECOSYSTEM STATE ---
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
    extinctionThreshold: 3
};

// --- WEBSOCKET CONNECTION ---
const socket = io();
socket.on('connect', () => console.log('Simulation connected to server'));

let container, camera, scene, renderer, effect, group, earthSlice;

init();
animate();

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Convert spherical (theta, phi) to a world position ON the sphere cap, shifted by -earthRadius in Y */
function sphericalToPos(theta, phi) {
    const x = EARTH_RADIUS * Math.sin(theta) * Math.cos(phi);
    const y = EARTH_RADIUS * Math.cos(theta) - EARTH_RADIUS; // translated
    const z = EARTH_RADIUS * Math.sin(theta) * Math.sin(phi);
    return new THREE.Vector3(x, y, z);
}

/** Place a mesh on a random point within the spawnable cap and add it to the group */
function spawnOnSurface(mesh, stateArray, animated = true) {
    const theta = Math.random() * (Math.PI / 3.0);
    const phi = Math.random() * Math.PI * 2;
    const pos = sphericalToPos(theta, phi);

    mesh.position.copy(pos);

    // Orient so mesh "Y-up" aligns with the sphere normal at this point
    const normal = new THREE.Vector3(Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    mesh.quaternion.copy(quaternion);

    if (animated) {
        mesh.userData.targetScale = new THREE.Vector3(1, 1, 1);
        mesh.scale.set(0.001, 0.001, 0.001);
    }

    mesh.userData.normal = normal.clone();
    group.add(mesh);
    stateArray.push(mesh);
}

/** Remove & dispose the last element from a state array */
function killLast(arr) {
    if (arr.length === 0) return;
    const victim = arr.pop();
    group.remove(victim);
    victim.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
    });
}

// ─── OBJECT BUILDERS ────────────────────────────────────────────────────────

function buildTree() {
    const root = new THREE.Group();
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.12, 6);
    trunkGeo.translate(0, 0.06, 0);
    const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5D4037 }));
    // Canopy
    const coneGeo = new THREE.ConeGeometry(0.07, 0.14, 7);
    coneGeo.translate(0, 0.19, 0);
    const canopy = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0x2E7D32 }));
    root.add(trunk, canopy);
    return root;
}

function buildBamboo() {
    const root = new THREE.Group();
    const segments = 3;
    for (let i = 0; i < segments; i++) {
        const segGeo = new THREE.CylinderGeometry(0.008, 0.010, 0.07, 6);
        segGeo.translate(0, 0.035 + i * 0.08, 0);
        const seg = new THREE.Mesh(segGeo, new THREE.MeshStandardMaterial({ color: 0x8BC34A }));
        // Node bump
        const nodeGeo = new THREE.TorusGeometry(0.011, 0.003, 4, 8);
        nodeGeo.rotateX(Math.PI / 2);
        nodeGeo.translate(0, i * 0.08, 0);
        const node = new THREE.Mesh(nodeGeo, new THREE.MeshStandardMaterial({ color: 0x558B2F }));
        root.add(seg, node);
        // Leaf
        const leafGeo = new THREE.PlaneGeometry(0.04, 0.015);
        leafGeo.translate(0.025, 0.03 + i * 0.08, 0);
        const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x9CCC65, side: THREE.DoubleSide }));
        root.add(leaf);
    }
    return root;
}

function buildPanda() {
    const root = new THREE.Group();
    // Body
    const bodyGeo = new THREE.SphereGeometry(0.045, 12, 12);
    bodyGeo.translate(0, 0.045, 0);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xfcfcfc }));
    // Head
    const headGeo = new THREE.SphereGeometry(0.03, 12, 12);
    headGeo.translate(0, 0.11, 0);
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xfcfcfc }));
    // Ears
    for (const sx of [-1, 1]) {
        const earGeo = new THREE.SphereGeometry(0.012, 6, 6);
        earGeo.translate(sx * 0.028, 0.133, 0);
        root.add(new THREE.Mesh(earGeo, new THREE.MeshStandardMaterial({ color: 0x111111 })));
    }
    // Eyes
    for (const sx of [-1, 1]) {
        const eyeGeo = new THREE.SphereGeometry(0.006, 5, 5);
        eyeGeo.translate(sx * 0.013, 0.114, 0.026);
        root.add(new THREE.Mesh(eyeGeo, new THREE.MeshStandardMaterial({ color: 0x111111 })));
    }
    root.add(body, head);
    return root;
}

function buildHouse() {
    const root = new THREE.Group();
    // Walls
    const wallGeo = new THREE.BoxGeometry(0.12, 0.10, 0.12);
    wallGeo.translate(0, 0.05, 0);
    const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xFFCC80 }));
    // Roof
    const roofGeo = new THREE.ConeGeometry(0.095, 0.07, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.translate(0, 0.135, 0);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xD84315 }));
    // Door
    const doorGeo = new THREE.BoxGeometry(0.025, 0.04, 0.005);
    doorGeo.translate(0, 0.02, 0.062);
    const door = new THREE.Mesh(doorGeo, new THREE.MeshStandardMaterial({ color: 0x6D4C41 }));
    root.add(walls, roof, door);
    return root;
}

function buildFactory() {
    const root = new THREE.Group();
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.16, 0.18, 0.14);
    bodyGeo.translate(0, 0.09, 0);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x616161 }));
    // Chimneys
    for (const [ox, height] of [[-0.04, 0.12], [0.04, 0.09]]) {
        const chimGeo = new THREE.CylinderGeometry(0.018, 0.02, height, 6);
        chimGeo.translate(ox, 0.18 + height / 2, 0);
        const chim = new THREE.Mesh(chimGeo, new THREE.MeshStandardMaterial({ color: 0x424242 }));
        // Smoke puff
        const smokeGeo = new THREE.SphereGeometry(0.022, 6, 6);
        smokeGeo.translate(ox, 0.18 + height + 0.025, 0);
        const smoke = new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({ color: 0x9E9E9E, transparent: true, opacity: 0.6 }));
        root.add(chim, smoke);
    }
    root.add(body);
    return root;
}

function buildHuman() {
    const root = new THREE.Group();
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5);
    for (const ox of [-0.01, 0.01]) {
        const leg = new THREE.Mesh(legGeo.clone(), new THREE.MeshStandardMaterial({ color: 0x1565C0 }));
        leg.position.set(ox, 0.025, 0);
        root.add(leg);
    }
    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.06, 6);
    torsoGeo.translate(0, 0.08, 0);
    const torso = new THREE.Mesh(torsoGeo, new THREE.MeshStandardMaterial({ color: 0x1976D2 }));
    // Head
    const headGeo = new THREE.SphereGeometry(0.018, 8, 8);
    headGeo.translate(0, 0.13, 0);
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xFFCC80 }));
    root.add(torso, head);
    return root;
}

function buildFire() {
    const root = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const h = 0.08 + Math.random() * 0.06;
        const coneGeo = new THREE.ConeGeometry(0.025, h, 6);
        coneGeo.translate((Math.random() - 0.5) * 0.03, h / 2, (Math.random() - 0.5) * 0.03);
        const colors = [0xFF3D00, 0xFF6D00, 0xFFAB00];
        const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: colors[i] }));
        root.add(cone);
    }
    root.userData.isFire = true;
    root.userData.pulsePhase = Math.random() * Math.PI * 2;
    return root;
}

// ─── SOCKET EVENT SETUP ──────────────────────────────────────────────────────

function setupSocketEvents() {
    socket.on('spawn-item', (data) => {
        spawnByType(data.type);
    });

    socket.on('start-fire', () => triggerGlobalFire());
    socket.on('end-fire', () => stopGlobalFire());
}

function spawnByType(type) {
    switch (type) {
        case 'bamboo': {
            const m = buildBamboo();
            spawnOnSurface(m, state.bamboo);
            // Bamboo → panda revival
            if (!state.isFireActive && state.factories.length < 3) {
                setTimeout(() => spawnByType('panda'), 1500);
            }
            break;
        }
        case 'panda':
            spawnOnSurface(buildPanda(), state.pandas);
            break;
        case 'house':
            spawnOnSurface(buildHouse(), state.houses);
            break;
        case 'factory':
            spawnOnSurface(buildFactory(), state.factories);
            break;
        case 'human':
            spawnOnSurface(buildHuman(), state.humans);
            break;
        case 'tree':
            spawnOnSurface(buildTree(), state.trees);
            break;
        default:
            console.warn('Unknown type:', type);
    }
}

// ─── FIRE LOGIC ──────────────────────────────────────────────────────────────

function triggerGlobalFire() {
    if (state.isFireActive) return;
    state.isFireActive = true;
    for (let i = 0; i < 18; i++) {
        spawnOnSurface(buildFire(), state.fires);
    }
    updateHUD();
}

function stopGlobalFire() {
    if (!state.isFireActive) return;
    state.isFireActive = false;
    while (state.fires.length > 0) killLast(state.fires);
    // After fire: rapid tree regrowth
    setTimeout(() => {
        for (let i = 0; i < 6; i++) {
            setTimeout(() => spawnOnSurface(buildTree(), state.trees), i * 300);
        }
    }, 1500);
    updateHUD();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function updateHUD() {
    document.getElementById('hud-pandas').textContent = state.pandas.length;
    document.getElementById('hud-factories').textContent = state.factories.length;
    document.getElementById('hud-fire').textContent = state.isFireActive ? '🔥 ON' : 'OFF';
    document.getElementById('hud-fire').style.color = state.isFireActive ? '#FF3D00' : '#aaa';
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    group = new THREE.Group();
    scene.add(group);

    // ── Earth Cap ────────────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(
        EARTH_RADIUS, 64, 32,
        0, Math.PI * 2,
        0, Math.PI / 2.5
    );
    earthGeo.translate(0, -EARTH_RADIUS, 0);

    const textureLoader = new THREE.TextureLoader();
    const barrenMap = textureLoader.load('barren_earth_land.png');
    barrenMap.colorSpace = THREE.SRGBColorSpace;
    barrenMap.wrapS = barrenMap.wrapT = THREE.RepeatWrapping;
    barrenMap.repeat.set(4, 4);

    const earthMat = new THREE.MeshStandardMaterial({
        map: barrenMap,
        bumpMap: barrenMap,
        bumpScale: 0.5,
        roughness: 0.9,
        metalness: 0.1,
    });
    earthSlice = new THREE.Mesh(earthGeo, earthMat);
    group.add(earthSlice);

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.PointLight(0xffffff, 10, 100);
    sun.position.set(5, 5, 5);
    scene.add(sun);
    const fill = new THREE.PointLight(0xffddaa, 8, 100);
    fill.position.set(-5, -5, -5);
    scene.add(fill);

    // ── Renderer ─────────────────────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // ── Effect ───────────────────────────────────────────────────────────────
    effect = new PeppersGhostEffect(renderer);
    effect.setSize(window.innerWidth, window.innerHeight);
    effect.cameraDistance = 4;

    // ── GUI ──────────────────────────────────────────────────────────────────
    import('https://unpkg.com/three@0.160.0/examples/jsm/libs/lil-gui.module.min.js').then(({ GUI }) => {
        const gui = new GUI();
        const s = { cameraDistance: 4, textureScale: 4, surfaceCurvature: Math.PI / 2.5 };
        gui.add(s, 'cameraDistance', 1, 15).name('Hologram Distance').onChange(v => effect.cameraDistance = v);
        gui.add(s, 'textureScale', 1, 20).name('Texture Scale').onChange(v => barrenMap.repeat.set(v, v));
        gui.add(s, 'surfaceCurvature', 0.1, Math.PI / 1.5).name('Curvature').onChange(v => {
            earthSlice.geometry.dispose();
            const g = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32, 0, Math.PI * 2, 0, v);
            g.translate(0, -EARTH_RADIUS, 0);
            earthSlice.geometry = g;
        });
    });

    // ── Socket ───────────────────────────────────────────────────────────────
    setupSocketEvents();

    // ── Misc ─────────────────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        effect.setSize(window.innerWidth, window.innerHeight);
    });

    setTimeout(() => { document.getElementById('info').style.opacity = '0'; }, 5000);

    document.getElementById('start-btn').addEventListener('click', () => {
        document.documentElement.requestFullscreen?.();
        document.getElementById('start-btn').style.display = 'none';
    });

    // ── Create HUD ───────────────────────────────────────────────────────────
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
        <div>🐼 Pandas: <span id="hud-pandas">0</span></div>
        <div>🏭 Factories: <span id="hud-factories">0</span></div>
        <div>🔥 Fire: <span id="hud-fire" style="color:#aaa">OFF</span></div>
    `;
    hud.style.cssText = `
        position:absolute; bottom:20px; left:20px;
        background:rgba(0,0,0,0.55); color:#eee;
        padding:10px 16px; border-radius:10px;
        font-family:Inter,sans-serif; font-size:14px;
        line-height:1.8; z-index:100; pointer-events:none;
        backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.1);
    `;
    document.body.appendChild(hud);

    updateHUD();

    // Broadcast state every 2s for control panel
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
}

// ─── ANIMATE ─────────────────────────────────────────────────────────────────

let lastTime = 0;

function animate(time = 0) {
    requestAnimationFrame(animate);

    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    // Group stays symmetric — normal faces up
    group.rotation.set(0, 0, 0);

    // Grow-in animations
    const all = [...state.bamboo, ...state.pandas, ...state.houses,
    ...state.factories, ...state.humans, ...state.trees, ...state.fires];
    all.forEach(obj => {
        if (obj.userData.targetScale && obj.scale.x < 0.99) {
            obj.scale.lerp(obj.userData.targetScale, 0.06);
        }
    });

    // ── Ecosystem logic ───────────────────────────────────────────────────────
    if (delta > 0) {

        if (state.isFireActive) {
            // Animate fires
            state.fires.forEach(f => {
                f.userData.pulsePhase = (f.userData.pulsePhase || 0) + delta * 6;
                const s = 1 + Math.sin(f.userData.pulsePhase) * 0.25;
                if (f.userData.targetScale) f.scale.setScalar(s * f.scale.x);
            });

            // Fire destroys life randomly
            if (Math.random() < 0.03) {
                const victims = [state.bamboo, state.pandas, state.trees, state.houses];
                killLast(victims[Math.floor(Math.random() * victims.length)]);
                updateHUD();
            }

            // Humans fight fire
            if (state.humans.length > 0 && Math.random() < state.humans.length * 0.015) {
                stopGlobalFire();
            }

        } else {

            // Panda seed spreading → tree growth
            if (state.pandas.length > 0 && Math.random() < state.pandas.length * 0.005) {
                spawnOnSurface(buildTree(), state.trees);
            }

            // Panda extinction from habitat loss
            const infra = state.houses.length + state.factories.length;
            if (infra >= state.extinctionThreshold && Math.random() < 0.01) {
                killLast(state.pandas);
                updateHUD();
            }

            // Auto fire-trigger from factories
            if (state.factories.length >= 5 && Math.random() < 0.005) {
                triggerGlobalFire();
            }
        }
    }

    effect.render(scene, camera);
}

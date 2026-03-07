import * as THREE from 'three';
import { CustomPeppersGhostEffect } from './CustomPeppersGhostEffect.js';

// Variable counters 
var treeTimer = 0;
var houseTimer = 0;
var factoryTimer = 0;
var pandaTimer = 0;
var fireBurnTimer = 0;
const maxTreeCount = 25;

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

let container, camera, scene, renderer, effect, group, earthSlice, barrenMap;
let lastTime = 0;

init();
animate();

// ─── SURFACE HELPERS ─────────────────────────────────────────────────────────

function randomSurfacePoint() {
    const theta = Math.random() * (Math.PI / 3.2);
    const phi = Math.random() * Math.PI * 2;
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

function spawnOnSurface(mesh, stateArray) {
    const { pos, normal } = randomSurfacePoint();
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    mesh.userData.targetScale = new THREE.Vector3(1, 1, 1);
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
    const g = new THREE.Group();
    const bGeo = new THREE.SphereGeometry(0.048, 12, 12); bGeo.translate(0, 0.048, 0);
    const hGeo = new THREE.SphereGeometry(0.032, 12, 12); hGeo.translate(0, 0.114, 0);
    const wMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8 });
    const bMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    g.add(new THREE.Mesh(bGeo, wMat), new THREE.Mesh(hGeo, wMat));
    for (const sx of [-1, 1]) {
        const eGeo = new THREE.SphereGeometry(0.013, 6, 6); eGeo.translate(sx * 0.029, 0.138, 0);
        const eyGeo = new THREE.SphereGeometry(0.007, 5, 5); eyGeo.translate(sx * 0.014, 0.117, 0.028);
        g.add(new THREE.Mesh(eGeo, bMat), new THREE.Mesh(eyGeo, bMat));
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

export function spawnByType(type) {
    switch (type) {
        case 'bamboo': spawnOnSurface(buildBamboo(), state.bamboo); break;
        case 'panda': spawnOnSurface(buildPanda(), state.pandas); break;
        case 'tree': if (state.trees.length < maxTreeCount) {spawnOnSurface(buildTree(), state.trees);}break;
        case 'house': spawnOnSurface(buildHouse(), state.houses); break;
        case 'factory': spawnOnSurface(buildFactory(), state.factories); break;
        case 'human': spawnOnSurface(buildHuman(), state.humans); // humans remove one tree when immedietly places
        if (state.trees.length > 0) killLast(state.trees); break;
    }
    updateHUD();
}

function triggerGlobalFire() {
    if (state.isFireActive) return;
    state.isFireActive = true;
    for (let i = 0; i < 18; i++) spawnOnSurface(buildFire(), state.fires);
    showAlert('Forest fire ignited by climate change!', 'fire');
    updateHUD();
}

function stopGlobalFire() {
    if (!state.isFireActive) return;
    state.isFireActive = false;

    while (state.fires.length) killLast(state.fires);

    // consume 10 humans to extinguish fire
    for (let i = 0; i < 10; i++) {
        if (state.humans.length > 0) killLast(state.humans);
    }

    showAlert('Fire extinguished! Trees will regrow.', 'safe');

    setTimeout(() => {
        const treesToRegrow = Math.min(6, maxTreeCount - state.trees.length);
        for (let i = 0; i < treesToRegrow; i++) {
            setTimeout(() => {
                if (state.trees.length < maxTreeCount) {
                    spawnOnSurface(buildTree(), state.trees);
                }
            }, i * 350);
        }
    }, 1500);

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
    scene.add(group);

    // ── Earth cap ─────────────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2.5);
    earthGeo.translate(0, -EARTH_RADIUS, 0);

    const loader = new THREE.TextureLoader();
    barrenMap = loader.load('barren_earth_land.png');
    barrenMap.colorSpace = THREE.SRGBColorSpace;
    barrenMap.wrapS = barrenMap.wrapT = THREE.RepeatWrapping;
    barrenMap.repeat.set(4, 4);

    earthSlice = new THREE.Mesh(earthGeo, new THREE.MeshStandardMaterial({
        map: barrenMap, bumpMap: barrenMap, bumpScale: 0.5, roughness: 0.9, metalness: 0.1
    }));
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
    effect.cameraDistance = 4;

    // ── GUI (lil-gui) ─────────────────────────────────────────────────────────
    import('https://unpkg.com/three@0.160.0/examples/jsm/libs/lil-gui.module.min.js').then(({ GUI }) => {
        const gui = new GUI({ title: 'Display Controls' });
        const s = { cameraDistance: 4, spreadDistance: 0, projectionSize: 1.0, textureScale: 4, curvature: Math.PI / 2.5 };
        gui.add(s, 'cameraDistance', 1, 15, 0.1).name('Hologram Distance').onChange(v => effect.cameraDistance = v);
        gui.add(s, 'spreadDistance', 0, 300, 1).name('Spread Distance (px)').onChange(v => effect.centerGap = v);
        gui.add(s, 'projectionSize', 0.3, 3, 0.05).name('Projection Size').onChange(v => effect.viewScale = v);
        gui.add(s, 'textureScale', 1, 20, 0.1).name('Texture Scale').onChange(v => barrenMap.repeat.set(v, v));
        gui.add(s, 'curvature', 0.1, Math.PI / 1.5).name('Curvature').onChange(v => {
            earthSlice.geometry.dispose();
            const g = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32, 0, Math.PI * 2, 0, v);
            g.translate(0, -EARTH_RADIUS, 0);
            earthSlice.geometry = g;
        });
    });

    // ── Panel button listeners ────────────────────────────────────────────────
    document.querySelectorAll('[data-spawn]').forEach(btn => {
        btn.addEventListener('click', () => {
            spawnByType(btn.dataset.spawn);
            btn.classList.add('pressed');
            setTimeout(() => btn.classList.remove('pressed'), 180);
        });
    });

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

        // fire starts at 5 factories
        if (!state.isFireActive && state.factories.length >= 5) {
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
                spawnOnSurface(buildTree(), state.trees);
            }
        }

            // human creates 1 house every 3 seconds
            if (state.humans.length > 0) {
                houseTimer += delta;
                if (houseTimer >= 3) {
                    houseTimer = 0;
                    spawnOnSurface(buildHouse(), state.houses);
                }
            // human creates 1 factory every 10 seconds
                factoryTimer += delta;
                if (factoryTimer >= 10) {
                    factoryTimer = 0;
                    spawnOnSurface(buildFactory(), state.factories);
                }
            }

            // When panda is placed: trees grow, and bamboo is consumed
            if (state.pandas.length > 0) {
                pandaTimer += delta;
                if (pandaTimer >= 3) {
                    pandaTimer = 0;

                    // 1 tree per panda
                    for (let i = 0; i < state.pandas.length; i++) {
                    if (state.trees.length < maxTreeCount) {
                        spawnOnSurface(buildTree(), state.trees);
                    }
                }
                    // 1 bamboo per 2 pandas
                    const bambooToRemove = Math.floor(state.pandas.length / 2);
                    for (let i = 0; i < bambooToRemove; i++) {
                        if (state.bamboo.length > 0) killLast(state.bamboo);
                    }
                }
            }
        }

        // If no bamboo, pandas disappear
        if (state.bamboo.length === 0) {
            while (state.pandas.length > 0) {
                killLast(state.pandas);
            }
        }

        updateHUD();
    }

    effect.render(scene, camera);
}

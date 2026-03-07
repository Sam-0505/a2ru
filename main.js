import * as THREE from 'three';
import { CustomPeppersGhostEffect } from './CustomPeppersGhostEffect.js';

let container;
let camera, scene, renderer, effect;
let group;

init();
animate();

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Camera setup - PeppersGhostEffect will override some properties, 
    // but needs a base perspective camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Absolute black

    // Create a group to hold our holographic objects
    group = new THREE.Group();
    scene.add(group);

    // --- HOLOGRAPHIC SPHERE DESIGN ---

    // 1. Inner Core
    const coreGeometry = new THREE.SphereGeometry(0.4, 32, 32);
    const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x0088ff,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    // 2. Middle Wireframe Shell
    const shellGeometry = new THREE.SphereGeometry(0.6, 16, 16);
    const shellMaterial = new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        wireframe: true,
        transparent: true,
        opacity: 0.6
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    group.add(shell);

    // 3. Outer Particle Orbit (Rings)
    const ringGeometry = new THREE.TorusGeometry(0.8, 0.02, 16, 100);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8 });

    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.rotation.x = Math.PI / 2;
    group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring2.rotation.y = Math.PI / 2;
    group.add(ring2);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x222222);
    scene.add(ambientLight);

    const light1 = new THREE.PointLight(0xffffff, 2, 100);
    light1.position.set(5, 5, 5);
    scene.add(light1);

    const light2 = new THREE.PointLight(0x00ffff, 2, 100);
    light2.position.set(-5, -5, -5);
    scene.add(light2);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // PeppersGhostEffect Setup
    effect = new CustomPeppersGhostEffect(renderer);
    effect.setSize(window.innerWidth, window.innerHeight);
    effect.cameraDistance = 4; // Distance from the camera to the center of the hologram

    // --- GUI SETUP ---
    // Make gui globally available or create local
    import('https://unpkg.com/three@0.160.0/examples/jsm/libs/lil-gui.module.min.js').then(({ GUI }) => {
        const guiControls = new GUI();

        // Settings object
        const settings = {
            cameraDistance: 4.0,
            centerGap: 0,
            viewScale: 1.0
        };

        // Add control for camera distance which acts effectively as "cone size" 
        // by scaling how far the camera looks at the center.
        guiControls.add(settings, 'cameraDistance', 1, 15).name('Hologram Distance').onChange((value) => {
            effect.cameraDistance = value;
        });

        // Control to push the 4 squares further apart
        guiControls.add(settings, 'centerGap', 0, 500).name('Spread Distance (px)').onChange((value) => {
            effect.centerGap = value;
        });

        // Control to change the size of each projection square
        guiControls.add(settings, 'viewScale', 0.5, 3.0).name('Projection Size').onChange((value) => {
            effect.viewScale = value;
        });
    });


    // Event Listeners
    window.addEventListener('resize', onWindowResize);

    // Hide UI after 5 seconds to not ruin the hologram effect
    setTimeout(() => {
        document.getElementById('info').style.opacity = '0';
    }, 5000);

    // Fullscreen button
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
        startBtn.style.display = 'none'; // Hide button after clicking
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    effect.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Rotate objects within the group for dynamic animation
    const time = performance.now() * 0.001;

    group.rotation.y = time * 0.5;
    group.rotation.x = time * 0.2;
    group.children[1].rotation.z = time * 0.3; // Rotate shell additionally
    group.children[2].rotation.x = Math.PI / 2 + Math.sin(time) * 0.2; // Wobble ring 1
    group.children[3].rotation.y = Math.PI / 2 + Math.cos(time) * 0.2; // Wobble ring 2

    effect.render(scene, camera);
}

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

    // --- HOLOGRAPHIC PARTIAL SPHERE (CURVATURE OF EARTH) ---

    // A prominent partial sphere to represent the curvature of the earth
    const earthRadius = 1.0;
    // Create a dome/cap of the sphere (theta from 0 to about Pi/3)
    const earthGeometry = new THREE.SphereGeometry(
        earthRadius,
        64,     // widthSegments (more for smoother curve)
        32,     // heightSegments
        0,      // phiStart
        Math.PI * 2, // phiLength (full circle horizontally)
        0,      // thetaStart (start from North Pole)
        Math.PI / 2.5 // thetaLength (go down slightly past the "tropic")
    );

    // Offset the geometry so the curved surface sits nicely in the view center
    earthGeometry.translate(0, -earthRadius, 0);

    // Load a local texture that simulates barren land
    const textureLoader = new THREE.TextureLoader();
    const barrenMap = textureLoader.load('barren_earth_land.png');
    barrenMap.colorSpace = THREE.SRGBColorSpace;
    barrenMap.wrapS = THREE.RepeatWrapping;
    barrenMap.wrapT = THREE.RepeatWrapping;
    barrenMap.repeat.set(4, 4); // Repeat the texture to avoid stretching

    // Map the texture onto the surface with bump mapping
    const earthMaterial = new THREE.MeshStandardMaterial({
        map: barrenMap,
        bumpMap: barrenMap,
        bumpScale: 0.5, // Increased for better crack depth
        color: 0xffffff, // Real color of the image, removed brownish tint and blue colors
        roughness: 0.9,
        metalness: 0.1,
    });
    const earthSlice = new THREE.Mesh(earthGeometry, earthMaterial);
    group.add(earthSlice);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Increased ambient light for brightness
    scene.add(ambientLight);

    const light1 = new THREE.PointLight(0xffffff, 10, 100); // Drastically increased intensity
    light1.position.set(5, 5, 5);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xffddaa, 8, 100); // Stronger warm fill light
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
            viewScale: 1.0,
            textureScale: 4.0,
            surfaceCurvature: Math.PI / 2.5
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

        // Control to change the texture scale
        guiControls.add(settings, 'textureScale', 1.0, 20.0).name('Texture Scale').onChange((value) => {
            barrenMap.repeat.set(value, value);
        });

        // Control to change the solid angle curvature of the terrain
        guiControls.add(settings, 'surfaceCurvature', 0.1, Math.PI / 1.5).name('Curvature (Angle)').onChange((value) => {
            // Dispose of the old geometry to prevent memory leaks
            earthSlice.geometry.dispose();
            // Recreate new geometry with the new theta length
            const newGeo = new THREE.SphereGeometry(
                earthRadius,
                64,     // widthSegments
                32,     // heightSegments
                0,      // phiStart
                Math.PI * 2, // phiLength
                0,      // thetaStart
                value   // thetaLength
            );
            // Re-apply the translation offset
            newGeo.translate(0, -earthRadius, 0);
            // Swap geometry
            earthSlice.geometry = newGeo;
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

    // Keep the group perfectly symmetric, with the curvature facing straight upwards
    group.rotation.x = 0;
    group.rotation.y = 0;
    group.rotation.z = 0;

    effect.render(scene, camera);
}

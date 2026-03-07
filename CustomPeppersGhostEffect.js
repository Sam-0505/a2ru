import * as THREE from 'three';

/**
 * CustomPeppersGhostEffect
 *
 * Renders 4 views in a cross pattern CENTERED on the screen:
 *
 *              [  TOP  ]
 *   [ LEFT ]   [CENTER]   [ RIGHT ]
 *              [ BOTTOM]
 *
 * The cross is always screen-centered regardless of aspect ratio.
 */
export class CustomPeppersGhostEffect {

    constructor(renderer) {
        const scope = this;

        scope.cameraDistance = 15;
        scope.reflectFromAbove = false;
        scope.viewScale = 1.0;   // uniform size multiplier for each quad
        scope.centerGap = 0.0;   // extra pixels to push quads away from center

        // Each quad's side length (set by setSize)
        let _q = 0;
        // Screen center (set by setSize)
        let _cx = 0, _cy = 0;

        const _cameraF = new THREE.PerspectiveCamera();
        const _cameraB = new THREE.PerspectiveCamera();
        const _cameraL = new THREE.PerspectiveCamera();
        const _cameraR = new THREE.PerspectiveCamera();

        const _position = new THREE.Vector3();
        const _quaternion = new THREE.Quaternion();
        const _scale = new THREE.Vector3();

        renderer.autoClear = false;

        this.setSize = function (width, height) {
            _cx = width / 2;
            _cy = height / 2;
            // Each quad is 1/3 of the smaller dimension
            _q = Math.min(width, height) / 3;
            renderer.setSize(width, height);
        };

        this.render = function (scene, camera) {
            if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
            if (camera.parent === null && camera.matrixWorldAutoUpdate === true)
                camera.updateMatrixWorld();

            camera.matrixWorld.decompose(_position, _quaternion, _scale);

            // ── Position four cameras ─────────────────────────────────────────
            _cameraF.position.copy(_position);
            _cameraF.quaternion.copy(_quaternion);
            _cameraF.translateZ(scope.cameraDistance);
            _cameraF.lookAt(scene.position);
            _cameraF.rotateZ(Math.PI); // Flip for reversed cone

            _cameraB.position.copy(_position);
            _cameraB.quaternion.copy(_quaternion);
            _cameraB.translateZ(-scope.cameraDistance);
            _cameraB.lookAt(scene.position);
            _cameraB.rotation.z += Math.PI;
            _cameraB.rotateZ(Math.PI); // Flip for reversed cone

            _cameraL.position.copy(_position);
            _cameraL.quaternion.copy(_quaternion);
            _cameraL.translateX(-scope.cameraDistance);
            _cameraL.lookAt(scene.position);
            _cameraL.rotation.x += Math.PI / 2;
            _cameraL.rotateZ(Math.PI); // Flip for reversed cone

            _cameraR.position.copy(_position);
            _cameraR.quaternion.copy(_quaternion);
            _cameraR.translateX(scope.cameraDistance);
            _cameraR.lookAt(scene.position);
            _cameraR.rotation.x += Math.PI / 2;
            _cameraR.rotateZ(Math.PI); // Flip for reversed cone


            // ── Sync projection matrices ──────────────────────────────────────
            for (const cam of [_cameraF, _cameraB, _cameraL, _cameraR]) {
                cam.fov = camera.fov;
                cam.aspect = 1.0;       // each quad is always square
                cam.near = camera.near;
                cam.far = camera.far;
                cam.updateProjectionMatrix();
            }

            renderer.clear();
            renderer.setScissorTest(true);

            // ── Centered cross layout ─────────────────────────────────────────
            //
            //  All 4 quads are size s × s (= _q × viewScale).
            //  Quad centres in WebGL coords (origin = bottom-left, Y-up):
            //
            //    TOP    : (_cx,        _cy + _q + gap)
            //    BOTTOM : (_cx,        _cy - _q - gap)
            //    LEFT   : (_cx - _q - gap,  _cy)
            //    RIGHT  : (_cx + _q + gap,  _cy)
            //
            //  setViewport(left, bottom, width, height) — bottom-left corner.

            const s = _q * scope.viewScale;
            const hs = s / 2;
            const gap = scope.centerGap;

            // TOP    — inner (bottom) edge at _cy, grows up
            _render(_cameraF, _cameraB, _cx - hs, _cy + gap);

            // BOTTOM — inner (top) edge at _cy, grows down
            _render(_cameraB, _cameraF, _cx - hs, _cy - s - gap);

            // LEFT   — inner (right) edge at _cx, grows left
            _render(_cameraL, _cameraR, _cx - s - gap, _cy - hs);

            // RIGHT  — inner (left) edge at _cx, grows right
            _render(_cameraR, _cameraL, _cx + gap, _cy - hs);

            renderer.setScissorTest(false);

            function _render(normalCam, invertedCam, x, y) {
                renderer.setScissor(x, y, s, s);
                renderer.setViewport(x, y, s, s);
                renderer.render(scene, scope.reflectFromAbove ? invertedCam : normalCam);
            }
        };
    }
}

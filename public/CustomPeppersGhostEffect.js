import * as THREE from 'three';

/**
 * CustomPeppersGhostEffect
 * Based on three.js PeppersGhostEffect with added:
 *  - viewScale  : multiplies the size of each of the 4 projection squares
 *  - centerGap  : extra pixels to push each square outward from center
 */
export class CustomPeppersGhostEffect {
    constructor(renderer) {
        const scope = this;

        scope.cameraDistance = 15;
        scope.reflectFromAbove = false;
        scope.viewScale = 1.0;  // size multiplier for each quad
        scope.centerGap = 0.0;  // extra spread outward in pixels

        // Internal canvas size
        let _halfWidth, _width, _height;

        const _cameraF = new THREE.PerspectiveCamera();
        const _cameraB = new THREE.PerspectiveCamera();
        const _cameraL = new THREE.PerspectiveCamera();
        const _cameraR = new THREE.PerspectiveCamera();

        const _position = new THREE.Vector3();
        const _quaternion = new THREE.Quaternion();
        const _scale = new THREE.Vector3();

        renderer.autoClear = false;

        this.setSize = function (width, height) {
            _halfWidth = width / 2;

            // Each quad is 1/3 of the smaller dimension (same as upstream three.js)
            if (width < height) {
                _width = width / 3;
                _height = width / 3;
            } else {
                _width = height / 3;
                _height = height / 3;
            }

            renderer.setSize(width, height);
        };

        this.render = function (scene, camera) {
            if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
            if (camera.parent === null && camera.matrixWorldAutoUpdate === true)
                camera.updateMatrixWorld();

            camera.matrixWorld.decompose(_position, _quaternion, _scale);

            // ── Position four cameras ────────────────────────────────────────
            // front
            _cameraF.position.copy(_position);
            _cameraF.quaternion.copy(_quaternion);
            _cameraF.translateZ(scope.cameraDistance);
            _cameraF.lookAt(scene.position);

            // back
            _cameraB.position.copy(_position);
            _cameraB.quaternion.copy(_quaternion);
            _cameraB.translateZ(-scope.cameraDistance);
            _cameraB.lookAt(scene.position);
            _cameraB.rotation.z += Math.PI;

            // left
            _cameraL.position.copy(_position);
            _cameraL.quaternion.copy(_quaternion);
            _cameraL.translateX(-scope.cameraDistance);
            _cameraL.lookAt(scene.position);
            _cameraL.rotation.x += Math.PI / 2;

            // right
            _cameraR.position.copy(_position);
            _cameraR.quaternion.copy(_quaternion);
            _cameraR.translateX(scope.cameraDistance);
            _cameraR.lookAt(scene.position);
            _cameraR.rotation.x += Math.PI / 2;

            renderer.clear();
            renderer.setScissorTest(true);

            // ── Sync projection properties from main camera ──────────────────
            // Without this, the internal cameras have no valid projection matrix
            // and render nothing (black screen).
            for (const cam of [_cameraF, _cameraB, _cameraL, _cameraR]) {
                cam.fov = camera.fov;
                cam.aspect = _width / _height;  // Each quad is square, so aspect=1
                cam.near = camera.near;
                cam.far = camera.far;
                cam.updateProjectionMatrix();
            }

            // ── Quad geometry ────────────────────────────────────────────────
            // scaled quad size
            const qw = _width * scope.viewScale;
            const qh = _height * scope.viewScale;
            // extra push outward beyond the standard abutting layout
            const gap = scope.centerGap;

            // Standard layout (upstream three.js) places quads touching center:
            //   TOP    centre-x = _halfWidth,        centre-y = _height*2
            //   BOTTOM centre-x = _halfWidth,        centre-y = 0
            //   LEFT   centre-x = _halfWidth-_width, centre-y = _height
            //   RIGHT  centre-x = _halfWidth+_width, centre-y = _height
            //
            // We keep the same anchoring but allow scaling + extra gap.

            // TOP
            renderer.setScissor(
                _halfWidth - qw / 2,
                _height * 2 - qh / 2 + gap,
                qw, qh
            );
            renderer.setViewport(
                _halfWidth - qw / 2,
                _height * 2 - qh / 2 + gap,
                qw, qh
            );
            renderer.render(scene, scope.reflectFromAbove ? _cameraB : _cameraF);

            // BOTTOM
            renderer.setScissor(
                _halfWidth - qw / 2,
                0 + qh / 2 - qh / 2 - gap,
                qw, qh
            );
            renderer.setViewport(
                _halfWidth - qw / 2,
                -gap,
                qw, qh
            );
            renderer.render(scene, scope.reflectFromAbove ? _cameraF : _cameraB);

            // LEFT
            renderer.setScissor(
                _halfWidth - _width - qw / 2 - gap,
                _height - qh / 2,
                qw, qh
            );
            renderer.setViewport(
                _halfWidth - _width - qw / 2 - gap,
                _height - qh / 2,
                qw, qh
            );
            renderer.render(scene, scope.reflectFromAbove ? _cameraR : _cameraL);

            // RIGHT
            renderer.setScissor(
                _halfWidth + _width - qw / 2 + gap,
                _height - qh / 2,
                qw, qh
            );
            renderer.setViewport(
                _halfWidth + _width - qw / 2 + gap,
                _height - qh / 2,
                qw, qh
            );
            renderer.render(scene, scope.reflectFromAbove ? _cameraL : _cameraR);

            renderer.setScissorTest(false);
        };
    }
}

import * as THREE from 'three';

export class CustomPeppersGhostEffect {
    constructor(renderer) {
        const scope = this;

        scope.cameraDistance = 15;
        scope.reflectFromAbove = false;

        // Custom properties
        scope.viewScale = 1.0; // Scales the size of each projection square
        scope.centerGap = 0.0; // Distance to push projections away from center (in pixels)

        let _width, _height, _cx, _cy;

        const _cameraF = new THREE.PerspectiveCamera(); //front
        const _cameraB = new THREE.PerspectiveCamera(); //back
        const _cameraL = new THREE.PerspectiveCamera(); //left
        const _cameraR = new THREE.PerspectiveCamera(); //right

        const _position = new THREE.Vector3();
        const _quaternion = new THREE.Quaternion();
        const _scale = new THREE.Vector3();

        renderer.autoClear = false;

        this.setSize = function (width, height) {
            _cx = width / 2;
            _cy = height / 2;

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
            if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();

            camera.matrixWorld.decompose(_position, _quaternion, _scale);

            // front
            _cameraF.position.copy(_position);
            _cameraF.quaternion.copy(_quaternion);
            _cameraF.translateZ(scope.cameraDistance);
            _cameraF.lookAt(scene.position);

            // back
            _cameraB.position.copy(_position);
            _cameraB.quaternion.copy(_quaternion);
            _cameraB.translateZ(-(scope.cameraDistance));
            _cameraB.lookAt(scene.position);
            _cameraB.rotation.z += 180 * (Math.PI / 180);

            // left
            _cameraL.position.copy(_position);
            _cameraL.quaternion.copy(_quaternion);
            _cameraL.translateX(-(scope.cameraDistance));
            _cameraL.lookAt(scene.position);
            _cameraL.rotation.x += 90 * (Math.PI / 180);

            // right
            _cameraR.position.copy(_position);
            _cameraR.quaternion.copy(_quaternion);
            _cameraR.translateX(scope.cameraDistance);
            _cameraR.lookAt(scene.position);
            _cameraR.rotation.x += 90 * (Math.PI / 180);

            renderer.clear();
            renderer.setScissorTest(true);

            // Calculate actual square size and base offset
            const s = _width * scope.viewScale;
            const halfS = s / 2;
            const offset = (_width * scope.viewScale) + scope.centerGap;

            // TOP (originally back)
            // Center of square is at (_cx, _cy + offset)
            // Bottom-left of square is at (_cx - halfS, _cy + offset - halfS)
            renderer.setScissor(_cx - halfS, _cy + offset - halfS, s, s);
            renderer.setViewport(_cx - halfS, _cy + offset - halfS, s, s);

            if (scope.reflectFromAbove) {
                renderer.render(scene, _cameraB);
            } else {
                renderer.render(scene, _cameraF);
            }

            // BOTTOM (originally front)
            // Center of square is at (_cx, _cy - offset)
            renderer.setScissor(_cx - halfS, _cy - offset - halfS, s, s);
            renderer.setViewport(_cx - halfS, _cy - offset - halfS, s, s);

            if (scope.reflectFromAbove) {
                renderer.render(scene, _cameraF);
            } else {
                renderer.render(scene, _cameraB);
            }

            // LEFT (originally left)
            // Center of square is at (_cx - offset, _cy)
            renderer.setScissor(_cx - offset - halfS, _cy - halfS, s, s);
            renderer.setViewport(_cx - offset - halfS, _cy - halfS, s, s);

            if (scope.reflectFromAbove) {
                renderer.render(scene, _cameraR);
            } else {
                renderer.render(scene, _cameraL);
            }

            // RIGHT (originally right)
            // Center of square is at (_cx + offset, _cy)
            renderer.setScissor(_cx + offset - halfS, _cy - halfS, s, s);
            renderer.setViewport(_cx + offset - halfS, _cy - halfS, s, s);

            if (scope.reflectFromAbove) {
                renderer.render(scene, _cameraL);
            } else {
                renderer.render(scene, _cameraR);
            }

            renderer.setScissorTest(false);
        };
    }
}

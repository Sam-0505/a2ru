import * as THREE from 'three';

const cameraDistance = 2.3;
const scene = new THREE.Scene();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

const _cameraF = new THREE.PerspectiveCamera();
const _cameraB = new THREE.PerspectiveCamera();
const _cameraL = new THREE.PerspectiveCamera();
const _cameraR = new THREE.PerspectiveCamera();

function debugCam(name, cam) {
    cam.updateMatrixWorld();
    const pos = new THREE.Vector3();
    cam.getWorldPosition(pos);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion);
    console.log(name, {
        pos: pos.toArray().map(v => Math.round(v*100)/100),
        dir: dir.toArray().map(v => Math.round(v*100)/100),
        up: up.toArray().map(v => Math.round(v*100)/100)
    });
}

_cameraF.position.copy(_position);
_cameraF.quaternion.copy(_quaternion);
_cameraF.translateZ(cameraDistance);
_cameraF.lookAt(scene.position);
_cameraF.rotateZ(Math.PI);

_cameraB.position.copy(_position);
_cameraB.quaternion.copy(_quaternion);
_cameraB.translateZ(-cameraDistance);
_cameraB.lookAt(scene.position);
_cameraB.rotation.z += Math.PI;
_cameraB.rotateZ(Math.PI);

_cameraL.position.copy(_position);
_cameraL.quaternion.copy(_quaternion);
_cameraL.translateX(-cameraDistance);
_cameraL.lookAt(scene.position);
_cameraL.rotation.x += Math.PI / 2;
_cameraL.rotateZ(Math.PI);

_cameraR.position.copy(_position);
_cameraR.quaternion.copy(_quaternion);
_cameraR.translateX(cameraDistance);
_cameraR.lookAt(scene.position);
_cameraR.rotation.x += Math.PI / 2;
_cameraR.rotateZ(Math.PI);

debugCam('TOP (F)', _cameraF);
debugCam('BOTTOM (B)', _cameraB);
debugCam('LEFT (L)', _cameraL);
debugCam('RIGHT (R)', _cameraR);

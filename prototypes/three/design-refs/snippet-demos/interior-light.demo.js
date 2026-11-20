// 演示：室内记忆厅外壳 + 天窗光束（只用 toolkit + interior-light）。
scene.background = new THREE.Color(0x2c2722);
scene.fog = new THREE.FogExp2(0x2c2722, 0.02);
scene.add(new THREE.AmbientLight(0x6b5f52, 0.6));
const sideFill = new THREE.PointLight(0x9fc6dc, 2.5, 9, 2);
sideFill.position.set(3.6, 3.4, 0.2);
const warmLamp = new THREE.PointLight(0xffb070, 3, 9, 2);
warmLamp.position.set(-2.6, 2.4, 0.6);
scene.add(sideFill, warmLamp);
scene.add(makeRoomShell(THREE));
const shaft = makeLightShaft(THREE, { top: [0, 6.2, 0], floor: [0.6, 0, 0.8] });
scene.add(shaft.group);
camera.fov = 56; camera.position.set(0, 1.72, 6.0); camera.lookAt(0, 1.8, -0.4); camera.updateProjectionMatrix();
let elapsed = 0;
ctx.onFrame((delta) => { elapsed += delta; shaft.update(elapsed); });
ctx.addOrbitControls({ target: [0, 1.8, -0.4], minDistance: 2, maxDistance: 6 });

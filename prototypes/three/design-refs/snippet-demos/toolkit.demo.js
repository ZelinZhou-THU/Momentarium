// 演示：渐变天空 + 三点布光 + 构件盒子 + 光晕（只用 toolkit）。
scene.fog = new THREE.FogExp2(0xb8c4c8, 0.02);
scene.add(makeSkyDome(THREE, { top: 0x4f6f8f, horizon: 0xf2c49a }));
addLightRig(THREE, scene);
const glowTexture = makeGlowTexture(THREE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), makeMaterial(THREE, 0x8a8a7a, 0.95));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const stone = makeMaterial(THREE, 0xa7a091, 0.86, 0.05);
const metal = makeMaterial(THREE, 0x3f4c51, 0.4, 0.72);
const lamp = makeGlowMaterial(THREE, 0xffe6b0, 0xffc06a, 2.6);
addBox(THREE, scene, [2.4, 0.3, 2.4], [0, 0.15, 0], stone);
addBox(THREE, scene, [0.5, 2.6, 0.5], [0, 1.6, 0], stone);
addBox(THREE, scene, [0.9, 0.12, 0.9], [0, 2.96, 0], metal);
addBox(THREE, scene, [0.4, 0.4, 0.4], [0, 3.22, 0], lamp);
addGlow(THREE, scene, glowTexture, { position: [0, 3.22, 0], size: 2.4, color: 0xffd9a0 });
camera.fov = 50; camera.position.set(0, 1.7, 7); camera.lookAt(0, 1.6, 0); camera.updateProjectionMatrix();
ctx.addOrbitControls({ target: [0, 1.6, 0], minDistance: 3, maxDistance: 16 });

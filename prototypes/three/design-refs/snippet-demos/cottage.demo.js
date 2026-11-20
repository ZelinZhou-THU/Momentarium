// 演示：10 构件小屋（只用 toolkit + cottage）。
scene.fog = new THREE.FogExp2(0xb5c0c0, 0.025);
scene.add(makeSkyDome(THREE, { top: 0x587a94, horizon: 0xe8cfa8 }));
addLightRig(THREE, scene, { keyPosition: [-6, 5.5, 6] });
const glowTexture = makeGlowTexture(THREE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), makeMaterial(THREE, 0x7d8a6a, 0.96));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const house = makeCottage(THREE, glowTexture);
house.rotation.y = -0.45;
scene.add(house);
camera.fov = 50; camera.position.set(1.5, 1.8, 7.2); camera.lookAt(0, 1.6, 0); camera.updateProjectionMatrix();
ctx.addOrbitControls({ target: [0, 1.6, 0], minDistance: 3, maxDistance: 16 });

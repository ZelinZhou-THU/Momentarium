// 演示：街角建筑（只用 toolkit + street-building）。
scene.background = new THREE.Color(0x22313b);
scene.fog = new THREE.FogExp2(0x22313b, 0.02);
addLightRig(THREE, scene, { keyColor: 0xffb070, keyIntensity: 1.2, keyPosition: [5, 4, 6], ambientColor: 0x51677a, ambientIntensity: 1.0, rimIntensity: 1.25 });
const glowTexture = makeGlowTexture(THREE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), makeMaterial(THREE, 0x2b3a42, 0.5, 0.3));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const building = makeStreetBuilding(THREE, glowTexture);
building.rotation.y = 0.35;
scene.add(building);
camera.fov = 52; camera.position.set(3, 2.2, 11); camera.lookAt(0, 3.4, 0); camera.updateProjectionMatrix();
ctx.addOrbitControls({ target: [0, 3.4, 0], minDistance: 5, maxDistance: 22 });

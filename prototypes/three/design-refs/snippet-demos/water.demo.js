// 演示：可读水面 + 一段岸（只用 toolkit + water）。
scene.fog = new THREE.FogExp2(0x9fb2ba, 0.03);
scene.add(makeSkyDome(THREE, { top: 0x5d7d92, horizon: 0xc9d3d2 }));
addLightRig(THREE, scene, { keyIntensity: 2.25, ambientColor: 0x9fb7c2, ambientIntensity: 1.0 });
const water = makeReadableWater(THREE, { width: 38, depth: 19, color: 0x435e66 });
water.group.position.set(0, 0.06, -1.2);
scene.add(water.group);
const shore = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), makeMaterial(THREE, 0x9a9382, 0.98, 0.02));
shore.rotation.x = -Math.PI / 2;
shore.position.set(0, 0.04, 9.5);
scene.add(shore);
camera.fov = 50; camera.position.set(0, 2.55, 10.2); camera.lookAt(0, 1.0, -1.2); camera.updateProjectionMatrix();
let elapsed = 0;
ctx.onFrame((delta) => { elapsed += delta; water.update(elapsed, ctx.renderer, scene); });
ctx.addOrbitControls({ target: [0, 1.0, -1.2], minDistance: 5, maxDistance: 18 });

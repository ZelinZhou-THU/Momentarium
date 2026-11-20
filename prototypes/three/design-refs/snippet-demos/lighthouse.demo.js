// 演示：灯塔立在礁石平台上（只用 toolkit + lighthouse）。
scene.fog = new THREE.FogExp2(0x9fb2ba, 0.028);
scene.add(makeSkyDome(THREE, { top: 0x5d7d92, horizon: 0xd8c9b4 }));
addLightRig(THREE, scene);
const glowTexture = makeGlowTexture(THREE);
const terrace = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.0, 0.75, 9, 1), makeMaterial(THREE, 0x536366, 0.95, 0.03));
terrace.position.y = 0.37;
scene.add(terrace);
const lighthouse = makeLighthouse(THREE, glowTexture);
lighthouse.group.position.set(0, 0.75, 0);
scene.add(lighthouse.group);
camera.fov = 50; camera.position.set(3.5, 2.6, 9); camera.lookAt(0, 3, 0); camera.updateProjectionMatrix();
let elapsed = 0;
ctx.onFrame((delta) => { elapsed += delta; lighthouse.update(elapsed); });
ctx.addOrbitControls({ target: [0, 3, 0], minDistance: 4, maxDistance: 18 });

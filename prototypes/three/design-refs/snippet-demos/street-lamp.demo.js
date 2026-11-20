// 演示：两盏路灯照亮步道（只用 toolkit + street-lamp）。
scene.background = new THREE.Color(0x1f2b35);
scene.fog = new THREE.FogExp2(0x1f2b35, 0.03);
scene.add(new THREE.AmbientLight(0x51677a, 0.8));
const glowTexture = makeGlowTexture(THREE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), makeMaterial(THREE, 0x3a4650, 0.6, 0.2));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 30), makeMaterial(THREE, 0x6b665c, 0.9));
path.rotation.x = -Math.PI / 2;
path.position.y = 0.01;
scene.add(path);
const lamps = [[2.4, 1], [2.4, -6]].map(([x, z]) => {
  const lamp = makeStreetLamp(THREE, glowTexture);
  lamp.group.position.set(x, 0, z);
  scene.add(lamp.group);
  return lamp;
});
camera.fov = 52; camera.position.set(-1.5, 1.7, 8); camera.lookAt(0.8, 2, -2); camera.updateProjectionMatrix();
let elapsed = 0;
ctx.onFrame((delta) => { elapsed += delta; lamps.forEach((lamp) => lamp.update(elapsed)); });
ctx.addOrbitControls({ target: [0.8, 2, -2], minDistance: 4, maxDistance: 20 });

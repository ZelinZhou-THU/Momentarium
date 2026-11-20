// 演示：阔叶树（三种尺寸）+ 针叶树 + 混合树林（只用 toolkit + trees）。
scene.fog = new THREE.FogExp2(0xc8d2c6, 0.02);
scene.add(makeSkyDome(THREE, { top: 0x6488a6, horizon: 0xeadfc4 }));
addLightRig(THREE, scene, { keyColor: 0xffe2b8, keyPosition: [-7, 9, 6] });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), makeMaterial(THREE, 0x7e9160, 0.96));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
[[-3.2, 0, 0, 5.5, 11], [0.6, 0, -1.5, 4.2, 12], [3.8, 0, 0.4, 3.2, 13]].forEach(([x, y, z, height, seed]) => {
  const tree = makeBroadleafTree(THREE, { height, seed });
  tree.position.set(x, y, z);
  scene.add(tree);
});
const pine = makeLowPolyTree(THREE, { height: 4.5 });
pine.position.set(6.6, 0, -1.8);
scene.add(pine);
scene.add(makeForest(THREE, { center: [0, 0, -14], count: 22, spread: 9, kind: "mixed" }));
camera.fov = 50; camera.position.set(0.5, 1.8, 10); camera.lookAt(0.5, 2.4, -1); camera.updateProjectionMatrix();
ctx.addOrbitControls({ target: [0.5, 2.4, -1], minDistance: 4, maxDistance: 26 });

// 组合：绿坡小屋（terrain + trees + cottage）：阔叶树放在小屋侧后方，用视线走廊保证门窗不被挡住。
scene.fog = new THREE.FogExp2(0xcfd8d2, 0.016);
scene.add(makeSkyDome(THREE, { top: 0x5f8db3, horizon: 0xeee2c6 }));
addLightRig(THREE, scene, { keyColor: 0xffd9a8, keyPosition: [-8, 8, 7], ambientColor: 0xa8bcc4 });
const glowTexture = makeGlowTexture(THREE);
scene.add(makeLowPolyTerrain(THREE, { flatRadius: 12, height: 8, lowColor: 0x7c9455, highColor: 0xa9b585 }));
const housePosition = [0.5, 0, -2];
const house = makeCottage(THREE, glowTexture, { wallColor: 0xe4dccb, roofColor: 0x5b5a4a });
house.position.set(...housePosition);
house.rotation.y = -0.2;
scene.add(house);
camera.fov = 50; camera.position.set(1.4, 1.8, 8); camera.lookAt(0.4, 1.6, -2); camera.updateProjectionMatrix();
// 选址规则：小屋占地圆（半径 2.3m）不进树冠；相机 → 小屋正面这条走廊（半宽 1.9m）不种树。
const avoid = [[housePosition[0], housePosition[2], 2.3]];
const viewCorridors = [[camera.position.x, camera.position.z, housePosition[0], housePosition[2] + 1.2, 1.9]];
[[-4.6, -3.4, 5.6, 31], [5.2, -4.4, 4.6, 32], [-2.8, 2.2, 3.4, 33]]
  .map(([x, z, height, seed]) => ({ x, z, tree: makeBroadleafTree(THREE, { height, seed }) }))
  .filter(({ x, z, tree }) => canPlaceTree(x, z, { crownRadius: tree.userData.crownRadius, avoid, viewCorridors }))
  .forEach(({ x, z, tree }) => {
    tree.position.set(x, 0, z);
    scene.add(tree);
  });
scene.add(makeForest(THREE, { center: [2, 0, -15], count: 18, spread: 9, kind: "mixed", avoid, viewCorridors }));
scene.add(makeRockCluster(THREE, { center: [-2.2, 0, 4.2], count: 4, size: 0.6, color: 0x8c877c }));
ctx.addOrbitControls({ target: [0.4, 1.6, -2], minDistance: 4, maxDistance: 22 });

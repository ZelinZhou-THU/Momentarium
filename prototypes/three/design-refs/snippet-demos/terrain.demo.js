// 演示：起伏地形 + 岩石（只用 toolkit + terrain）。
scene.fog = new THREE.FogExp2(0xc4cdc4, 0.018);
scene.add(makeSkyDome(THREE, { top: 0x5e86a8, horizon: 0xe9dcc0 }));
addLightRig(THREE, scene, { keyPosition: [-8, 9, 5] });
scene.add(makeLowPolyTerrain(THREE));
scene.add(makeRockCluster(THREE, { center: [-3.5, 0, 2], count: 5 }));
scene.add(makeRockCluster(THREE, { center: [5, 0, -3], count: 4, size: 1.8, seed: 4 }));
camera.fov = 52; camera.position.set(0, 2.2, 12); camera.lookAt(0, 2, -4); camera.updateProjectionMatrix();
ctx.addOrbitControls({ target: [0, 2, -4], minDistance: 5, maxDistance: 30 });

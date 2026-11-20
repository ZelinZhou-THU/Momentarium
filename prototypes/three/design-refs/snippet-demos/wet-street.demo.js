// 演示：雨夜湿街 + 雨丝（只用 toolkit + wet-street）。背景是一面临街外墙：霓虹灯条和暖窗都装在墙上，窗有窗框和窗棂。
scene.background = new THREE.Color(0x22313b);
scene.fog = new THREE.FogExp2(0x22313b, 0.024);
scene.add(new THREE.AmbientLight(0x51677a, 0.95));
const facadeZ = -1.0;
const frameMaterial = makeMaterial(THREE, 0x4a3221, 0.8, 0.03);
const sillMaterial = makeMaterial(THREE, 0x4b5a5d, 0.9, 0.05);
const warmGlass = makeGlowMaterial(THREE, 0xffc27a, 0xff9a4a, 1.4);
addBox(THREE, scene, [22, 7, 0.4], [0, 3.5, facadeZ - 0.2], makeMaterial(THREE, 0x33444d, 0.85, 0.06));
addBox(THREE, scene, [22, 0.14, 0.12], [0, 2.75, facadeZ + 0.06], makeMaterial(THREE, 0x5d6f75, 0.6, 0.2));
const addFramedWindow = (x, y, width, height) => {
  addBox(THREE, scene, [width, height, 0.08], [x, y, facadeZ + 0.04], frameMaterial);
  addBox(THREE, scene, [width - 0.14, height - 0.14, 0.02], [x, y, facadeZ + 0.09], warmGlass);
  addBox(THREE, scene, [0.05, height - 0.14, 0.03], [x, y, facadeZ + 0.11], frameMaterial);
  addBox(THREE, scene, [width - 0.14, 0.05, 0.03], [x, y + height * 0.15, facadeZ + 0.11], frameMaterial);
  addBox(THREE, scene, [width + 0.16, 0.08, 0.22], [x, y - height / 2 - 0.04, facadeZ + 0.11], sillMaterial);
};
[-0.2, 1.6, 4.1].forEach((x) => addFramedWindow(x, 4.4, 1.0, 1.3));
addFramedWindow(4.1, 1.4, 2.6, 1.7);
// 霓虹：两根灯管装在金属底座上，底座贴墙。
addBox(THREE, scene, [2.0, 0.6, 0.06], [-2.7, 3.4, facadeZ + 0.03], makeMaterial(THREE, 0x161c22, 0.6, 0.3));
[3.25, 3.55].forEach((y) => addBox(THREE, scene, [1.8, 0.06, 0.05], [-2.7, y, facadeZ + 0.09], makeGlowMaterial(THREE, 0xffb3cc, 0xff3f7f, 2.6)));
const neon = new THREE.PointLight(0xff5d8f, 6, 9, 2);
neon.position.set(-2.7, 3.4, -0.3);
const warm = new THREE.PointLight(0xffb066, 8, 10, 2);
warm.position.set(4.1, 1.6, 0.3);
scene.add(neon, warm);
const street = makeWetStreet(THREE);
street.group.position.set(0, 0, 2);
scene.add(street.group);
const rain = makeRain(THREE);
scene.add(rain.lines);
camera.fov = 52; camera.position.set(1.2, 1.9, 9); camera.lookAt(0, 1.6, 0); camera.updateProjectionMatrix();
let elapsed = 0;
ctx.onFrame((delta) => { elapsed += delta; street.update(elapsed, ctx.renderer, scene); rain.update(elapsed); });
ctx.addOrbitControls({ target: [0, 1.6, 0], minDistance: 4, maxDistance: 18 });

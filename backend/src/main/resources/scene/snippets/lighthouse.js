/* 灯塔 / 塔形主地标（海岸、港口、山顶瞭望）：基座 / 塔身 / 色带 / 外挑走廊平台 + 栏杆 + 扶手 / 发光灯室 / 锥形塔顶 / 灯光光晕（缓慢呼吸）。
 * 依赖 toolkit：addGlow、makeMaterial、makeGlowMaterial。高 ≈6m，可整体缩放。用法：
 *   const lighthouse = makeLighthouse(THREE, glowTexture, { bandColor: 0xa8453a });
 *   lighthouse.group.position.set(-6.2, 0.72, -3.2); scene.add(lighthouse.group);
 *   ctx.onFrame(() => lighthouse.update(elapsed)); */
function makeLighthouse(THREE, glowTexture, { bodyColor = 0xd9dcd4, bandColor = 0xa8453a, lightColor = 0xffd9a0 } = {}) {
  const group = new THREE.Group();
  const body = makeMaterial(THREE, bodyColor, 0.78, 0.05);
  const band = makeMaterial(THREE, bandColor, 0.7, 0.08);
  const metal = makeMaterial(THREE, 0x3f4c51, 0.4, 0.72);
  const edge = makeMaterial(THREE, 0x39464a, 0.55, 0.25);
  const lantern = makeGlowMaterial(THREE, 0xffe6b0, 0xffc06a, 3.1);

  const addCylinder = (radiusTop, radiusBottom, height, y, material, segments = 12) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1), material);
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };
  addCylinder(1.2, 1.35, 0.4, 0.2, edge, 10); // 基座
  addCylinder(0.88, 1.05, 3.4, 1.9, body); // 塔身（上细下粗）
  addCylinder(0.72, 0.86, 1.0, 4.1, band); // 色带
  // 环形走廊：外挑的平台（立在色带顶面 y=4.6 上）+ 12 根立柱 + 顶部扶手环，栏杆不悬空。
  addCylinder(1.05, 0.95, 0.08, 4.64, edge, 16);
  Array.from({ length: 12 }, (_, post) => {
    const angle = (post / 12) * Math.PI * 2;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), metal);
    rail.position.set(Math.cos(angle) * 0.98, 4.89, Math.sin(angle) * 0.98);
    group.add(rail);
    return rail;
  });
  const handrail = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.025, 6, 32), metal);
  handrail.rotation.x = Math.PI / 2;
  handrail.position.y = 5.1;
  group.add(handrail);
  addCylinder(0.46, 0.52, 0.72, 5.06, lantern, 8); // 灯室
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.8, 8), edge); // 塔顶
  roof.position.y = 5.78;
  group.add(roof);
  const glow = addGlow(THREE, group, glowTexture, { position: [0, 5.06, 0], size: 3.6, color: lightColor, opacity: 0.9 });
  const light = new THREE.PointLight(lightColor, 3, 12, 2);
  light.position.set(0, 5.06, 0);
  group.add(light);

  const update = (elapsed) => {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.9);
    glow.material.opacity = 0.7 + pulse * 0.25;
    light.intensity = 2.4 + pulse * 1.2;
  };
  return { group, update };
}

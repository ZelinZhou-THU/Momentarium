/* 路灯（街道、码头、步道、夜景）：灯杆 / 悬臂 / 灯罩 / 灯泡 / 光晕 / 半透明锥形光柱 / 真实 SpotLight 照亮地面。
 * 依赖 toolkit：addGlow、makeDataTexture、makeMaterial、makeGlowMaterial。高 5.6m。用法：
 *   const lamp = makeStreetLamp(THREE, glowTexture, { color: 0xffc78d });
 *   lamp.group.position.set(4.6, 0, 1.2); scene.add(lamp.group);
 *   ctx.onFrame(() => lamp.update(elapsed)); */
function makeStreetLamp(THREE, glowTexture, { color = 0xffc78d, height = 5.6, armLength = 1.5, intensity = 12 } = {}) {
  const group = new THREE.Group();
  const metal = makeMaterial(THREE, 0x39474e, 0.35, 0.8);
  const bulbMaterial = makeGlowMaterial(THREE, 0xffc27a, 0xff9a4a, 2.4);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, height, 10), metal);
  pole.position.y = height / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 10), metal);
  base.position.y = 0.17;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.08, 0.08), metal);
  arm.position.set(-armLength / 2 + 0.05, height - 0.05, 0);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.28, 10), metal);
  head.position.set(-armLength + 0.08, height - 0.16, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), bulbMaterial);
  bulb.position.set(-armLength + 0.08, height - 0.32, 0);
  group.add(pole, base, arm, head, bulb);
  const glow = addGlow(THREE, group, glowTexture, { position: [-armLength + 0.08, height - 0.32, 0], size: 3.2, color, opacity: 0.9 });

  // 光柱：开口锥体 + 加色混合 + 低不透明度，透明度从灯头向地面渐隐（等透明度的锥体边缘会很硬）。
  const shaftFade = makeDataTexture(THREE, 64, (x, y) => {
    const level = Math.round(Math.pow(y / 63, 1.8) * 255);
    return [level, level, level, 255];
  });
  const shaft = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, height - 0.4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, alphaMap: shaftFade, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  shaft.position.set(-armLength + 0.08, (height - 0.4) / 2, 0);
  group.add(shaft);

  // 真实光源：让地面（尤其湿面）出现可读的光斑。
  const spot = new THREE.SpotLight(color, intensity, 14, 0.6, 0.5, 1.6);
  spot.position.set(-armLength + 0.08, height - 0.4, 0);
  spot.target.position.set(-armLength - 0.3, 0, 0.5);
  group.add(spot, spot.target);

  const update = (elapsed) => {
    glow.material.opacity = 0.85 + Math.sin(elapsed * 2.2) * 0.05;
  };
  return { group, update };
}

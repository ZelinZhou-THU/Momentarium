function build(ctx) {
  const THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
  scene.background = new THREE.Color(0x2c2722);
  scene.fog = new THREE.FogExp2(0x2c2722, 0.02);
  camera.fov = 56; camera.position.set(0, 1.72, 6.9); camera.lookAt(0, 1.5, -0.4); camera.updateProjectionMatrix();
  if (ctx.renderer) { ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping; ctx.renderer.toneMappingExposure = 1.08; }

  const dataTex = (size, fill) => {
    const data = new Uint8Array(size * size * 4);
    fill((x, y, r, g, b, a) => { const o = (y * size + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a; });
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const glowTex = dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
      const d = Math.min(1, Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64);
      put(x, y, 255, 226, 186, Math.round(Math.pow(1 - d, 2.1) * 255));
    }
  });
  const plankTex = dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
      const plank = Math.floor(y / 21);
      const seam = y % 21 < 2 ? 0.4 : 1;
      const grain = Math.sin(x * 0.32 + plank * 2.4) * 0.5 + 0.5;
      const level = Math.round((0.5 + grain * 0.5) * seam * 255);
      put(x, y, Math.round(level * 0.66), Math.round(level * 0.46), Math.round(level * 0.28), 255);
    }
  });
  const glowSprite = (parent, x, y, z, scale, color, opacity) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.set(x, y, z); sprite.scale.set(scale, scale, 1); parent.add(sprite); return sprite;
  };

  scene.add(new THREE.AmbientLight(0x6b5f52, 0.85));
  const skylight = new THREE.DirectionalLight(0xffe3b8, 2.6); skylight.position.set(0.8, 8, 2.2); skylight.target.position.set(0, 0, -0.5); scene.add(skylight, skylight.target);
  const coolWindow = new THREE.DirectionalLight(0x9fc6dc, 1.15); coolWindow.position.set(6, 3, 0.5); scene.add(coolWindow);
  const warmLamp = new THREE.PointLight(0xffb070, 6, 9, 2); warmLamp.position.set(-2.6, 2.4, 0.6); scene.add(warmLamp);
  const sideFill = new THREE.PointLight(0x9fc6dc, 6, 9, 2); sideFill.position.set(3.6, 3.4, 0.2); scene.add(sideFill);

  const M = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const mat = {
    floor: new THREE.MeshStandardMaterial({ map: plankTex, color: 0xffffff, roughness: 0.42, metalness: 0.18 }),
    stone: M(0x77705f, 0.88, 0.05), stoneDark: M(0x554f42, 0.9, 0.04), plaster: M(0x8a8373, 0.92, 0.02),
    wood: M(0x6f4f33, 0.7, 0.06), woodDark: M(0x4c3623, 0.75, 0.05), metal: M(0x3e4448, 0.4, 0.75),
    warmGlass: new THREE.MeshStandardMaterial({ color: 0xffd39b, emissive: 0xffb066, emissiveIntensity: 1.9, roughness: 0.4 }),
    coolGlass: new THREE.MeshStandardMaterial({ color: 0xd6ecf5, emissive: 0x8fc4dc, emissiveIntensity: 2.8, roughness: 0.25 }),
  };
  const box = (parent, w, h, d, x, y, z, m, ry = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; parent.add(mesh); return mesh;
  };

  /* 房间外壳：地板（木纹）/ 三面石墙 / 顶棚 + 天窗开口 */
  const room = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 13), mat.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0.5); room.add(floor);
  box(room, 14, 6.2, 0.4, 0, 3.1, -5.6, mat.plaster);            // 背墙
  box(room, 0.4, 6.2, 13, -6.8, 3.1, 0.5, mat.stoneDark);        // 左墙
  box(room, 0.4, 6.2, 13, 6.8, 3.1, 0.5, mat.stone);             // 右墙
  box(room, 14, 0.45, 13, 0, 6.3, 0.5, mat.stoneDark);           // 顶棚
  /* 天窗：井状框 + 分格 */
  box(room, 3.2, 0.5, 0.28, 0, 6.2, -1.7, mat.woodDark);
  box(room, 3.2, 0.5, 0.28, 0, 6.2, 2.1, mat.woodDark);
  box(room, 0.28, 0.5, 3.8, -1.6, 6.2, 0.2, mat.woodDark);
  box(room, 0.28, 0.5, 3.8, 1.6, 6.2, 0.2, mat.woodDark);
  box(room, 3.0, 0.06, 0.1, 0, 6.02, 0.2, mat.metal);
  box(room, 0.1, 0.06, 3.4, 0, 6.02, 0.2, mat.metal);
  const skylightGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.4), new THREE.MeshBasicMaterial({ color: 0xffe8c4, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  skylightGlow.rotation.x = Math.PI / 2; skylightGlow.position.set(0, 5.96, 0.2); room.add(skylightGlow);
  scene.add(room);

  /* 天窗光束：斜向锥体 + 地面光斑（受控体积光示意） */
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.3, 5.4, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe3b8, transparent: true, opacity: 0.085, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.set(0.2, 3.0, 0.2); beam.rotation.z = -0.12; scene.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 28), new THREE.MeshBasicMaterial({ color: 0xffdcae, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0.4, 0.02, 0.6); scene.add(pool);

  /* 立柱 ×4 + 横梁 + 檐下拱线脚 */
  const columns = [];
  for (const [x, z] of [[-4.4, -3.4], [-4.4, 2.6], [4.4, -3.4], [4.4, 2.6]]) {
    const column = new THREE.Group();
    box(column, 0.62, 0.3, 0.62, 0, 0.15, 0, mat.stoneDark);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 4.6, 10), mat.stone);
    shaft.position.y = 2.6; column.add(shaft);
    box(column, 0.6, 0.24, 0.6, 0, 4.98, 0, mat.stoneDark);
    column.position.set(x, 0, z); scene.add(column); columns.push(column);
  }
  box(scene, 9.6, 0.3, 0.42, 0, 5.1, -4.4, mat.woodDark);
  box(scene, 9.6, 0.3, 0.42, 0, 5.1, 3.6, mat.woodDark);
  box(scene, 0.34, 0.3, 8.2, -4.4, 5.1, 0.1, mat.woodDark);
  box(scene, 0.34, 0.3, 8.2, 4.4, 5.1, 0.1, mat.woodDark);

  /* 右墙高窗 ×2：外框 + 竖梃 + 横档 + 冷光玻璃 + 窗台 */
  const tallWindow = (z, width, height) => {
    const group = new THREE.Group();
    box(group, 0.16, height + 0.3, width + 0.3, 0, 0, 0, mat.woodDark);
    box(group, 0.08, height, 0.08, 0, 0, 0, mat.wood);
    box(group, 0.08, 0.08, width, 0, height * 0.18, 0, mat.wood);
    box(group, 0.06, height - 0.2, width - 0.2, 0.04, 0, 0, mat.coolGlass);
    box(group, 0.4, 0.1, width + 0.5, 0.12, -height / 2 - 0.1, 0, mat.stone);
    group.position.set(6.55, 3.1, z); scene.add(group); return group;
  };
  tallWindow(-2.2, 1.5, 3.6); tallWindow(1.6, 1.5, 3.6);
  const windowGlowA = glowSprite(scene, 6.2, 3.1, -2.2, 3.0, 0x9fc6dc, 0.35);
  const windowGlowB = glowSprite(scene, 6.2, 3.1, 1.6, 3.0, 0x9fc6dc, 0.3);
  box(scene, 0.2, 0.12, 6.0, 6.35, 1.1, -0.3, mat.woodDark);

  /* 左侧楼梯 + 栏杆 + 长凳 + 壁灯 */
  const stairs = new THREE.Group();
  for (let step = 0; step < 6; step += 1) {
    box(stairs, 2.4, 0.22, 0.42, -4.2, 0.11 + step * 0.22, 1.6 - step * 0.4, mat.stone);
  }
  for (let post = 0; post < 6; post += 1) {
    box(stairs, 0.06, 0.9, 0.06, -5.25, 0.45 + post * 0.22, 1.55 - post * 0.4, mat.metal);
  }
  const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.7), mat.woodDark);
  handrail.position.set(-5.25, 1.5, 0.55); handrail.rotation.x = 0.5; stairs.add(handrail);
  scene.add(stairs);
  const bench = new THREE.Group();
  box(bench, 2.2, 0.12, 0.62, 0, 0.46, 0, mat.wood);
  box(bench, 2.2, 0.65, 0.1, 0, 0.82, -0.3, mat.wood);
  box(bench, 0.12, 0.44, 0.5, -0.9, 0.22, 0, mat.woodDark);
  box(bench, 0.12, 0.44, 0.5, 0.9, 0.22, 0, mat.woodDark);
  bench.position.set(2.4, 0, 1.9); bench.rotation.y = -0.28; scene.add(bench);
  const sconceA = glowSprite(scene, -6.4, 3.4, 2.9, 1.4, 0xffc27a, 0.75);
  const sconceB = glowSprite(scene, -6.4, 3.4, -2.4, 1.4, 0xffc27a, 0.7);
  box(scene, 0.1, 0.3, 0.1, -6.4, 3.4, 2.9, mat.metal);
  box(scene, 0.1, 0.3, 0.1, -6.4, 3.4, -2.4, mat.metal);
  const beamLamp = new THREE.PointLight(0xffc27a, 4, 6, 2); beamLamp.position.set(-6.2, 3.4, 0.2); scene.add(beamLamp);

  /* 墙面挂画/记忆碑（无照片，抽象石牌） */
  const plaques = [[-2.6, 3.3, -5.38, 1.5, 0.9], [2.4, 3.1, -5.38, 1.2, 0.75], [0.4, 4.5, -5.38, 0.9, 0.55]];
  plaques.forEach((p, index) => {
    box(scene, p[3], p[4], 0.08, p[0], p[1], p[2], index === 1 ? mat.stoneDark : mat.stone);
    box(scene, p[3] - 0.16, p[4] - 0.16, 0.03, p[0], p[1], p[2] + 0.06, mat.woodDark);
    glowSprite(scene, p[0], p[1], p[2] + 0.16, 0.8, 0xffd8a8, 0.25);
  });

  /* 尘埃粒子（天窗光束内） */
  const dustCount = 130, dustPositions = new Float32Array(dustCount * 3);
  for (let index = 0; index < dustCount; index += 1) {
    dustPositions[index * 3] = (Math.random() - 0.5) * 6.5;
    dustPositions[index * 3 + 1] = 0.5 + Math.random() * 4.8;
    dustPositions[index * 3 + 2] = -2.8 + Math.random() * 6.0;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe6c2, size: 0.028, transparent: true, opacity: 0.5, depthWrite: false })); scene.add(dust);

  let elapsed = 0;
  ctx.onFrame((delta) => {
    elapsed += delta;
    dust.rotation.y = Math.sin(elapsed * 0.04) * 0.08;
    skylightGlow.material.opacity = 0.24 + Math.sin(elapsed * 0.6) * 0.04;
    beam.material.opacity = 0.075 + Math.sin(elapsed * 0.5) * 0.015;
    pool.material.opacity = 0.16 + Math.sin(elapsed * 0.45) * 0.03;
    windowGlowA.material.opacity = 0.32 + Math.sin(elapsed * 0.7) * 0.05;
    windowGlowB.material.opacity = 0.28 + Math.cos(elapsed * 0.65) * 0.04;
    sconceA.material.opacity = 0.72 + Math.sin(elapsed * 2.1) * 0.07;
    sconceB.material.opacity = 0.68 + Math.cos(elapsed * 1.9) * 0.07;
    beamLamp.intensity = 3.8 + Math.sin(elapsed * 0.8) * 0.5;
  });
  ctx.addOrbitControls({ target: [0, 1.8, -1.0], minDistance: 4, maxDistance: 16, rotateSpeed: 0.4, zoomSpeed: 0.7 });
}

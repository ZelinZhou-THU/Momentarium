function build(ctx) {
  const THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
  scene.background = new THREE.Color(0x22313b);
  scene.fog = new THREE.FogExp2(0x22313b, 0.024);
  camera.fov = 52; camera.position.set(2.4, 1.92, 8.2); camera.lookAt(-0.8, 1.45, -1.2); camera.updateProjectionMatrix();
  if (ctx.renderer) { ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping; ctx.renderer.toneMappingExposure = 1.1; }

  const dataTex = (size, fill) => {
    const data = new Uint8Array(size * size * 4);
    fill((x, y, r, g, b, a) => { const o = (y * size + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a; });
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const glowTex = dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
      const d = Math.min(1, Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64);
      put(x, y, 255, 226, 190, Math.round(Math.pow(1 - d, 2.2) * 255));
    }
  });
  const glowSprite = (parent, x, y, z, scale, color, opacity) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.set(x, y, z); sprite.scale.set(scale, scale, 1); parent.add(sprite); return sprite;
  };

  /* 光：冷环境 + 暖街灯 + 霓虹粉点光 + 背侧蓝轮廓光 */
  scene.add(new THREE.AmbientLight(0x51677a, 0.95));
  const warmKey = new THREE.PointLight(0xffb066, 10, 12, 2); warmKey.position.set(2.6, 3.1, 2.2); scene.add(warmKey);
  const neonLight = new THREE.PointLight(0xff5d8f, 7, 9, 2); neonLight.position.set(-3.0, 2.8, -1.2); scene.add(neonLight);
  const coolRim = new THREE.DirectionalLight(0x8fc0e0, 1.25); coolRim.position.set(5, 4, -7); scene.add(coolRim);

  const M = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const mat = {
    street: M(0x2b3a42, 0.16, 0.72), puddle: M(0x1e2c34, 0.05, 0.92),
    wall: M(0x384c55, 0.82, 0.08), wallDark: M(0x2a3c45, 0.88, 0.06),
    roof: M(0x283740, 0.68, 0.15), trim: M(0x5d6f75, 0.6, 0.2), stone: M(0x4b5a5d, 0.9, 0.05),
    wood: M(0x6b4a32, 0.75, 0.04), woodDark: M(0x4a3221, 0.8, 0.03), metal: M(0x39474e, 0.35, 0.8),
    warmGlass: new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xff9a4a, emissiveIntensity: 2.4, roughness: 0.35 }),
    coolGlass: new THREE.MeshStandardMaterial({ color: 0x9fc6dc, emissive: 0x5c93b4, emissiveIntensity: 1.6, roughness: 0.3 }),
    neon: new THREE.MeshStandardMaterial({ color: 0xff7fa8, emissive: 0xff3f7f, emissiveIntensity: 3.4, roughness: 0.4 }),
  };
  const box = (parent, w, h, d, x, y, z, m, ry = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; parent.add(mesh); return mesh;
  };

  /* 湿街 + 一次性 CubeCamera 受控反射 + 水洼 */
  const cubeRT = new THREE.WebGLCubeRenderTarget(128);
  const cubeCam = new THREE.CubeCamera(0.2, 40, cubeRT); cubeCam.position.set(0, 0.4, 0);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(28, 24), mat.street);
  street.rotation.x = -Math.PI / 2; street.position.set(0, 0, 2.0); street.material.envMap = cubeRT.texture; street.material.envMapIntensity = 0.85; scene.add(street);
  const puddles = [[-2.2, 0.045, 2.4, 3.6, 1.5], [1.9, 0.045, 0.9, 2.4, 1.0], [0.2, 0.045, 4.6, 4.4, 1.6]].map((p) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), mat.puddle.clone());
    mesh.material.envMap = cubeRT.texture; mesh.material.envMapIntensity = 1.0;
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(p[0], p[1], p[2]); scene.add(mesh); return mesh;
  });
  const curb = new THREE.Mesh(new THREE.BoxGeometry(28, 0.16, 0.5), mat.stone); curb.position.set(0, 0.08, 7.4); scene.add(curb);

  /* 街角建筑（左侧）：基座/错层墙体/檐口线脚×3/出檐女儿墙/窗框暖窗/店面/雨棚/霓虹招牌/落水管/台阶/栏杆 */
  const building = new THREE.Group();
  box(building, 5.2, 0.5, 4.2, 0, 0.25, 0, mat.stone);
  box(building, 4.6, 6.4, 3.6, 0, 3.6, 0, mat.wall);
  box(building, 2.2, 6.8, 2.0, 2.35, 3.8, -0.6, mat.wallDark);
  for (let floor = 0; floor < 3; floor += 1) {
    box(building, 5.0, 0.14, 4.0, 0, 2.1 + floor * 2.1, 0, mat.trim);
    box(building, 0.16, 0.14, 4.0, -2.5 + 0.02, 2.1 + floor * 2.1, 0, mat.trim);
  }
  box(building, 5.3, 0.22, 4.2, 0, 6.95, 0, mat.roof);
  box(building, 4.9, 0.55, 3.9, 0, 7.35, 0, mat.roof);
  box(building, 5.1, 0.16, 4.05, 0, 7.66, 0, mat.trim);
  const windowGrid = (x, y, z, ry, columns, rows, warm) => {
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const group = new THREE.Group();
        box(group, 1.0, 1.35, 0.1, 0, 0, 0, mat.woodDark);
        box(group, 0.86, 1.2, 0.06, 0, 0, 0.03, warm && (column + row) % 3 !== 2 ? mat.warmGlass : mat.coolGlass);
        box(group, 0.08, 1.2, 0.08, 0, 0, 0.06, mat.wood);
        box(group, 0.86, 0.08, 0.08, 0, 0, 0.06, mat.wood);
        box(group, 1.16, 0.1, 0.34, 0, -0.74, 0.1, mat.stone);
        group.position.set(x + (column - (columns - 1) / 2) * 1.5, y + row * 1.95, z);
        group.rotation.y = ry; building.add(group);
      }
    }
  };
  windowGrid(0, 2.8, 1.81, 0, 3, 2, true);
  windowGrid(1.83, 2.8, 0.1, Math.PI / 2, 2, 2, true);
  /* 店面：木框玻璃 + 门 + 门槛 + 暖色内光 */
  box(building, 4.2, 1.7, 0.16, -0.1, 1.35, 1.84, mat.woodDark);
  box(building, 2.2, 1.45, 0.08, -0.75, 1.3, 1.94, mat.warmGlass);
  box(building, 0.95, 1.5, 0.08, 1.3, 1.28, 1.94, mat.warmGlass);
  box(building, 0.1, 1.5, 0.08, 0.3, 1.28, 1.95, mat.wood);
  box(building, 4.4, 0.12, 0.34, -0.1, 0.62, 2.0, mat.stone);
  /* 雨棚（斜面 + 支撑 + 檐边）+ 雨棚下暖光 */
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.5), mat.roof);
  awning.position.set(-0.1, 2.55, 2.45); awning.rotation.x = -0.3; building.add(awning);
  box(building, 0.1, 0.9, 0.1, -2.1, 2.0, 2.95, mat.metal); box(building, 0.1, 0.9, 0.1, 1.9, 2.0, 2.95, mat.metal);
  box(building, 4.7, 0.1, 0.08, -0.1, 2.28, 3.16, mat.trim);
  /* 霓虹招牌：竖框 + 发光板 + 顶部横臂 */
  const sign = new THREE.Group();
  box(sign, 1.15, 1.9, 0.12, 0, 0, 0, mat.metal);
  box(sign, 0.95, 1.7, 0.06, 0, 0, 0.08, mat.neon);
  box(sign, 1.25, 0.1, 0.14, 0, 1.02, 0.02, mat.metal);
  sign.position.set(-2.55, 3.35, 1.95); sign.rotation.y = 0.12; building.add(sign);
  glowSprite(building, -2.55, 3.35, 2.25, 3.4, 0xff6f9f, 0.8);
  /* 落水管 + 弯头 + 外墙台阶栏杆 */
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.4, 8), mat.metal);
  pipe.position.set(2.85, 3.4, 1.86); building.add(pipe);
  for (let step = 0; step < 3; step += 1) box(building, 1.2, 0.15, 0.32, 1.3 + step * 0.1, 0.07 + step * 0.15, 2.4 + step * 0.3, mat.stone);
  for (let post = 0; post < 4; post += 1) box(building, 0.06, 0.55, 0.06, -0.2 + post * 0.55, 0.95, 2.55, mat.metal);
  box(building, 2.2, 0.06, 0.06, 0.62, 1.2, 2.55, mat.metal);
  const doorLamp = glowSprite(building, 1.32, 2.1, 2.1, 1.6, 0xffc27a, 0.85);
  building.position.set(-2.7, 0, -0.4); building.rotation.y = 0.06; scene.add(building);

  /* 街灯（右侧）+ 锥形光柱 + 光晕 */
  const lampGroup = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.6, 10), mat.metal); pole.position.y = 2.8; lampGroup.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), mat.metal); arm.position.set(-0.7, 5.55, 0); lampGroup.add(arm);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.28, 10), mat.metal); head.position.set(-1.42, 5.44, 0); lampGroup.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat.warmGlass); bulb.position.set(-1.42, 5.28, 0); lampGroup.add(bulb);
  glowSprite(lampGroup, -1.42, 5.28, 0, 3.2, 0xffc27a, 0.9);
  const shaft = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.2, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc78d, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  shaft.position.set(-2.0, 2.7, 0.6); shaft.rotation.z = 0.18; lampGroup.add(shaft);
  const spot = new THREE.SpotLight(0xffc78d, 12, 14, 0.6, 0.5, 1.6); spot.position.set(-1.42, 5.2, 0); spot.target.position.set(-1.8, 0, 0.5); lampGroup.add(spot, spot.target);
  lampGroup.position.set(4.6, 0, 1.2); scene.add(lampGroup);

  /* 远处街景（低多边形体块 + 点窗），提供纵深 */
  const farBuildings = [[-10, -3, 0x26343c], [-8.5, -7, 0x2b3b44], [7.5, -7.5, 0x26343c], [10, -9, 0x2a3942]];
  farBuildings.forEach((entry, index) => {
    const height = 5 + index * 1.6;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.4 + index, height, 3.0), M(entry[2], 0.85, 0.08));
    tower.position.set(entry[0], height / 2, entry[1]); scene.add(tower);
    for (let lit = 0; lit < 3; lit += 1) {
      box(scene, 0.4, 0.5, 0.06, entry[0] - 0.9 + lit * 0.85, 2.2 + lit * 0.9, entry[1] + 1.55, lit % 2 === 0 ? mat.warmGlass : mat.coolGlass);
    }
  });

  /* 地面反射光带（受控，模拟霓虹/街灯在湿面拉长） */
  const streak = (color, x, z, width, length, opacity) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.05, z); scene.add(mesh);
  };
  streak(0xff6f9f, -2.7, 3.2, 1.4, 4.4, 0.15);
  streak(0xffc78d, 4.1, 3.0, 1.6, 5.0, 0.13);
  streak(0x8fc0e0, 0.5, 5.6, 2.2, 3.2, 0.08);

  /* 雨丝：细线粒子（LineSegments），落速与风偏 */
  const rainCount = 220, rainPositions = new Float32Array(rainCount * 6);
  for (let index = 0; index < rainCount; index += 1) {
    const x = (Math.random() - 0.5) * 22, y = Math.random() * 7.5, z = -4 + Math.random() * 14;
    rainPositions[index * 6] = x; rainPositions[index * 6 + 1] = y; rainPositions[index * 6 + 2] = z;
    rainPositions[index * 6 + 3] = x + 0.06; rainPositions[index * 6 + 4] = y - 0.5; rainPositions[index * 6 + 5] = z;
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xa9c6d8, transparent: true, opacity: 0.35, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat); scene.add(rain);

  /* 前景遮挡：右侧雨棚边缘（深色带轮廓光，避免全黑） */
  const foreground = new THREE.Group();
  box(foreground, 5.0, 0.4, 0.5, 0, 0, 0, mat.roof);
  box(foreground, 5.0, 0.06, 0.12, 0, -0.2, 0.28, new THREE.MeshStandardMaterial({ color: 0x9fb6c2, emissive: 0x55707e, emissiveIntensity: 0.6, roughness: 0.5 }));
  foreground.position.set(2.6, 5.6, 5.2); foreground.rotation.y = -0.28; scene.add(foreground);

  let elapsed = 0, reflected = false;
  ctx.onFrame((delta) => {
    elapsed += delta;
    if (!reflected && ctx.renderer) { cubeCam.update(ctx.renderer, scene); reflected = true; }
    const positions = rainGeo.attributes.position;
    for (let index = 0; index < rainCount; index += 1) {
      const fall = (elapsed * 4.2) % 7.5;
      const baseY = 7.5 - ((index * 0.37 + fall) % 7.5);
      positions.setY(index * 2 + 1, baseY);
      positions.setY(index * 2, baseY + 0.5);
      positions.setX(index * 2, positions.getX(index * 2) + Math.sin(elapsed + index) * 0.0008);
    }
    positions.needsUpdate = true;
    rainMat.opacity = 0.28 + Math.sin(elapsed * 2.1) * 0.06;
    neonLight.intensity = 6.5 + Math.sin(elapsed * 1.7) * 1.2;
    /* 霓虹在地面的湿反射呼吸 */
    puddles.forEach((puddle, index) => { puddle.material.envMapIntensity = 0.9 + Math.sin(elapsed * 1.2 + index) * 0.12; });
    doorLamp.material.opacity = 0.8 + Math.sin(elapsed * 2.2) * 0.08;
  });
  ctx.addOrbitControls({ target: [-0.8, 1.6, -0.6], minDistance: 5, maxDistance: 20, rotateSpeed: 0.42, zoomSpeed: 0.7 });
}

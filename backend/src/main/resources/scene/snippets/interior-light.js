/* 室内光（展厅、房间、教堂、图书馆、旧屋）：木纹地板 + 三面墙 + 带天窗的顶棚 + 高窗 + 斜向光束 + 地面光斑 + 光束里的尘粒。
 * 依赖 toolkit：addBox、addGlow、makeDataTexture、makeMaterial、makeGlowMaterial、makeRandom。用法：
 *   const room = makeRoomShell(THREE, { width: 14, depth: 13, height: 6.2 }); scene.add(room);
 *   const shaft = makeLightShaft(THREE, { top: [0, 6, 0.2], floor: [0.4, 0, 0.6] }); scene.add(shaft.group);
 *   ctx.onFrame((dt) => { elapsed += dt; shaft.update(elapsed); });
 * 室内要把相机放进房间（例：position (0, 1.72, 6.9)、lookAt (0, 1.5, -0.4)），fov 52–58。 */
function makeRoomShell(THREE, { width = 14, depth = 13, height = 6.2, wallColor = 0x8a8373, stoneColor = 0x77705f, woodColor = 0x4c3623 } = {}) {
  const room = new THREE.Group();
  // 木地板：贴图覆盖 2.4m × 2.4m，8 条木板（每条 0.3m 宽）沿 x 方向铺；每排木板长度不同、接缝错开，
  // 每块木板有自己的色差和木纹相位，板缝 1px 深色 + 1px 倒角高光——这样近看才像真的拼木地板。
  const random = makeRandom(17);
  const textureSize = 256;
  const plankPx = 32;
  const rows = Array.from({ length: textureSize / plankPx }, () => ({ offset: Math.floor(random() * textureSize), length: random() < 0.5 ? 64 : 128 }));
  const boardShade = (row, board) => {
    const hash = Math.sin(row * 127.1 + board * 311.7) * 43758.5453;
    return 0.82 + (hash - Math.floor(hash)) * 0.26;
  };
  const planks = makeDataTexture(THREE, textureSize, (x, y) => {
    const rowIndex = Math.floor(y / plankPx);
    const row = rows[rowIndex];
    const along = (x + row.offset) % textureSize;
    const board = Math.floor(along / row.length);
    const inBoard = along % row.length;
    const across = y % plankPx;
    const shade = boardShade(rowIndex, board);
    const phase = board * 1.7 + rowIndex * 2.3;
    const grain = 0.5 + 0.22 * Math.sin(along * 0.07 + phase + 2.2 * Math.sin(across * 0.21 + phase)) + 0.08 * Math.sin(along * 0.43 + across * 0.9);
    const edge = across === 0 || inBoard === 0 ? 0.45 : across === 1 || inBoard === 1 ? 1.12 : 1;
    const level = shade * edge * (0.78 + grain * 0.3);
    return [Math.min(255, Math.round(128 * level)), Math.min(255, Math.round(86 * level)), Math.min(255, Math.round(54 * level)), 255];
  });
  planks.repeat.set(width / 2.4, depth / 2.4);
  planks.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.6, metalness: 0.04 }));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  const plaster = makeMaterial(THREE, wallColor, 0.92, 0.02);
  const stone = makeMaterial(THREE, stoneColor, 0.88, 0.05);
  const stoneDark = makeMaterial(THREE, 0x554f42, 0.9, 0.04);
  const wood = makeMaterial(THREE, woodColor, 0.75, 0.05);
  const halfW = width / 2;
  const halfD = depth / 2;
  addBox(THREE, room, [width, height, 0.4], [0, height / 2, -halfD], plaster); // 背墙
  addBox(THREE, room, [0.4, height, depth], [-halfW, height / 2, 0], stoneDark); // 左墙
  addBox(THREE, room, [0.4, height, depth], [halfW, height / 2, 0], stone); // 右墙
  // 踢脚线：墙与地面交接处一圈深木条，消掉"墙直接插进地板"的生硬感。
  addBox(THREE, room, [width - 0.4, 0.14, 0.04], [0, 0.07, -halfD + 0.22], wood);
  addBox(THREE, room, [0.04, 0.14, depth - 0.4], [-halfW + 0.22, 0.07, 0], wood);
  addBox(THREE, room, [0.04, 0.14, depth - 0.4], [halfW - 0.22, 0.07, 0], wood);

  // 顶棚四块围出天窗开口（3 × 3.6m），开口加木框和十字金属分格。
  const opening = [3.0, 3.6];
  const sideWidth = (width - opening[0]) / 2;
  const sideDepth = (depth - opening[1]) / 2;
  addBox(THREE, room, [sideWidth, 0.45, depth], [-(opening[0] + sideWidth) / 2, height, 0], stoneDark);
  addBox(THREE, room, [sideWidth, 0.45, depth], [(opening[0] + sideWidth) / 2, height, 0], stoneDark);
  addBox(THREE, room, [opening[0], 0.45, sideDepth], [0, height, -(opening[1] + sideDepth) / 2], stoneDark);
  addBox(THREE, room, [opening[0], 0.45, sideDepth], [0, height, (opening[1] + sideDepth) / 2], stoneDark);
  addBox(THREE, room, [opening[0] + 0.2, 0.5, 0.2], [0, height - 0.1, -opening[1] / 2], wood);
  addBox(THREE, room, [opening[0] + 0.2, 0.5, 0.2], [0, height - 0.1, opening[1] / 2], wood);
  addBox(THREE, room, [0.2, 0.5, opening[1]], [-opening[0] / 2, height - 0.1, 0], wood);
  addBox(THREE, room, [0.2, 0.5, opening[1]], [opening[0] / 2, height - 0.1, 0], wood);
  const skyGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(opening[0], opening[1]),
    new THREE.MeshBasicMaterial({ color: 0xffe8c4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  skyGlass.rotation.x = Math.PI / 2;
  skyGlass.position.y = height + 0.2;
  room.add(skyGlass);

  // 右墙两扇高窗：外框 / 竖梃 / 横档 / 冷光玻璃 / 窗台。
  const coolGlass = makeGlowMaterial(THREE, 0xd6ecf5, 0x8fc4dc, 2.8);
  [-2.2, 1.6].forEach((z) => {
    const frame = new THREE.Group();
    addBox(THREE, frame, [0.16, 3.9, 1.8], [0, 0, 0], wood);
    addBox(THREE, frame, [0.06, 3.4, 1.3], [-0.06, 0, 0], coolGlass);
    addBox(THREE, frame, [0.08, 3.6, 0.08], [-0.1, 0, 0], wood);
    addBox(THREE, frame, [0.08, 0.08, 1.5], [-0.1, 0.65, 0], wood);
    addBox(THREE, frame, [0.4, 0.1, 2.0], [-0.12, -2.0, 0], stone);
    frame.position.set(halfW - 0.25, height / 2, z);
    room.add(frame);
  });
  return room;
}

/** 斜向光束：开口圆台（加色、opacity 0.06–0.1）+ 地面光斑 + 光束内缓慢漂移的尘粒，外加一盏真实方向光。 */
function makeLightShaft(THREE, { top = [0, 6, 0.2], floor = [0.4, 0, 0.6], color = 0xffe3b8, topRadius = 0.5, bottomRadius = 2.3, dustCount = 130, seed = 5 } = {}) {
  const group = new THREE.Group();
  const start = new THREE.Vector3(top[0], top[1], top[2]);
  const end = new THREE.Vector3(floor[0], floor[1], floor[2]);
  const length = start.distanceTo(end);

  // 光束透明度沿高度渐变（上浓下淡，落地处几乎消失），避免一根实心的发光管子。
  const beamFade = makeDataTexture(THREE, 64, (x, y) => {
    const level = Math.round(Math.pow(y / 63, 1.4) * 255);
    return [level, level, level, 255];
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, alphaMap: beamFade, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.copy(start.clone().add(end).multiplyScalar(0.5));
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(end).normalize());
  group.add(beam);

  // 地面光斑：径向渐变贴图（中心亮、边缘柔和衰减），不要用实心圆片——边缘会很硬。
  const poolTexture = makeDataTexture(THREE, 64, (x, y) => {
    const distance = Math.min(1, Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32);
    return [255, 255, 255, Math.round(Math.pow(1 - distance, 1.6) * 255)];
  });
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(bottomRadius * 2.4, bottomRadius * 2.4),
    new THREE.MeshBasicMaterial({ map: poolTexture, color, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(end.x, end.y + 0.02, end.z);
  group.add(pool);

  // 聚光而不是方向光：只照亮光束落点一圈（方向光会把整块地板一起照白）。
  const light = new THREE.SpotLight(color, 5, length * 1.6, Math.atan(bottomRadius / length) * 1.25, 0.65, 1);
  light.position.copy(start);
  light.target.position.copy(end);
  group.add(light, light.target);

  const random = makeRandom(seed);
  const dustPositions = new Float32Array(dustCount * 3);
  Array.from({ length: dustCount }, (_, index) => {
    const along = random();
    const center = start.clone().lerp(end, along);
    const spread = topRadius + (bottomRadius - topRadius) * along;
    dustPositions.set([center.x + (random() - 0.5) * spread * 1.6, center.y, center.z + (random() - 0.5) * spread * 1.6], index * 3);
    return index;
  });
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xffe6c2, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }));
  group.add(dust);

  const update = (elapsed) => {
    beam.material.opacity = 0.11 + Math.sin(elapsed * 0.5) * 0.02;
    pool.material.opacity = 0.3 + Math.sin(elapsed * 0.45) * 0.04;
    dust.position.y = Math.sin(elapsed * 0.2) * 0.15;
    dust.rotation.y = Math.sin(elapsed * 0.04) * 0.08;
  };
  return { group, update };
}

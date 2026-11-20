/* 街角建筑（城市、街道、店铺、夜晚）：所有构件按同一套米制坐标咬合（窗台不压线脚、雨棚靠拉杆挂在墙上、招牌垂直于墙面伸出）。
 * 构件：基座 / 主楼 + 侧面退台体块 / 每层线脚 / 女儿墙压顶 / 窗格（外框 + 十字窗棂 + 窗台）/ 木框店面 + 门 /
 *       外斜雨棚 + 拉杆 / 垂直于墙面的霓虹灯箱（暗底 + 发光灯管边框与笔画）/ 墙角落水管 / 门前台阶 + 扶手 / 门灯。
 * 依赖 toolkit：addBox、addGlow、makeMaterial、makeGlowMaterial。主楼 4.6×3.6m、3 层、每层 2.1m。用法：
 *   const building = makeStreetBuilding(THREE, glowTexture, { neonColor: 0xff3f7f });
 *   building.position.set(-2.7, 0, -0.4); scene.add(building);   // 原点在基座底面中心，正面朝 +z */
function makeStreetBuilding(THREE, glowTexture, { wallColor = 0x384c55, accentWallColor = 0x2a3c45, trimColor = 0x5d6f75, neonColor = 0xff3f7f, floors = 3 } = {}) {
  const building = new THREE.Group();
  const mat = {
    wall: makeMaterial(THREE, wallColor, 0.82, 0.08),
    wallAccent: makeMaterial(THREE, accentWallColor, 0.88, 0.06),
    trim: makeMaterial(THREE, trimColor, 0.6, 0.2),
    roof: makeMaterial(THREE, 0x283740, 0.68, 0.15),
    stone: makeMaterial(THREE, 0x4b5a5d, 0.9, 0.05),
    wood: makeMaterial(THREE, 0x6b4a32, 0.75, 0.04),
    woodDark: makeMaterial(THREE, 0x4a3221, 0.8, 0.03),
    metal: makeMaterial(THREE, 0x39474e, 0.35, 0.8),
    signBack: makeMaterial(THREE, 0x161c22, 0.6, 0.3),
    warmGlass: makeGlowMaterial(THREE, 0xffc27a, 0xff9a4a, 1.6),
    coolGlass: makeGlowMaterial(THREE, 0x9fc6dc, 0x5c93b4, 1.1),
    neon: makeGlowMaterial(THREE, 0xffb3cc, neonColor, 2.6),
  };

  // 统一尺寸。
  const baseH = 0.5; // 基座高 = 一层地面
  const halfW = 2.3; // 主楼半宽
  const halfD = 1.8; // 主楼半深，正面在 z = +halfD
  const floorH = 2.1;
  const wallTop = baseH + floors * floorH;
  const front = halfD;

  // 体量：基座 + 主楼 + 右后方退台体块（比主楼矮一层、往后退，形成第二个体量）。
  addBox(THREE, building, [halfW * 2 + 0.4, baseH, halfD * 2 + 0.4], [0, baseH / 2, 0], mat.stone);
  addBox(THREE, building, [halfW * 2, wallTop - baseH, halfD * 2], [0, (wallTop + baseH) / 2, 0], mat.wall);
  const annexTop = wallTop - floorH;
  addBox(THREE, building, [2.0, annexTop, 2.4], [halfW + 1.0, annexTop / 2, -0.4], mat.wallAccent); // 落在街面上（主楼基座外）
  addBox(THREE, building, [2.1, 0.14, 2.5], [halfW + 1.0, annexTop + 0.07, -0.4], mat.trim);
  const annexFront = -0.4 + 1.2;
  addBox(THREE, building, [0.9, 2.0, 0.08], [halfW + 1.0, 1.0, annexFront + 0.04], mat.woodDark); // 侧楼一层的后门
  addBox(THREE, building, [0.76, 1.9, 0.04], [halfW + 1.0, 0.95, annexFront + 0.09], mat.wood);
  addBox(THREE, building, [1.1, 0.1, 0.25], [halfW + 1.0, 2.1, annexFront + 0.12], mat.trim);

  // 每层线脚（只绕主楼一圈）+ 女儿墙压顶。
  Array.from({ length: floors - 1 }, (_, index) => {
    const y = baseH + floorH * (index + 1);
    addBox(THREE, building, [halfW * 2 + 0.2, 0.14, 0.12], [0, y, front + 0.06], mat.trim);
    addBox(THREE, building, [0.12, 0.14, halfD * 2], [-halfW - 0.06, y, 0], mat.trim);
    return y;
  });
  addBox(THREE, building, [halfW * 2 + 0.3, 0.5, halfD * 2 + 0.3], [0, wallTop + 0.25, 0], mat.roof);
  addBox(THREE, building, [halfW * 2 + 0.45, 0.12, halfD * 2 + 0.45], [0, wallTop + 0.56, 0], mat.trim);

  // 窗：每层居中，窗台在线脚上方 0.3m，窗顶离上一道线脚 0.35m。
  const addWindow = (x, y, z, rotationY, warm) => {
    const unit = new THREE.Group();
    addBox(THREE, unit, [1.0, 1.35, 0.08], [0, 0, 0.04], mat.woodDark);
    addBox(THREE, unit, [0.86, 1.21, 0.02], [0, 0, 0.09], warm ? mat.warmGlass : mat.coolGlass);
    addBox(THREE, unit, [0.06, 1.21, 0.03], [0, 0, 0.11], mat.wood);
    addBox(THREE, unit, [0.86, 0.06, 0.03], [0, 0.18, 0.11], mat.wood);
    addBox(THREE, unit, [1.16, 0.08, 0.22], [0, -0.715, 0.11], mat.stone);
    unit.position.set(x, y, z);
    unit.rotation.y = rotationY;
    building.add(unit);
  };
  Array.from({ length: floors - 1 }, (_, row) => {
    const y = baseH + floorH * (row + 1) + 0.3 + 0.715;
    [-1.5, 0, 1.5].forEach((x, column) => addWindow(x, y, front, 0, (column + row) % 3 !== 2));
    addWindow(-halfW, y, 0.6, -Math.PI / 2, row % 2 === 0); // 左侧山墙（转角那一面）
    if (y + 0.8 < annexTop) addWindow(halfW + 1.0, y, annexFront, 0, row % 2 === 1); // 侧楼二层
    return y;
  });

  // 店面：木框 + 两块暖光橱窗 + 门（门落在一层地面上）。
  const shopBottom = baseH;
  const shopHeight = 1.75;
  const shopY = shopBottom + shopHeight / 2;
  addBox(THREE, building, [4.2, shopHeight, 0.1], [-0.1, shopY, front + 0.05], mat.woodDark);
  addBox(THREE, building, [2.3, 1.2, 0.03], [-0.85, shopY + 0.12, front + 0.11], mat.warmGlass);
  addBox(THREE, building, [2.3, 0.3, 0.04], [-0.85, shopBottom + 0.2, front + 0.12], mat.wood);
  addBox(THREE, building, [0.95, 1.6, 0.03], [1.3, shopBottom + 0.8, front + 0.11], mat.warmGlass);
  addBox(THREE, building, [0.06, 1.6, 0.04], [1.3, shopBottom + 0.8, front + 0.13], mat.wood);
  addBox(THREE, building, [4.4, 0.12, 0.2], [-0.1, shopBottom + shopHeight + 0.06, front + 0.1], mat.trim);

  // 雨棚：贴墙一端高、外端低（向外排水），靠两根拉杆挂在墙上，下面不需要立柱。
  const awningTilt = 0.3;
  const awningDepth = 1.3;
  const awningWallY = shopBottom + shopHeight + 0.45;
  const awning = addBox(THREE, building, [4.6, 0.08, awningDepth], [-0.1, awningWallY - (awningDepth / 2) * Math.sin(awningTilt), front + (awningDepth / 2) * Math.cos(awningTilt)], mat.roof);
  awning.rotation.x = awningTilt;
  const awningTipZ = front + awningDepth * Math.cos(awningTilt);
  const awningTipY = awningWallY - awningDepth * Math.sin(awningTilt);
  addBox(THREE, building, [4.6, 0.12, 0.05], [-0.1, awningTipY - 0.04, awningTipZ + 0.02], mat.trim);
  [-0.75, 0.75].forEach((x) => { // 拉杆锚点放在窗与窗之间的墙面上
    const anchorY = awningWallY + 0.75;
    const length = Math.hypot(awningTipZ - front, anchorY - awningTipY);
    const rod = addBox(THREE, building, [0.035, 0.035, length], [x, (anchorY + awningTipY) / 2, (front + awningTipZ) / 2], mat.metal);
    rod.rotation.x = Math.atan2(anchorY - awningTipY, awningTipZ - front);
    addBox(THREE, building, [0.12, 0.12, 0.05], [x, anchorY, front + 0.025], mat.metal);
  });

  // 霓虹灯箱：垂直于墙面伸出（侧面朝街），暗底板 + 发光灯管边框 + 三道横笔画；金属挑臂固定在二层墙面。
  const sign = new THREE.Group();
  const signW = 0.9;
  const signH = 1.5;
  addBox(THREE, sign, [0.12, signH, signW], [0, 0, 0], mat.signBack);
  const tube = 0.045;
  [-1, 1].forEach((side) => {
    addBox(THREE, sign, [0.16, tube, signW - 0.1], [0, side * (signH / 2 - 0.06), 0], mat.neon);
    addBox(THREE, sign, [0.16, signH - 0.1, tube], [0, 0, side * (signW / 2 - 0.06)], mat.neon);
  });
  [0.35, 0, -0.35].forEach((y, index) => addBox(THREE, sign, [0.16, tube, signW * (index === 1 ? 0.35 : 0.55)], [0, y, (index - 1) * 0.08], mat.neon));
  const signOffset = 0.25 + signW / 2;
  sign.position.set(-halfW + 0.14, baseH + floorH + 1.05, front + signOffset);
  building.add(sign);
  [0.55, -0.55].forEach((dy) => addBox(THREE, building, [0.05, 0.05, signOffset - signW / 2 + 0.02], [-halfW + 0.14, sign.position.y + dy, front + (signOffset - signW / 2) / 2], mat.metal));
  addGlow(THREE, building, glowTexture, { position: [-halfW + 0.14, sign.position.y, sign.position.z], size: 2.6, color: neonColor, opacity: 0.55 });
  const neonLight = new THREE.PointLight(neonColor, 4, 6, 2);
  neonLight.position.copy(sign.position);
  building.add(neonLight);

  // 落水管：贴着主楼右前角，从女儿墙一直落到基座。
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, wallTop - baseH, 8), mat.metal);
  pipe.position.set(halfW - 0.1, (wallTop + baseH) / 2, front + 0.08);
  building.add(pipe);

  // 门前台阶（从基座顶面落到街面）+ 扶手立柱立在地上。
  const doorX = 1.3;
  addBox(THREE, building, [1.2, 0.34, 0.32], [doorX, 0.17, front + 0.36], mat.stone);
  addBox(THREE, building, [1.2, 0.17, 0.32], [doorX, 0.085, front + 0.68], mat.stone);
  [front + 0.36, front + 0.68].forEach((z, index) => addBox(THREE, building, [0.05, 0.9, 0.05], [doorX - 0.65, (index === 0 ? 0.34 : 0.17) + 0.45, z], mat.metal));
  const handrail = addBox(THREE, building, [0.05, 0.05, 0.45], [doorX - 0.65, 1.0, front + 0.52], mat.metal);
  handrail.rotation.x = 0.4;
  addGlow(THREE, building, glowTexture, { position: [doorX, shopBottom + shopHeight + 0.25, front + 0.2], size: 1.2, color: 0xffc27a, opacity: 0.8 });

  return building;
}

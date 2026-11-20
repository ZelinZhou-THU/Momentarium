/* 低多边形小屋（记忆馆、海边小屋、山间木屋）：所有构件按同一套米制坐标咬合（门窗不重叠、不悬空、山墙封闭）。
 * 构件：带前廊的基座 / 两级台阶 / 墙体 + 转角压条 / 封闭山墙 / 双坡屋顶（出檐 0.35m）+ 屋脊 + 封檐板 /
 *       门（门框 + 门板 + 门芯板 + 门把手 + 门眉 + 门槛）/ 窗 ×4（外框 + 十字窗棂 + 暖光玻璃 + 窗台 + 窗眉）/ 烟囱 + 压顶 / 前廊栏杆 / 壁灯。
 * 依赖 toolkit：addBox、addGlow、makeMaterial、makeGlowMaterial。屋身 3.1×2.25m，檐口高 2.47m，屋脊高 ≈3.1m。用法：
 *   const house = makeCottage(THREE, glowTexture, { wallColor: 0xa7a091, roofColor: 0x4d5a5e });
 *   house.position.set(4.5, 0, -2.35); house.rotation.y = -0.32; scene.add(house);   // 原点在基座底面中心 */
function makeCottage(THREE, glowTexture, { wallColor = 0xa7a091, roofColor = 0x4d5a5e, woodColor = 0x7b5a3c, windowGlow = 0xffa04f, withRailing = true } = {}) {
  const house = new THREE.Group();
  const mat = {
    base: makeMaterial(THREE, 0x7f8987, 0.9, 0.06),
    wall: makeMaterial(THREE, wallColor, 0.86, 0.05),
    roof: makeMaterial(THREE, roofColor, 0.62, 0.18),
    edge: makeMaterial(THREE, 0x39464a, 0.55, 0.25),
    wood: makeMaterial(THREE, woodColor, 0.72, 0.05),
    woodDark: makeMaterial(THREE, 0x5d4128, 0.76, 0.04),
    metal: makeMaterial(THREE, 0x3f4c51, 0.4, 0.72),
    glass: makeGlowMaterial(THREE, 0xffcf8e, windowGlow, 2.2),
  };

  // 统一尺寸：所有构件都从这些数推出来，避免各算各的导致穿插。
  const floorY = 0.42; // 基座顶面 = 室内地面
  const halfW = 1.55; // 墙体半宽（x）
  const halfD = 1.125; // 墙体半深（z），前墙面在 z = +halfD
  const eaveY = 2.47; // 墙顶
  const pitch = 0.5; // 屋面坡度（弧度，约 29°）
  const overhang = 0.35; // 出檐（水平）
  const ridgeY = eaveY + halfD * Math.tan(pitch);
  const front = halfD; // 前墙面

  // 1) 基座：前面多出 0.83m 做前廊；2) 两级台阶：每级高 0.14m、深 0.3m，正对门。
  addBox(THREE, house, [3.5, floorY, 3.3], [0, floorY / 2, 0.3], mat.base);
  const doorX = -0.75;
  addBox(THREE, house, [1.1, 0.28, 0.3], [doorX, 0.14, 2.1], mat.base);
  addBox(THREE, house, [1.1, 0.14, 0.3], [doorX, 0.07, 2.4], mat.base);

  // 3) 墙体 + 四角竖向压条。
  addBox(THREE, house, [halfW * 2, eaveY - floorY, halfD * 2], [0, (eaveY + floorY) / 2, 0], mat.wall);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) =>
    addBox(THREE, house, [0.1, eaveY - floorY, 0.1], [sx * (halfW + 0.01), (eaveY + floorY) / 2, sz * (halfD + 0.01)], mat.wood),
  );

  // 4) 山墙：两端用三角形挤出体封住屋顶下的空洞（低多边形里最常见的破绽）。
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfD, 0);
  gableShape.lineTo(halfD, 0);
  gableShape.lineTo(0, ridgeY - eaveY);
  gableShape.lineTo(-halfD, 0);
  const gableGeometry = new THREE.ExtrudeGeometry(gableShape, { depth: 0.1, bevelEnabled: false });
  [halfW - 0.1, -halfW].forEach((x) => {
    const gable = new THREE.Mesh(gableGeometry, mat.wall);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(x, eaveY, 0);
    house.add(gable);
  });

  // 5) 双坡屋顶：屋面板底面贴着墙顶—屋脊这条线；板长按出檐算，屋脊压顶 + 前后封檐板。
  const run = halfD + overhang;
  const slabLength = run / Math.cos(pitch);
  const thickness = 0.14;
  [1, -1].forEach((side) => {
    const slab = addBox(THREE, house, [halfW * 2 + 0.6, thickness, slabLength], [0, 0, 0], mat.roof);
    const midZ = (run / 2) * side;
    const midY = ridgeY - (run / 2) * Math.tan(pitch);
    slab.position.set(0, midY + (thickness / 2) * Math.cos(pitch), midZ + (thickness / 2) * Math.sin(pitch) * side);
    slab.rotation.x = pitch * side;
    addBox(THREE, house, [halfW * 2 + 0.6, 0.16, 0.05], [0, ridgeY - run * Math.tan(pitch) - 0.02, (run + 0.03) * side], mat.edge);
  });
  addBox(THREE, house, [halfW * 2 + 0.7, 0.12, 0.28], [0, ridgeY + thickness / Math.cos(pitch), 0], mat.edge);

  // 6) 窗：外框 + 十字窗棂 + 暖光玻璃 + 窗台 + 窗眉；frame 的 +z 朝外。
  const addWindow = (x, y, z, rotationY, width = 0.9, height = 1.0) => {
    const unit = new THREE.Group();
    addBox(THREE, unit, [width, height, 0.06], [0, 0, 0.03], mat.woodDark);
    addBox(THREE, unit, [width - 0.16, height - 0.16, 0.02], [0, 0, 0.065], mat.glass);
    addBox(THREE, unit, [0.05, height - 0.16, 0.03], [0, 0, 0.085], mat.wood);
    addBox(THREE, unit, [width - 0.16, 0.05, 0.03], [0, height * 0.12, 0.085], mat.wood);
    addBox(THREE, unit, [width + 0.14, 0.06, 0.18], [0, -height / 2 - 0.03, 0.09], mat.base);
    addBox(THREE, unit, [width + 0.1, 0.08, 0.1], [0, height / 2 + 0.04, 0.05], mat.base);
    unit.position.set(x, y, z);
    unit.rotation.y = rotationY;
    house.add(unit);
  };
  addWindow(0.75, 1.45, front, 0);
  addWindow(halfW, 1.45, 0, Math.PI / 2);
  addWindow(-halfW, 1.45, 0, -Math.PI / 2);
  addWindow(0, 1.45, -halfD, Math.PI, 0.8, 0.9);

  // 7) 门：高 1.75m，底边落在地面（floorY），与右侧窗之间留 0.6m 墙面。
  const doorHeight = 1.75;
  const doorY = floorY + doorHeight / 2;
  addBox(THREE, house, [0.9, doorHeight, 0.08], [doorX, doorY, front + 0.04], mat.woodDark);
  addBox(THREE, house, [0.74, doorHeight - 0.1, 0.05], [doorX, doorY - 0.05, front + 0.095], mat.wood);
  addBox(THREE, house, [0.54, 0.6, 0.02], [doorX, doorY + 0.35, front + 0.125], mat.woodDark);
  addBox(THREE, house, [0.54, 0.5, 0.02], [doorX, doorY - 0.4, front + 0.125], mat.woodDark);
  addBox(THREE, house, [0.05, 0.12, 0.06], [doorX + 0.27, doorY - 0.05, front + 0.14], mat.metal);
  addBox(THREE, house, [1.06, 0.12, 0.18], [doorX, floorY + doorHeight + 0.06, front + 0.09], mat.base);
  addBox(THREE, house, [1.0, 0.03, 0.22], [doorX, floorY + 0.015, front + 0.11], mat.base);

  // 8) 烟囱：从后坡屋面穿出（底部埋在屋面里），顶部压顶。
  addBox(THREE, house, [0.46, 1.05, 0.46], [0.9, 3.05, -0.55], mat.edge);
  addBox(THREE, house, [0.6, 0.1, 0.6], [0.9, 3.62, -0.55], mat.base);

  // 9) 前廊栏杆：立柱立在基座上，沿前廊右半边与右侧边围合（给台阶和门留出入口）。
  if (withRailing) {
    const railZ = 1.88;
    const postHeight = 0.7;
    [0.1, 0.5, 0.9, 1.3, 1.68].forEach((x) => addBox(THREE, house, [0.07, postHeight, 0.07], [x, floorY + postHeight / 2, railZ], mat.woodDark));
    [1.5].forEach((z) => addBox(THREE, house, [0.07, postHeight, 0.07], [1.68, floorY + postHeight / 2, z], mat.woodDark));
    addBox(THREE, house, [1.66, 0.06, 0.09], [0.89, floorY + postHeight, railZ], mat.wood);
    addBox(THREE, house, [1.66, 0.04, 0.05], [0.89, floorY + 0.18, railZ], mat.woodDark);
    addBox(THREE, house, [0.09, 0.06, 0.76], [1.68, floorY + postHeight, (railZ + front) / 2], mat.wood);
  }

  // 10) 壁灯：装在门与窗之间的墙面上（支架 + 灯罩 + 暖光 + 光晕）。
  addBox(THREE, house, [0.06, 0.06, 0.16], [0, 2.0, front + 0.08], mat.metal);
  addBox(THREE, house, [0.22, 0.05, 0.22], [0, 2.1, front + 0.18], mat.edge);
  addBox(THREE, house, [0.16, 0.18, 0.16], [0, 1.98, front + 0.18], mat.glass);
  addGlow(THREE, house, glowTexture, { position: [0, 1.98, front + 0.3], size: 1.4, color: 0xffc98c, opacity: 0.75 });

  return house;
}

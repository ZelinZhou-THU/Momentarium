/* 树（针叶 + 阔叶）与树林，带"不挡主体、不穿进建筑"的选址检查。
 * 阔叶树 = 略带锥度的树干 + 2–3 根藏进树冠里的主枝 + 5–7 团略压扁的叶簇（低多边形二十面体，顶点小幅抖动、不出尖刺）；
 * 叶簇彼此交叠成一个完整的圆冠，下层叶簇颜色更深（假装自阴影）。不要用一堆随机三角片拼树冠，也不要让枝干交叉露在外面。
 * 依赖 toolkit：makeMaterial、makeRandom。用法：
 *   const oak = makeBroadleafTree(THREE, { height: 5.5 });
 *   oak.position.set(-4.2, 0, -2.5); scene.add(oak);              // 放在主体侧后方，树干离墙 ≥ 树冠半径 + 0.5m
 *   const view = [[camera.position.x, camera.position.z, 0, -1.5, 1.8]]; // 相机 → 门窗 的视线走廊（半宽 1.8m）
 *   canPlaceTree(-4.2, -2.5, { crownRadius: oak.userData.crownRadius, avoid: [[0, -1.5, 3]], viewCorridors: view }); // false 就换位置
 *   scene.add(makeForest(THREE, { center: [8, 0, -10], count: 12, spread: 8, kind: "mixed", avoid: [[0, -1.5, 3]], viewCorridors: view })); */

/** 低多边形针叶树：树干 + 3 层错位圆锥，颜色由深到浅。 */
function makeLowPolyTree(THREE, { height = 4, foliageColor = 0x3f5e3a, trunkColor = 0x5d4128 } = {}) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * height / 4, 0.14 * height / 4, height * 0.3, 6), makeMaterial(THREE, trunkColor, 0.85));
  trunk.position.y = height * 0.15;
  tree.add(trunk);
  const base = new THREE.Color(foliageColor);
  [0, 1, 2].forEach((layer) => {
    const radius = height * (0.32 - layer * 0.07);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 0.42, 7), makeMaterial(THREE, base.clone().multiplyScalar(1 + layer * 0.12).getHex(), 0.88, 0, { flatShading: true }));
    cone.position.y = height * (0.38 + layer * 0.2);
    cone.rotation.y = layer * 0.5;
    tree.add(cone);
  });
  tree.userData.crownRadius = height * 0.32;
  return tree;
}

/** 一团叶簇：二十面体（detail 1）顶点按位置统一小幅抖动（0.9–1.08，不出尖刺），再略压扁。 */
function makeLeafClump(THREE, radius, material, random) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const positions = geometry.attributes.position;
  // 非索引几何：同一位置的顶点有多份，按位置取同一个抖动量，否则叶簇会裂开露缝。
  const jitterByCorner = new Map();
  Array.from({ length: positions.count }, (_, vertex) => {
    const corner = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)].map((value) => value.toFixed(3)).join(",");
    const jitter = jitterByCorner.get(corner) ?? 0.9 + random() * 0.18;
    jitterByCorner.set(corner, jitter);
    positions.setXYZ(vertex, positions.getX(vertex) * jitter, positions.getY(vertex) * jitter * 0.82, positions.getZ(vertex) * jitter);
    return vertex;
  });
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/** 一根从 from 到 to 的锥形圆柱（树干/主枝）：底粗顶细，朝向用四元数对齐，不靠手调欧拉角。 */
function makeLimb(THREE, from, to, bottomRadius, topRadius, material) {
  const start = new THREE.Vector3(...from);
  const direction = new THREE.Vector3(...to).sub(start);
  const length = direction.length();
  const limb = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, length, 7), material);
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  limb.position.copy(start).addScaledVector(direction, 0.5);
  return limb;
}

/**
 * 低多边形阔叶树：height 是总高（米）。树冠中心在 0.63h，叶簇向外延伸；主枝的末端都落在叶簇内部，
 * 从外面只看到树干进入树冠，不会出现交叉支架一样的枝干。userData.crownRadius 供选址检查使用。
 */
function makeBroadleafTree(THREE, { height = 5, crownColor = 0x56783a, trunkColor = 0x6b4a2f, seed = 5 } = {}) {
  const random = makeRandom(seed);
  const tree = new THREE.Group();
  const bark = makeMaterial(THREE, trunkColor, 0.9);
  const crownY = height * 0.63;
  const crownRadius = height * 0.3;
  const trunkTop = [0, crownY - crownRadius * 0.15, 0];
  tree.add(makeLimb(THREE, [0, -0.1, 0], trunkTop, height * 0.045, height * 0.028, bark));
  // 树根处的根部扩张：一段很矮的倒锥，让树干"长"在地上而不是插在地上。
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.045, height * 0.075, height * 0.08, 7), bark);
  flare.position.y = height * 0.03;
  tree.add(flare);

  const base = new THREE.Color(crownColor);
  const shades = [0.78, 0.92, 1.06].map((factor) => makeMaterial(THREE, base.clone().multiplyScalar(factor).getHex(), 0.9, 0, { flatShading: true }));
  const ringCount = 5;
  const turn = random() * Math.PI * 2;
  // 下层一圈叶簇（偏深）+ 中心一团 + 顶部一团（最亮）：彼此交叠成一个完整的圆冠。
  const clumps = [
    ...Array.from({ length: ringCount }, (_, index) => {
      const angle = turn + (index / ringCount) * Math.PI * 2 + (random() - 0.5) * 0.4;
      const reach = crownRadius * (0.48 + random() * 0.1);
      return { position: [Math.cos(angle) * reach, crownY - crownRadius * 0.15 + random() * 0.2, Math.sin(angle) * reach], radius: crownRadius * (0.58 + random() * 0.08), shade: index % 2 === 0 ? 0 : 1 };
    }),
    { position: [0, crownY + crownRadius * 0.1, 0], radius: crownRadius * 0.78, shade: 1 },
    { position: [(random() - 0.5) * 0.3, crownY + crownRadius * 0.5, (random() - 0.5) * 0.3], radius: crownRadius * 0.58, shade: 2 },
  ];
  clumps.forEach(({ position, radius, shade }) => {
    const clump = makeLeafClump(THREE, radius, shades[shade], random);
    clump.position.set(...position);
    clump.rotation.y = random() * Math.PI;
    tree.add(clump);
  });
  // 主枝：从树干上部伸向下层叶簇的中心（末端藏在叶簇里），粗细明显小于树干。
  clumps.slice(0, ringCount).filter((_, index) => index % 2 === 0).forEach(({ position }) => {
    const startY = crownY - crownRadius * (0.55 + random() * 0.1);
    tree.add(makeLimb(THREE, [0, startY, 0], [position[0] * 0.8, position[1], position[2] * 0.8], height * 0.022, height * 0.012, bark));
  });
  // 选址包住完整叶簇：中心偏移 + 叶簇半径 × 最大顶点抖动；绕 Y 轴旋转不改变该边界。
  tree.userData.crownRadius = Math.max(height * 0.075, ...clumps.map(({ position, radius }) => Math.hypot(position[0], position[2]) + radius * 1.08));
  return tree;
}

/** 点 (x, z) 到线段的水平距离（视线走廊检查用）。 */
function distanceToSegment(x, z, [fromX, fromZ, toX, toZ]) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - fromX) * dx + (z - fromZ) * dz) / lengthSquared));
  return Math.hypot(x - (fromX + dx * t), z - (fromZ + dz * t));
}

/**
 * 树能不能种在 (x, z)：树冠不压进 avoid 区域（[x, z, 半径]：房屋、湖面、道路），
 * 也不进入视线走廊（[相机x, 相机z, 主体x, 主体z, 半宽]：相机看向门窗/主地标的那条带）。
 */
function canPlaceTree(x, z, { crownRadius = 1.5, avoid = [], viewCorridors = [] } = {}) {
  return (
    avoid.every(([ax, az, radius]) => Math.hypot(x - ax, z - az) > radius + crownRadius) &&
    viewCorridors.every(([fromX, fromZ, toX, toZ, halfWidth]) => distanceToSegment(x, z, [fromX, fromZ, toX, toZ]) > halfWidth + crownRadius)
  );
}

/**
 * 一片树林：在 center 附近随机散布，高度有变化；kind = "conifer" | "broadleaf" | "mixed"。
 * 不满足 canPlaceTree 的候选位置直接不种——树穿进房子、树挡住门窗是最常见的两类问题。
 */
function makeForest(THREE, { center = [0, 0, 0], count = 14, spread = 10, clearRadius = 0, kind = "conifer", avoid = [], viewCorridors = [], foliageColor = 0x3f5e3a, crownColor = 0x56783a, seed = 21 } = {}) {
  const random = makeRandom(seed);
  const forest = new THREE.Group();
  const candidates = Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const distance = clearRadius + random() * spread;
    const broadleaf = kind === "broadleaf" || (kind === "mixed" && random() < 0.5);
    const height = broadleaf ? 3.5 + random() * 2.5 : 3 + random() * 2.5;
    return { x: center[0] + Math.cos(angle) * distance, z: center[2] + Math.sin(angle) * distance, height, broadleaf, turn: random() * Math.PI, treeSeed: seed * 31 + index };
  });
  candidates
    .map(({ x, z, height, broadleaf, turn, treeSeed }) => {
      const tree = broadleaf ? makeBroadleafTree(THREE, { height, crownColor, seed: treeSeed }) : makeLowPolyTree(THREE, { height, foliageColor });
      return { x, z, turn, tree };
    })
    .filter(({ x, z, tree }) => canPlaceTree(x, z, { crownRadius: tree.userData.crownRadius, avoid, viewCorridors }))
    .forEach(({ x, z, turn, tree }) => {
      tree.position.set(x, center[1], z);
      tree.rotation.y = turn;
      forest.add(tree);
    });
  return forest;
}

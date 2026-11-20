/*
 * few-shot 片段 B：低多边形建筑细节（task-56 参考场景 A 的小屋提炼，米制尺度）
 * 供 ai-lead-b 嵌入「子代码提示词」；不可单独运行，依赖外层 build(ctx) 的
 *   const THREE = ctx.THREE; const house = new THREE.Group(); scene.add(house);
 * 反例：盒子 + 三棱柱。正例：≥10 个可辨认构件 + 材质分区（石/顶/木/金属/暖光）。
 * 尺度：屋身约 3.1m 宽 × 2.25m 深 × 2.05m 高；总高约 3.2m；窗 0.82×1.0m；门 0.62×1.4m。
 */
const stone = new THREE.MeshStandardMaterial({ color: 0xa7a091, roughness: 0.86, metalness: 0.05 });      // 石墙
const stoneBase = new THREE.MeshStandardMaterial({ color: 0x7f8987, roughness: 0.9, metalness: 0.06 });  // 基座/台阶
const roofMat = new THREE.MeshStandardMaterial({ color: 0x4d5a5e, roughness: 0.62, metalness: 0.18 });    // 石板瓦
const roofEdge = new THREE.MeshStandardMaterial({ color: 0x39464a, roughness: 0.55, metalness: 0.25 });    // 檐口/压顶
const wood = new THREE.MeshStandardMaterial({ color: 0x7b5a3c, roughness: 0.72, metalness: 0.05 });       // 木门/窗框
const woodDark = new THREE.MeshStandardMaterial({ color: 0x5d4128, roughness: 0.76, metalness: 0.04 });
const metal = new THREE.MeshStandardMaterial({ color: 0x3f4c51, roughness: 0.4, metalness: 0.72 });       // 金属栏杆/灯具
const warmGlass = new THREE.MeshStandardMaterial({ color: 0xffcf8e, emissive: 0xffa04f, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.1 }); // 暖光窗

const addBox = (parent, width, height, depth, x, y, z, material, rotationY) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  if (typeof rotationY === 'number') mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
};

// 1) 基座（石板，略大于墙身，形成收边）
addBox(house, 3.5, 0.42, 2.7, 0, 0.21, 0, stoneBase);
// 2) 台阶（3 级，每级缩进 0.16m，前向 0.34m）
for (let step = 0; step < 3; step += 1) {
  addBox(house, 1.25 - step * 0.16, 0.16, 0.42, 0.15, 0.08 + step * 0.16, 1.62 + step * 0.34, stoneBase);
}
// 3) 墙体（主墙 + 后侧错层体块，形成"两个体量"而非单盒）
addBox(house, 3.1, 2.05, 2.25, 0, 1.45, 0, stone);
addBox(house, 1.4, 2.35, 1.1, -1.05, 1.6, -0.65, stone);
// 4) 双坡屋顶 + 大出檐（两片斜板长 4.05m > 墙宽 3.1m，出檐 0.45m）+ 屋脊梁
const roofSouth = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.16, 1.75), roofMat);
roofSouth.position.set(0, 2.82, 0.62);
roofSouth.rotation.x = 0.42;
const roofNorth = roofSouth.clone();
roofNorth.position.set(0, 2.82, -0.62);
roofNorth.rotation.x = -0.42;
addBox(house, 4.12, 0.14, 0.28, 0, 3.18, 0, roofEdge); // 屋脊
house.add(roofSouth, roofNorth);
// 5) 檐口线脚（四面薄板，宽 4.0m、高 0.09m，强调建筑边缘与体块分层）
addBox(house, 4.0, 0.09, 0.12, 0, 2.52, 1.18, roofEdge);
addBox(house, 4.0, 0.09, 0.12, 0, 2.52, -1.18, roofEdge);
addBox(house, 0.12, 0.09, 2.45, -1.96, 2.52, 0, roofEdge);
addBox(house, 0.12, 0.09, 2.45, 1.96, 2.52, 0, roofEdge);
// 6) 窗：窗框（外框深木 + 内框木 + 暖光玻璃）+ 窗台石；前墙 2 扇 + 侧墙 1 扇
const addWindow = (x, y, z, width, height, rotationY) => {
  const group = new THREE.Group();
  addBox(group, width, height, 0.06, 0, 0, 0, woodDark);
  addBox(group, width - 0.14, height - 0.14, 0.04, 0, 0, 0.02, wood);
  addBox(group, width - 0.3, height - 0.3, 0.03, 0, 0, 0.04, warmGlass);
  addBox(group, width + 0.08, 0.07, 0.16, 0, height / 2 + 0.04, 0.04, stoneBase);
  addBox(group, width + 0.08, 0.07, 0.16, 0, -height / 2 - 0.04, 0.04, stoneBase);
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  house.add(group);
};
addWindow(-0.78, 1.55, 1.13, 0.82, 1.0, 0);
addWindow(0.72, 1.55, 1.13, 0.82, 1.0, 0);
addWindow(1.56, 1.55, -0.35, 0.8, 0.95, Math.PI / 2);
// 7) 门：门框 + 木门 + 门楣石 + 门前石阶（0.62×1.4m）
addBox(house, 0.78, 1.55, 0.1, -1.05, 0.9, 1.18, woodDark);
addBox(house, 0.62, 1.4, 0.08, -1.05, 0.86, 1.24, wood);
addBox(house, 0.9, 0.12, 0.36, -1.05, 1.72, 1.3, stoneBase);
addBox(house, 0.8, 0.1, 0.4, -1.05, 0.06, 1.48, stoneBase);
// 8) 烟囱 + 压顶（0.46×0.46m，位于屋脊侧）
addBox(house, 0.46, 1.0, 0.46, 1.15, 3.15, -0.3, roofEdge);
addBox(house, 0.6, 0.1, 0.6, 1.15, 3.68, -0.3, stoneBase);
// 9) 栏杆：6 根立柱（间距 0.7m）+ 上下横杆（木），位于临海一侧
for (let post = 0; post < 6; post += 1) {
  addBox(house, 0.06, 0.52, 0.06, -1.75 + post * 0.7, 0.26, 0, woodDark);
}
addBox(house, 3.8, 0.06, 0.08, 0, 0.52, 0, wood);
addBox(house, 3.8, 0.05, 0.06, 0, 0.18, 0, woodDark);
// 10) 壁灯（金属支架 + 遮雨檐 + 暖光玻璃，配合 PointLight/Sprite 光晕做首屏焦点）
addBox(house, 0.1, 0.28, 0.1, 1.6, 2.1, 1.2, metal);
addBox(house, 0.34, 0.06, 0.34, 1.6, 2.28, 1.2, roofEdge);
addBox(house, 0.22, 0.18, 0.22, 1.6, 2.16, 1.2, warmGlass);
// 材质分区：石/顶/木/金属/暖光各司其职；低多边形用"薄板叠层 + 出檐 + 线脚"制造细节，而非堆高面数。

// few-shot B（compact，≤2KB）：低多边形建筑细节（米制）。假设已有 THREE/house=Group/scene。
// 目标：≥10 个可辨认构件 + 材质分区，不是"盒子+三棱柱"。尺度：屋身 3.1×2.25×2.05m，总高≈3.2m，窗 0.82×1.0m，门 0.62×1.4m。
const mat=(color,roughness,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const M={stone:mat(0xa7a091,.86),base:mat(0x7f8987,.9,.06),roof:mat(0x4d5a5e,.62,.18),edge:mat(0x39464a,.55,.25),
  wood:mat(0x7b5a3c,.72),woodD:mat(0x5d4128,.76,0),metal:mat(0x3f4c51,.4,.72),
  glass:new THREE.MeshStandardMaterial({color:0xffcf8e,emissive:0xffa04f,emissiveIntensity:2.2,roughness:.4})};
const box=(parent,w,h,d,x,y,z,m,ry=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.rotation.y=ry;parent.add(mesh);return mesh};
box(house,3.5,.42,2.7,0,.21,0,M.base);                                  // 1 基座
for(let s=0;s<3;s++)box(house,1.25-s*.16,.16,.42,.15,.08+s*.16,1.62+s*.34,M.base); // 2 台阶×3
box(house,3.1,2.05,2.25,0,1.45,0,M.stone);box(house,1.4,2.35,1.1,-1.05,1.6,-.65,M.stone); // 3 墙体（错层两体量）
const roofS=new THREE.Mesh(new THREE.BoxGeometry(4.05,.16,1.75),M.roof);roofS.position.set(0,2.82,.62);roofS.rotation.x=.42; // 4 双坡屋顶
const roofN=roofS.clone();roofN.position.z=-.62;roofN.rotation.x=-.42;house.add(roofS,roofN);
box(house,4.12,.14,.28,0,3.18,0,M.edge);                                 // 屋脊
box(house,4.0,.09,.12,0,2.52,1.18,M.edge);box(house,4.0,.09,.12,0,2.52,-1.18,M.edge); // 5 檐口线脚（四面）
box(house,.12,.09,2.45,-1.96,2.52,0,M.edge);box(house,.12,.09,2.45,1.96,2.52,0,M.edge);
const win=(x,y,z,w,h,ry)=>{const g=new THREE.Group();box(g,w,h,.06,0,0,0,M.woodD);box(g,w-.14,h-.14,.04,0,0,.02,M.wood); // 6 窗框+暖光窗
  box(g,w-.3,h-.3,.03,0,0,.04,M.glass);box(g,w+.08,.07,.16,0,h/2+.04,.04,M.base);box(g,w+.08,.07,.16,0,-h/2-.04,.04,M.base);
  g.position.set(x,y,z);g.rotation.y=ry;house.add(g)};
win(-.78,1.55,1.13,.82,1,0);win(.72,1.55,1.13,.82,1,0);win(1.56,1.55,-.35,.8,.95,Math.PI/2);
box(house,.78,1.55,.1,-1.05,.9,1.18,M.woodD);box(house,.62,1.4,.08,-1.05,.86,1.24,M.wood); // 7 门（框+木门）
box(house,.9,.12,.36,-1.05,1.72,1.3,M.base);box(house,.8,.1,.4,-1.05,.06,1.48,M.base); // 门楣+门前石阶
box(house,.46,1,.46,1.15,3.15,-.3,M.edge);box(house,.6,.1,.6,1.15,3.68,-.3,M.base);   // 8 烟囱+压顶
for(let p=0;p<6;p++)box(house,.06,.52,.06,-1.75+p*.7,.26,0,M.woodD);box(house,3.8,.06,.08,0,.52,0,M.wood);box(house,3.8,.05,.06,0,.18,0,M.woodD); // 9 栏杆 6 柱+2 横杆
box(house,.1,.28,.1,1.6,2.1,1.2,M.metal);box(house,.34,.06,.34,1.6,2.28,1.2,M.edge);box(house,.22,.18,.22,1.6,2.16,1.2,M.glass); // 10 壁灯（金属+遮雨檐+暖光）
// 细节原则：薄板叠层（檐口/门楣/压顶/窗台）+ 出檐宽度 > 墙宽 + 窗框/暖光分层 + 错层体量；材质分区石/顶/木/金属/暖光。

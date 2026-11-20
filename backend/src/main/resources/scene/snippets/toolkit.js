/* 通用工具（每个场景都可以复用）：可复现随机数、程序化贴图、光晕、构件盒子、材质、渐变天空、三点布光。
 * 约定：所有函数显式接收 THREE（来自 ctx.THREE），不访问 document，不加载外部资源。 */

/** 可复现的伪随机数（同一 seed 每次渲染一致，避免截图之间画面跳变）。返回 () => [0, 1)。 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 程序化贴图：pixelAt(x, y) 返回 [r, g, b, a]（0–255）。沙箱里没有 canvas，统一用 DataTexture。 */
function makeDataTexture(THREE, size, pixelAt) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      data.set(pixelAt(x, y), (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // DataTexture 默认最近邻采样、不生成 mipmap，远处会变成马赛克/闪烁；size 用 2 的幂才能开 mipmap。
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** 柔和渐变斑：中心亮、边缘衰减到 0（地面光斑、湿地倒影、雾团）；要拉长就把贴它的平面做成长条。 */
function makeSoftSpotTexture(THREE, { falloff = 1.6 } = {}) {
  return makeDataTexture(THREE, 64, (x, y) => {
    const distance = Math.min(1, Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32);
    return [255, 255, 255, Math.round(Math.pow(1 - distance, falloff) * 255)];
  });
}

/** 柔和圆形光晕贴图（给暖窗、路灯、灯笼加 Sprite 光晕用）。 */
function makeGlowTexture(THREE) {
  return makeDataTexture(THREE, 64, (x, y) => {
    const distance = Math.min(1, Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32);
    return [255, 240, 220, Math.round(Math.pow(1 - distance, 2.2) * 255)];
  });
}

/** 在 parent 上加一个加色混合的光晕 Sprite。 */
function addGlow(THREE, parent, glowTexture, { position, size, color, opacity = 0.8 }) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  sprite.position.set(position[0], position[1], position[2]);
  sprite.scale.set(size, size, 1);
  parent.add(sprite);
  return sprite;
}

/** 标准材质简写：石 roughness 0.85–0.95、木 0.7–0.8、金属 metalness 0.6–0.8 + roughness 0.3–0.4。 */
function makeMaterial(THREE, color, roughness, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

/** 发光材质（暖窗、霓虹、灯笼）：emissiveIntensity 1.5–3 才能在截图里读出来。 */
function makeGlowMaterial(THREE, color, emissive, emissiveIntensity) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.4 });
}

/** 构件盒子：size = [宽, 高, 深]（米），position = [x, y, z]；薄板叠层是低多边形细节的主要手段。 */
function addBox(THREE, parent, size, position, material, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

/** 渐变天空穹顶：顶部 top → 地平线 horizon（顶点色，不受雾影响），避免画面上方是一块死色。 */
function makeSkyDome(THREE, { top, horizon, radius = 120 }) {
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const topColor = new THREE.Color(top);
  const horizonColor = new THREE.Color(horizon);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const height = Math.max(0, positions.getY(index) / radius);
    const color = horizonColor.clone().lerp(topColor, Math.pow(height, 0.6));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}

/** 三点布光：暖主光（侧前方低角度）+ 冷环境光 + 冷轮廓光（背侧），强度比约 3 : 1 : 1.5。 */
function addLightRig(THREE, scene, { keyColor = 0xffe2b8, keyIntensity = 2.2, keyPosition = [-7, 6.5, 4.5], ambientColor = 0x8fa6b4, ambientIntensity = 0.9, rimColor = 0x9fc6e0, rimIntensity = 1.1, rimPosition = [6, 4, -8] } = {}) {
  const key = new THREE.DirectionalLight(keyColor, keyIntensity);
  key.position.set(keyPosition[0], keyPosition[1], keyPosition[2]);
  const ambient = new THREE.AmbientLight(ambientColor, ambientIntensity);
  const rim = new THREE.DirectionalLight(rimColor, rimIntensity);
  rim.position.set(rimPosition[0], rimPosition[1], rimPosition[2]);
  scene.add(key, ambient, rim);
  return { key, ambient, rim };
}

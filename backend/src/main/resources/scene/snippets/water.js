/* 可读水面（海、湖、河、港湾）：几何波动 + 程序化法线 + 两层反向滚动的波纹 + 岸线泡沫 + 一次性反射。
 * 依赖 toolkit：makeDataTexture、makeMaterial、makeRandom。用法：
 *   const water = makeReadableWater(THREE, { width: 38, depth: 19, color: 0x435e66 });
 *   water.group.position.set(0, 0.06, -1.2); scene.add(water.group);
 *   ctx.onFrame((dt) => { elapsed += dt; water.update(elapsed, ctx.renderer, scene); }); */
// 海：默认值；湖/池塘：waveScale 0.1–0.2、rippleStrength 0.2、foam: false（静水的波峰会排成整齐的明暗条纹，要压得很低）。
function makeReadableWater(THREE, { width = 38, depth = 19, color = 0x435e66, foamColor = 0xffffff, waveScale = 1, rippleStrength = 1, foam = true, seed = 7 } = {}) {
  const group = new THREE.Group();

  // 1) 几何波动：约 0.5m 一格，三层 sin 叠加（振幅单位米，速度单位 rad/s）。
  const geometry = new THREE.PlaneGeometry(width, depth, Math.round(width * 2), Math.round(depth * 2));
  const positions = geometry.attributes.position;
  const restXY = Array.from({ length: positions.count }, (_, index) => [positions.getX(index), positions.getY(index)]);
  const material = makeMaterial(THREE, color, 0.2, 0.55, { envMapIntensity: 0.9 });
  const surface = new THREE.Mesh(geometry, material);
  surface.rotation.x = -Math.PI / 2;
  group.add(surface);

  // 2) 程序化法线贴图：给高光加细碎纹理，避免"一块玻璃"。
  // 高度场：5 组不同方向、不同频率的正弦叠加（频率取整周期，保证贴图无缝平铺），看起来像碎波而不是整齐条纹。
  const TAU = Math.PI * 2;
  const octaves = [[3, 1, 0.34], [-2, 4, 0.26], [5, -3, 0.18], [1, 7, 0.12], [-7, -5, 0.1]];
  const heightAt = (x, y) => octaves.reduce((sum, [fx, fy, amplitude], index) => sum + Math.sin(((x * fx + y * fy) / 128) * TAU + index * 1.7) * amplitude, 0);
  const normalMap = makeDataTexture(THREE, 128, (x, y) => {
    const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * 9;
    const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 9;
    const length = Math.hypot(dx, dy, 1);
    return [Math.round((-dx / length) * 127.5 + 127.5), Math.round((-dy / length) * 127.5 + 127.5), 235, 255];
  });
  // 法线贴图按世界尺寸平铺（约 7m 一格）；强度按 rippleStrength 的平方衰减——静水像镜子，天空/地面的反差会把一点点法线扰动放大成条纹。
  normalMap.repeat.set(width / 7, depth / 7);
  material.normalMap = normalMap;
  const normalStrength = 0.75 * rippleStrength * rippleStrength;
  material.normalScale = new THREE.Vector2(normalStrength, normalStrength);

  // 3) 两层波纹条纹：加色混合、低不透明度（0.05–0.1），反向滚动。
  const makeRipple = (density, opacity, lift) => {
    const stripes = makeDataTexture(THREE, 128, (x, y) => {
      const phase = (y / 128) * density + Math.sin((x / 128) * Math.PI * 3) * 4;
      const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      return [228, 242, 247, Math.round(Math.pow(wave, 3.2) * 210)];
    });
    stripes.repeat.set((density / 8) * (width / 38), 2 * (depth / 19));
    const layer = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: stripes, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    layer.rotation.x = -Math.PI / 2;
    layer.position.y = lift;
    group.add(layer);
    return layer;
  };
  const rippleNear = makeRipple(26, 0.09 * rippleStrength, 0.03);
  const rippleFar = makeRipple(48, 0.05 * rippleStrength, 0.035);

  // 4) 岸线泡沫：随机圆点贴图贴在一段圆弧上（位置按岸线调整）。
  const random = makeRandom(seed);
  const foamDots = Array.from({ length: 150 }, () => [random() * 128, random() * 128, 0.8 + random() * 3.4]);
  const foamTexture = makeDataTexture(THREE, 128, (x, y) => {
    const coverage = foamDots.reduce((best, [cx, cy, radius]) => Math.max(best, 1 - Math.hypot(x - cx, y - cy) / radius), 0);
    return [255, 255, 255, coverage > 0 ? Math.round(coverage * 190 + 40) : 0];
  });
  const foamArc = new THREE.Mesh(
    new THREE.TorusGeometry(width * 0.12, 0.22, 4, 40, Math.PI * 0.62),
    new THREE.MeshBasicMaterial({ map: foamTexture, color: foamColor, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  foamArc.rotation.set(-Math.PI / 2, 0, 1.75);
  foamArc.position.set(-width * 0.14, 0.06, -0.4);
  foamArc.visible = foam;
  group.add(foamArc);

  // 5) 受控反射：CubeCamera 不会自己更新，第一次 update 时拍一次环境（不要每帧拍，太贵）。
  const cubeTarget = new THREE.WebGLCubeRenderTarget(128);
  const cubeCamera = new THREE.CubeCamera(0.2, 60, cubeTarget);
  cubeCamera.position.y = 0.4;
  group.add(cubeCamera);
  material.envMap = cubeTarget.texture;
  let reflected = false;

  const update = (elapsed, renderer, scene) => {
    restXY.forEach(([x, y], index) => {
      const radial = Math.hypot(x, y);
      positions.setZ(index, (Math.sin(x * 0.55 + elapsed * 0.9) * 0.075 + Math.sin(y * 0.8 - elapsed * 1.25) * 0.052 + Math.sin(radial * 1.6 - elapsed * 1.8) * 0.018) * waveScale);
    });
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    rippleNear.material.map.offset.set(elapsed * 0.012, elapsed * 0.006);
    rippleFar.material.map.offset.set(-elapsed * 0.02, elapsed * 0.01);
    normalMap.offset.set(elapsed * 0.02, elapsed * 0.012);
    foamArc.material.opacity = 0.72 + Math.sin(elapsed * 1.2) * 0.12;
    if (!reflected && renderer) {
      surface.visible = false;
      cubeCamera.update(renderer, scene);
      surface.visible = true;
      reflected = true;
    }
  };

  return { group, surface, update };
}

/* 雨夜湿街：高光泽路面 + 水洼 + 灯光在湿面拉长的反射光带 + 雨丝（LineSegments）。
 * 依赖 toolkit：makeMaterial、makeRandom、makeSoftSpotTexture。用法：
 *   const street = makeWetStreet(THREE, { width: 28, depth: 24 }); scene.add(street.group);
 *   const rain = makeRain(THREE, { count: 220 }); scene.add(rain.lines);
 *   ctx.onFrame((dt) => { elapsed += dt; street.update(elapsed, ctx.renderer, scene); rain.update(elapsed); }); */
function makeWetStreet(THREE, { width = 28, depth = 24, color = 0x2b3a42, puddles = [[-2.2, 2.4, 3.6, 1.5], [1.9, 0.9, 2.4, 1.0], [0.2, 4.6, 4.4, 1.6]], streaks = [[0xff6f9f, -2.7, 3.2, 1.4, 4.4, 0.15], [0xffc78d, 4.1, 3.0, 1.6, 5.0, 0.13]] } = {}) {
  const group = new THREE.Group();
  const cubeTarget = new THREE.WebGLCubeRenderTarget(128);
  const cubeCamera = new THREE.CubeCamera(0.2, 40, cubeTarget);
  cubeCamera.position.set(0, 0.4, 0);
  group.add(cubeCamera);

  // 路面：低粗糙度 + 高金属度 + 环境反射，才能读出"湿"。
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), makeMaterial(THREE, color, 0.16, 0.72, { envMap: cubeTarget.texture, envMapIntensity: 0.85 }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // 水洼：不规则椭圆（不要直角矩形），比路面更光滑；金属度别太高，否则夜里反射环境发黑、像个洞。略高 1.5cm 防止 z-fighting。
  const puddleMeshes = puddles.map(([x, z, w, d], index) => {
    const outline = new THREE.Shape();
    const points = 18;
    Array.from({ length: points + 1 }, (_, step) => {
      const angle = (step / points) * Math.PI * 2;
      const wobble = 1 + 0.12 * Math.sin(angle * 3 + index) + 0.06 * Math.sin(angle * 5 + index * 2);
      const px = Math.cos(angle) * (w / 2) * wobble;
      const py = Math.sin(angle) * (d / 2) * wobble;
      return step === 0 ? outline.moveTo(px, py) : outline.lineTo(px, py);
    });
    const puddle = new THREE.Mesh(new THREE.ShapeGeometry(outline), makeMaterial(THREE, 0x34464f, 0.05, 0.35, { envMap: cubeTarget.texture, envMapIntensity: 1.2 }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, 0.015, z);
    group.add(puddle);
    return puddle;
  });

  // 反射光带：[颜色, x, z, 宽, 长, 不透明度]，放在光源正下方、朝相机方向拉长；用渐变贴图让四边柔和衰减。
  const streakTexture = makeSoftSpotTexture(THREE, { falloff: 1.4 });
  streaks.forEach(([streakColor, x, z, w, length, opacity]) => {
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.6, length * 1.3),
      new THREE.MeshBasicMaterial({ map: streakTexture, color: streakColor, transparent: true, opacity: Math.min(1, opacity * 2.5), depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    streak.rotation.x = -Math.PI / 2;
    streak.position.set(x, 0.05, z);
    group.add(streak);
  });

  let reflected = false;
  const update = (elapsed, renderer, scene) => {
    puddleMeshes.forEach((puddle, index) => {
      puddle.material.envMapIntensity = 0.9 + Math.sin(elapsed * 1.2 + index) * 0.12;
    });
    if (!reflected && renderer) {
      cubeCamera.update(renderer, scene);
      reflected = true;
    }
  };
  return { group, update };
}

/** 雨丝：每根是一条 0.5m 的斜线，循环下落；count 200–400 足够，不要用大量球体当雨滴。 */
function makeRain(THREE, { count = 220, spanX = 22, spanZ = 14, centerZ = 3, height = 7.5, color = 0xa9c6d8, seed = 11 } = {}) {
  const random = makeRandom(seed);
  const drops = Array.from({ length: count }, () => [(random() - 0.5) * spanX, random() * height, centerZ + (random() - 0.5) * spanZ]);
  const positions = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);

  const update = (elapsed) => {
    drops.forEach(([x, startY, z], index) => {
      const y = height - ((height - startY + elapsed * 4.2) % height);
      positions.set([x, y + 0.5, z, x + 0.06, y, z], index * 6);
    });
    geometry.attributes.position.needsUpdate = true;
    material.opacity = 0.28 + Math.sin(elapsed * 2.1) * 0.06;
  };
  update(0);
  return { lines, update };
}

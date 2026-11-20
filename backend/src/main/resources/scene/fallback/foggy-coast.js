function build(ctx) {
  const THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
  scene.background = new THREE.Color(0x9fb2ba);
  scene.fog = new THREE.FogExp2(0x9fb2ba, 0.032);
  camera.fov = 50; camera.position.set(0, 2.55, 10.2); camera.lookAt(0, 1.45, -1.2); camera.updateProjectionMatrix();
  if (ctx.renderer) { ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping; ctx.renderer.toneMappingExposure = 1.08; }
  const dataTex = (size, fill) => {
    const data = new Uint8Array(size * size * 4);
    fill((x, y, r, g, b, a) => { const o = (y * size + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a; });
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const stripe = (density, amplitude, r, g, b) => dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
      const phase = (y / 128) * density + Math.sin((x / 128) * Math.PI * 3) * amplitude;
      const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      put(x, y, 196, 224, 234, Math.round(Math.pow(wave, 3.2) * 210));
    }
  });
  const glowTex = dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
      const d = Math.min(1, Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64);
      put(x, y, 255, 236, 205, Math.round(Math.pow(1 - d, 2.2) * 255));
    }
  });
  const foamTex = () => {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let i = 0; i < 150; i += 1) {
      const cx = Math.random() * size, cy = Math.random() * size, rad = 0.8 + Math.random() * 3.4;
      for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(size - 1, Math.ceil(cy + rad)); y += 1)
        for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(size - 1, Math.ceil(cx + rad)); x += 1) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= rad) { const o = (y * size + x) * 4; data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = Math.round((1 - d / rad) * 190 + 40); }
        }
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const mistTex = () => dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) {
      const a = Math.round(Math.pow(Math.sin((Math.PI * y) / 128), 1.6) * 210);
      for (let x = 0; x < 128; x += 1) put(x, y, 214, 228, 232, a);
    }
  });
  scene.add(new THREE.AmbientLight(0x9fb7c2, 1.05));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.25); key.position.set(-7, 6.5, 4.5); scene.add(key);
  const M = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mat = {
    rock: M(0x6d7d80, 0.92, 0.04), rockDark: M(0x536366, 0.95, 0.03), sand: M(0x9a9382, 0.98, 0.02),
    wall: M(0xa7a091, 0.86, 0.05), base: M(0x7f8987, 0.9, 0.06), roof: M(0x4d5a5e, 0.62, 0.18), edge: M(0x39464a, 0.55, 0.25),
    wood: M(0x7b5a3c, 0.72, 0.05), woodDark: M(0x5d4128, 0.76, 0.04), metal: M(0x3f4c51, 0.4, 0.72),
    glass: new THREE.MeshStandardMaterial({ color: 0xffcf8e, emissive: 0xffa04f, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.1 }),
    white: M(0xd9dcd4, 0.78, 0.05), red: M(0xa8453a, 0.7, 0.08),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffc06a, emissiveIntensity: 3.1, roughness: 0.35 }),
  };
  const box = (parent, w, h, d, x, y, z, m, ry = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; parent.add(mesh); return mesh;
  };
  const waterGeo = new THREE.PlaneGeometry(38, 19, 76, 38);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x435e66, roughness: 0.16, metalness: 0.55, envMapIntensity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.06, -1.2); scene.add(water);
  const waveBase = [];
  const pos = waterGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) waveBase.push({ x: pos.getX(i), y: pos.getY(i) });
  const animateWater = (t) => {
    for (let i = 0; i < pos.count; i += 1) {
      const b = waveBase[i], d = Math.hypot(b.x, b.y);
      pos.setZ(i, Math.sin(b.x * 0.55 + t * 0.9) * 0.075 + Math.sin(b.y * 0.8 - t * 1.25) * 0.052 + Math.sin(d * 1.6 - t * 1.8) * 0.018);
    }
    pos.needsUpdate = true; waterGeo.computeVertexNormals();
  };
  const cubeRT = new THREE.WebGLCubeRenderTarget(128);
  const cubeCam = new THREE.CubeCamera(0.2, 60, cubeRT);
  water.material.envMap = cubeRT.texture; water.material.needsUpdate = true;
  const normalTex = dataTex(128, (put) => {
    for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
      const h = (hx, hy) => Math.sin(hx * 0.16 + hy * 0.05) * 0.5 + Math.sin(hy * 0.21 - hx * 0.04) * 0.5;
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2.4;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 2.4;
      const length = Math.hypot(dx, dy, 1);
      put(x, y, Math.round((-dx / length) * 0.5 * 255 + 127.5), Math.round((-dy / length) * 0.5 * 255 + 127.5), 235, 255);
    }
  });
  normalTex.repeat.set(7, 4);
  water.material.normalMap = normalTex;
  water.material.normalScale = new THREE.Vector2(0.75, 0.75);
  water.material.roughness = 0.2;
  const ripple = (density, amp, opacity) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(38, 19), new THREE.MeshBasicMaterial({ map: stripe(density, amp, 228, 242, 247), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    mesh.material.map.repeat.set(density / 8, 2); mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0.085 + opacity * 0.05, -1.2); return mesh;
  };
  const rippleOne = ripple(26, 6, 0.09), rippleTwo = ripple(48, 3, 0.05);
  const foamMat = new THREE.MeshBasicMaterial({ map: foamTex(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const foamA = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.22, 4, 40, Math.PI * 0.62), foamMat);
  foamA.rotation.set(-Math.PI / 2, 0, 1.75); foamA.position.set(-5.4, 0.12, -1.6);
  scene.add(rippleOne, rippleTwo, foamA, cubeCam);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  [[-8.2, 0.35, -0.8, 2.6, 1.1], [-6.4, 0.2, 1.4, 1.7, 0.8], [7.9, 0.3, 0.3, 2.4, 1.0], [6.1, 0.18, 2.0, 1.5, 0.7], [-3.4, 0.12, 4.4, 0.9, 0.5], [3.2, 0.1, 4.9, 0.8, 0.45]].forEach((r, i) => {
    const mesh = new THREE.Mesh(rockGeo, i % 2 === 0 ? mat.rock : mat.rockDark);
    mesh.position.set(r[0], r[1], r[2]); mesh.scale.set(r[3], r[4], r[3] * 0.8); mesh.rotation.set(i * 0.6, i * 0.9, 0); scene.add(mesh);
  });
  const leftTerrace = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.0, 0.75, 9, 1), mat.rockDark);
  leftTerrace.position.set(-6.2, 0.35, -3.2); leftTerrace.scale.set(1.35, 1, 0.9); scene.add(leftTerrace);
  const lighthouse = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.05, 3.4, 12, 1), mat.white); tower.position.y = 1.7; lighthouse.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 1.0, 12, 1), mat.red); band.position.y = 3.9; lighthouse.add(band);
  const gallery = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.07, 6, 20), mat.metal); gallery.rotation.x = Math.PI / 2; gallery.position.y = 4.42; lighthouse.add(gallery);
  const lanternRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.72, 8, 1), mat.lantern); lanternRoom.position.y = 4.86; lighthouse.add(lanternRoom);
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.8, 8), mat.edge); roofCone.position.y = 5.58; lighthouse.add(roofCone);
  for (let post = 0; post < 8; post += 1) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), mat.metal);
    const angle = (post / 8) * Math.PI * 2; rail.position.set(Math.cos(angle) * 0.8, 4.62, Math.sin(angle) * 0.8); lighthouse.add(rail);
  }
  const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  lanternGlow.position.set(0, 4.86, 0); lanternGlow.scale.set(3.6, 3.6, 1); lighthouse.add(lanternGlow);
  lighthouse.position.set(-6.2, 0.72, -3.2); scene.add(lighthouse);
  const house = new THREE.Group();
  box(house, 3.5, 0.42, 2.7, 0, 0.21, 0, mat.base);
  for (let s = 0; s < 3; s += 1) box(house, 1.25 - s * 0.16, 0.16, 0.42, 0.15, 0.08 + s * 0.16, 1.62 + s * 0.34, mat.base);
  box(house, 3.1, 2.05, 2.25, 0, 1.45, 0, mat.wall);
  box(house, 1.4, 2.35, 1.1, -1.05, 1.6, -0.65, mat.wall);
  const roofS = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.16, 1.75), mat.roof); roofS.position.set(0, 2.82, 0.62); roofS.rotation.x = 0.42; house.add(roofS);
  const roofN = roofS.clone(); roofN.position.z = -0.62; roofN.rotation.x = -0.42; house.add(roofN);
  box(house, 4.12, 0.14, 0.28, 0, 3.18, 0, mat.edge);
  box(house, 4.0, 0.09, 0.12, 0, 2.52, 1.18, mat.edge); box(house, 4.0, 0.09, 0.12, 0, 2.52, -1.18, mat.edge);
  box(house, 0.12, 0.09, 2.45, -1.96, 2.52, 0, mat.edge); box(house, 0.12, 0.09, 2.45, 1.96, 2.52, 0, mat.edge);
  const windowAt = (x, y, z, w, h, ry) => {
    const g = new THREE.Group();
    box(g, w, h, 0.06, 0, 0, 0, mat.woodDark); box(g, w - 0.14, h - 0.14, 0.04, 0, 0, 0.02, mat.wood);
    box(g, w - 0.3, h - 0.3, 0.03, 0, 0, 0.04, mat.glass);
    box(g, w + 0.08, 0.07, 0.16, 0, h / 2 + 0.04, 0.04, mat.base); box(g, w + 0.08, 0.07, 0.16, 0, -h / 2 - 0.04, 0.04, mat.base);
    g.position.set(x, y, z); g.rotation.y = ry; house.add(g);
  };
  windowAt(-0.78, 1.55, 1.13, 0.82, 1.0, 0); windowAt(0.72, 1.55, 1.13, 0.82, 1.0, 0); windowAt(1.56, 1.55, -0.35, 0.8, 0.95, Math.PI / 2);
  box(house, 0.78, 1.55, 0.1, -1.05, 0.9, 1.18, mat.woodDark); box(house, 0.62, 1.4, 0.08, -1.05, 0.86, 1.24, mat.wood);
  box(house, 0.9, 0.12, 0.36, -1.05, 1.72, 1.3, mat.base); box(house, 0.8, 0.1, 0.4, -1.05, 0.06, 1.48, mat.base);
  const doorLamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc27a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  doorLamp.position.set(-1.05, 1.95, 1.32); doorLamp.scale.set(1.1, 1.1, 1); house.add(doorLamp);
  box(house, 0.46, 1.0, 0.46, 1.15, 3.15, -0.3, mat.edge); box(house, 0.6, 0.1, 0.6, 1.15, 3.68, -0.3, mat.base);
  for (let p = 0; p < 6; p += 1) box(house, 0.06, 0.52, 0.06, -1.75 + p * 0.7, 0.26, 0, mat.woodDark);
  box(house, 3.8, 0.06, 0.08, 0, 0.52, 0, mat.wood); box(house, 3.8, 0.05, 0.06, 0, 0.18, 0, mat.woodDark);
  box(house, 0.1, 0.28, 0.1, 1.6, 2.1, 1.2, mat.metal); box(house, 0.34, 0.06, 0.34, 1.6, 2.28, 1.2, mat.edge); box(house, 0.22, 0.18, 0.22, 1.6, 2.16, 1.2, mat.glass);
  const wallLamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc98c, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  wallLamp.position.set(1.6, 2.16, 1.32); wallLamp.scale.set(1.5, 1.5, 1); house.add(wallLamp);
  house.position.set(4.5, 0.72, -2.35); house.rotation.y = -0.32; scene.add(house);
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTex(), transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const mistLayer = (x, y, z, w, h, opacity) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mistMat.clone());
    mesh.material.opacity = opacity; mesh.position.set(x, y, z); scene.add(mesh);
  };
  mistLayer(0, 3.2, -14, 30, 8, 0.3); mistLayer(0, 2.2, -22, 40, 10, 0.22);
  let elapsed = 0, reflected = false;
  ctx.onFrame((delta) => {
    elapsed += delta;
    animateWater(elapsed);
    rippleOne.material.map.offset.set(elapsed * 0.012, elapsed * 0.006);
    rippleTwo.material.map.offset.set(-elapsed * 0.02, elapsed * 0.01);
    normalTex.offset.set(elapsed * 0.02, elapsed * 0.012);
    foamA.material.opacity = 0.72 + Math.sin(elapsed * 1.2) * 0.12;
    if (!reflected && ctx.renderer) { cubeCam.update(ctx.renderer, scene); reflected = true; }
  });
  ctx.addOrbitControls({ target: [0, 1.5, -1.2], minDistance: 5, maxDistance: 18, rotateSpeed: 0.42, zoomSpeed: 0.7 });
}

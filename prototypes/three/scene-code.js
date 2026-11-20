/*
 * Prototype scene code — deliberately written in the exact shape a generated
 * scene takes: one `function build(ctx)` that may only use the ctx API.
 *
 * Scene: a coastal memory shrine. The photo floats as a lit, tilted frame above
 * a dark polished floor, with sea-cold key light, a warm rim light, drifting
 * dust and a breathing halo. All geometry and materials are generated in code;
 * no external assets and no document access.
 */
function build(ctx) {
  const THREE = ctx.THREE;

  ctx.setBackground(0x080d12);
  ctx.scene.fog = new THREE.FogExp2(0x080d12, 0.045);

  const photoCount = ctx.photos.length;
  const frameWidth = photoCount <= 1 ? 2.75 : Math.max(1.55, 2.75 - (photoCount - 1) * 0.5);
  const frameSpacing = frameWidth + 0.35;
  const frameTotalWidth = Math.max(0, photoCount - 1) * frameSpacing;
  const spanWidth = frameTotalWidth + frameWidth;
  const cameraDistance = Math.max(4.55, 4.55 + (spanWidth - 2.75) * 0.55);
  ctx.camera.fov = 50;
  ctx.camera.position.set(cameraDistance * 0.29, 1.95, cameraDistance * 0.99);
  ctx.camera.lookAt(0, 1.55, 0);
  ctx.camera.updateProjectionMatrix();

  /* Lighting: cold sea light from the front-right, warm memory light behind. */
  ctx.scene.add(new THREE.AmbientLight(0x41586a, 1.15));

  const keyLight = new THREE.DirectionalLight(0xc2dcea, 1.75);
  keyLight.position.set(3.4, 4.6, 2.6);
  ctx.scene.add(keyLight);

  const rimLight = new THREE.PointLight(0xffb27a, 14, 10, 2);
  rimLight.position.set(-1.7, 2.7, -1.9);
  ctx.scene.add(rimLight);

  const fillLight = new THREE.PointLight(0x3d6b8a, 8, 12, 2);
  fillLight.position.set(2.6, 1.2, 1.4);
  ctx.scene.add(fillLight);

  /* Floor: dark polished stone that catches the key light. */
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c141b,
    roughness: 0.38,
    metalness: 0.32,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 72), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  ctx.scene.add(floor);

  /* A thin luminous seam in the floor keeps the frame anchored in space. */
  const seamMaterial = new THREE.MeshBasicMaterial({
    color: 0x5d8fab,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.035), seamMaterial);
  seam.rotation.x = -Math.PI / 2;
  seam.position.set(0, 0.006, 0.55);
  ctx.scene.add(seam);

  /* Photos: each photo becomes a lit memory frame in a shallow arc. */
  const frameGroup = new THREE.Group();
  ctx.scene.add(frameGroup);

  /* A soft radial glow texture generated from raw RGBA bytes (no DOM access). */
  const createGlowTexture = () => {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    const radius = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const distance = Math.min(1, Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius);
        const alpha = Math.round(Math.pow(1 - distance, 2.4) * 255);
        const offset = (y * size + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = alpha;
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  };
  const glowTexture = createGlowTexture();

  const createMemoryFrame = (photo) => {
    const group = new THREE.Group();
    const height = frameWidth / photo.aspect;

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(frameWidth + 0.14, height + 0.14, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x18232c, roughness: 0.52, metalness: 0.45 }),
    );
    group.add(backing);

    const photoMaterial = new THREE.MeshBasicMaterial({ map: photo.texture, toneMapped: false });
    const photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(frameWidth, height), photoMaterial);
    photoMesh.position.z = 0.045;
    photoMesh.userData.photoId = photo.id;
    group.add(photoMesh);

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(frameWidth * 1.9, height * 1.9),
      new THREE.MeshBasicMaterial({
        color: 0x8fb8d2,
        map: glowTexture,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    halo.position.z = -0.09;
    group.add(halo);

    return group;
  };

  const frames = ctx.photos.map((photo, index) => {
    const frame = createMemoryFrame(photo);
    const offsetX = index * frameSpacing - frameTotalWidth / 2;
    frame.position.set(offsetX, 1.62, 0);
    frame.rotation.y = offsetX * -0.045;
    frameGroup.add(frame);
    return frame;
  });

  /* Drifting dust: 240 points, cheap and calm. */
  const dustCount = 240;
  const dustPositions = new Float32Array(
    Array.from({ length: dustCount * 3 }, (unused, index) => {
      const axis = index % 3;
      if (axis === 0) return (Math.random() - 0.5) * 9;
      if (axis === 1) return 0.15 + Math.random() * 3.4;
      return -2.6 + Math.random() * 5.4;
    }),
  );
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: 0xa9cfe2,
      size: 0.018,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  ctx.scene.add(dust);

  /* Slow ambient motion: always gentle, never dizzying. */
  let elapsed = 0;
  ctx.onFrame((deltaSeconds) => {
    elapsed += deltaSeconds;
    dust.rotation.y = elapsed * 0.012;
    dust.position.y = Math.sin(elapsed * 0.24) * 0.03;
    frameGroup.rotation.y = Math.sin(elapsed * 0.12) * 0.01;
    frames.forEach((frame, index) => {
      frame.position.y = 1.62 + Math.sin(elapsed * 0.5 + index * 0.7) * 0.012;
    });
    rimLight.intensity = 13 + Math.sin(elapsed * 0.55) * 1.8;
    seamMaterial.opacity = 0.3 + Math.sin(elapsed * 0.4) * 0.06;
  });

  ctx.addOrbitControls({ target: [0, 1.55, 0], minDistance: 2.5, maxDistance: 14, rotateSpeed: 0.55, zoomSpeed: 0.8 });
}

/*
 * Scenario fixture: build(ctx) blocks the sandbox thread for ~12s.
 * Expected: this probes whether the parent-side 8s build watchdog can fire when
 * the generated code never yields. (If the iframe shares the renderer main
 * thread, the parent page freezes too — that is exactly what the probe records.)
 */
function build(ctx) {
  const THREE = ctx.THREE;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    /* deliberately block the event loop */
  }

  ctx.setBackground(0x0d0f18);
  ctx.camera.position.set(0, 1.6, 4);
  ctx.camera.lookAt(0, 1.4, 0);
  ctx.scene.add(new THREE.AmbientLight(0xffffff, 1));
  ctx.photos.forEach((photo) => {
    const height = 1.6 / photo.aspect;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, height),
      new THREE.MeshBasicMaterial({ map: photo.texture, toneMapped: false }),
    );
    mesh.position.set(0, 1.4, 0);
    mesh.userData.photoId = photo.id;
    ctx.scene.add(mesh);
  });
}

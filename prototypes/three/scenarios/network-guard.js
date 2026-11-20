/*
 * Scenario fixture: the scene works, but it also tries forbidden network access.
 * Expected: CSP blocks both attempts, the promises reject quietly (caught by the
 * scenario itself), the scene still builds, and SceneRuntime reports
 * networkAttempts > 0 so the hard gate can reject it.
 */
function build(ctx) {
  const THREE = ctx.THREE;

  fetch('https://example.com/scene-data.json').catch(() => {});
  const forbiddenImage = new Image();
  forbiddenImage.src = 'https://example.com/scene-texture.jpg';

  ctx.setBackground(0x0b1210);
  ctx.camera.position.set(0, 1.5, 3.6);
  ctx.camera.lookAt(0, 1.4, 0);
  ctx.scene.add(new THREE.AmbientLight(0xffffff, 1.2));

  ctx.photos.forEach((photo, index) => {
    const height = 1.5 / photo.aspect;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, height),
      new THREE.MeshBasicMaterial({ map: photo.texture, toneMapped: false }),
    );
    mesh.position.set(index * 1.8 - (ctx.photos.length - 1) * 0.9, 1.4, 0);
    mesh.userData.photoId = photo.id;
    ctx.scene.add(mesh);
  });
}

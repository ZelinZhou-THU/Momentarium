/*
 * Scenario fixture: build(ctx) throws immediately.
 * Expected: SceneRuntime reports error(code=BUILD_FAILED), runtime.errors non-empty,
 * no captures are produced.
 */
function build(ctx) {
  const THREE = ctx.THREE;
  ctx.setBackground(0x180d0d);
  ctx.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  throw new Error('scenario: build failed on purpose');
}

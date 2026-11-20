import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

// 使用运行时同一份 Three.js 与片段，不启动浏览器或调用模型。
const context = createContext({ console: { warn() {} } });
[
  '../../../frontend/public/vendor/three.min.js',
  '../../../backend/src/main/resources/scene/snippets/toolkit.js',
  '../../../backend/src/main/resources/scene/snippets/trees.js',
].forEach(path => runInContext(readFileSync(new URL(path, import.meta.url), 'utf8'), context));
const { THREE, makeBroadleafTree, makeForest, canPlaceTree } = context;

const vertices = object => {
  object.updateMatrixWorld(true);
  const meshes = [];
  object.traverse(child => { if (child.geometry) meshes.push(child); });
  return meshes.flatMap(mesh => Array.from({ length: mesh.geometry.attributes.position.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld),
  ));
};

test('阔叶树的选址半径覆盖不同种子、尺寸与旋转的实际顶点', () => {
  [5, 11, 31].flatMap(seed => [3.2, 5, 5.6].map(height => ({ seed, height }))).forEach(({ seed, height }) => {
    const tree = makeBroadleafTree(THREE, { seed, height });
    tree.rotation.y = 0.7;
    vertices(tree).forEach(point => assert.ok(
      Math.hypot(point.x, point.z) <= tree.userData.crownRadius + 1e-6,
      `seed=${seed}, height=${height}: 顶点超出选址半径`,
    ));
  });
});

test('曾被误放行的树同时被建筑避让和视线走廊检查拒绝', () => {
  const tree = makeBroadleafTree(THREE, { height: 5, seed: 5 });
  const crownRadius = tree.userData.crownRadius;
  assert.equal(canPlaceTree(3.9, 0, { crownRadius, avoid: [[0, 0, 2.3]] }), false);
  assert.equal(canPlaceTree(3.9, 0, { crownRadius, viewCorridors: [[0, -10, 0, 10, 2.3]] }), false);
  assert.equal(canPlaceTree(10, 0, { crownRadius, avoid: [[0, 0, 2.3]] }), true);
});

test('树林筛选后实际树冠不侵入建筑或视线走廊', () => {
  [5, 11, 31].forEach(seed => {
    const forest = makeForest(THREE, {
      count: 80, spread: 10, kind: 'mixed', seed,
      avoid: [[0, 0, 2.3]], viewCorridors: [[0, -10, 0, 10, 1]],
    });
    assert.ok(forest.children.length > 0, '应保留安全位置的树');
    vertices(forest).forEach(point => {
      assert.ok(Math.hypot(point.x, point.z) > 2.3, '树冠侵入建筑避让圆');
      assert.ok(Math.abs(point.x) > 1, '树冠侵入视线走廊');
    });
  });
});

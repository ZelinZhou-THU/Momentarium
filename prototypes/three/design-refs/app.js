/*
 * voxel vs smooth 对比实验 — 父页面控制器（独立原型，不依赖 Vite/React）。
 *
 * 同一组 3 张 fixtures 照片、同一相机/光照预算下，依次在 sandbox iframe 中执行
 * scenes/smooth.js 与 scenes/voxel.js 的 build(ctx)，各采集 2 个视角截图与运行时统计。
 * 页面自动模式：?auto=1 时顺序跑两版，结果挂在 window.__compareResult（Promise）。
 */
(function startCompareApp() {
  'use strict';

  const RUNTIME_VERSION = 1;
  const BUILD_TIMEOUT_MS = 8000;
  const CAPTURE_TIMEOUT_MS = 15000;
  const SANDBOX_CSP =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';";
  const VARIANT_LIMITS = { buildTimeoutMs: BUILD_TIMEOUT_MS, sessionLimitMs: 120000 };
  const PHOTO_SOURCES = [
    { id: 'fixture-synthetic-01', path: '../../../tests/fixtures/synthetic/sample-01-coast.jpg', caption: '退潮的礁石海岸' },
    { id: 'fixture-synthetic-02', path: '../../../tests/fixtures/synthetic/sample-02-coast.jpg', caption: '黄昏的海面' },
    { id: 'fixture-synthetic-03', path: '../../../tests/fixtures/synthetic/sample-03-coast.jpg', caption: '山间海岸的清晨' },
  ];
  const SCENES_ALL = [
    { key: 'foggy-coast', label: '雾中记忆档案馆', sourcePath: '../../../backend/src/main/resources/scene/fallback/foggy-coast.js' },
    { key: 'rainy-street', label: '雨夜街角', sourcePath: './scenes/rainy-street.js' },
    { key: 'interior-hall', label: '室内记忆厅', sourcePath: './scenes/interior-hall.js' },
  ];
  const CAPTURE_VIEWS = [
    { label: '初始视角', azimuthDeg: 0, elevationDeg: 0 },
    { label: '方位角 +35°', azimuthDeg: 35, elevationDeg: 0 },
  ];

  const searchParams = new URLSearchParams(window.location.search);
  const autoRun = searchParams.get('auto') === '1';
  const requestedScenes = searchParams.get('scenes');
  const SCENES = requestedScenes === null ? SCENES_ALL : SCENES_ALL.filter((scene) => requestedScenes.split(',').includes(scene.key));
  if (SCENES.length === 0) throw new Error('no scenes selected');

  const state = {
    compareResult: null,
    resources: null,
  };

  const byId = (id) => document.getElementById(id);

  const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

  function appendLog(message) {
    const item = document.createElement('li');
    const time = new Date().toISOString().slice(11, 23);
    item.textContent = `[${time}] ${message}`;
    byId('log-list').append(item);
    console.log(`[compare] ${message}`);
  }

  function setStatus(text) {
    byId('status-line').textContent = text;
  }

  /* ----------------------------- 资源加载 ----------------------------- */

  async function loadText(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`加载失败 ${path}: HTTP ${response.status}`);
    return response.text();
  }

  async function preparePhoto(source) {
    const response = await fetch(source.path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`加载照片失败 ${source.path}: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2d 不可用');
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => (result === null ? reject(new Error('toBlob 失败')) : resolve(result)),
          'image/jpeg',
          0.82,
        );
      });
      return {
        id: source.id,
        caption: source.caption,
        width,
        height,
        aspect: width / height,
        mimeType: 'image/jpeg',
        buffer: await blob.arrayBuffer(),
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
      };
    } finally {
      bitmap.close();
    }
  }

  async function loadResources() {
    if (state.resources !== null) return state.resources;
    setStatus('加载 three / runtime / fixtures 照片…');
    const loaded = await Promise.all([
      loadText('../vendor/three.min.js'),
      loadText('../runtime.js'),
      ...SCENES.map((scene) => loadText(scene.sourcePath)),
      ...PHOTO_SOURCES.map(preparePhoto),
    ]);
    const threeSource = loaded[0];
    const runtimeSource = loaded[1];
    const sceneSources = loaded.slice(2, 2 + SCENES.length);
    const photos = loaded.slice(2 + SCENES.length);
    const sources = Object.fromEntries(SCENES.map((scene, index) => [scene.key, sceneSources[index]]));
    state.resources = { threeSource, runtimeSource, sources, photos };
    appendLog(
      `资源就绪：three=${threeSource.length}B runtime=${runtimeSource.length}B photos=${photos
        .map((photo) => `${photo.id}:${photo.width}x${photo.height}`)
        .join(', ')}`,
    );
    return state.resources;
  }

  /* ------------------------------ 沙箱会话 ---------------------------- */

  function buildSrcdoc(threeSource, runtimeSource) {
    if (threeSource.includes('</script') || runtimeSource.includes('</script')) {
      throw new Error('内联脚本含闭合序列，拒绝组装 srcdoc');
    }
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`,
      '<style>html,body{margin:0;height:100%;overflow:hidden;background:#0a1118;}canvas{display:block;}</style>',
      '</head>',
      '<body>',
      `<script>${threeSource}</script>`,
      `<script>${runtimeSource}</script>`,
      '</body>',
      '</html>',
    ].join('\n');
  }

  function waitForFrameLoad(frame, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('iframe 加载超时')), timeoutMs);
      frame.addEventListener(
        'load',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  function waitForMessage(frame, runId, types, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error(`等待 ${types.join('/')} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      const onMessage = (event) => {
        if (event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!isRecord(data) || typeof data.type !== 'string') return;
        if (data.runId !== runId) return;
        if (data.type === 'error') {
          clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          const message = new Error(`沙箱错误 ${data.code}: ${data.message}`);
          message.code = data.code;
          reject(message);
          return;
        }
        if (!types.includes(data.type)) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data);
      };
      window.addEventListener('message', onMessage);
    });
  }

  async function runVariant(variant, resources) {
    const runId = `compare-${variant.key}-${Date.now().toString(36)}`;
    appendLog(`[${variant.key}] 开始：创建 sandbox iframe`);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('title', `对比场景 ${variant.label}`);
    iframe.className = 'sandbox-frame';
    iframe.srcdoc = buildSrcdoc(resources.threeSource, resources.runtimeSource);
    for (const other of document.querySelectorAll('.sandbox-frame')) other.remove();
    byId('stage').appendChild(iframe);
    await waitForFrameLoad(iframe, 10000);

    const photos = resources.photos.map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      aspect: photo.aspect,
      mimeType: photo.mimeType,
      buffer: photo.buffer.slice(0),
    }));
    const builtPromise = waitForMessage(iframe, runId, ['built'], BUILD_TIMEOUT_MS);
    iframe.contentWindow.postMessage(
      {
        type: 'init',
        runId,
        runtimeVersion: RUNTIME_VERSION,
        photos,
        code: resources.sources[variant.key],
        limits: VARIANT_LIMITS,
      },
      '*',
      photos.map((photo) => photo.buffer),
    );
    const built = await builtPromise;
    appendLog(`[${variant.key}] built：buildMs=${built.buildMs} texturesMs=${built.texturesMs}`);

    const capturesPromise = waitForMessage(iframe, runId, ['captures'], CAPTURE_TIMEOUT_MS);
    iframe.contentWindow.postMessage(
      {
        type: 'capture',
        runId,
        requestId: `${runId}-capture`,
        views: CAPTURE_VIEWS.map((view) => ({ azimuthDeg: view.azimuthDeg, elevationDeg: view.elevationDeg })),
      },
      '*',
    );
    const captures = await capturesPromise;
    appendLog(
      `[${variant.key}] captures：images=${captures.images.length} fps=${captures.runtime.fps} calls=${captures.runtime.drawStats.calls} tris=${captures.runtime.drawStats.triangles}`,
    );

    const result = {
      key: variant.key,
      label: variant.label,
      codeLength: resources.sources[variant.key].length,
      built,
      views: captures.images.map((image, index) => ({
        label: CAPTURE_VIEWS[index] ? CAPTURE_VIEWS[index].label : `view-${index}`,
        dataUrl: image.dataUrl,
        width: image.width,
        height: image.height,
      })),
      runtime: captures.runtime,
    };
    iframe.remove();
    return result;
  }

  /* ------------------------------ 主流程 ------------------------------ */

  async function runCompare() {
    const resources = await loadResources();
    const results = {};
    for (const variant of SCENES) {
      setStatus(`渲染 ${variant.label}…`);
      results[variant.key] = await runVariant(variant, resources);
    }
    const compareResult = {
      generatedAt: new Date().toISOString(),
      photos: resources.photos.map((photo) => ({
        id: photo.id,
        width: photo.width,
        height: photo.height,
        aspect: Math.round(photo.aspect * 1000) / 1000,
        sourceWidth: photo.sourceWidth,
        sourceHeight: photo.sourceHeight,
      })),
      captureViews: CAPTURE_VIEWS,
      variants: results,
    };
    state.compareResult = compareResult;
    renderResults(compareResult);
    setStatus('对比实验完成');
    appendLog('两版场景均完成渲染与截图');
    return compareResult;
  }

  /* ------------------------------- UI --------------------------------- */

  function metricRow(variant) {
    const runtime = variant.runtime;
    return (
      `<tr><td>${variant.label}</td>` +
      `<td>${runtime.buildMs}</td><td>${runtime.fps ?? 'n/a'}</td>` +
      `<td>${runtime.drawStats.calls}</td><td>${runtime.drawStats.triangles}</td>` +
      `<td>${runtime.photoIdsUsed.length}/${runtime.photoCount}</td><td>${runtime.networkAttempts}</td>` +
      `<td>${runtime.errors.length}</td></tr>`
    );
  }

  function renderResults(compareResult) {
    byId('metrics-body').innerHTML = Object.values(compareResult.variants)
      .map((variant) => metricRow(variant))
      .join('');
    byId('captures').innerHTML = Object.values(compareResult.variants)
      .map((variant) =>
        variant.views
          .map(
            (view) =>
              `<figure><img src="${view.dataUrl}" alt="${variant.label} ${view.label}" />` +
              `<figcaption>${variant.label} · ${view.label} · ${view.width}x${view.height}</figcaption></figure>`,
          )
          .join(''),
      )
      .join('');
    byId('result-section').hidden = false;
  }

  function boot() {
    byId('run-button').addEventListener('click', () => {
      void runCompare().catch((error) => {
        setStatus(`失败：${error.message}`);
        appendLog(`失败：${error.message}`);
      });
    });
    window.__compare = { run: runCompare, state };
    if (autoRun) {
      window.__compareResult = runCompare().catch((error) => ({
        failed: true,
        message: error instanceof Error ? error.message : String(error),
      }));
    } else {
      setStatus('点击“开始对比”运行两版场景');
    }
  }

  boot();
})();

/*
 * 参考片段评审画廊（独立原型，不依赖 Vite/React）。
 *
 * 片段源文件只有一份：backend/src/main/resources/scene/snippets/（子代码提示词按题面从这里挑片段）。
 * 每个演示 = toolkit + 用到的片段 + snippet-demos/<key>.demo.js，按提示词要求的方式拼进一个 function build(ctx)，
 * 在与 index.html 相同的 sandbox iframe 里渲染，采集 2 个视角截图与运行时统计；点卡片可进入可交互的实时预览并查看源码。
 * ?auto=1 时自动跑全部演示，结果挂在 window.__snippetResult（Promise），供 probe 截图留证。
 */
(function startSnippetGallery() {
  'use strict';

  const RUNTIME_VERSION = 1;
  const BUILD_TIMEOUT_MS = 8000;
  const CAPTURE_TIMEOUT_MS = 15000;
  const SNIPPET_ROOT = '../../../backend/src/main/resources/scene/snippets/';
  const SANDBOX_CSP =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';";
  const PHOTO_SOURCE = { id: 'fixture-synthetic-01', path: '../../../tests/fixtures/synthetic/sample-01-coast.jpg' };
  const CAPTURE_VIEWS = [
    { label: '初始视角', azimuthDeg: 0, elevationDeg: 0 },
    { label: '方位角 +35°', azimuthDeg: 35, elevationDeg: 0 },
  ];
  const DEMOS = [
    { key: 'toolkit', label: '通用工具（天空 / 布光 / 构件 / 光晕）', uses: [], group: '单个片段' },
    { key: 'water', label: '可读水面', uses: ['water'], group: '单个片段' },
    { key: 'lighthouse', label: '灯塔地标', uses: ['lighthouse'], group: '单个片段' },
    { key: 'cottage', label: '低多边形小屋（10 构件）', uses: ['cottage'], group: '单个片段' },
    { key: 'wet-street', label: '雨夜湿街 + 雨丝', uses: ['wet-street'], group: '单个片段' },
    { key: 'street-building', label: '街角建筑', uses: ['street-building'], group: '单个片段' },
    { key: 'street-lamp', label: '路灯', uses: ['street-lamp'], group: '单个片段' },
    { key: 'interior-light', label: '室内光（房间 + 天窗光束 + 尘粒）', uses: ['interior-light'], group: '单个片段' },
    { key: 'terrain', label: '自然地形（地形 + 岩石）', uses: ['terrain'], group: '单个片段' },
    { key: 'trees', label: '树（阔叶 + 针叶 + 混合树林）', uses: ['trees'], group: '单个片段' },
    { key: 'combo-coast', label: '组合：雾中海岸', uses: ['water', 'lighthouse', 'cottage', 'terrain'], group: '组合示例（模拟模型拼装）' },
    { key: 'combo-rainy-street', label: '组合：雨夜街角', uses: ['wet-street', 'street-building', 'street-lamp'], group: '组合示例（模拟模型拼装）' },
    { key: 'combo-mountain-cabin', label: '组合：山间木屋清晨', uses: ['terrain', 'trees', 'cottage', 'water'], group: '组合示例（模拟模型拼装）' },
    { key: 'combo-hillside-cottage', label: '组合：绿坡小屋（树不挡门窗）', uses: ['terrain', 'trees', 'cottage'], group: '组合示例（模拟模型拼装）' },
  ];

  const autoRun = new URLSearchParams(window.location.search).get('auto') === '1';
  const state = { resources: null, results: {} };
  const byId = (id) => document.getElementById(id);
  const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
  const byteLength = (text) => new TextEncoder().encode(text).length;
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

  function setStatus(text) {
    byId('status-line').textContent = text;
  }

  async function loadText(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`加载失败 ${path}: HTTP ${response.status}`);
    return response.text();
  }

  async function preparePhoto(source) {
    const response = await fetch(source.path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`加载照片失败 ${source.path}: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((result) => (result === null ? reject(new Error('toBlob 失败')) : resolve(result)), 'image/jpeg', 0.8),
    );
    return { id: source.id, width: canvas.width, height: canvas.height, aspect: canvas.width / canvas.height, mimeType: 'image/jpeg', buffer: await blob.arrayBuffer() };
  }

  /** 与子代码提示词要求一致：辅助函数原样写进 build(ctx) 函数体，再写场景本身。 */
  function assembleBuild(snippetSources, demoSource) {
    return [
      'function build(ctx) {',
      '  const THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;',
      ...snippetSources,
      demoSource,
      '}',
    ].join('\n');
  }

  async function loadResources() {
    if (state.resources !== null) return state.resources;
    setStatus('加载 three / runtime / 片段 / 演示…');
    const manifest = JSON.parse(await loadText(`${SNIPPET_ROOT}manifest.json`));
    const entries = [manifest.toolkit, ...manifest.snippets];
    const [threeSource, runtimeSource, photo, ...rest] = await Promise.all([
      loadText('../vendor/three.min.js'),
      loadText('../runtime.js'),
      preparePhoto(PHOTO_SOURCE),
      ...entries.map((entry) => loadText(`${SNIPPET_ROOT}${entry.file}`)),
      ...DEMOS.map((demo) => loadText(`./snippet-demos/${demo.key}.demo.js`)),
    ]);
    const snippets = Object.fromEntries(entries.map((entry, index) => [entry.id, { ...entry, source: rest[index] }]));
    const demos = Object.fromEntries(
      DEMOS.map((demo, index) => {
        const demoSource = rest[entries.length + index];
        const parts = ['toolkit', ...demo.uses].map((id) => snippets[id].source);
        return [demo.key, { ...demo, demoSource, code: assembleBuild(parts, demoSource) }];
      }),
    );
    state.resources = { threeSource, runtimeSource, photo, snippets, demos };
    renderBudget(state.resources);
    return state.resources;
  }

  /* ------------------------------ 沙箱会话 ---------------------------- */

  function buildSrcdoc(threeSource, runtimeSource) {
    return [
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
      `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`,
      '<style>html,body{margin:0;height:100%;overflow:hidden;background:#0a1118;}canvas{display:block;}</style>',
      `</head><body><script>${threeSource}</script><script>${runtimeSource}</script></body></html>`,
    ].join('\n');
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
        if (!isRecord(data) || data.runId !== runId) return;
        if (data.type === 'error') {
          clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          reject(new Error(`沙箱错误 ${data.code}: ${data.message}`));
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

  /** 在 host 里起一个沙箱并 build；返回 iframe 与 runId（调用方决定截图还是留着交互）。 */
  async function startSession(host, demo, resources) {
    const runId = `snippet-${demo.key}-${Date.now().toString(36)}`;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('title', demo.label);
    iframe.className = 'sandbox-frame';
    iframe.srcdoc = buildSrcdoc(resources.threeSource, resources.runtimeSource);
    host.replaceChildren(iframe);
    await new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
    const photo = { ...resources.photo, buffer: resources.photo.buffer.slice(0) };
    const built = waitForMessage(iframe, runId, ['built'], BUILD_TIMEOUT_MS);
    iframe.contentWindow.postMessage(
      { type: 'init', runId, runtimeVersion: RUNTIME_VERSION, photos: [photo], code: demo.code, limits: { buildTimeoutMs: BUILD_TIMEOUT_MS, sessionLimitMs: 600000 } },
      '*',
      [photo.buffer],
    );
    return { iframe, runId, built: await built };
  }

  async function captureDemo(demo, resources) {
    const session = await startSession(byId('capture-stage'), demo, resources);
    const captures = waitForMessage(session.iframe, session.runId, ['captures'], CAPTURE_TIMEOUT_MS);
    session.iframe.contentWindow.postMessage(
      { type: 'capture', runId: session.runId, requestId: `${session.runId}-capture`, views: CAPTURE_VIEWS.map(({ azimuthDeg, elevationDeg }) => ({ azimuthDeg, elevationDeg })) },
      '*',
    );
    const result = await captures;
    session.iframe.remove();
    return { views: result.images.map((image) => image.dataUrl), runtime: result.runtime };
  }

  /* -------------------------------- UI -------------------------------- */

  function metricLine(runtime) {
    const fpsClass = typeof runtime.fps === 'number' && runtime.fps >= 20 ? 'ok' : 'bad';
    const errorClass = runtime.errors.length === 0 ? 'ok' : 'bad';
    return (
      `<span class="${fpsClass}">fps ${runtime.fps ?? 'n/a'}</span>` +
      `<span>draw ${runtime.drawStats.calls}</span><span>tris ${runtime.drawStats.triangles}</span>` +
      `<span>build ${runtime.buildMs}ms</span><span class="${errorClass}">errors ${runtime.errors.length}</span>` +
      `<span class="${runtime.networkAttempts === 0 ? 'ok' : 'bad'}">net ${runtime.networkAttempts}</span>`
    );
  }

  function renderCards() {
    const groups = [...new Set(DEMOS.map((demo) => demo.group))];
    byId('gallery').innerHTML = groups
      .map(
        (group) =>
          `<h2>${group}</h2><div class="grid">` +
          DEMOS.filter((demo) => demo.group === group)
            .map(
              (demo) =>
                `<article class="card" data-key="${demo.key}" tabindex="0">` +
                `<div class="shots" id="shots-${demo.key}"><div class="placeholder">等待渲染…</div></div>` +
                `<div class="card-body"><h3>${demo.label}</h3>` +
                `<p class="chips">${['toolkit', ...demo.uses].map((id) => `<span class="chip">${id}</span>`).join('')}</p>` +
                `<p class="metrics" id="metrics-${demo.key}"></p></div></article>`,
            )
            .join('') +
          '</div>',
      )
      .join('');
    document.querySelectorAll('.card').forEach((card) => {
      const open = () => void openViewer(card.dataset.key);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') open();
      });
    });
  }

  function renderBudget(resources) {
    const rows = Object.values(resources.snippets)
      .map((snippet) => `<tr><td>${snippet.id}</td><td>${snippet.title}</td><td>${kb(byteLength(snippet.source))}</td><td>${snippet.keywords.join('、') || '（总是附带）'}</td></tr>`)
      .join('');
    byId('budget-body').innerHTML = rows;
  }

  function renderResult(key, result) {
    byId(`shots-${key}`).innerHTML = result.views.map((dataUrl, index) => `<img src="${dataUrl}" alt="${key} ${CAPTURE_VIEWS[index].label}" />`).join('');
    byId(`metrics-${key}`).innerHTML = metricLine(result.runtime);
  }

  function renderFailure(key, error) {
    byId(`shots-${key}`).innerHTML = `<div class="placeholder bad">${escapeHtml(error.message)}</div>`;
  }

  async function openViewer(key) {
    const resources = await loadResources();
    const demo = resources.demos[key];
    byId('viewer-title').textContent = demo.label;
    byId('viewer-size').textContent = `拼装后 build(ctx) ${kb(byteLength(demo.code))}`;
    byId('viewer-tabs').innerHTML = [...demo.uses, 'toolkit', 'demo']
      .map((id, index) => `<button type="button" class="tab${index === 0 ? ' active' : ''}" data-id="${id}">${id === 'demo' ? '演示代码' : id}</button>`)
      .join('');
    const showSource = (id) => {
      const source = id === 'demo' ? demo.demoSource : resources.snippets[id].source;
      byId('viewer-code').textContent = source;
      document.querySelectorAll('#viewer-tabs .tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.id === id));
    };
    document.querySelectorAll('#viewer-tabs .tab').forEach((tab) => tab.addEventListener('click', () => showSource(tab.dataset.id)));
    showSource(demo.uses[0] ?? 'toolkit');
    byId('viewer').hidden = false;
    byId('viewer-stage').innerHTML = '<div class="placeholder">正在搭建…</div>';
    await startSession(byId('viewer-stage'), demo, resources).catch((error) => {
      byId('viewer-stage').innerHTML = `<div class="placeholder bad">${escapeHtml(error.message)}</div>`;
    });
  }

  function closeViewer() {
    byId('viewer').hidden = true;
    byId('viewer-stage').replaceChildren();
  }

  async function runAll() {
    const resources = await loadResources();
    const entries = [];
    for (const demo of DEMOS) {
      setStatus(`渲染 ${demo.label}…`);
      const outcome = await captureDemo(resources.demos[demo.key], resources).then(
        (result) => ({ ok: true, result }),
        (error) => ({ ok: false, error }),
      );
      if (outcome.ok) {
        state.results[demo.key] = { label: demo.label, uses: demo.uses, codeBytes: byteLength(resources.demos[demo.key].code), ...outcome.result };
        renderResult(demo.key, outcome.result);
      } else {
        state.results[demo.key] = { label: demo.label, failed: outcome.error.message };
        renderFailure(demo.key, outcome.error);
      }
      entries.push(demo.key);
    }
    const failed = Object.values(state.results).filter((result) => result.failed || result.runtime.errors.length > 0).length;
    setStatus(failed === 0 ? `全部 ${entries.length} 个演示渲染完成，无运行时错误` : `${failed} 个演示失败或有运行时错误`);
    return state.results;
  }

  function boot() {
    renderCards();
    byId('run-button').addEventListener('click', () => void runAll().catch((error) => setStatus(`失败：${error.message}`)));
    byId('viewer-close').addEventListener('click', closeViewer);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeViewer();
    });
    window.__snippets = { run: runAll, state };
    if (autoRun) window.__snippetResult = runAll().catch((error) => ({ failed: true, error: error.message }));
    else void loadResources().then(() => setStatus('就绪：点「渲染全部」，或点任一卡片直接实时预览'), (error) => setStatus(`失败：${error.message}`));
  }

  boot();
})();

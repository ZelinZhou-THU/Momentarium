/*
 * Prototype parent-page controller (no framework, no build step).
 *
 * Responsibilities:
 *  - load the pinned three UMD build, the SceneRuntime source and the scene code;
 *  - fetch a local JPEG, downscale it to a display copy (long edge <= 2048, JPEG 0.82)
 *    and hand the bytes to the sandbox as a transferred ArrayBuffer;
 *  - assemble the sandbox srcdoc (CSP meta + inlined three + inlined runtime);
 *  - run the postMessage protocol with watchdog timeouts, collect the two JPEG
 *    captures and the runtime evidence, and show them on the page.
 *
 * Query parameters (dev harness only):
 *  - ?auto=1            run immediately and expose window.__prototypeResult
 *  - ?code=<key>        choose the scene fixture: normal | build-error | build-timeout | network-guard
 */
(function startPrototypeApp() {
  'use strict';

  const RUNTIME_VERSION = 1;
  const BUILD_TIMEOUT_MS = 8000;
  const CAPTURE_TIMEOUT_MS = 15000;
  const FRAME_LOAD_TIMEOUT_MS = 10000;
  const SESSION_LIMIT_MS = 90000;
  const DISPLAY_MAX_EDGE = 2048;
  const DISPLAY_JPEG_QUALITY = 0.82;
  const SCENE_CODE_LIMIT_BYTES = 60 * 1024;
  const SANDBOX_CSP =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none';";
  const PHOTO_SOURCE = {
    id: 'synthetic-coast-001',
    path: 'assets/synthetic-coast.jpg',
    caption: '济州岛海岸 · 玄武岩与青绿色的海（用户拍摄）',
  };
  const CAPTURE_VIEWS = [
    { label: '初始视角', azimuthDeg: 0, elevationDeg: 0 },
    { label: '方位角 +35°', azimuthDeg: 35, elevationDeg: 0 },
  ];
  const SCENE_CODE_SOURCES = {
    normal: 'scene-code.js',
    'build-error': 'scenarios/build-error.js',
    'build-timeout': 'scenarios/build-timeout.js',
    'network-guard': 'scenarios/network-guard.js',
  };

  class ProtocolTimeoutError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ProtocolTimeoutError';
    }
  }

  const searchParams = new URLSearchParams(window.location.search);
  const requestedCodeKey = searchParams.get('code');
  const codeKey = Object.prototype.hasOwnProperty.call(SCENE_CODE_SOURCES, requestedCodeKey) ? requestedCodeKey : 'normal';
  const autoRun = searchParams.get('auto') === '1';
  // Dev knob so the prototype can also exercise the multi-photo channel
  // (D4 renders 3-8 photos); the same local JPEG is duplicated per photo id.
  const PHOTO_COUNT = (() => {
    const parsed = Number.parseInt(searchParams.get('photos') ?? '1', 10);
    return Number.isFinite(parsed) ? Math.min(4, Math.max(1, parsed)) : 1;
  })();

  const state = {
    phase: 'idle',
    runId: null,
    frame: null,
    resources: null,
    pending: null,
    sessionTimer: null,
    sessionExpired: false,
    traceStartedAt: 0,
    protocol: [],
    captures: [],
    runtime: null,
    failures: [],
    photoSelections: [],
    lastResult: null,
    runPromise: null,
  };

  /* ------------------------------------------------------------------ */
  /* DOM helpers                                                         */
  /* ------------------------------------------------------------------ */

  function byId(id) {
    return document.getElementById(id);
  }

  function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function estimateDataUrlBytes(dataUrl) {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) return 0;
    const base64 = dataUrl.slice(commaIndex + 1);
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
  }

  function appendProtocol(direction, type, detail) {
    state.protocol.push({
      atMs: Math.round(performance.now() - state.traceStartedAt),
      direction,
      type,
      detail,
    });
    if (state.protocol.length > 120) state.protocol.shift();
    renderProtocol();
  }

  function renderProtocol() {
    const entries = state.protocol.slice(-40);
    byId('protocol-log').replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        const time = document.createElement('span');
        time.textContent = `${String(entry.atMs).padStart(5, ' ')}ms `;
        const name = document.createElement('b');
        name.textContent = `${entry.direction} ${entry.type}`;
        const detail = document.createElement('span');
        detail.textContent = entry.detail ? ` · ${entry.detail}` : '';
        item.append(time, name, detail);
        return item;
      }),
    );
  }

  function setPhase(phase) {
    state.phase = phase;
    const badge = byId('phase-badge');
    badge.textContent = phase;
    badge.className = phase === 'ready' ? 'ready' : phase === 'failed' || phase === 'timeout' ? 'failed' : '';
  }

  function renderPhoto(photos, sourceStats) {
    byId('photo-report').textContent = [
      `照片 ${photos.length} 张（同一本地 JPEG 按不同 id 复制，验证多纹理通道）`,
      `原图 ${sourceStats.originalWidth}x${sourceStats.originalHeight} ${formatBytes(sourceStats.originalBytes)}`,
      `展示图 ${sourceStats.displayWidth}x${sourceStats.displayHeight} ${formatBytes(sourceStats.displayBytes)}（scale=${sourceStats.scale}，JPEG ${DISPLAY_JPEG_QUALITY}）`,
      `ids：${photos.map((photo) => photo.id).join(', ')}`,
      `图注：${PHOTO_SOURCE.caption}`,
    ].join('\n');
    byId('photo-report').classList.remove('muted');
  }

  function renderRuntime(runtime) {
    if (!runtime) {
      byId('runtime-report').textContent = '—';
      return;
    }
    const used = runtime.photoIdsUsed.length;
    const lines = [
      `buildMs=${runtime.buildMs}  texturesMs=${runtime.texturesMs}  firstFrameMs=${runtime.firstFrameMs}`,
      `fps=${runtime.fps ?? 'n/a'}  frames=${runtime.framesRendered}  sessionElapsedMs=${runtime.sessionElapsedMs}`,
      `errors=${runtime.errors.length}  networkAttempts=${runtime.networkAttempts}  cspViolations=${runtime.cspViolations.length}`,
      `photoIdsUsed=${runtime.photoIdsUsed.join(',') || '(none)'} (${used}/${runtime.photoCount})`,
      `canvas=${runtime.canvas.width}x${runtime.canvas.height}  drawCalls=${runtime.drawStats.calls}  triangles=${runtime.drawStats.triangles}`,
      `webgl=${runtime.webgl.version} | ${runtime.webgl.renderer}`,
      `orbitControls=${runtime.orbitControls}`,
    ];
    if (runtime.errors.length > 0) {
      lines.push('errors:', ...runtime.errors.map((entry) => `  [${entry.phase}] ${entry.name}: ${entry.message}`));
    }
    byId('runtime-report').textContent = lines.join('\n');
  }

  function renderCaptures(captures) {
    const strip = byId('capture-strip');
    if (captures.length === 0) {
      strip.hidden = true;
      strip.replaceChildren();
      return;
    }
    strip.hidden = false;
    strip.replaceChildren(
      ...captures.map((capture) => {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = capture.dataUrl;
        image.alt = `沙箱截图：${capture.label}`;
        const caption = document.createElement('figcaption');
        caption.textContent = `${capture.label} · ${capture.width}x${capture.height} · ≈${formatBytes(capture.bytes)} JPEG`;
        figure.append(image, caption);
        return figure;
      }),
    );
  }

  function renderFailures(failures) {
    byId('error-list').replaceChildren(
      ...failures.map((failure) => {
        const item = document.createElement('li');
        item.textContent = `[${failure.code}] ${failure.message}`;
        return item;
      }),
    );
  }

  function renderStageHint(message) {
    const hint = document.createElement('div');
    hint.className = 'stage-hint';
    hint.textContent = message;
    byId('stage').replaceChildren(hint);
  }

  /* ------------------------------------------------------------------ */
  /* Resource loading                                                    */
  /* ------------------------------------------------------------------ */

  async function loadText(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`failed to load ${path}: HTTP ${response.status}`);
    return response.text();
  }

  async function loadDisplayPhoto() {
    const response = await fetch(PHOTO_SOURCE.path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`failed to load ${PHOTO_SOURCE.path}: HTTP ${response.status}`);
    const originalBuffer = await response.arrayBuffer();
    const bitmap = await createImageBitmap(new Blob([originalBuffer], { type: 'image/jpeg' }));
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const scale = Math.min(1, DISPLAY_MAX_EDGE / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context2d = canvas.getContext('2d');
    if (!context2d) throw new Error('canvas 2d context is unavailable');
    context2d.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('canvas.toBlob() returned null'))),
        'image/jpeg',
        DISPLAY_JPEG_QUALITY,
      );
    });
    const displayBuffer = await blob.arrayBuffer();
    return {
      id: PHOTO_SOURCE.id,
      caption: PHOTO_SOURCE.caption,
      width,
      height,
      aspect: width / height,
      mimeType: 'image/jpeg',
      buffer: displayBuffer,
      stats: {
        originalWidth,
        originalHeight,
        originalBytes: originalBuffer.byteLength,
        displayWidth: width,
        displayHeight: height,
        displayBytes: displayBuffer.byteLength,
        scale: Math.round(scale * 1000) / 1000,
      },
    };
  }

  async function loadSceneResources() {
    if (state.resources) return state.resources;
    try {
      const [threeSource, runtimeSource, codeSource, photo] = await Promise.all([
        loadText('vendor/three.min.js'),
        loadText('runtime.js'),
        loadText(SCENE_CODE_SOURCES[codeKey]),
        loadDisplayPhoto(),
      ]);
      if (threeSource.includes('</script')) throw new Error('vendor/three.min.js contains a script terminator');
      if (runtimeSource.includes('</script')) throw new Error('runtime.js contains a script terminator');
      if (codeSource.length > SCENE_CODE_LIMIT_BYTES) {
        throw new Error(`scene code is ${codeSource.length} bytes, over the ${SCENE_CODE_LIMIT_BYTES} byte limit`);
      }
      state.resources = { threeSource, runtimeSource, codeSource, photo };
      return state.resources;
    } catch (error) {
      // A file:// page cannot fetch sibling files, so this is the path that
      // surfaces the "static server required" limitation.
      if (!error.code) error.code = 'RESOURCE_LOAD_FAILED';
      throw error;
    }
  }

  function createPhotoPayloads(resources) {
    return Array.from({ length: PHOTO_COUNT }, (unused, index) => ({
      id: `${PHOTO_SOURCE.id.replace(/-001$/, '')}-${String(index + 1).padStart(3, '0')}`,
      width: resources.photo.width,
      height: resources.photo.height,
      aspect: resources.photo.aspect,
      mimeType: resources.photo.mimeType,
      buffer: resources.photo.buffer.slice(0),
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Sandbox srcdoc assembly                                             */
  /* ------------------------------------------------------------------ */

  function buildSrcdoc(resources) {
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`,
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>Momentarium scene sandbox</title>',
      '<style>html,body{margin:0;height:100%;overflow:hidden;background:#080d12;}canvas{display:block;}</style>',
      '</head>',
      '<body>',
      `<script>${resources.threeSource}</script>`,
      `<script>${resources.runtimeSource}</script>`,
      '</body>',
      '</html>',
    ].join('\n');
  }

  function createSandboxFrame(srcdoc) {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', '3D 场景沙箱');
    frame.srcdoc = srcdoc;
    return frame;
  }

  function waitForFrameLoad(frame, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ProtocolTimeoutError(`iframe srcdoc did not load within ${timeoutMs} ms`));
      }, timeoutMs);
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

  /* ------------------------------------------------------------------ */
  /* Protocol plumbing                                                   */
  /* ------------------------------------------------------------------ */

  function awaitMessage(types, timeoutMs) {
    if (state.pending) throw new Error('protocol waiters cannot overlap');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending = null;
        reject(new ProtocolTimeoutError(`no ${types.join('/')} message within ${timeoutMs} ms`));
      }, timeoutMs);
      state.pending = {
        types,
        resolve: (message) => {
          clearTimeout(timer);
          state.pending = null;
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          state.pending = null;
          reject(error);
        },
      };
    });
  }

  function summarizeMessage(message) {
    if (message.type === 'built') {
      return `buildMs=${message.buildMs} texturesMs=${message.texturesMs} firstFrameMs=${message.firstFrameMs} photoCount=${message.photoCount}`;
    }
    if (message.type === 'captures') {
      const runtime = message.runtime;
      return `images=${message.images.length} buildMs=${runtime.buildMs} fps=${runtime.fps} errors=${runtime.errors.length} networkAttempts=${runtime.networkAttempts}`;
    }
    if (message.type === 'error') {
      return `code=${message.code} phase=${message.phase} message=${message.message}`;
    }
    if (message.type === 'photoselected') {
      return `photoId=${message.photoId}`;
    }
    return '';
  }

  function handleSandboxMessage(event) {
    const frameWindow = state.frame ? state.frame.contentWindow : null;
    if (!frameWindow || event.source !== frameWindow) return;
    const message = event.data;
    if (!isRecord(message) || typeof message.type !== 'string') {
      appendProtocol('sandbox→parent', 'invalid', 'ignored malformed message');
      return;
    }
    if (typeof message.runId === 'string' && state.runId !== null && message.runId !== state.runId) {
      appendProtocol('sandbox→parent', 'stale', `ignored runId=${message.runId} origin=${event.origin}`);
      return;
    }
    appendProtocol('sandbox→parent', message.type, `${summarizeMessage(message)} origin=${event.origin}`);

    if (message.type === 'photoselected') {
      handlePhotoSelected(message);
      return;
    }

    const pending = state.pending;
    if (!pending) return;
    if (message.type === 'error') {
      const error = new Error(message.message || 'sandbox reported an error');
      error.code = typeof message.code === 'string' ? message.code : 'SANDBOX_ERROR';
      error.phase = typeof message.phase === 'string' ? message.phase : 'unknown';
      error.runtimeErrors = Array.isArray(message.errors) ? message.errors : [];
      pending.reject(error);
      return;
    }
    if (pending.types.includes(message.type)) pending.resolve(message);
  }

  function handlePhotoSelected(message) {
    if (typeof message.photoId !== 'string') return;
    state.photoSelections.push(message.photoId);
    if (state.lastResult) state.lastResult.photoSelections = state.photoSelections.slice();
    const photo = state.resources ? state.resources.photo : null;
    const caption = photo ? photo.caption : '';
    const selection = byId('selection');
    selection.classList.remove('muted');
    selection.textContent = `已点击照片：${caption}（photoId=${message.photoId}，共 ${state.photoSelections.length} 次）`;
  }

  /* ------------------------------------------------------------------ */
  /* Session lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  function clearSessionTimer() {
    if (state.sessionTimer !== null) {
      clearTimeout(state.sessionTimer);
      state.sessionTimer = null;
    }
  }

  function startSessionTimer() {
    clearSessionTimer();
    state.sessionTimer = setTimeout(() => {
      const error = new ProtocolTimeoutError(`render session exceeded ${SESSION_LIMIT_MS} ms`);
      error.code = 'SESSION_TIMEOUT';
      state.sessionExpired = true;
      appendProtocol('parent', 'session-timeout', `限制 ${SESSION_LIMIT_MS}ms，销毁 iframe`);
      renderStageHint(`会话超过 ${SESSION_LIMIT_MS} ms，iframe 已销毁（单次渲染会话上限）。`);
      destroyFrame();
      if (state.pending) state.pending.reject(error);
      else if (state.phase === 'ready') setPhase('session-ended');
    }, SESSION_LIMIT_MS);
  }

  function destroyFrame() {
    clearSessionTimer();
    if (state.frame) {
      const frame = state.frame;
      state.frame = null;
      frame.srcdoc = '';
      frame.remove();
    }
  }

  function teardownSession(reason) {
    if (state.pending) state.pending.reject(new Error(`session torn down: ${reason}`));
    destroyFrame();
    state.runId = null;
  }

  /* ------------------------------------------------------------------ */
  /* Run orchestration                                                   */
  /* ------------------------------------------------------------------ */

  function createEmptyResult() {
    return {
      ok: false,
      scenario: codeKey,
      auto: autoRun,
      startedAt: new Date().toISOString(),
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      sandbox: null,
      photo: null,
      protocol: state.protocol,
      captures: [],
      runtime: null,
      failures: [],
      photoSelections: [],
      timings: {},
    };
  }

  function resolveFailureCode(error) {
    if (typeof error.code === 'string') return error.code;
    if (error instanceof ProtocolTimeoutError) {
      if (state.phase === 'executing-build') return 'BUILD_TIMEOUT';
      if (state.phase === 'capturing') return 'CAPTURE_TIMEOUT';
      if (state.phase === 'creating-sandbox') return 'FRAME_LOAD_TIMEOUT';
      return 'PROTOCOL_TIMEOUT';
    }
    return 'RUN_FAILED';
  }

  function recordFailure(result, error) {
    const failure = {
      code: resolveFailureCode(error),
      phase: state.phase,
      message: error.message,
    };
    state.failures.push(failure);
    result.failures = state.failures.slice();
    result.ok = false;
    renderFailures(state.failures);
    appendProtocol('parent', 'run-failed', `[${failure.code}] ${failure.message}`);
    return failure;
  }

  function resetRunState() {
    state.protocol = [];
    state.captures = [];
    state.runtime = null;
    state.failures = [];
    state.photoSelections = [];
    state.sessionExpired = false;
    state.traceStartedAt = performance.now();
    byId('runtime-report').textContent = '—';
    byId('capture-strip').hidden = true;
    byId('capture-strip').replaceChildren();
    byId('error-list').replaceChildren();
    byId('selection').textContent = '在 3D 画面中点击照片，应回传 photoId。';
    byId('selection').classList.add('muted');
  }

  async function executeRun() {
    teardownSession('restart');
    resetRunState();
    const result = createEmptyResult();
    state.lastResult = result;
    renderStageHint('正在加载资源…');
    const startButton = byId('run-button');
    startButton.disabled = true;
    const runStartedAt = performance.now();
    try {
      setPhase('loading-resources');
      const resources = await loadSceneResources();
      const photos = createPhotoPayloads(resources);
      result.photo = {
        caption: resources.photo.caption,
        count: photos.length,
        ids: photos.map((photo) => photo.id),
        source: resources.photo.stats,
      };
      renderPhoto(photos, resources.photo.stats);

      const srcdoc = buildSrcdoc(resources);
      result.sandbox = {
        csp: SANDBOX_CSP,
        srcdocBytes: srcdoc.length,
        threeBytes: resources.threeSource.length,
        runtimeBytes: resources.runtimeSource.length,
        codeBytes: resources.codeSource.length,
        codeKey,
      };
      appendProtocol(
        'parent',
        'srcdoc-assembled',
        `three=${formatBytes(resources.threeSource.length)} runtime=${formatBytes(resources.runtimeSource.length)} srcdoc=${formatBytes(srcdoc.length)}`,
      );

      setPhase('creating-sandbox');
      const frame = createSandboxFrame(srcdoc);
      state.frame = frame;
      byId('stage').replaceChildren(frame);
      await waitForFrameLoad(frame, FRAME_LOAD_TIMEOUT_MS);
      appendProtocol('sandbox', 'loaded', 'srcdoc 解析完成，sandbox="allow-scripts"');

      setPhase('executing-build');
      state.runId = `run-${Date.now().toString(36)}`;
      startSessionTimer();

      const initMessage = {
        type: 'init',
        runId: state.runId,
        runtimeVersion: RUNTIME_VERSION,
        photos,
        code: resources.codeSource,
        limits: { buildTimeoutMs: BUILD_TIMEOUT_MS, sessionLimitMs: SESSION_LIMIT_MS },
      };
      const transferredBytes = photos.reduce((total, photo) => total + photo.buffer.byteLength, 0);
      const builtWaiter = awaitMessage(['built'], BUILD_TIMEOUT_MS);
      frame.contentWindow.postMessage(
        initMessage,
        '*',
        photos.map((photo) => photo.buffer),
      );
      appendProtocol(
        'parent→sandbox',
        'init',
        `photos=${photos.length} buffers=${formatBytes(transferredBytes)} code=${formatBytes(resources.codeSource.length)} buildTimeout=${BUILD_TIMEOUT_MS}ms`,
      );

      const buildStart = performance.now();
      const builtMessage = await builtWaiter;
      result.timings.buildRoundTripMs = Math.round(performance.now() - buildStart);
      appendProtocol('parent', 'built-accepted', `roundTrip=${result.timings.buildRoundTripMs}ms`);

      setPhase('capturing');
      const captureStart = performance.now();
      const capturesWaiter = awaitMessage(['captures'], CAPTURE_TIMEOUT_MS);
      frame.contentWindow.postMessage(
        {
          type: 'capture',
          runId: state.runId,
          requestId: `capture-${Date.now().toString(36)}`,
          views: CAPTURE_VIEWS.map((view) => ({ azimuthDeg: view.azimuthDeg, elevationDeg: view.elevationDeg })),
        },
        '*',
      );
      appendProtocol('parent→sandbox', 'capture', `views=${CAPTURE_VIEWS.length} (initial + azimuth 35°)`);

      const capturesMessage = await capturesWaiter;
      result.timings.captureMs = Math.round(performance.now() - captureStart);
      result.timings.totalMs = Math.round(performance.now() - runStartedAt);
      state.captures = capturesMessage.images.map((image, index) => ({
        label: CAPTURE_VIEWS[index] ? CAPTURE_VIEWS[index].label : `view-${index}`,
        view: image.view,
        width: image.width,
        height: image.height,
        bytes: estimateDataUrlBytes(image.dataUrl),
        dataUrl: image.dataUrl,
      }));
      state.runtime = capturesMessage.runtime;
      result.captures = state.captures;
      result.runtime = state.runtime;
      result.ok = true;
      setPhase('ready');
      renderCaptures(state.captures);
      renderRuntime(state.runtime);
      appendProtocol(
        'parent',
        'captures-accepted',
        `images=${state.captures.length} fps=${state.runtime.fps} photoIdsUsed=${state.runtime.photoIdsUsed.length}/${state.runtime.photoCount}`,
      );
      return result;
    } catch (error) {
      recordFailure(result, error);
      setPhase(error instanceof ProtocolTimeoutError ? 'timeout' : 'failed');
      renderStageHint(`运行失败：${error.message}`);
      destroyFrame();
      return result;
    } finally {
      startButton.disabled = false;
    }
  }

  function runPrototype() {
    if (state.runPromise) return state.runPromise;
    state.runPromise = executeRun().finally(() => {
      state.runPromise = null;
    });
    return state.runPromise;
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    window.addEventListener('message', handleSandboxMessage);
    byId('run-button').addEventListener('click', () => {
      void runPrototype();
    });
    window.__prototype = {
      run: runPrototype,
      state,
      getLastResult: () => state.lastResult,
    };
    if (autoRun) {
      window.__prototypeResult = runPrototype();
    }
  }

  boot();
})();

/*
 * Momentarium SceneRuntime prototype (runtimeVersion = 1).
 *
 * This file is HOST code, not model generated. It is inlined into the sandboxed
 * iframe's srcdoc by app.js, after three.min.js. It owns the renderer, the
 * photo textures, the context object handed to generated code, the simplified
 * orbit controls, the capture pipeline and the runtime evidence collection.
 *
 * Message protocol (parent page <-> sandboxed iframe):
 *
 *   parent -> iframe  init(photos, code, limits)   -> built | error
 *   parent -> iframe  capture(views)               -> captures(images, runtime) | error
 *   iframe -> parent  photoselected(photoId)
 *
 * Photos arrive as transferred ArrayBuffers (JPEG bytes). They are turned into
 * Blob URLs inside this document and loaded with THREE.TextureLoader, so the
 * canvas never sees a cross-origin image and toDataURL() stays untainted.
 *
 * The generated code is executed with `new Function` because
 * `script-src 'unsafe-eval'` is part of the sandbox CSP; the code itself is
 * never inserted into the document as HTML.
 */
(function installSceneRuntime() {
  'use strict';

  const RUNTIME_VERSION = 1;
  const JPEG_QUALITY = 0.82;
  const ERROR_LIMIT = 12;
  const NETWORK_ATTEMPT_LIMIT = 20;
  const FPS_SAMPLE_FRAMES = 30;
  const FPS_MAX_WAIT_MS = 4000;
  const DEFAULT_ORBIT_TARGET = [0, 1.4, 0];
  const MIN_POLAR_ANGLE = 0.12;
  const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;
  const PHOTO_CLICK_MAX_MOVE_PX = 5;
  const PHOTO_CLICK_MAX_DURATION_MS = 500;
  const ORBIT_ROTATE_SPEED = 0.005;
  const ORBIT_TILT_SPEED = 0.003;
  const ORBIT_ZOOM_SPEED = 0.0012;

  class RuntimeFailure extends Error {
    constructor(code, message, options) {
      super(message);
      this.name = 'RuntimeFailure';
      this.code = code;
      this.phase = (options && options.phase) || 'init';
      this.cause = options && options.cause;
    }
  }

  const state = {
    runId: null,
    startedAt: 0,
    initialized: false,
    built: false,
    renderer: null,
    scene: null,
    camera: null,
    photos: [],
    orbitControls: null,
    onFrameCallbacks: [],
    errors: [],
    networkAttempts: [],
    cspViolations: [],
    frameTimes: [],
    fpsWaiter: null,
    framesRendered: 0,
    animationFrameId: null,
    lastFrameTimestamp: null,
    captureBusy: false,
    webglInfo: null,
    timings: { texturesMs: null, buildMs: null, firstFrameMs: null },
  };

  /* ------------------------------------------------------------------ */
  /* Protocol helpers                                                    */
  /* ------------------------------------------------------------------ */

  function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function postToParent(message) {
    const payload = Object.assign({}, message);
    if (state.runId && !payload.runId) payload.runId = state.runId;
    window.parent.postMessage(payload, '*');
  }

  function toErrorEntry(phase, error) {
    const fallbackMessage = typeof error === 'string' ? error : String(error);
    const isErrorLike = error instanceof Error;
    return {
      phase,
      name: isErrorLike ? error.name : 'Error',
      message: isErrorLike ? error.message : fallbackMessage,
      stack: isErrorLike && typeof error.stack === 'string' ? error.stack.slice(0, 1200) : null,
      atMs: Math.round(performance.now()),
    };
  }

  function recordError(phase, error) {
    if (state.errors.length >= ERROR_LIMIT) return;
    state.errors.push(toErrorEntry(phase, error));
  }

  function postFailure(error) {
    const isRuntimeFailure = error instanceof RuntimeFailure;
    postToParent({
      type: 'error',
      code: isRuntimeFailure ? error.code : 'RUNTIME_FAILED',
      phase: isRuntimeFailure ? error.phase : 'runtime',
      message: error instanceof Error ? error.message : String(error),
      errors: state.errors.slice(),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Forbidden-resource monitoring (used for the networkAttempts gate)   */
  /* ------------------------------------------------------------------ */

  function installNetworkMonitor() {
    const recordAttempt = (kind, url) => {
      if (state.networkAttempts.length >= NETWORK_ATTEMPT_LIMIT) return;
      state.networkAttempts.push({
        kind,
        url: String(url === undefined || url === null ? '' : url).slice(0, 160),
        atMs: Math.round(performance.now()),
      });
    };

    const describeFetchInput = (input) => {
      if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
      return String(input);
    };

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function monitoredFetch(input) {
        recordAttempt('fetch', describeFetchInput(input));
        return originalFetch.apply(this, arguments);
      };
    }

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function monitoredOpen(method, url) {
      recordAttempt('xhr', url);
      return originalXhrOpen.apply(this, arguments);
    };

    const OriginalWebSocket = window.WebSocket;
    if (typeof OriginalWebSocket === 'function') {
      class MonitoredWebSocket extends OriginalWebSocket {
        constructor(url, protocols) {
          recordAttempt('websocket', url);
          super(url, protocols);
        }
      }
      window.WebSocket = MonitoredWebSocket;
    }

    const OriginalEventSource = window.EventSource;
    if (typeof OriginalEventSource === 'function') {
      class MonitoredEventSource extends OriginalEventSource {
        constructor(url, options) {
          recordAttempt('eventsource', url);
          super(url, options);
        }
      }
      window.EventSource = MonitoredEventSource;
    }

    if (typeof navigator.sendBeacon === 'function') {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function monitoredSendBeacon(url) {
        recordAttempt('sendbeacon', url);
        return originalSendBeacon.apply(navigator, arguments);
      };
    }

    document.addEventListener('securitypolicyviolation', (event) => {
      if (state.cspViolations.length >= NETWORK_ATTEMPT_LIMIT) return;
      state.cspViolations.push({
        directive: event.violatedDirective,
        blockedUri: String(event.blockedURI || '').slice(0, 160),
        atMs: Math.round(performance.now()),
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Renderer / scene / camera                                           */
  /* ------------------------------------------------------------------ */

  function probeWebGlContext() {
    const canvas = document.createElement('canvas');
    const attributes = {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: true,
    };
    return canvas.getContext('webgl2', attributes) || canvas.getContext('webgl', attributes);
  }

  function readWebGlInfo(context) {
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    return {
      version: context.getParameter(context.VERSION),
      renderer: debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
      vendor: debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown',
      maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE),
    };
  }

  function createRenderer() {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    document.body.appendChild(renderer.domElement);
    return renderer;
  }

  function resizeRenderer() {
    if (!state.renderer || !state.camera) return;
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(width, height, true);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
  }

  function createSceneAndCamera() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 400);
    camera.position.set(0, 1.6, 6);
    camera.lookAt(0, 1.4, 0);
    camera.updateMatrixWorld();
    return { scene, camera };
  }

  function ensureCameraSane() {
    const camera = state.camera;
    const position = camera.position;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      camera.position.set(0, 1.6, 6);
      camera.lookAt(0, 1.4, 0);
    }
    if (!(camera.fov > 1 && camera.fov < 179)) camera.fov = 52;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /* ------------------------------------------------------------------ */
  /* Photo textures                                                      */
  /* ------------------------------------------------------------------ */

  function validatePhotoInputs(inputs) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new RuntimeFailure('PHOTOS_INVALID', 'init() requires a non-empty photos array');
    }
    return inputs.map((input, index) => {
      if (!isRecord(input) || typeof input.id !== 'string') {
        throw new RuntimeFailure('PHOTOS_INVALID', `photos[${index}] is missing a string id`);
      }
      if (!(input.buffer instanceof ArrayBuffer)) {
        throw new RuntimeFailure('PHOTOS_INVALID', `photos[${index}].buffer is not an ArrayBuffer (was it transferred?)`);
      }
      const width = Number(input.width);
      const height = Number(input.height);
      if (!(width > 0) || !(height > 0)) {
        throw new RuntimeFailure('PHOTOS_INVALID', `photos[${index}] is missing a positive width/height`);
      }
      return {
        id: input.id,
        buffer: input.buffer,
        mimeType: typeof input.mimeType === 'string' ? input.mimeType : 'image/jpeg',
        width,
        height,
        aspect: width / height,
      };
    });
  }

  async function loadPhotoTextures(photoInputs) {
    const loader = new THREE.TextureLoader();
    return Promise.all(
      photoInputs.map(async (input) => {
        const blob = new Blob([input.buffer], { type: input.mimeType });
        const objectUrl = URL.createObjectURL(blob);
        try {
          const texture = await loader.loadAsync(objectUrl);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, state.renderer.capabilities.getMaxAnisotropy());
          return {
            id: input.id,
            width: input.width,
            height: input.height,
            aspect: input.aspect,
            texture,
          };
        } catch (error) {
          throw new RuntimeFailure('TEXTURE_LOAD_FAILED', `failed to load texture for photo "${input.id}": ${error.message}`, {
            phase: 'textures',
            cause: error,
          });
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Simplified orbit controls (fallback interaction, no examples/jsm)   */
  /* ------------------------------------------------------------------ */

  function createOrbitControls(options) {
    const settings = isRecord(options) ? options : {};
    const target = new THREE.Vector3().fromArray(
      Array.isArray(settings.target) && settings.target.length === 3 ? settings.target : DEFAULT_ORBIT_TARGET,
    );
    const config = {
      target,
      minDistance: Number.isFinite(settings.minDistance) ? settings.minDistance : 1.5,
      maxDistance: Number.isFinite(settings.maxDistance) ? settings.maxDistance : 40,
      rotateSpeed: Number.isFinite(settings.rotateSpeed) ? settings.rotateSpeed : 1,
      zoomSpeed: Number.isFinite(settings.zoomSpeed) ? settings.zoomSpeed : 1,
    };
    const initialPosition = state.camera.position.clone();
    const initialQuaternion = state.camera.quaternion.clone();
    const spherical = new THREE.Spherical().setFromVector3(state.camera.position.clone().sub(target));
    if (!(spherical.radius > 0.001)) spherical.set(6, Math.PI / 2 - 0.15, 0);
    spherical.phi = clamp(spherical.phi, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);

    const applyCamera = () => {
      const position = new THREE.Vector3().setFromSpherical(spherical).add(target);
      state.camera.position.copy(position);
      state.camera.lookAt(target);
      state.camera.updateMatrixWorld();
    };

    const element = state.renderer.domElement;
    let activePointerId = null;
    let lastX = 0;
    let lastY = 0;
    let downAt = 0;
    let movedPx = 0;

    const onPointerDown = (event) => {
      if (activePointerId !== null || event.button !== 0) return;
      activePointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      downAt = performance.now();
      movedPx = 0;
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (event.pointerId !== activePointerId) return;
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      movedPx += Math.abs(deltaX) + Math.abs(deltaY);
      if (movedPx < 2) return;
      spherical.theta -= deltaX * ORBIT_ROTATE_SPEED * config.rotateSpeed;
      spherical.phi = clamp(spherical.phi - deltaY * ORBIT_TILT_SPEED * config.rotateSpeed, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);
      applyCamera();
    };

    const releasePointer = (event) => {
      if (event.pointerId !== activePointerId) return;
      const elapsed = performance.now() - downAt;
      activePointerId = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      const isClick = movedPx <= PHOTO_CLICK_MAX_MOVE_PX && elapsed <= PHOTO_CLICK_MAX_DURATION_MS;
      if (isClick) selectPhotoAt(event.clientX, event.clientY);
    };

    const onWheel = (event) => {
      event.preventDefault();
      const zoomFactor = Math.exp(event.deltaY * ORBIT_ZOOM_SPEED * config.zoomSpeed);
      spherical.radius = clamp(spherical.radius * zoomFactor, config.minDistance, config.maxDistance);
      applyCamera();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', releasePointer);
    element.addEventListener('pointercancel', releasePointer);
    element.addEventListener('wheel', onWheel, { passive: false });

    return {
      target: config.target,
      config,
      getFrame() {
        return { target: config.target.clone(), spherical: spherical.clone() };
      },
      reset() {
        state.camera.position.copy(initialPosition);
        state.camera.quaternion.copy(initialQuaternion);
        state.camera.updateMatrixWorld();
      },
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /* ------------------------------------------------------------------ */
  /* Photo hit-testing (photoId -> parent for the big-image overlay)     */
  /* ------------------------------------------------------------------ */

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function findPhotoId(object) {
    let node = object;
    while (node) {
      const userData = node.userData;
      if (isRecord(userData)) {
        if (typeof userData.photoId === 'string') return userData.photoId;
        if (Array.isArray(userData.photoIds)) {
          const photoId = userData.photoIds.find((candidate) => typeof candidate === 'string');
          if (photoId) return photoId;
        }
      }
      node = node.parent;
    }
    return null;
  }

  function findPhotoIdByTexture(object) {
    let node = object;
    while (node) {
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) {
        if (!material) continue;
        for (const slot of ['map', 'emissiveMap', 'alphaMap']) {
          const texture = material[slot];
          if (!texture) continue;
          const photo = state.photos.find((candidate) => candidate.texture === texture);
          if (photo) return photo.id;
        }
      }
      node = node.parent;
    }
    return null;
  }

  function selectPhotoAt(clientX, clientY) {
    if (!state.built || !state.camera) return;
    const element = state.renderer.domElement;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerNdc, state.camera);
    const hits = raycaster.intersectObjects(state.scene.children, true);
    for (const hit of hits) {
      const photoId = findPhotoId(hit.object) || findPhotoIdByTexture(hit.object);
      if (photoId) {
        postToParent({ type: 'photoselected', photoId });
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Photo usage detection (heuristic for the all-photos hard gate)      */
  /* ------------------------------------------------------------------ */

  function detectPhotoIdsUsed() {
    const usedIds = new Set();
    const textureToPhotoId = new Map(state.photos.map((photo) => [photo.texture, photo.id]));
    state.scene.traverse((object) => {
      if (isRecord(object.userData)) {
        if (typeof object.userData.photoId === 'string') usedIds.add(object.userData.photoId);
        if (Array.isArray(object.userData.photoIds)) {
          object.userData.photoIds.forEach((photoId) => {
            if (typeof photoId === 'string') usedIds.add(photoId);
          });
        }
      }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        if (!material) continue;
        for (const slot of ['map', 'emissiveMap', 'alphaMap']) {
          const photoId = textureToPhotoId.get(material[slot]);
          if (photoId) usedIds.add(photoId);
        }
        if (isRecord(material.uniforms)) {
          Object.keys(material.uniforms).forEach((key) => {
            const uniform = material.uniforms[key];
            const photoId = uniform && uniform.value && uniform.value.isTexture ? textureToPhotoId.get(uniform.value) : undefined;
            if (photoId) usedIds.add(photoId);
          });
        }
      }
    });
    return state.photos.map((photo) => photo.id).filter((photoId) => usedIds.has(photoId));
  }

  /* ------------------------------------------------------------------ */
  /* Generated code execution + ctx                                      */
  /* ------------------------------------------------------------------ */

  function compileSceneCode(code) {
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new RuntimeFailure('CODE_INVALID', 'scene code is empty', { phase: 'build' });
    }
    const factory = new Function(`${code}\n;return typeof build === 'function' ? build : null;`);
    const buildFunction = factory();
    if (typeof buildFunction !== 'function') {
      throw new RuntimeFailure('CODE_INVALID', 'scene code must define function build(ctx)', { phase: 'build' });
    }
    return buildFunction;
  }

  function createContext() {
    return {
      runtimeVersion: RUNTIME_VERSION,
      THREE,
      scene: state.scene,
      camera: state.camera,
      renderer: state.renderer,
      photos: state.photos,
      addOrbitControls(options) {
        if (state.orbitControls) return state.orbitControls;
        state.orbitControls = createOrbitControls(options);
        return state.orbitControls;
      },
      onFrame(callback) {
        if (typeof callback === 'function') state.onFrameCallbacks.push(callback);
      },
      setBackground(color) {
        state.scene.background = color instanceof THREE.Color ? color : new THREE.Color(color);
      },
    };
  }

  function executeBuild(code) {
    const buildFunction = compileSceneCode(code);
    const context = createContext();
    const startedAt = performance.now();
    try {
      buildFunction(context);
    } catch (error) {
      // The caller records the cause once via the RuntimeFailure.cause path.
      throw new RuntimeFailure('BUILD_FAILED', error instanceof Error ? error.message : String(error), {
        phase: 'build',
        cause: error,
      });
    }
    state.timings.buildMs = performance.now() - startedAt;
  }

  /* ------------------------------------------------------------------ */
  /* Frame loop + fps sampling                                           */
  /* ------------------------------------------------------------------ */

  function pushFrameTime(timestamp) {
    state.frameTimes.push(timestamp);
    if (state.frameTimes.length > FPS_SAMPLE_FRAMES + 1) state.frameTimes.shift();
    const waiter = state.fpsWaiter;
    if (waiter && state.frameTimes.length >= waiter.requiredFrames + 1) {
      waiter.resolve();
    }
  }

  function waitForFpsWindow(requiredFrames, timeoutMs) {
    if (state.frameTimes.length >= requiredFrames + 1) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (state.fpsWaiter) state.fpsWaiter = null;
        resolve();
      }, timeoutMs);
      state.fpsWaiter = {
        requiredFrames,
        resolve: () => {
          state.fpsWaiter = null;
          clearTimeout(timer);
          resolve();
        },
      };
    });
  }

  function computeFps() {
    const times = state.frameTimes;
    if (times.length < 2) return null;
    const elapsedMs = times[times.length - 1] - times[0];
    if (!(elapsedMs > 0)) return null;
    return Math.round(((times.length - 1) * 1000 * 10) / elapsedMs) / 10;
  }

  function startAnimationLoop() {
    state.lastFrameTimestamp = null;
    const tick = (timestamp) => {
      if (state.animationFrameId === null) return;
      state.animationFrameId = requestAnimationFrame(tick);
      const deltaSeconds =
        state.lastFrameTimestamp === null ? 0 : Math.min(0.1, (timestamp - state.lastFrameTimestamp) / 1000);
      state.lastFrameTimestamp = timestamp;
      pushFrameTime(timestamp);
      state.framesRendered += 1;
      try {
        state.onFrameCallbacks.forEach((callback) => callback(deltaSeconds));
        state.renderer.render(state.scene, state.camera);
      } catch (error) {
        recordError('frame', error);
        state.onFrameCallbacks.length = 0;
      }
    };
    state.animationFrameId = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ */
  /* Capture                                                             */
  /* ------------------------------------------------------------------ */

  function computeCaptureFrame() {
    const controls = state.orbitControls;
    const target = controls ? controls.target.clone() : new THREE.Vector3().fromArray(DEFAULT_ORBIT_TARGET);
    const spherical = new THREE.Spherical().setFromVector3(state.camera.position.clone().sub(target));
    if (!(spherical.radius > 0.001)) spherical.set(6, Math.PI / 2 - 0.15, 0);
    return { target, spherical };
  }

  function applyCaptureView(view) {
    const azimuthDeg = isRecord(view) && Number.isFinite(view.azimuthDeg) ? view.azimuthDeg : 0;
    const elevationDeg = isRecord(view) && Number.isFinite(view.elevationDeg) ? view.elevationDeg : 0;
    if (azimuthDeg === 0 && elevationDeg === 0) return;
    const frame = computeCaptureFrame();
    const spherical = frame.spherical.clone();
    spherical.theta += THREE.MathUtils.degToRad(azimuthDeg);
    spherical.phi = clamp(spherical.phi - THREE.MathUtils.degToRad(elevationDeg), MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);
    state.camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(frame.target));
    state.camera.lookAt(frame.target);
    state.camera.updateMatrixWorld();
  }

  function captureImages(views) {
    const cameraPosition = state.camera.position.clone();
    const cameraQuaternion = state.camera.quaternion.clone();
    const canvas = state.renderer.domElement;
    try {
      return views.map((view, index) => {
        applyCaptureView(view);
        state.renderer.render(state.scene, state.camera);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        return {
          view,
          index,
          dataUrl,
          width: canvas.width,
          height: canvas.height,
        };
      });
    } finally {
      state.camera.position.copy(cameraPosition);
      state.camera.quaternion.copy(cameraQuaternion);
      state.camera.updateMatrixWorld();
      state.renderer.render(state.scene, state.camera);
    }
  }

  function collectRuntimeStats() {
    const renderInfo = state.renderer.info.render;
    return {
      runtimeVersion: RUNTIME_VERSION,
      buildMs: roundMs(state.timings.buildMs),
      texturesMs: roundMs(state.timings.texturesMs),
      firstFrameMs: roundMs(state.timings.firstFrameMs),
      fps: computeFps(),
      errors: state.errors.slice(),
      photoIdsUsed: detectPhotoIdsUsed(),
      photoCount: state.photos.length,
      networkAttempts: state.networkAttempts.length + state.cspViolations.length,
      networkAttemptDetails: state.networkAttempts.slice(0, 10),
      cspViolations: state.cspViolations.slice(0, 10),
      framesRendered: state.framesRendered,
      canvas: { width: state.renderer.domElement.width, height: state.renderer.domElement.height },
      drawStats: { calls: renderInfo.calls, triangles: renderInfo.triangles, points: renderInfo.points },
      webgl: state.webglInfo,
      orbitControls: Boolean(state.orbitControls),
      sessionElapsedMs: Math.round(performance.now() - state.startedAt),
    };
  }

  function roundMs(value) {
    return typeof value === 'number' ? Math.round(value * 10) / 10 : null;
  }

  /* ------------------------------------------------------------------ */
  /* init / capture handlers                                             */
  /* ------------------------------------------------------------------ */

  async function handleInit(message) {
    if (state.initialized) {
      postToParent({ type: 'error', code: 'SESSION_ALREADY_INITIALIZED', phase: 'init', message: 'init() was called twice' });
      return;
    }
    state.initialized = true;
    state.runId = typeof message.runId === 'string' ? message.runId : 'run-unknown';
    state.startedAt = performance.now();
    try {
      if (Number.isFinite(message.runtimeVersion) && message.runtimeVersion !== RUNTIME_VERSION) {
        throw new RuntimeFailure('RUNTIME_VERSION_MISMATCH', `expected runtimeVersion ${RUNTIME_VERSION}, got ${message.runtimeVersion}`);
      }
      const photoInputs = validatePhotoInputs(message.photos);
      if (typeof message.code !== 'string' || message.code.trim().length === 0) {
        throw new RuntimeFailure('CODE_INVALID', 'init() requires the generated scene code', { phase: 'build' });
      }

      const probeContext = probeWebGlContext();
      if (!probeContext) {
        throw new RuntimeFailure('WEBGL_UNAVAILABLE', 'WebGL is not available in this browser and sandbox');
      }
      state.webglInfo = readWebGlInfo(probeContext);
      state.renderer = createRenderer();
      state.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        recordError('renderer', new Error('WebGL context lost'));
      });

      const sceneAndCamera = createSceneAndCamera();
      state.scene = sceneAndCamera.scene;
      state.camera = sceneAndCamera.camera;
      resizeRenderer();

      installNetworkMonitor();

      const texturesStartedAt = performance.now();
      state.photos = await loadPhotoTextures(photoInputs);
      state.timings.texturesMs = performance.now() - texturesStartedAt;

      executeBuild(message.code);
      ensureCameraSane();
      resizeRenderer();
      state.renderer.render(state.scene, state.camera);
      state.built = true;
      state.timings.firstFrameMs = performance.now() - state.startedAt;
      startAnimationLoop();
      postToParent({
        type: 'built',
        runtimeVersion: RUNTIME_VERSION,
        buildMs: roundMs(state.timings.buildMs),
        texturesMs: roundMs(state.timings.texturesMs),
        firstFrameMs: roundMs(state.timings.firstFrameMs),
        photoCount: state.photos.length,
      });
    } catch (error) {
      if (error instanceof RuntimeFailure && error.cause) recordError(error.phase, error.cause);
      else recordError(error.phase || 'init', error);
      postFailure(error);
    }
  }

  async function handleCapture(message) {
    if (!state.built) {
      postToParent({ type: 'error', code: 'NOT_READY', phase: 'capture', message: 'capture() before built' });
      return;
    }
    if (state.captureBusy) {
      postToParent({ type: 'error', code: 'CAPTURE_BUSY', phase: 'capture', message: 'a capture is already running' });
      return;
    }
    state.captureBusy = true;
    try {
      // Spec: fps must be averaged over 30 frames, so wait for that window
      // (bounded — a very slow scene still gets its capture, with a low fps).
      await waitForFpsWindow(FPS_SAMPLE_FRAMES, FPS_MAX_WAIT_MS);
      const views = Array.isArray(message.views) ? message.views.filter(isRecord) : [];
      const images = captureImages(views);
      const runtime = collectRuntimeStats();
      postToParent({ type: 'captures', requestId: message.requestId, runtimeVersion: RUNTIME_VERSION, images, runtime });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        recordError('capture', error);
        postToParent({
          type: 'error',
          code: 'CAPTURE_TAINTED',
          phase: 'capture',
          message: 'canvas.toDataURL() failed: the drawing buffer is tainted',
          errors: state.errors.slice(),
        });
        return;
      }
      recordError('capture', error);
      postFailure(new RuntimeFailure('CAPTURE_FAILED', error instanceof Error ? error.message : String(error), { phase: 'capture' }));
    } finally {
      state.captureBusy = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!isRecord(message) || typeof message.type !== 'string') return;
    if (message.type === 'init') {
      handleInit(message).catch((error) => postFailure(error));
    } else if (message.type === 'capture') {
      handleCapture(message).catch((error) => postFailure(error));
    }
  });

  window.addEventListener('error', (event) => {
    recordError('window', event.error instanceof Error ? event.error : new Error(event.message || 'window error'));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    recordError('promise', reason instanceof Error ? reason : new Error(String(reason)));
  });

  window.addEventListener('resize', () => {
    if (state.renderer && state.camera) resizeRenderer();
  });
})();

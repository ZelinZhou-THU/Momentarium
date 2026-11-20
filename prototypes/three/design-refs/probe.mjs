/*
 * 设计参考场景 — 无依赖 headless 探针。
 *
 * 启动一个仅本机可见的静态服务（仓库根，允许 /prototypes/three/** 与 /tests/fixtures/**），
 * 用 headless Edge 打开对比页自动跑两版场景，采集证据并做硬门禁校验：
 *   evidence/{smooth,voxel}-{initial,azimuth35}.jpg、design-refs-report.json、page.png
 *
 * 用法：
 *   node prototypes/three/design-refs/probe.mjs            # 自动跑 + 写证据
 *   node prototypes/three/design-refs/probe.mjs --serve    # 只起静态服务（手动打开调试，Ctrl+C 退出）
 *   node prototypes/three/design-refs/probe.mjs --snippets # 渲染参考片段评审画廊，截图写到 evidence/snippets/
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url))); // repo root
const EVIDENCE = join(ROOT, 'prototypes', 'three', 'design-refs', 'evidence');
const EDGE = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const AUTO_RESULT_TIMEOUT_MS = 120000;
const MIN_IMAGE_BYTES = 10_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const log = (label, detail) => console.log(`[compare] ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail).slice(0, 400)}`}`);

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

/* ------------------------------ 静态服务 ------------------------------- */

const startServer = async (port) => {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'prototypes/three/design-refs/index.html' : pathname.replace(/^\/+/, '');
    const filePath = resolve(ROOT, normalize(relative));
    // 参考片段的唯一来源在后端资源目录（提示词与评审画廊共用同一份文件），只放开这一个目录。
    const allowedPrefixes = [join(ROOT, 'prototypes', 'three'), join(ROOT, 'tests', 'fixtures'), join(ROOT, 'backend', 'src', 'main', 'resources', 'scene', 'snippets')];
    const allowed = allowedPrefixes.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}\\`));
    if (!allowed) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('not a file');
      response.writeHead(200, { 'Content-Type': MIME.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream' });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
    }
  });
  await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
  return { port: server.address().port, close: () => server.close() };
};

/* -------------------------------- CDP --------------------------------- */

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(webSocketUrl);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        const { resolve: resolveCall, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolveCall(message.result);
        return;
      }
      if (typeof message.method === 'string') this.events.push(message);
    });
  }

  static async connect(webSocketUrl) {
    const client = new CdpClient(webSocketUrl);
    await new Promise((resolveOpen, reject) => {
      client.socket.addEventListener('open', resolveOpen, { once: true });
      client.socket.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
    });
    return client;
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCall, reject) => this.pending.set(id, { resolve: resolveCall, reject }));
  }

  close() {
    this.socket.close();
  }
}

/* --------------------------- 证据写入与校验 ---------------------------- */

const saveValidated = async (fileName, buffer, kind, minBytes = MIN_IMAGE_BYTES) => {
  const finalPath = join(EVIDENCE, fileName);
  const tempPath = `${finalPath}.tmp-${process.pid}`;
  await writeFile(tempPath, buffer);
  const written = await readFile(tempPath);
  if (kind === 'png' && (written.length <= MIN_IMAGE_BYTES || !written.subarray(0, 8).equals(PNG_MAGIC))) {
    await rm(tempPath, { force: true });
    throw new Error(`evidence invalid: ${fileName} size=${written.length}`);
  }
  if (kind === 'jpeg' && (written.length <= minBytes || !written.subarray(0, 3).equals(JPEG_MAGIC))) {
    await rm(tempPath, { force: true });
    throw new Error(`evidence invalid: ${fileName} size=${written.length}`);
  }
  if (kind === 'json') {
    if (written.length <= 200) {
      await rm(tempPath, { force: true });
      throw new Error(`evidence invalid: ${fileName} size=${written.length}`);
    }
    try {
      JSON.parse(written.toString('utf8'));
    } catch {
      await rm(tempPath, { force: true });
      throw new Error(`evidence invalid: ${fileName} not json`);
    }
  }
  await import('node:fs/promises').then(({ rename }) => rename(tempPath, finalPath));
  return written.length;
};

const dataUrlToBuffer = (dataUrl, expectedPrefix) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(expectedPrefix)) {
    throw new Error(`invalid dataUrl prefix: ${String(dataUrl).slice(0, 24)}`);
  }
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
};

const waitForDevtoolsPort = async (profileDir) => {
  const devtoolsFile = join(profileDir, 'DevToolsActivePort');
  const startedAt = Date.now();
  while (Date.now() - startedAt < 25000) {
    try {
      const content = await readFile(devtoolsFile, 'utf8');
      const port = Number(content.split('\n')[0].trim());
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('devtools port timeout');
};

/* ------------------------------- 主流程 ------------------------------- */

const validateVariant = (variant, key) => {
  const issues = [];
  const runtime = variant.runtime;
  if (runtime.errors.length > 0) issues.push(`${key}: runtime.errors=${runtime.errors.length}`);
  if (runtime.photoIdsUsed.length !== 0) issues.push(`${key}: photoIdsUsed=${runtime.photoIdsUsed.length} (pure-scene expects 0)`);
  if (runtime.networkAttempts !== 0) issues.push(`${key}: networkAttempts=${runtime.networkAttempts}`);
  if (typeof runtime.fps !== 'number' || runtime.fps < 20) issues.push(`${key}: fps=${runtime.fps} (<20)`);
  if (variant.views.length !== 2) issues.push(`${key}: views=${variant.views.length} (expected 2)`);
  if (typeof variant.codeLength === 'number' && variant.codeLength > 12288) issues.push(`${key}: codeLength=${variant.codeLength} (>12KB)`);
  variant.views.forEach((view, index) => {
    const buffer = dataUrlToBuffer(view.dataUrl, 'data:image/jpeg;base64,');
    if (buffer.length <= MIN_IMAGE_BYTES) issues.push(`${key}: view[${index}] jpeg too small (${buffer.length}B)`);
    if (!buffer.subarray(0, 3).equals(JPEG_MAGIC)) issues.push(`${key}: view[${index}] not jpeg`);
  });
  return issues;
};

const runCompare = async () => {
  const profile = await mkdtemp(join(tmpdir(), 'mome-voxel-smooth-'));
  const server = await startServer(0);
  const requestedScenes = (process.argv.find((argument) => argument.startsWith('--scenes=')) ?? '').slice('--scenes='.length);
  const sceneQuery = requestedScenes.length > 0 ? `&scenes=${encodeURIComponent(requestedScenes)}` : '';
  const pageUrl = `http://127.0.0.1:${server.port}/prototypes/three/design-refs/index.html?auto=1${sceneQuery}`;
  log('serving', { root: ROOT, port: server.port });
  const browser = spawn(
    EDGE,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1500,1000',
      '--hide-scrollbars',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
    ],
    { stdio: 'ignore' },
  );
  try {
    await import('node:fs/promises').then(async ({ mkdir }) => mkdir(EVIDENCE, { recursive: true }));
    const devtoolsPort = await waitForDevtoolsPort(profile);
    const target = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent('about:blank')}`, {
      method: 'PUT',
    }).then((response) => response.json());
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    log('page', pageUrl);
    await client.send('Page.navigate', { url: pageUrl });

    const evaluated = await Promise.race([
      client.send('Runtime.evaluate', {
        expression: 'window.__compareResult',
        awaitPromise: true,
        returnByValue: true,
      }),
      sleep(AUTO_RESULT_TIMEOUT_MS).then(() => {
        throw new Error(`compare result timeout (${AUTO_RESULT_TIMEOUT_MS}ms)`);
      }),
    ]);
    if (evaluated.exceptionDetails) throw new Error(`page exception: ${evaluated.exceptionDetails.text}`);
    const result = evaluated.result.value;
    if (result === null || typeof result !== 'object') throw new Error('page returned no compare result');
    if (result.failed === true) throw new Error(`compare page failed: ${result.message}`);

    const validationIssues = [];
    for (const key of ['foggy-coast', 'rainy-street', 'interior-hall']) {
      const variant = result.variants[key];
      if (!variant || typeof variant !== 'object') {
        validationIssues.push(`${key}: missing result`);
        continue;
      }
      for (let index = 0; index < variant.views.length; index += 1) {
        const label = index === 0 ? 'initial' : 'azimuth35';
        const buffer = dataUrlToBuffer(variant.views[index].dataUrl, 'data:image/jpeg;base64,');
        const bytes = await saveValidated(`design-${key}-${label}.jpg`, buffer, 'jpeg');
        log(`saved ${key}-${label}.jpg`, bytes);
      }
      validationIssues.push(...validateVariant(variant, key));
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      photoFixtures: result.photos,
      captureViews: result.captureViews,
      variants: Object.fromEntries(
        Object.entries(result.variants).map(([key, variant]) => [
          key,
          {
            label: variant.label,
            buildMs: variant.runtime.buildMs,
            texturesMs: variant.runtime.texturesMs,
            firstFrameMs: variant.runtime.firstFrameMs,
            fps: variant.runtime.fps,
            drawStats: variant.runtime.drawStats,
            photoIdsUsed: variant.runtime.photoIdsUsed,
            photoCount: variant.runtime.photoCount,
            networkAttempts: variant.runtime.networkAttempts,
            errors: variant.runtime.errors,
            framesRendered: variant.runtime.framesRendered,
            canvas: variant.runtime.canvas,
            orbitControls: variant.runtime.orbitControls,
          },
        ]),
      ),
      validation: { passed: validationIssues.length === 0, issues: validationIssues },
    };
    await saveValidated('design-refs-report.json', Buffer.from(JSON.stringify(summary, null, 2)), 'json');
    const pageShot = await client.send('Page.captureScreenshot', { format: 'png' });
    await saveValidated('page.png', Buffer.from(pageShot.data, 'base64'), 'png');

    const consoleErrors = client.events
      .filter((event) => event.method === 'Runtime.exceptionThrown')
      .map((event) => String(event.params.exceptionDetails.text ?? '').slice(0, 300));
    if (consoleErrors.length > 0) validationIssues.push(`page exceptions: ${consoleErrors.join(' | ')}`);

    log('summary', summary.variants);
    log('validation', summary.validation);
    if (validationIssues.length > 0) {
      throw new Error(`validation failed: ${validationIssues.join('; ')}`);
    }
    log('done', { evidence: EVIDENCE });
    client.close();
    browser.kill();
    server.close();
    await sleep(400);
    process.exit(0);
    client.close();
  } finally {
    browser.kill();
    await sleep(400);
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
};

/* ---------------------- 参考片段评审画廊（--snippets） ---------------------- */

/** 无头 Edge 打开 snippets.html?auto=1，等 window.__snippetResult，把每个演示的 2 张截图写到 evidence/snippets/。 */
const runSnippets = async () => {
  const profile = await mkdtemp(join(tmpdir(), 'mome-snippets-'));
  const server = await startServer(0);
  const pageUrl = `http://127.0.0.1:${server.port}/prototypes/three/design-refs/snippets.html?auto=1`;
  const browser = spawn(
    EDGE,
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1500,1000', '--hide-scrollbars', `--user-data-dir=${profile}`, '--remote-debugging-port=0'],
    { stdio: 'ignore' },
  );
  try {
    await import('node:fs/promises').then(async ({ mkdir }) => mkdir(join(EVIDENCE, 'snippets'), { recursive: true }));
    const devtoolsPort = await waitForDevtoolsPort(profile);
    const target = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((response) => response.json());
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    log('page', pageUrl);
    await client.send('Page.navigate', { url: pageUrl });
    await sleep(1500);
    const evaluated = await Promise.race([
      client.send('Runtime.evaluate', { expression: 'window.__snippetResult', awaitPromise: true, returnByValue: true }),
      sleep(AUTO_RESULT_TIMEOUT_MS * 2).then(() => {
        throw new Error('snippet result timeout');
      }),
    ]);
    if (evaluated.exceptionDetails) throw new Error(`page exception: ${evaluated.exceptionDetails.text}`);
    const results = evaluated.result.value;
    if (results === null || typeof results !== 'object' || results.failed === true) throw new Error(`snippet page failed: ${JSON.stringify(results).slice(0, 300)}`);
    const issues = [];
    const summary = {};
    for (const [key, result] of Object.entries(results)) {
      if (result.failed) {
        issues.push(`${key}: ${result.failed}`);
        continue;
      }
      for (let index = 0; index < result.views.length; index += 1) {
        const label = index === 0 ? 'initial' : 'azimuth35';
        await saveValidated(join('snippets', `${key}-${label}.jpg`), dataUrlToBuffer(result.views[index], 'data:image/jpeg;base64,'), 'jpeg', 2000);
      }
      const runtime = result.runtime;
      if (runtime.errors.length > 0) issues.push(`${key}: errors=${JSON.stringify(runtime.errors).slice(0, 200)}`);
      if (runtime.networkAttempts !== 0) issues.push(`${key}: networkAttempts=${runtime.networkAttempts}`);
      if (typeof runtime.fps !== 'number' || runtime.fps < 20) issues.push(`${key}: fps=${runtime.fps}`);
      summary[key] = { label: result.label, uses: result.uses, codeBytes: result.codeBytes, fps: runtime.fps, drawStats: runtime.drawStats, buildMs: runtime.buildMs, errors: runtime.errors, networkAttempts: runtime.networkAttempts };
    }
    const report = { generatedAt: new Date().toISOString(), demos: summary, validation: { passed: issues.length === 0, issues } };
    await saveValidated(join('snippets', 'snippets-report.json'), Buffer.from(JSON.stringify(report, null, 2)), 'json');
    log('validation', report.validation);
    client.close();
    if (issues.length > 0) throw new Error(`validation failed: ${issues.join('; ')}`);
  } finally {
    browser.kill();
    await sleep(400);
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
};

const main = async () => {
  if (process.argv.includes('--snippets')) {
    await runSnippets();
    return;
  }
  if (process.argv.includes('--serve')) {
    const server = await startServer(4321);
    log('manual mode', `http://127.0.0.1:${server.port}/prototypes/three/design-refs/index.html`);
    await new Promise(() => {});
    return;
  }
  await runCompare();
};

main().catch((error) => {
  console.error('[compare] FAILED:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

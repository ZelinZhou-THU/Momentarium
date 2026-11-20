#!/usr/bin/env node
/*
 * Headless probe for the SceneRuntime prototype.
 *
 * It starts serve.mjs on an ephemeral port, drives Microsoft Edge through the
 * DevTools protocol (no npm dependencies), runs the prototype page through the
 * happy path and the hard-gate edge cases, and writes reproducible evidence:
 *
 *   evidence/capture-initial.jpg      sandbox capture, initial view
 *   evidence/capture-azimuth35.jpg    sandbox capture, azimuth +35 degrees
 *   evidence/page-normal.png          full prototype page screenshot
 *   evidence/runtime-normal.json      runtime statistics of the happy path
 *   evidence/report.json              every scenario, assertions and findings
 *
 * Usage: node prototypes/three/probe.mjs [--scenario all|normal|build-error|
 *        network-guard|build-timeout|webgl-unavailable|file-protocol|session-limit]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(ROOT, '..', '..', 'docs', 'evidence', 'three');
const SERVE_SCRIPT = join(ROOT, 'serve.mjs');
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const BROWSER_FLAGS = [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--window-size=1600,1200',
  '--hide-scrollbars',
];
const NO_WEBGL_FLAGS = ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'];
const VIEW_START_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const raceWithTimeout = (promise, timeoutMs, fallback) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/* ---------------------------------------------------------------------- */
/* CDP client                                                             */
/* ---------------------------------------------------------------------- */

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(webSocketUrl);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
        else resolve(message.result);
        return;
      }
      if (typeof message.method === 'string') this.events.push(message);
    });
  }

  static async connect(webSocketUrl) {
    const client = new CdpClient(webSocketUrl);
    await new Promise((resolve, reject) => {
      client.socket.addEventListener('open', resolve, { once: true });
      client.socket.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
    });
    return client;
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

const evaluate = async (client, expression, options = {}) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: Boolean(options.awaitPromise),
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(`page evaluation failed: ${description}`);
  }
  return result.result ? result.result.value : undefined;
};

/* ---------------------------------------------------------------------- */
/* Process helpers                                                        */
/* ---------------------------------------------------------------------- */

const findEdge = () => {
  const candidates = [process.env.EDGE_PATH, ...EDGE_CANDIDATES].filter(Boolean);
  return candidates;
};

const fileExists = async (filePath) => {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
};

const waitForDevToolsPort = async (profileDir, timeoutMs) => {
  const devtoolsFile = join(profileDir, 'DevToolsActivePort');
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const content = await readFile(devtoolsFile, 'utf8');
      const port = Number(content.split('\n')[0].trim());
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`browser devtools port did not appear within ${timeoutMs} ms`);
};

const launchBrowser = async (profileDir, extraFlags) => {
  const edgePaths = findEdge();
  const edgePath = edgePaths[0];
  if (!edgePath) throw new Error('Microsoft Edge not found; set EDGE_PATH');
  if (!(await fileExists(edgePath))) throw new Error(`browser executable missing: ${edgePath}`);
  const args = [...BROWSER_FLAGS, ...extraFlags, `--user-data-dir=${profileDir}`, '--remote-debugging-port=0'];
  return { process: spawn(edgePath, args, { stdio: 'ignore' }), edgePath };
};

const createPageTarget = async (devtoolsPort, url) => {
  const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`could not create page target: HTTP ${response.status}`);
  return response.json();
};

const stopBrowser = async (browser, profileDir) => {
  browser.process.kill();
  await raceWithTimeout(
    new Promise((resolve) => browser.process.once('exit', resolve)),
    5000,
    null,
  );
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
};

const findFreePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });

const startStaticServer = async () => {
  const port = await findFreePort();
  const child = spawn(process.execPath, [SERVE_SCRIPT, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/index.html`);
      if (response.ok) return { port, child, logs };
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`static server did not start: ${logs.join('')}`);
};

const stopStaticServer = async (server) => {
  server.child.kill();
  await raceWithTimeout(
    new Promise((resolve) => server.child.once('exit', resolve)),
    3000,
    null,
  );
};

/* ---------------------------------------------------------------------- */
/* Page driving helpers                                                   */
/* ---------------------------------------------------------------------- */

const openPrototypePage = async (devtoolsPort, pageUrl) => {
  const target = await createPageTarget(devtoolsPort, 'about:blank');
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.navigate', { url: pageUrl });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    try {
      const readyState = await raceWithTimeout(evaluate(client, 'document.readyState'), 1500, 'pending');
      if (readyState === 'complete') return { client, target };
    } catch {
      // page may still be parsing or frozen
    }
    await sleep(100);
  }
  throw new Error('prototype page did not reach readyState=complete');
};

const waitForPrototypeResult = async (client, timeoutMs) => {
  const startedAt = Date.now();
  const freezes = [];
  while (Date.now() - startedAt < timeoutMs) {
    const hasResult = await raceWithTimeout(
      evaluate(client, 'Boolean(window.__prototypeResult)'),
      1500,
      'frozen',
    );
    if (hasResult === 'frozen') {
      if (freezes.length === 0 || Date.now() - freezes[freezes.length - 1] > 1000) freezes.push(Date.now());
      await sleep(250);
      continue;
    }
    if (hasResult === true) {
      const result = await raceWithTimeout(
        client.send('Runtime.evaluate', {
          expression: 'window.__prototypeResult',
          awaitPromise: true,
          returnByValue: true,
        }),
        timeoutMs,
        null,
      );
      if (result && result.result && result.result.value) return { result: result.result.value, freezes };
      if (result && result.exceptionDetails) {
        throw new Error(`__prototypeResult rejected: ${result.exceptionDetails.text}`);
      }
    }
    await sleep(150);
  }
  throw new Error(`__prototypeResult did not resolve within ${timeoutMs} ms`);
};

const consoleEventsOf = (client) =>
  client.events
    .filter((event) => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(event.method))
    .map((event) => {
      if (event.method === 'Runtime.consoleAPICalled') {
        const text = event.params.args
          .map((argument) => argument.value ?? argument.description ?? argument.type)
          .join(' ');
        return { source: 'console', type: event.params.type, text: text.slice(0, 600) };
      }
      if (event.method === 'Runtime.exceptionThrown') {
        return { source: 'exception', type: 'error', text: (event.params.exceptionDetails.text ?? '').slice(0, 600) };
      }
      const { level, text } = event.params.entry;
      return { source: 'log', type: level, text: String(text).slice(0, 600) };
    });

const screenshotOf = async (client, fileName) => {
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(EVIDENCE_DIR, fileName), Buffer.from(shot.data, 'base64'));
  return fileName;
};

const saveCapture = async (capture, fileName) => {
  const base64 = capture.dataUrl.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');
  await writeFile(join(EVIDENCE_DIR, fileName), buffer);
  return {
    fileName,
    width: capture.width,
    height: capture.height,
    bytes: buffer.byteLength,
    magic: buffer.subarray(0, 3).toString('hex'),
  };
};

const clickIframeCenter = async (client) => {
  const rect = await evaluate(
    client,
    `(() => {
      const frame = document.querySelector('iframe');
      if (!frame) return null;
      const box = frame.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    })()`,
  );
  if (!rect) return { clicked: false, reason: 'no iframe on page' };
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(600);
  const selections = await evaluate(client, 'window.__prototype.state.photoSelections.slice()');
  return { clicked: true, point: { x, y }, selections: Array.isArray(selections) ? selections : [] };
};

const stripCaptureDataUrls = (result) => {
  if (!result || !Array.isArray(result.captures)) return null;
  return {
    ...result,
    captures: result.captures.map((capture) => ({
      label: capture.label,
      view: capture.view,
      width: capture.width,
      height: capture.height,
      bytes: capture.bytes,
      prefix: typeof capture.dataUrl === 'string' ? capture.dataUrl.slice(0, 32) : null,
    })),
  };
};

/* ---------------------------------------------------------------------- */
/* Scenario definitions                                                   */
/* ---------------------------------------------------------------------- */

const buildScenarioList = (baseUrl) => [
  {
    name: 'normal',
    description: 'happy path: 3-photo transfer, inline three+runtime, build(ctx), 2 captures, stats, photo click',
    url: `${baseUrl}/index.html?auto=1&photos=3`,
    run: async (client) => {
      const { result, freezes } = await waitForPrototypeResult(client, VIEW_START_TIMEOUT_MS);
      await sleep(1000);
      const screenshot = await screenshotOf(client, 'page-normal.png');
      const captures = [];
      if (result.captures && result.captures[0]) {
        captures.push(await saveCapture(result.captures[0], 'capture-initial.jpg'));
      }
      if (result.captures && result.captures[1]) {
        captures.push(await saveCapture(result.captures[1], 'capture-azimuth35.jpg'));
      }
      const click = await clickIframeCenter(client);
      await writeFile(join(EVIDENCE_DIR, 'runtime-normal.json'), JSON.stringify(stripCaptureDataUrls(result), null, 2));
      return {
        result: stripCaptureDataUrls(result),
        screenshot,
        captureFiles: captures,
        click,
        freezes,
        console: consoleEventsOf(client),
      };
    },
    assertions: (payload) => {
      const checks = [];
      const { result } = payload;
      checks.push({ name: 'run ok', pass: result.ok === true, detail: result.ok });
      checks.push({
        name: '2 JPEG captures <= 2MB each',
        pass:
          Array.isArray(result.captures) &&
          result.captures.length === 2 &&
          result.captures.every((capture) => capture.width > 0 && capture.height > 0 && capture.bytes <= 2 * 1024 * 1024) &&
          payload.captureFiles.length === 2 &&
          payload.captureFiles.every((file) => file.magic === 'ffd8ff'),
        detail: {
          captures: result.captures && result.captures.map((capture) => `${capture.width}x${capture.height}/${capture.bytes}B`),
          files: payload.captureFiles,
        },
      });
      checks.push({
        name: 'runtime.errors empty',
        pass: Boolean(result.runtime) && result.runtime.errors.length === 0,
        detail: result.runtime ? `${result.runtime.errors.length} errors` : 'no runtime',
      });
      checks.push({
        name: 'all photos used',
        pass:
          Boolean(result.runtime) &&
          result.runtime.photoCount > 0 &&
          result.runtime.photoIdsUsed.length === result.runtime.photoCount,
        detail: result.runtime ? `${result.runtime.photoIdsUsed.length}/${result.runtime.photoCount}` : 'no runtime',
      });
      checks.push({
        name: 'networkAttempts = 0',
        pass: Boolean(result.runtime) && result.runtime.networkAttempts === 0,
        detail: result.runtime ? result.runtime.networkAttempts : 'no runtime',
      });
      checks.push({
        name: 'fps >= 20',
        pass: Boolean(result.runtime) && typeof result.runtime.fps === 'number' && result.runtime.fps >= 20,
        detail: result.runtime ? result.runtime.fps : 'no runtime',
      });
      checks.push({
        name: 'photo click returns photoId',
        pass:
          Array.isArray(payload.click.selections) &&
          payload.click.selections.length > 0 &&
          Array.isArray(result.photo?.ids) &&
          result.photo.ids.includes(payload.click.selections[0]),
        detail: payload.click,
      });
      return checks;
    },
  },
  {
    name: 'build-error',
    description: 'build(ctx) throws: runtime error path, no captures',
    url: `${baseUrl}/index.html?auto=1&code=build-error`,
    run: async (client) => {
      const { result } = await waitForPrototypeResult(client, VIEW_START_TIMEOUT_MS);
      await sleep(500);
      const screenshot = await screenshotOf(client, 'page-build-error.png');
      return { result: stripCaptureDataUrls(result), screenshot, console: consoleEventsOf(client) };
    },
    assertions: (payload) => [
      { name: 'run failed', pass: payload.result.ok === false, detail: payload.result.ok },
      {
        name: 'BUILD_FAILED surfaced',
        pass: payload.result.failures.some((failure) => failure.code === 'BUILD_FAILED'),
        detail: payload.result.failures,
      },
    ],
  },
  {
    name: 'network-guard',
    description: 'scene tries fetch + external image: CSP blocks, networkAttempts > 0',
    url: `${baseUrl}/index.html?auto=1&code=network-guard`,
    run: async (client) => {
      const { result } = await waitForPrototypeResult(client, VIEW_START_TIMEOUT_MS);
      await sleep(500);
      return { result: stripCaptureDataUrls(result), console: consoleEventsOf(client) };
    },
    assertions: (payload) => [
      { name: 'scene still builds', pass: payload.result.ok === true, detail: payload.result.ok },
      {
        name: 'networkAttempts detected',
        pass: Boolean(payload.result.runtime) && payload.result.runtime.networkAttempts > 0,
        detail: payload.result.runtime ? payload.result.runtime.networkAttempts : 'no runtime',
      },
    ],
  },
  {
    name: 'build-timeout',
    description: 'build(ctx) blocks 12s: parent 8s watchdog must fire while the sandbox is blocked',
    url: `${baseUrl}/index.html?auto=1&code=build-timeout`,
    run: async (client) => {
      const startedAt = Date.now();
      const { result, freezes } = await waitForPrototypeResult(client, 45000);
      await sleep(300);
      const screenshot = await screenshotOf(client, 'page-build-timeout.png');
      return {
        result: stripCaptureDataUrls(result),
        screenshot,
        freezes,
        wallClockMs: Date.now() - startedAt,
        console: consoleEventsOf(client),
      };
    },
    assertions: (payload) => [
      {
        name: 'parent 8s watchdog fired while the sandbox was blocked',
        pass: payload.result.ok === false && payload.result.failures.some((failure) => failure.code === 'BUILD_TIMEOUT'),
        detail: payload.result.failures,
      },
      {
        name: 'parent page stayed responsive (sandbox did not freeze it)',
        pass: payload.freezes.length === 0 && payload.wallClockMs < 12000,
        detail: `${payload.wallClockMs}ms wall clock, freeze observations=${payload.freezes.length}`,
      },
    ],
  },
  {
    name: 'webgl-unavailable',
    description: 'WebGL disabled: runtime must report WEBGL_UNAVAILABLE',
    url: `${baseUrl}/index.html?auto=1`,
    browserFlags: NO_WEBGL_FLAGS,
    run: async (client) => {
      const { result } = await waitForPrototypeResult(client, VIEW_START_TIMEOUT_MS);
      await sleep(300);
      const screenshot = await screenshotOf(client, 'page-webgl-unavailable.png');
      return { result: stripCaptureDataUrls(result), screenshot };
    },
    assertions: (payload) => [
      { name: 'run failed', pass: payload.result.ok === false, detail: payload.result.ok },
      {
        name: 'WEBGL_UNAVAILABLE surfaced',
        pass: payload.result.failures.some((failure) => failure.code === 'WEBGL_UNAVAILABLE'),
        detail: payload.result.failures,
      },
    ],
  },
  {
    name: 'file-protocol',
    description: 'open index.html via file://: parent fetch of vendor/photo must fail cleanly',
    url: `${pathToFileURL(join(ROOT, 'index.html')).href}?auto=1`,
    run: async (client) => {
      const { result } = await waitForPrototypeResult(client, VIEW_START_TIMEOUT_MS);
      await sleep(300);
      return { result: stripCaptureDataUrls(result), console: consoleEventsOf(client) };
    },
    assertions: (payload) => [
      { name: 'run failed', pass: payload.result.ok === false, detail: payload.result.ok },
      {
        name: 'RESOURCE_LOAD_FAILED surfaced',
        pass: payload.result.failures.some((failure) => failure.code === 'RESOURCE_LOAD_FAILED'),
        detail: payload.result.failures,
      },
    ],
  },
];

const runSessionLimitScenario = async (baseUrl) => {
  const profileDir = await mkdtemp(join(tmpdir(), 'mome-probe-'));
  const browser = await launchBrowser(profileDir, []);
  const devtoolsPort = await waitForDevToolsPort(profileDir, 20000);
  const { client } = await openPrototypePage(devtoolsPort, `${baseUrl}/index.html?auto=1`);
  try {
    await waitForPrototypeResult(client, VIEW_START_TIMEOUT_MS);
    await sleep(91000);
    const state = await evaluate(
      client,
      `({
        iframeCount: document.querySelectorAll('iframe').length,
        sessionExpired: window.__prototype.state.sessionExpired,
        phase: window.__prototype.state.phase,
      })`,
    );
    return {
      state,
      assertions: [
        { name: 'iframe destroyed at 90s', pass: state.iframeCount === 0, detail: state.iframeCount },
        { name: 'session marked expired', pass: state.sessionExpired === true, detail: state.sessionExpired },
      ],
    };
  } finally {
    client.close();
    await stopBrowser(browser, profileDir);
  }
};

/* ---------------------------------------------------------------------- */
/* Main                                                                   */
/* ---------------------------------------------------------------------- */

const parseArgs = () => {
  const args = process.argv.slice(2);
  const scenarioIndex = args.indexOf('--scenario');
  return {
    scenario: scenarioIndex >= 0 ? args[scenarioIndex + 1] ?? 'all' : 'all',
  };
};

const main = async () => {
  const { scenario } = parseArgs();
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    baseUrl,
    edge: null,
    scenarios: [],
    sessionLimit: null,
  };
  let failedChecks = 0;
  try {
    const scenarios = buildScenarioList(baseUrl).filter((item) => scenario === 'all' || item.name === scenario);
    if (scenarios.length === 0 && scenario !== 'session-limit') {
      throw new Error(`unknown --scenario: ${scenario}`);
    }

    for (const item of scenarios) {
      process.stdout.write(`\n[scenario] ${item.name} — ${item.description}\n`);
      const profileDir = await mkdtemp(join(tmpdir(), 'mome-probe-'));
      const browser = await launchBrowser(profileDir, item.browserFlags ?? []);
      try {
        const devtoolsPort = await waitForDevToolsPort(profileDir, 20000);
        const versionResponse = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`).then((response) => response.json());
        report.edge = versionResponse.Browser;
        const { client } = await openPrototypePage(devtoolsPort, item.url);
        try {
          const payload = await item.run(client);
          const checks = item.assertions(payload);
          const passed = checks.every((check) => check.pass);
          if (!passed) failedChecks += 1;
          report.scenarios.push({
            name: item.name,
            description: item.description,
            url: item.url,
            passed,
            checks,
            payload,
          });
          process.stdout.write(`  ${passed ? 'PASS' : 'FAIL'}\n`);
          checks.forEach((check) => {
            process.stdout.write(`    ${check.pass ? 'ok  ' : 'FAIL'} ${check.name}${check.detail === undefined ? '' : ` — ${JSON.stringify(check.detail).slice(0, 300)}`}\n`);
          });
        } finally {
          client.close();
        }
      } finally {
        await stopBrowser(browser, profileDir);
      }
    }

    if (scenario === 'all' || scenario === 'session-limit') {
      process.stdout.write('\n[scenario] session-limit — iframe must be destroyed after 90s\n');
      const sessionLimit = await runSessionLimitScenario(baseUrl);
      const passed = sessionLimit.assertions.every((check) => check.pass);
      if (!passed) failedChecks += 1;
      report.sessionLimit = { passed, checks: sessionLimit.assertions, state: sessionLimit.state };
      process.stdout.write(`  ${passed ? 'PASS' : 'FAIL'}\n`);
      sessionLimit.assertions.forEach((check) => {
        process.stdout.write(`    ${check.pass ? 'ok  ' : 'FAIL'} ${check.name} — ${JSON.stringify(check.detail).slice(0, 200)}\n`);
      });
    }
  } finally {
    await stopStaticServer(server);
  }
  await writeFile(join(EVIDENCE_DIR, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`\nEvidence written to ${EVIDENCE_DIR}\n`);
  process.stdout.write(`Report: ${join(EVIDENCE_DIR, 'report.json')}\n`);
  if (failedChecks > 0) {
    process.stdout.write(`\n${failedChecks} scenario(s) failed their assertions.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('\nAll scenario assertions passed.\n');
  }
};

main().catch((error) => {
  process.stderr.write(`probe failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

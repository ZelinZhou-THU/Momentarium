#!/usr/bin/env node
/*
 * Dependency-free static server for the SceneRuntime prototype.
 *
 * The sandbox needs http(s) to read vendor/three.min.js and the photo asset
 * (a file:// page cannot fetch sibling files), so this server exists purely to
 * host prototypes/three over http://127.0.0.1.
 *
 * Usage: node prototypes/three/serve.mjs [port]
 *        PORT=4317 node prototypes/three/serve.mjs
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const HOST = '127.0.0.1';
const DEFAULT_PORT = 4317;

const MIME_TYPES = new Map([
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
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const parsePort = (rawPort) => {
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port: ${rawPort}`);
  }
  return port;
};

const mimeTypeFor = (filePath) => MIME_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';

const resolveRequestPath = (requestUrl) => {
  const url = new URL(requestUrl ?? '/', `http://${HOST}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) return null;
  return filePath;
};

const sendText = (response, statusCode, text) => {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(text);
};

const serveFile = async (request, response, filePath) => {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    sendText(response, 404, 'not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mimeTypeFor(filePath),
    'Content-Length': fileStat.size,
    'Cache-Control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
};

const server = createServer((request, response) => {
  const startedAt = Date.now();
  const pathname = (() => {
    try {
      return new URL(request.url ?? '/', `http://${HOST}`).pathname;
    } catch {
      return request.url ?? '';
    }
  })();

  response.on('finish', () => {
    process.stdout.write(`${request.method} ${pathname} -> ${response.statusCode} (${Date.now() - startedAt}ms)\n`);
  });

  const finishWithError = (statusCode, message) => sendText(response, statusCode, message);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    finishWithError(405, 'method not allowed');
    return;
  }
  if (pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }

  const filePath = (() => {
    try {
      return resolveRequestPath(request.url);
    } catch {
      return null;
    }
  })();
  if (!filePath) {
    finishWithError(400, 'bad request');
    return;
  }

  serveFile(request, response, filePath).catch((error) => {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') finishWithError(404, 'not found');
    else finishWithError(500, `internal error: ${error.message}`);
  });
});

const port = parsePort(process.env.PORT ?? process.argv[2] ?? DEFAULT_PORT);
server.listen(port, HOST, () => {
  process.stdout.write(`[scene-prototype] serving ${ROOT} at http://${HOST}:${port}/index.html\n`);
});

#!/usr/bin/env node
// D7 live 窗口计费校验（准备件）：**只允许 1 次**最小 Chat Completions 调用，验证端点/套餐/计费字段。
// 纪律（D7）：
//   - 真实调用只由 Lead 在用户批准后执行；本脚本在 AI_MODE!=live 时立即拒绝执行（exit 2），
//     因此 fake 预检 / CI / 本任务自测永远不会产生 live 调用。
//   - 密钥只从 .env / 进程环境读取，绝不打印、不写入产物；结果只保存 usage/延迟/判定，
//     不保存请求头原文与完整响应体。
//   - 只发 1 个请求、不重试（429/5xx/超时都直接判 FAIL），保证单次窗口不额外消耗。
// 判定（Lead 确认口径）：
//   PASS ⇔ HTTP 200 且有非空 content ∧ usage.opencode.billing_source ∈ {go, go-plus}
//            ∧ usage.opencode.allowance 存在 ∧ usage.cost 可解析为数值；
//   billing_source=balance → FAIL（打到了按量付费端点，检查 AI_BASE_URL 是否含 /go）。
// 用法：
//   node scripts/ai/live-check.mjs             # 真实 1 次调用（需 AI_MODE=live + 用户批准）
//   node scripts/ai/live-check.mjs --dry-run   # AI_MODE=live 下只打印请求摘要，不发网络
//   node scripts/ai/live-check.mjs --help
// 产物：backend/target/ai-diagnostics/live-check-result.json（默认；可用 --out <path> 覆盖），不含密钥。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');

const LIVE_CHECK_SESSION = 'momentarium-d7-live-check-20261028';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 16;
const ALLOWED_BILLING_SOURCES = new Set(['go', 'go-plus']);
const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_REFUSED = 2;

// ---------- 环境（.env 只读，不打印） ----------

async function loadDotEnv(directory) {
  const text = await readFile(path.join(directory, '.env'), 'utf8').catch(() => '');
  const entries = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      if (separator < 0) return null;
      const key = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();
      const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      return key === '' ? null : [key, value];
    })
    .filter((entry) => entry !== null);
  return Object.fromEntries(entries);
}

const dotEnv = await loadDotEnv(path.join(projectRoot, 'backend'));
const readEnv = (name, fallback = '') => process.env[name] ?? dotEnv[name] ?? fallback;

const settings = {
  mode: readEnv('AI_MODE', 'fake').trim().toLowerCase(),
  baseUrl: readEnv('AI_BASE_URL', 'https://opencode.ai/inference/go').replace(/\/+$/, ''),
  apiKey: readEnv('AI_API_KEY'),
  textModel: readEnv('AI_TEXT_MODEL', 'deepseek-v4.1-flash'),
  userAgent: readEnv('AI_USER_AGENT', 'Momentarium/0.1'),
  session: readEnv('AI_LIVE_CHECK_SESSION', LIVE_CHECK_SESSION),
  timeoutMs: Number.parseInt(readEnv('AI_LIVE_CHECK_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS)), 10),
};

const endpoint = `${settings.baseUrl}/openai/v1/chat/completions`;

const requestSummary = {
  endpoint,
  mode: settings.mode,
  model: settings.textModel,
  maxTokens: MAX_TOKENS,
  apiKey: settings.apiKey ? '<set>' : '<missing>',
  userAgent: settings.userAgent,
  session: settings.session,
  timeoutMs: settings.timeoutMs,
};

function printHelp() {
  console.log(
    [
      'D7 live-check：1 次最小调用校验 OpenCode Go 计费字段（仅在用户批准后由 Lead 执行）',
      '',
      '用法：',
      '  node scripts/ai/live-check.mjs               # 真实 1 次调用（要求 AI_MODE=live）',
      '  node scripts/ai/live-check.mjs --dry-run     # 只打印请求摘要，不发网络（要求 AI_MODE=live）',
      '  node scripts/ai/live-check.mjs --out <path>  # 覆盖结果文件路径',
      '  node scripts/ai/live-check.mjs --help',
      '',
      '判定：HTTP 200 ∧ content 非空 ∧ billing_source ∈ {go,go-plus} ∧ allowance 存在 ∧ cost 可解析 → PASS。',
      'AI_MODE=fake 时脚本拒绝执行（exit 2），不会产生任何真实调用。',
    ].join('\n'),
  );
}

// ---------- 1 次调用（不重试） ----------

function buildRequestBody() {
  return {
    model: settings.textModel,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    max_tokens: MAX_TOKENS,
    temperature: 0,
    stream: false,
  };
}

async function postOnce(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const startedAt = process.hrtime.bigint();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': settings.userAgent,
        'x-opencode-session': settings.session,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const rawBody = await response.text();
    const latencyMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
    return {
      status: response.status,
      latencyMs,
      rawBody,
      logId: response.headers.get('x-opencode-log-id') ?? response.headers.get('x-request-id') ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractContent(completion) {
  const message = completion?.choices?.[0]?.message;
  if (!message) return null;
  if (typeof message.content === 'string' && message.content.trim() !== '') return message.content.trim();
  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim() !== '') {
    return message.reasoning_content.trim();
  }
  return null;
}

function numericCost(usage) {
  const raw = usage?.cost;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function allowanceOf(opencode) {
  const allowance = opencode?.allowance;
  const present = allowance !== undefined && allowance !== null;
  const summary = present
    ? typeof allowance === 'object'
      ? JSON.stringify(allowance).slice(0, 400)
      : String(allowance)
    : null;
  return { present, summary };
}

function tokensOf(usage) {
  const opencodeTokens = usage?.opencode?.tokens ?? {};
  return {
    prompt: usage?.prompt_tokens ?? opencodeTokens.input ?? null,
    completion: usage?.completion_tokens ?? opencodeTokens.output ?? null,
    reasoning: usage?.completion_tokens_details?.reasoning_tokens ?? opencodeTokens.reasoning ?? null,
  };
}

function evaluate(result) {
  const completion = result.rawBody ? parseJson(result.rawBody) : null;
  const content = completion ? extractContent(completion) : null;
  const usage = completion?.usage ?? null;
  const opencode = usage?.opencode ?? null;
  const billingSource = typeof opencode?.billing_source === 'string' ? opencode.billing_source : null;
  const cost = numericCost(usage);
  const { present: allowancePresent, summary: allowanceSummary } = allowanceOf(opencode);
  const tokens = tokensOf(usage);

  const reasons = [];
  if (result.status !== 200) reasons.push(`HTTP ${result.status}（期望 200）`);
  if (!content) reasons.push('响应缺少非空 choices[0].message.content');
  if (billingSource === null) {
    reasons.push('usage.opencode.billing_source 缺失（网关字段差异 → 按 FAIL，人工核对 Console）');
  } else if (billingSource === 'balance') {
    reasons.push('billing_source=balance：打到了按量付费端点，检查 AI_BASE_URL 是否包含 /go');
  } else if (!ALLOWED_BILLING_SOURCES.has(billingSource)) {
    reasons.push(`billing_source=${billingSource} 不在 {go, go-plus}`);
  }
  if (!allowancePresent) reasons.push('usage.opencode.allowance 缺失（字段差异 → 按 FAIL，人工核对 Console）');
  if (cost === null) reasons.push('usage.cost 缺失或非数值（无法核对计费 → 按 FAIL）');

  return {
    completionPresent: completion !== null,
    content,
    usage,
    billingSource,
    cost,
    allowancePresent,
    allowanceSummary,
    tokens,
    verdict: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons,
  };
}

// ---------- 主流程 ----------

async function main(args) {
  if (args.has('--help') || args.has('-h')) {
    printHelp();
    return EXIT_PASS;
  }

  // 关键防误跑：任何非 live 模式一律拒绝，且发生在 apiKey 校验与任何网络动作之前。
  if (settings.mode !== 'live') {
    console.error(`✗ 拒绝执行：AI_MODE=${settings.mode || '(unset)'}，live-check 只允许在 AI_MODE=live 时运行。`);
    console.error('  该脚本会发起 1 次真实计费调用；只在用户批准窗口、由 Lead 执行。');
    console.error('  如需检查请求构造：AI_MODE=live node scripts/ai/live-check.mjs --dry-run（不发网络）。');
    return EXIT_REFUSED;
  }

  const outIndex = process.argv.indexOf('--out');
  const outPath =
    outIndex >= 0 && process.argv[outIndex + 1] ? path.resolve(process.argv[outIndex + 1]) : path.join(projectRoot, 'backend', 'target', 'ai-diagnostics', 'live-check-result.json');

  if (args.has('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, willSendNetwork: false, request: requestSummary }, null, 2));
    return EXIT_PASS;
  }

  if (!settings.apiKey) {
    console.error('✗ 拒绝执行：AI_MODE=live 但 AI_API_KEY 未配置（.env 或环境变量）。');
    return EXIT_REFUSED;
  }

  console.log('== D7 live-check：1 次最小调用（计费字段校验） ==');
  console.log(`endpoint: ${endpoint}`);
  console.log(`model: ${settings.textModel} / max_tokens: ${MAX_TOKENS} / timeout: ${settings.timeoutMs}ms`);
  console.log(`apiKey: <set> / UA: ${settings.userAgent} / session: ${settings.session}`);
  console.log('');

  const startedAt = new Date();
  let result;
  try {
    result = await postOnce(buildRequestBody());
  } catch (error) {
    const message = error?.name === 'AbortError' ? `timeout after ${settings.timeoutMs}ms` : String(error?.message ?? error);
    const failure = {
      timestamp: startedAt.toISOString(),
      request: requestSummary,
      httpStatus: null,
      latencyMs: null,
      error: message,
      verdict: 'FAIL',
      reasons: [`网络/超时失败：${message}`],
      liveCallCount: 1,
    };
    console.log(`网络失败：${message}`);
    console.log('判定: FAIL');
    await writeResult(outPath, failure);
    console.log(`结果已写入 ${path.relative(projectRoot, outPath)}`);
    return EXIT_FAIL;
  }

  const evaluation = evaluate(result);
  const record = {
    timestamp: startedAt.toISOString(),
    request: requestSummary,
    httpStatus: result.status,
    latencyMs: result.latencyMs,
    logId: result.logId,
    contentMatchesOk: evaluation.content ? /^ok[,.]?$/i.test(evaluation.content.trim()) : false,
    cost: evaluation.cost,
    billingSource: evaluation.billingSource,
    allowancePresent: evaluation.allowancePresent,
    allowanceSummary: evaluation.allowanceSummary,
    tokens: evaluation.tokens,
    usage: evaluation.usage,
    verdict: evaluation.verdict,
    reasons: evaluation.reasons,
    liveCallCount: 1,
    note: 'live-check 只调用 1 次；不保存 API key、请求头原文与完整响应体。',
  };

  console.log(`HTTP ${result.status} | ${result.latencyMs} ms | logId: ${result.logId ?? '-'}`);
  console.log(`content: ${evaluation.content ? truncate(evaluation.content.replace(/\s+/g, ' '), 80) : '<empty>'}`);
  console.log(`cost: ${evaluation.cost ?? '-'} / billing_source: ${evaluation.billingSource ?? '-'}`);
  console.log(`allowance: ${evaluation.allowancePresent ? evaluation.allowanceSummary : '<missing>'}`);
  console.log(`tokens: ${JSON.stringify(evaluation.tokens)}`);
  console.log('');
  console.log(`判定: ${evaluation.verdict}`);
  evaluation.reasons.forEach((reason) => console.log(`  · ${reason}`));
  if (evaluation.verdict === 'FAIL') {
    console.log('  备用判据：若网关字段与 D1 实测不同导致字段缺失，登录 OpenCode Console 人工核对本次调用是否计入 Go 套餐；');
    console.log('  在证据中记录“脚本 FAIL / 人工核对结果”，由 Lead 决定是否继续（不擅自继续消耗）。');
  }

  await writeResult(outPath, record);
  console.log(`结果已写入 ${path.relative(projectRoot, outPath)}（不含密钥/请求头/完整响应体）`);
  return evaluation.verdict === 'PASS' ? EXIT_PASS : EXIT_FAIL;
}

function truncate(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}… (${text.length} chars)`;
}

async function writeResult(outPath, record) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

// 用 exitCode 而非 process.exit()：Windows 上 Node 24 在 fetch 句柄关闭时强制退出会触发 libuv assertion。
process.exitCode = await main(new Set(process.argv.slice(2)));

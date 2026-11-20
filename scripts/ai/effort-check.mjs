#!/usr/bin/env node
// 推理强度探测（仅在用户批准的 live 窗口执行）：同一道题，分别不带 / 带 reasoning_effort 的几个取值，
// 看网关是否接受、是否忽略未知取值（对照 bogus）、推理 token 与答对率是否随强度变化。
// 与产品一致：流式（SSE）读取、默认不设 max_tokens（可用 --max-tokens 指定）。
// 纪律（同 live-check）：
//   - AI_MODE!=live 立即拒绝（exit 2）；密钥只从 backend/.env / 进程环境读取，绝不打印、不写入产物；
//   - 不重试；任一响应 billing_source 不是 go/go-plus 立即中止；
//   - 产物只保存状态码、耗时、usage、结束原因与是否答对，不保存请求头与完整响应体。
// 用法：
//   AI_MODE=live node scripts/ai/effort-check.mjs [--task easy|hard] [--repeat 2] [--efforts none,high,max,bogus]
//                                                  [--max-tokens 65536] [--json-mode] [--no-stream] [--sequential] [--out <path>]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED_BILLING_SOURCES = new Set(['go', 'go-plus']);

async function loadDotEnv(directory) {
  const text = await readFile(path.join(directory, '.env'), 'utf8').catch(() => '');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const value = line.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        return [line.slice(0, separator).trim(), value];
      }),
  );
}

const dotEnv = await loadDotEnv(path.join(projectRoot, 'backend'));
const readEnv = (name, fallback = '') => process.env[name] ?? dotEnv[name] ?? fallback;

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);

const settings = {
  mode: readEnv('AI_MODE', 'fake').trim().toLowerCase(),
  baseUrl: readEnv('AI_BASE_URL', 'https://opencode.ai/inference/go').replace(/\/+$/, ''),
  apiKey: readEnv('AI_API_KEY'),
  model: readEnv('AI_CODE_MODEL', 'deepseek-v4.1-flash'),
  userAgent: readEnv('AI_USER_AGENT', 'Momentarium/0.1'),
  repeat: Number.parseInt(argument('--repeat', '2'), 10),
  efforts: argument('--efforts', 'none,high,max,bogus').split(','),
  maxTokens: argument('--max-tokens', null),
  jsonMode: flag('--json-mode'),
  sequential: flag('--sequential'),
  stream: !flag('--no-stream'),
  out: argument('--out', path.join(projectRoot, 'backend', 'target', 'ai-diagnostics', 'effort-check-result.json')),
};

if (settings.mode !== 'live') {
  console.error('AI_MODE 不是 live，拒绝执行（exit 2）。');
  process.exit(2);
}
if (!settings.baseUrl.endsWith('/go') || settings.apiKey === '') {
  console.error('AI_BASE_URL 必须是 Go 端点且 AI_API_KEY 必须已配置（exit 2）。');
  process.exit(2);
}

const endpoint = `${settings.baseUrl}/openai/v1/chat/completions`;
const digitSum = (value) => String(value).split('').reduce((sum, digit) => sum + Number(digit), 0);
const TASKS = {
  easy: {
    question: '把 5 个互不相同的球放进 3 个完全相同的盒子，每个盒子至少放 1 个球，一共有多少种不同的放法？先给出最终数字，再用一句话说明。',
    expected: '25',
  },
  // 需要较长推理才能做对；答案由本脚本现算，不依赖模型自述。
  hard: {
    question:
      '有多少个不超过 3000 的正整数 n，使得 n 是 13 的倍数，并且 n 的各位数字之和是 7 的倍数？请只在最后一行写“答案：<数字>”。',
    expected: String(
      Array.from({ length: 3000 }, (_, index) => index + 1).filter((n) => n % 13 === 0 && digitSum(n) % 7 === 0).length,
    ),
  },
};
const task = TASKS[argument('--task', 'easy')];
const QUESTION = settings.jsonMode ? `${task.question}\n只输出一个 JSON 对象：{"answer": "<数字>"}。` : task.question;

const requestBody = (effort) => ({
  model: settings.model,
  messages: [{ role: 'user', content: QUESTION }],
  temperature: 0.6,
  stream: settings.stream,
  ...(settings.stream ? { stream_options: { include_usage: true } } : {}),
  ...(settings.maxTokens === null ? {} : { max_tokens: Number.parseInt(settings.maxTokens, 10) }),
  ...(settings.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  ...(effort === 'none' ? {} : { reasoning_effort: effort }),
});

async function readStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { buffer: '', content: '', usage: null, finishReason: null, firstDataMs: null };
  const startedAt = Date.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    state.firstDataMs ??= Date.now() - startedAt;
    state.buffer += decoder.decode(value, { stream: true });
    const lines = state.buffer.split('\n');
    state.buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        state.content += chunk.choices?.[0]?.delta?.content ?? '';
        state.finishReason = chunk.choices?.[0]?.finish_reason ?? state.finishReason;
        state.usage = chunk.usage ?? state.usage;
      } catch {
        // 忽略非 JSON 数据行
      }
    }
  }
  return state;
}

async function callOnce(effort) {
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': settings.userAgent,
        'x-opencode-session': 'momentarium-effort-check-20261030',
      },
      body: JSON.stringify(requestBody(effort)),
      signal: AbortSignal.timeout(1_200_000),
    });
    if (response.status !== 200) {
      const raw = await response.text();
      return {
        effort,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        errorExcerpt: raw.replace(/\s+/g, ' ').slice(0, 240),
      };
    }
    const stream = settings.stream
      ? await readStream(response)
      : await response.json().then((json) => ({
          content: json.choices?.[0]?.message?.content ?? '',
          usage: json.usage ?? null,
          finishReason: json.choices?.[0]?.finish_reason ?? null,
          firstDataMs: null,
        }));
    const usage = stream.usage ?? {};
    const opencode = usage.opencode ?? {};
    return {
      effort,
      status: 200,
      elapsedMs: Date.now() - startedAt,
      firstDataMs: stream.firstDataMs,
      finishReason: stream.finishReason,
      answeredCorrectly: stream.content.includes(task.expected),
      completionTokens: opencode.tokens?.output ?? usage.completion_tokens ?? null,
      reasoningTokens: opencode.tokens?.reasoning ?? usage.completion_tokens_details?.reasoning_tokens ?? null,
      billingSource: opencode.billing_source ?? null,
      cost: usage.cost ?? null,
    };
  } catch (error) {
    return { effort, outcome: `network:${error.name}:${error.cause?.code ?? error.message}`, elapsedMs: Date.now() - startedAt };
  }
}

const describe = (result) =>
  `${result.effort.padEnd(6)} status=${result.status ?? result.outcome} ${result.elapsedMs}ms ` +
  `out=${result.completionTokens ?? '-'} reasoning=${result.reasoningTokens ?? '-'} finish=${result.finishReason ?? '-'} ` +
  `ok=${result.answeredCorrectly ?? '-'} billing=${result.billingSource ?? '-'}${result.errorExcerpt ? ` err=${result.errorExcerpt}` : ''}`;

const results = [];
for (let round = 1; round <= settings.repeat; round += 1) {
  const roundResults = settings.sequential
    ? await settings.efforts.reduce(
        async (previous, effort) => [...(await previous), await callOnce(effort)],
        Promise.resolve([]),
      )
    : await Promise.all(settings.efforts.map(callOnce));
  roundResults.forEach((result) => {
    results.push({ round, ...result });
    console.log(`#${round} ${describe(result)}`);
  });
  if (roundResults.some((result) => result.status === 200 && !ALLOWED_BILLING_SOURCES.has(result.billingSource))) {
    console.error('billing_source 不是 go/go-plus，立即中止。');
    break;
  }
}

await mkdir(path.dirname(settings.out), { recursive: true });
await writeFile(
  settings.out,
  `${JSON.stringify({ at: new Date().toISOString(), model: settings.model, task: argument('--task', 'easy'), question: QUESTION, maxTokens: settings.maxTokens, jsonMode: settings.jsonMode, results }, null, 2)}\n`,
  'utf8',
);
console.log(`结果已写入 ${settings.out}（不含密钥/请求头/完整响应体）`);

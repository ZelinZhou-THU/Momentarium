/** 契约 v1.14 修订指令：去首尾空白后 1–500 个 Unicode 码点；允许换行与制表符，拒绝其他控制字符。 */
export const SCENE_INSTRUCTION_MAX_LENGTH = 500;

export type SceneInstructionValidation =
  | { readonly ok: true; readonly instruction: string }
  | { readonly ok: false; readonly message: string };

const codePointLength = (text: string): number => Array.from(text).length;

const hasForbiddenControlCharacter = (text: string): boolean =>
  Array.from(text).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x09) {
      return false;
    }
    // 与后端一致：拒绝 C0、DEL 与 C1 控制符（U+0080–U+009F）。
    return code < 0x20 || (code >= 0x7f && code <= 0x9f);
  });

export const validateSceneInstruction = (raw: string): SceneInstructionValidation => {
  const instruction = raw.trim();
  if (instruction.length === 0) {
    return { ok: false, message: "请输入修订要求（1–500 个字）。" };
  }
  if (codePointLength(instruction) > SCENE_INSTRUCTION_MAX_LENGTH) {
    return { ok: false, message: "修订要求最多 500 个字。" };
  }
  if (hasForbiddenControlCharacter(instruction)) {
    return {
      ok: false,
      message: "修订要求不能包含 NUL 等控制字符；可以保留换行与制表符。",
    };
  }
  return { ok: true, instruction };
};

/**
 * 为什么现在不能提交修订；null 表示没有结构性阻碍（输入是否合法另算）。
 * 过期场景必须拦在前端：后端会以 SCENE_REVISION_STALE 拒绝，用户却看不懂。
 */
export const explainRevisionBlocked = (input: {
  readonly currentRun: { readonly code: string | null } | null;
  readonly hasActiveRun: boolean;
  readonly sceneStale: boolean;
}): string | null =>
  input.currentRun === null
    ? "还没有当前采用场景；先成功生成并采用一个场景。"
    : input.currentRun.code === null
      ? "当前场景没有可修订的代码。"
      : input.hasActiveRun
        ? "有场景正在生成，结束后才能修订。"
        : input.sceneStale
          ? "素材已变化，当前场景不能修订；请先重新生成场景。"
          : null;

/** 输入框旁的字数：按码点计数（emoji 记 1），展示原始输入长度便于用户控制。 */
export const describeInstructionCount = (raw: string): string =>
  `${codePointLength(raw)}/${SCENE_INSTRUCTION_MAX_LENGTH} 字`;

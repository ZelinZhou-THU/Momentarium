/** 邀请令牌的形状：URL 安全的 base64 字符（字母、数字、`-`、`_`），实际约 43 位；太短的输入不是令牌。 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,}$/u;

const INVITE_PATH_PATTERN = /\/invite\/([^/?#\s]+)/u;

const decodedOrSelf = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * 从粘贴内容里取出邀请令牌：接受完整邀请链接（含 `/invite/…`，可带查询串或末尾斜杠）、
 * 不带域名的 `/invite/…` 路径，或单独的令牌；识别不了返回 null。
 */
export const inviteTokenFromInput = (input: string): string | null => {
  const text = input.trim();
  const fromPath = INVITE_PATH_PATTERN.exec(text)?.[1];
  const candidate = fromPath === undefined ? text : decodedOrSelf(fromPath);
  return TOKEN_PATTERN.test(candidate) ? candidate : null;
};

export const INVITE_INPUT_INVALID_NOTICE =
  "没有识别出邀请链接，请粘贴策展人发给你的完整链接（形如 …/invite/…）或其中的邀请码。";

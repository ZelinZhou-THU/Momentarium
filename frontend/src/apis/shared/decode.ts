/**
 * 响应解码基础工具：后端返回的 JSON 视为 unknown，逐字段收窄成契约类型，
 * 不使用 `any` 与 `as` 强转（spec 11.6 类型最小集）。
 */

/** 响应结构与 docs/api-contract.md 不一致时抛出；由页面按错误态展示。 */
export class DecodeError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`服务返回的数据不符合契约：${path}`);
    this.name = "DecodeError";
    this.path = path;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const requireObject = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new DecodeError(path);
  }
  return value;
};

export const requireString = (value: unknown, path: string): string => {
  if (typeof value !== "string") {
    throw new DecodeError(path);
  }
  return value;
};

export const requireNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DecodeError(path);
  }
  return value;
};

export const requireBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean") {
    throw new DecodeError(path);
  }
  return value;
};

export const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new DecodeError(path);
  }
  return value;
};

export const requireStringArray = (value: unknown, path: string): string[] =>
  requireArray(value, path).map((item, index) => requireString(item, `${path}[${index}]`));

/** 契约里 `Option[T]` 序列化为 null（不省略字段），缺失同样视为违约。 */
export const requireNullable = <T>(
  value: unknown,
  path: string,
  decode: (inner: unknown, innerPath: string) => T,
): T | null => (value === null ? null : decode(value, path));

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && allowed.some((candidate) => candidate === value);

/** 封闭字符串集合（枚举）解码；新增取值必须两侧同步。 */
export const requireOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T => {
  if (!isOneOf(value, allowed)) {
    throw new DecodeError(path);
  }
  return value;
};

// 组合 Tailwind 类名：丢弃条件为假的项，避免 JSX 中出现难读的字符串拼接。
export const classNames = (
  ...values: ReadonlyArray<string | false | null | undefined>
): string => values.filter((value): value is string => Boolean(value)).join(" ");

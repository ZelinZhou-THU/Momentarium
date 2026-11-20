/** ISO 时间 → 「10月31日 16:10」（本地时区）。 */
export const formatRunTime = (iso: string): string =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

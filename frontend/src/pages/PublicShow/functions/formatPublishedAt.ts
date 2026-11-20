/** 发布时间展示（公开页 meta 行）：ISO-8601 → 本地化中文；非法值原样返回不崩。 */
export const formatPublishedAt = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/** 数字版本号展示：Version 1 → 第 1 版。 */
export const formatVersion = (version: number): string => `第 ${version} 版`;

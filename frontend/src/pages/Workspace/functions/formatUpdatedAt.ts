/** ISO-8601 时间 → 中文日期（工作台页头展示用）；非法值原样返回。 */
export const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
};

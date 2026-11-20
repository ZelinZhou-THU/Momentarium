/** 档案日期：中文长日期（列表/feature 元信息共用，避免每处各写一套格式化）。 */
export const formatArchiveDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

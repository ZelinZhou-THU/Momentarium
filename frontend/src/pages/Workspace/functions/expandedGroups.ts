/** 策展面板里展开的章节（按章节下标）。章节多时默认只展开第一章，避免长表单。 */
export type ExpandedGroups = ReadonlySet<number>;

const ALL_EXPANDED_MAX_GROUPS = 2;

export const initialExpandedGroups = (groupCount: number): ExpandedGroups =>
  new Set(
    groupCount <= ALL_EXPANDED_MAX_GROUPS
      ? Array.from({ length: groupCount }, (_, index) => index)
      : groupCount > 0
        ? [0]
        : [],
  );

export const allGroupsExpanded = (groupCount: number): ExpandedGroups =>
  new Set(Array.from({ length: groupCount }, (_, index) => index));

export const toggleExpandedGroup = (expanded: ExpandedGroups, groupIndex: number): ExpandedGroups =>
  new Set(
    expanded.has(groupIndex)
      ? [...expanded].filter((index) => index !== groupIndex)
      : [...expanded, groupIndex],
  );

export const expandGroup = (expanded: ExpandedGroups, groupIndex: number): ExpandedGroups =>
  new Set([...expanded, groupIndex]);

/** 章节上移/下移后，展开状态跟着章节走（两个相邻下标互换）。 */
export const moveExpandedGroup = (
  expanded: ExpandedGroups,
  groupIndex: number,
  direction: "up" | "down",
  groupCount: number,
): ExpandedGroups => {
  const target = direction === "up" ? groupIndex - 1 : groupIndex + 1;
  if (target < 0 || target >= groupCount) {
    return expanded;
  }
  return new Set(
    [...expanded].map((index) =>
      index === groupIndex ? target : index === target ? groupIndex : index,
    ),
  );
};

/** 删除章节后，其后的章节下标前移一位。 */
export const removeExpandedGroup = (expanded: ExpandedGroups, groupIndex: number): ExpandedGroups =>
  new Set(
    [...expanded]
      .filter((index) => index !== groupIndex)
      .map((index) => (index > groupIndex ? index - 1 : index)),
  );

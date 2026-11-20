import {
  requireArray,
  requireNullable,
  requireNumber,
  requireObject,
  requireString,
} from "../../apis/shared/decode";

/** 契约 v1.9 PhotoMemoryView：草稿照片上已采用的讲述（作者视图带 memoryId 以支持移除）。 */
export interface PhotoMemoryView {
  readonly memoryId: string;
  readonly text: string;
  readonly contributorName: string;
}

const parsePhotoMemoryView = (value: unknown, path: string): PhotoMemoryView => {
  const record = requireObject(value, path);
  return {
    memoryId: requireString(record.memoryId, `${path}.memoryId`),
    text: requireString(record.text, `${path}.text`),
    contributorName: requireString(record.contributorName, `${path}.contributorName`),
  };
};

/** 契约 §2.1 PhotoView：groupId / positionInGroup 为 Option，序列化为 null；v1.9 增加 memories。 */
export interface PhotoView {
  readonly id: string;
  readonly originalName: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly caption: string;
  readonly groupId: string | null;
  readonly positionInGroup: number | null;
  readonly contentUrl: string;
  readonly thumbUrl: string;
  /** 已采用的讲述，按采用顺序；旧响应没有该字段时按 [] 兼容。 */
  readonly memories: readonly PhotoMemoryView[];
}

export const parsePhotoView = (value: unknown, path = "photo"): PhotoView => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    originalName: requireString(record.originalName, `${path}.originalName`),
    mime: requireString(record.mime, `${path}.mime`),
    width: requireNumber(record.width, `${path}.width`),
    height: requireNumber(record.height, `${path}.height`),
    caption: requireString(record.caption, `${path}.caption`),
    groupId: requireNullable(record.groupId, `${path}.groupId`, requireString),
    positionInGroup: requireNullable(
      record.positionInGroup,
      `${path}.positionInGroup`,
      requireNumber,
    ),
    contentUrl: requireString(record.contentUrl, `${path}.contentUrl`),
    thumbUrl: requireString(record.thumbUrl, `${path}.thumbUrl`),
    memories:
      record.memories === undefined
        ? []
        : requireArray(record.memories, `${path}.memories`).map((memory, index) =>
            parsePhotoMemoryView(memory, `${path}.memories[${index}]`),
          ),
  };
};

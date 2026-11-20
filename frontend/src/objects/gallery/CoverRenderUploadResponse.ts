import { DecodeError, requireNumber, requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §5.3 CoverRenderUploadResponse(renderKey, width, height)：场景渲染封面上传响应。 */
export interface CoverRenderUploadResponse {
  readonly renderKey: string;
  readonly width: number;
  readonly height: number;
}

export const parseCoverRenderUploadResponse = (
  value: unknown,
  path = "coverRenderUpload",
): CoverRenderUploadResponse => {
  const record = requireObject(value, path);
  const renderKey = requireString(record.renderKey, `${path}.renderKey`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(renderKey)) {
    throw new DecodeError(`${path}.renderKey`);
  }
  return {
    renderKey,
    width: requireNumber(record.width, `${path}.width`),
    height: requireNumber(record.height, `${path}.height`),
  };
};

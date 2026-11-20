import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../shared/ApiError";
import { describeGalleryError } from "./describeGalleryError";

const apiError = (reason: ApiError["reason"], code: ApiError["code"] = "VALIDATION"): ApiError =>
  new ApiError({ status: 400, code, reason, message: "后端 message 文本" });

describe("describeGalleryError（发布/列表/工作台共用）", () => {
  it("发布前校验 reason 给出可操作提示", () => {
    expect(describeGalleryError(apiError("TITLE_REQUIRED"))).toBe("请填写展览标题");
    expect(describeGalleryError(apiError("PHOTO_COUNT"))).toBe("展览至少需要 3 张照片");
    expect(describeGalleryError(apiError("PHOTO_UNGROUPED"))).toBe("还有照片没有放入章节");
    expect(describeGalleryError(apiError("GROUP_EMPTY"))).toBe("存在空章节，请放入照片或删除章节");
    expect(describeGalleryError(apiError("SCENE_NOT_READY"))).toBe(
      "需要一个生成成功的三维场景才能发布",
    );
    expect(describeGalleryError(apiError("SCENE_STALE"))).toBe(
      "场景已过期，请重新生成后再发布",
    );
  });

  it("封面错误提供中文提示", () => {
    expect(describeGalleryError(apiError("INVALID_COVER"))).toContain("封面无效");
    expect(describeGalleryError(apiError("COVER_TOO_LARGE"))).toContain("过大");
    expect(describeGalleryError(apiError("COVER_UNSUPPORTED_TYPE"))).toContain("格式");
  });

  it("版本冲突与 401/网络错误有兜底文案", () => {
    expect(describeGalleryError(apiError("VERSION_CONFLICT", "CONFLICT"))).toBe(
      "内容已在别处更新，请刷新后重试",
    );
    expect(describeGalleryError(apiError(null, "UNAUTHORIZED"))).toBe("登录状态已失效，请重新登录");
    expect(describeGalleryError(new NetworkError())).toContain("无法连接服务器");
  });
});

import { describe, expect, it } from "vitest";
import { describeUploadProgress } from "./describeUploadProgress";

const MB = 1024 * 1024;

describe("批量上传进度", () => {
  it("还没收到进度回调：0%，只显示文件数和总大小", () => {
    expect(describeUploadProgress(7, 65.8 * MB, null)).toEqual({
      phase: "sending",
      label: "正在上传 7 张照片（共 65.8 MB）",
      percent: 0,
    });
  });

  it("发送中：按请求体已发送字节算百分比", () => {
    const view = describeUploadProgress(7, 65.8 * MB, { loadedBytes: 33 * MB, totalBytes: 66 * MB });
    expect(view.percent).toBe(50);
    expect(view.label).toContain("已发送 33.0 MB");
  });

  it("请求体发完：进入服务端处理阶段，不再给百分比", () => {
    const view = describeUploadProgress(7, 65.8 * MB, { loadedBytes: 66 * MB, totalBytes: 66 * MB });
    expect(view.phase).toBe("processing");
    expect(view.percent).toBeNull();
    expect(view.label).toContain("服务器正在");
  });
});

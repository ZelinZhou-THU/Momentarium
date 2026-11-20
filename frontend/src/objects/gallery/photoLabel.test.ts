import { describe, expect, it } from "vitest";
import { photoLabel } from "./photoLabel";

describe("photoLabel 照片称呼回退", () => {
  it("有图注用图注（去首尾空白）", () => {
    expect(photoLabel({ caption: " 海边日落 ", originalName: "IMG_1.jpg" })).toBe("海边日落");
  });

  it("图注为空或只有空白时回退到原文件名", () => {
    expect(photoLabel({ caption: "", originalName: "IMG_1.jpg" })).toBe("IMG_1.jpg");
    expect(photoLabel({ caption: "  ", originalName: "IMG_1.jpg" })).toBe("IMG_1.jpg");
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("../shared/send", () => ({ sendFormData: vi.fn() }));
import { sendFormData } from "../shared/send";
import { UploadCoverRenderAPI } from "./UploadCoverRenderAPI";

describe("UploadCoverRenderAPI", () => {
  it("sends a file to the exhibition cover-render route", () => {
    const file = new File(["jpeg"], "cover.jpg", { type: "image/jpeg" });
    new UploadCoverRenderAPI("exhibition", file).send();
    const [request] = vi.mocked(sendFormData).mock.calls[0];
    expect(request.path).toBe("/api/exhibitions/exhibition/cover-render");
    expect(request.formData.get("file")).toBe(file);
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("../../../apis/gallery/UploadCoverRenderAPI", () => ({}));
vi.mock("../../../apis/gallery/SetCoverAPI", () => ({}));
import { createSceneCoverSaver } from "./useSceneCover";
import type { ImageCapture } from "../../../scene/contract";

const capture: ImageCapture = { view: { azimuthDeg: 0, elevationDeg: 0 }, index: 0, dataUrl: "data:image/jpeg;base64,AA==", width: 1, height: 1 };
describe("scene cover saving", () => {
  it("uploads before setting, refreshes only after success, and reuses key after set failure", async () => {
    const order: string[] = [];
    const encode = vi.fn(async () => new File(["x"], "cover.jpg"));
    const upload = vi.fn(async () => { order.push("upload"); return "key"; });
    const set = vi.fn(async (key: string) => { order.push(`set:${key}`); if (order.length === 2) throw new Error("failed"); });
    const refresh = vi.fn(() => { order.push("refresh"); });
    const save = createSceneCoverSaver({ encode, upload, set, refresh });
    await expect(save.save("run", capture)).rejects.toThrow();
    expect(refresh).not.toHaveBeenCalled();
    await save.save("run", capture);
    expect(order).toEqual(["upload", "set:key", "set:key", "refresh"]);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it("retries upload after failure", async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue("key");
    const set = vi.fn();
    const save = createSceneCoverSaver({ encode: async () => new File([], "x"), upload, set, refresh: vi.fn() });
    await expect(save.save("run", capture)).rejects.toThrow();
    await save.save("run", capture);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith("key", expect.any(AbortSignal));
  });
  it("discarding a pending upload prevents setting or refreshing a stale cover", async () => {
    let complete: (key: string) => void = () => {};
    const upload = vi.fn(() => new Promise<string>(resolve => { complete = resolve; }));
    const set = vi.fn();
    const refresh = vi.fn();
    const saver = createSceneCoverSaver({ encode: async () => new File([], "x"), upload, set, refresh });
    const pending = saver.save("run", capture);
    await Promise.resolve();
    saver.cancel();
    complete("key");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(set).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("after success a new capture uploads a new image", async () => {
    const upload = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const set = vi.fn();
    const saver = createSceneCoverSaver({ encode: async () => new File([], "x"), upload, set, refresh: vi.fn() });
    await saver.save("run", capture);
    await saver.save("run", capture);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.map(call => call[0])).toEqual(["first", "second"]);
  });
  it("cancel aborts an in-flight set request", async () => {
    const signals: AbortSignal[] = [];
    const set = vi.fn((_key: string, value: AbortSignal) => {
      signals.push(value);
      return new Promise<void>((_resolve, reject) => value.addEventListener("abort", () => reject(value.reason)));
    });
    const refresh = vi.fn();
    const saver = createSceneCoverSaver({ encode: async () => new File([], "x"), upload: async () => "key", set, refresh });
    const pending = saver.save("run", capture);
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    saver.cancel();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0]?.aborted).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";
vi.mock("../../stores/sessionStore", () => ({ getSessionToken: () => "token" }));
import { NetworkError } from "./ApiError";
import { requireObject, requireString } from "./decode";
import { send } from "./send";

describe("send options", () => {
  it("forwards signal and omits authorization for anonymous requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const controller = new AbortController();
    await send({ routeName: "test" }, x => x, { authentication: "none", signal: controller.signal });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    fetchMock.mockRestore();
  });
  it("sends the session token by default", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await send({ routeName: "test" }, x => x);
    expect(mock.mock.calls[0][1]?.headers).toHaveProperty("Authorization", "Bearer token");
    mock.mockRestore();
  });
  it("maps network failures and preserves typed 404", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network"));
    await expect(send({ routeName: "test" }, x => x)).rejects.toBeInstanceOf(NetworkError);
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "missing" } }), { status: 404 }));
    await expect(send({ routeName: "test" }, x => x)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    mock.mockRestore();
  });
  it("rejects invalid JSON and fields", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("invalid")).mockResolvedValueOnce(new Response("{}"));
    const decode = (payload: unknown) => requireString(requireObject(payload, "result").name, "name");
    await expect(send({ routeName: "test" }, decode)).rejects.toThrow();
    await expect(send({ routeName: "test" }, decode)).rejects.toThrow();
    mock.mockRestore();
  });
  it("preserves abort while reading the response body", async () => {
    const error = new DOMException("aborted", "AbortError");
    const response = new Response("{}");
    vi.spyOn(response, "json").mockRejectedValue(error);
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(send({ routeName: "test" }, x => x)).rejects.toBe(error);
    mock.mockRestore();
  });
  it("preserves abort errors", async () => {
    const error = new DOMException("aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
    await expect(send({ routeName: "test" }, x => x)).rejects.toBe(error);
    fetchMock.mockRestore();
  });
});

describe("sendFormDataWithProgress", () => {
  type Listener = (event: { lengthComputable: boolean; loaded: number; total: number }) => void;

  /** 最小 XHR 替身：send 时先报两次上传进度，再以给定状态码完成。 */
  const fakeXhr = (status: number, body: string) =>
    class {
      static instances: unknown[] = [];
      status = 0;
      responseText = "";
      headers: Record<string, string> = {};
      private listeners: Record<string, () => void> = {};
      private uploadListeners: Listener[] = [];
      upload = { addEventListener: (_: string, listener: Listener) => this.uploadListeners.push(listener) };
      open() {}
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      addEventListener(type: string, listener: () => void) {
        this.listeners[type] = listener;
      }
      abort() {
        this.listeners.abort?.();
      }
      send() {
        this.uploadListeners.forEach((listener) => listener({ lengthComputable: true, loaded: 50, total: 100 }));
        this.uploadListeners.forEach((listener) => listener({ lengthComputable: true, loaded: 100, total: 100 }));
        this.status = status;
        this.responseText = body;
        this.listeners.load?.();
      }
    };

  it("reports upload progress and decodes the response", async () => {
    vi.stubGlobal("XMLHttpRequest", fakeXhr(200, JSON.stringify({ ok: true })));
    const { sendFormDataWithProgress } = await import("./send");
    const seen: number[] = [];
    const result = await sendFormDataWithProgress({ path: "/api/photos/upload", formData: new FormData() }, (x) => x, {
      onUploadProgress: (progress) => seen.push(progress.loadedBytes),
    });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual([50, 100]);
    vi.unstubAllGlobals();
  });

  it("maps non-2xx to the typed contract error", async () => {
    vi.stubGlobal(
      "XMLHttpRequest",
      fakeXhr(413, JSON.stringify({ error: { code: "VALIDATION", message: "too large", reason: "UPLOAD_TOO_LARGE" } })),
    );
    const { sendFormDataWithProgress } = await import("./send");
    await expect(
      sendFormDataWithProgress({ path: "/api/photos/upload", formData: new FormData() }, (x) => x),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 413 });
    vi.unstubAllGlobals();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "t1" as string | null }));
vi.mock("../../stores/sessionStore", () => ({ getSessionToken: (): string | null => session.token }));

import {
  acquireAuthorizedImage,
  authorizedImageCacheSize,
  clearAuthorizedImageCache,
  RELEASE_GRACE_MS,
} from "./authorizedImageCache";

const okResponse = (): Response => new Response(new Blob(["x"]), { status: 200 });

describe("受保护图片共享缓存", () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();
  const revoke = vi.fn();
  let counter = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    session.token = "t1";
    counter = 0;
    fetchMock.mockReset().mockImplementation(() => Promise.resolve(okResponse()));
    revoke.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL: () => `blob:${(counter += 1)}`, revokeObjectURL: revoke });
  });

  afterEach(() => {
    clearAuthorizedImageCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("同一 URL 的多个租约只下载一次、共用同一个 objectURL", async () => {
    const a = acquireAuthorizedImage("/api/photos/p1/content?variant=thumb");
    const b = acquireAuthorizedImage("/api/photos/p1/content?variant=thumb");
    const [ua, ub] = await Promise.all([a.ready, b.ready]);
    expect(ua).toBe(ub);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b.peek()).toBe(ua);
  });

  it("引用归零后在宽限期内重新挂载不会再下载；超时后 revoke 并释放", async () => {
    const first = acquireAuthorizedImage("/u");
    const objectUrl = await first.ready;
    first.release();
    first.release();
    vi.advanceTimersByTime(RELEASE_GRACE_MS - 1);
    const again = acquireAuthorizedImage("/u");
    expect(await again.ready).toBe(objectUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    again.release();
    vi.advanceTimersByTime(RELEASE_GRACE_MS);
    expect(revoke).toHaveBeenCalledWith(objectUrl);
    expect(authorizedImageCacheSize()).toBe(0);
  });

  it("仍被引用的条目不会被释放", async () => {
    const held = acquireAuthorizedImage("/held");
    const other = acquireAuthorizedImage("/held");
    await held.ready;
    other.release();
    vi.advanceTimersByTime(RELEASE_GRACE_MS * 2);
    expect(revoke).not.toHaveBeenCalled();
    expect(held.peek()).not.toBeNull();
  });

  it("换账号后不会读到旧令牌的图片，旧条目被清扫", async () => {
    const mine = acquireAuthorizedImage("/same");
    const oldUrl = await mine.ready;
    session.token = "t2";
    const theirs = acquireAuthorizedImage("/same");
    expect(await theirs.ready).not.toBe(oldUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith(oldUrl);
    expect(authorizedImageCacheSize()).toBe(1);
  });

  it("URL 带不同版本号即为不同条目（素材替换后失效）", async () => {
    await acquireAuthorizedImage("/c?variant=thumb&v=1").ready;
    await acquireAuthorizedImage("/c?variant=thumb&v=2").ready;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("失败不缓存：下一次获取会重试", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response("no", { status: 500 })));
    const failed = acquireAuthorizedImage("/flaky");
    await expect(failed.ready).rejects.toThrow();
    await Promise.resolve();
    const retry = acquireAuthorizedImage("/flaky");
    await expect(retry.ready).resolves.toMatch(/^blob:/u);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

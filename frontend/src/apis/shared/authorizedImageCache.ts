import { fetchAuthorizedBlob } from "./authorizedFetch";
import { getSessionToken } from "../../stores/sessionStore";

/**
 * 作者态受保护图片的共享缓存：同一令牌下同一 URL 只下载一次、只生成一个 object URL，
 * 多个组件（照片墙 / 策展 / 地图 / 投稿 / 放大对话框）按引用计数共享。
 *
 * - 隔离：缓存键含当前令牌；换账号后旧令牌的条目不会被读到，并在下一次获取时被清扫释放。
 * - 失效：图片内容可变的地方由调用方把版本号拼进 URL（封面 `?v=`、投稿 `&v=版本`），新 URL 即新条目。
 * - 内存：引用降到 0 后保留 RELEASE_GRACE_MS（覆盖折叠/展开、切页签这类立刻重挂载），之后中止未完成请求并 revoke。
 * - 失败不缓存：出错的条目立刻移除，下次挂载会重试。
 * 这是基础设施缓存而非业务数据，不进入 Zustand。
 */
export const RELEASE_GRACE_MS = 30_000;

interface CacheEntry {
  readonly key: string;
  readonly tokenScope: string;
  readonly controller: AbortController;
  readonly ready: Promise<string>;
  objectUrl: string | null;
  refs: number;
  evictTimer: ReturnType<typeof setTimeout> | null;
}

export interface AuthorizedImageLease {
  /** 解析为 object URL；失败时拒绝。 */
  readonly ready: Promise<string>;
  /** 已缓存好的 object URL（同步读取），否则 null。 */
  readonly peek: () => string | null;
  /** 归还引用；幂等。 */
  readonly release: () => void;
}

const entries = new Map<string, CacheEntry>();

const tokenScopeOf = (): string => getSessionToken() ?? "";

const keyOf = (tokenScope: string, url: string): string => `${tokenScope}\n${url}`;

const evict = (entry: CacheEntry): void => {
  if (entry.evictTimer !== null) {
    clearTimeout(entry.evictTimer);
  }
  entry.controller.abort();
  if (entry.objectUrl !== null) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  entries.delete(entry.key);
};

/** 清扫其他令牌（已登出 / 已换账号）留下的条目。 */
const sweepForeignEntries = (tokenScope: string): void =>
  [...entries.values()].filter((entry) => entry.tokenScope !== tokenScope).forEach(evict);

const createEntry = (key: string, tokenScope: string, url: string): CacheEntry => {
  const controller = new AbortController();
  const entry: CacheEntry = {
    key,
    tokenScope,
    controller,
    objectUrl: null,
    refs: 0,
    evictTimer: null,
    ready: fetchAuthorizedBlob(url, controller.signal).then((blob) => {
      if (controller.signal.aborted) {
        throw new Error("受保护图片请求已取消");
      }
      const objectUrl = URL.createObjectURL(blob);
      entry.objectUrl = objectUrl;
      return objectUrl;
    }),
  };
  // 失败的条目立刻移除，下次挂载重试；这里吞掉拒绝，调用方通过 ready 自行处理。
  entry.ready.catch(() => {
    if (entries.get(key) === entry) {
      entries.delete(key);
    }
  });
  return entry;
};

/** 取得一张受保护图片的租约；用完必须 release（hook 在卸载 / url 变化时调用）。 */
export const acquireAuthorizedImage = (url: string): AuthorizedImageLease => {
  const tokenScope = tokenScopeOf();
  sweepForeignEntries(tokenScope);
  const key = keyOf(tokenScope, url);
  const entry = entries.get(key) ?? createEntry(key, tokenScope, url);
  entries.set(key, entry);

  if (entry.evictTimer !== null) {
    clearTimeout(entry.evictTimer);
    entry.evictTimer = null;
  }
  entry.refs += 1;

  const releaseState = { released: false };
  return {
    ready: entry.ready,
    peek: () => entry.objectUrl,
    release: () => {
      if (releaseState.released) {
        return;
      }
      releaseState.released = true;
      entry.refs -= 1;
      if (entry.refs <= 0 && entries.get(key) === entry) {
        entry.evictTimer = setTimeout(() => evict(entry), RELEASE_GRACE_MS);
      }
    },
  };
};

/** 当前缓存条目数（测试与诊断用）。 */
export const authorizedImageCacheSize = (): number => entries.size;

/** 立即释放全部条目（测试用；登出时由令牌变化自然清扫）。 */
export const clearAuthorizedImageCache = (): void => [...entries.values()].forEach(evict);

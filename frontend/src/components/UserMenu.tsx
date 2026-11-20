import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export interface UserMenuProps {
  readonly username: string;
  readonly onLogout: () => void;
}

const ITEM_CLASS =
  "block w-full px-4 py-2 text-left text-caption text-ink transition-colors duration-150 ease-out hover:bg-bg motion-reduce:transition-none focus-visible:outline-none focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

/**
 * 顶栏右侧用户菜单：用户名按钮展开「账户设置 / 我的作者主页 / 登出」。
 * 作者主页是公开身份，和账户设置同属"我"的范畴，所以收在这里；
 * 没开启公开时，作者主页会引导本人去账户设置开启，不需要在菜单里额外请求资料。
 * 点击菜单外部、按 Esc 或选择条目都会收起。
 */
export function UserMenu({ username, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface/60"
      >
        <span className="max-w-32 truncate">{username}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="用户菜单"
          className="absolute right-0 top-full z-50 mt-2 w-32 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-sm"
        >
          <Link
            viewTransition
            role="menuitem"
            to="/account"
            className={ITEM_CLASS}
            onClick={() => setOpen(false)}
          >
            账户设置
          </Link>
          <Link
            viewTransition
            role="menuitem"
            to={`/u/${username}`}
            className={ITEM_CLASS}
            onClick={() => setOpen(false)}
          >
            我的作者主页
          </Link>
          <button
            type="button"
            role="menuitem"
            className={`${ITEM_CLASS} border-t border-line`}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            登出
          </button>
        </div>
      ) : null}
    </div>
  );
}

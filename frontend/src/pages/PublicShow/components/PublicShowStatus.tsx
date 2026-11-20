import { Link } from "react-router-dom";
import { Button } from "../../../components/ui";

/** 公开页三态（与 3D 页面区分：深色沉浸底、无编辑入口）。 */

export function PublicShowLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-night">
      <p role="status" className="text-caption text-surface/75">
        正在打开展览…首次进入需要几秒
      </p>
    </main>
  );
}

export function PublicShowNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-night px-8">
      <div className="w-full max-w-md text-center">
        <p className="text-micro text-surface/60">Momentarium · 公开记忆场景</p>
        <h1 className="mt-4 font-serif text-h1 text-surface">未找到或未发布</h1>
        <p className="mt-3 text-body text-surface/75">
          这场展览尚未发布，或链接已失效。发布后的展览才能通过公开链接进入。
        </p>
      </div>
    </main>
  );
}

export interface PublicShowErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}

export function PublicShowError({ message, onRetry }: PublicShowErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-night px-8">
      <div className="w-full max-w-md text-center">
        <p className="text-micro text-surface/60">Momentarium · 公开记忆场景</p>
        <h1 className="mt-4 font-serif text-h1 text-surface">无法打开场景</h1>
        <p className="mt-3 text-body text-surface/75">{message}</p>
        <Button variant="inversePrimary" onClick={onRetry} className="mt-8">
          重新加载
        </Button>
      </div>
    </main>
  );
}

export interface ShowPreviewUnavailableProps {
  readonly reason: string;
  readonly backTo: string;
  readonly backLabel: string;
}

/** 作者看展预览不可用（还没有通过评审的场景等）：说明原因并回到工作台。 */
export function ShowPreviewUnavailable({ reason, backTo, backLabel }: ShowPreviewUnavailableProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-night px-8">
      <div className="w-full max-w-md text-center">
        <p className="text-micro text-surface/60">Momentarium · 看展预览</p>
        <h1 className="mt-4 font-serif text-h1 text-surface">还不能看展</h1>
        <p className="mt-3 text-body text-surface/75">{reason}</p>
        <Link
          viewTransition
          to={backTo}
          className="mt-8 inline-flex rounded-md bg-accentSoft px-6 py-3 text-body font-medium text-night transition-opacity duration-150 ease-out hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-night"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}

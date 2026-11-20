import { Link } from "react-router-dom";

export interface AuthorHomeNavProps {
  /** 是否已登录（session store 里有当前用户）；决定右侧显示「我的展览 / 我参与的」还是「登录」。 */
  readonly signedIn: boolean;
}

/**
 * 公开作者主页导航：品牌与应用顶栏保持一致；匿名访客不会被品牌链接送去登录。
 */
export function AuthorHomeNav({ signedIn }: AuthorHomeNavProps) {
  return (
    <nav
      aria-label="作者主页导航"
      className="mb-12 flex flex-wrap items-center justify-between gap-4 rounded-md bg-night px-6 py-4 text-surface"
    >
      {signedIn ? (
        <Link viewTransition to="/exhibitions" className="font-serif text-h2 text-surface">
          Momentarium
        </Link>
      ) : (
        <span className="font-serif text-h2 text-surface">Momentarium</span>
      )}
      <span aria-current="page" className="text-caption text-surface">作者主页</span>
      {signedIn ? (
        <div className="flex items-center gap-5">
          <Link
            viewTransition
            to="/exhibitions"
            className="text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none"
          >
            我的展览
          </Link>
          <Link
            viewTransition
            to="/contributions"
            className="text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none"
          >
            我参与的
          </Link>
        </div>
      ) : (
        <Link
          viewTransition
          to="/login"
          className="text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none"
        >
          登录
        </Link>
      )}
    </nav>
  );
}

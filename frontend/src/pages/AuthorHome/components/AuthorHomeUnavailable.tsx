import { Link } from "react-router-dom";

export interface AuthorHomeUnavailableProps {
  /** 路由上的作者用户名。 */
  readonly username: string;
  /** 当前登录用户的用户名；未登录或不是本人时为 null。 */
  readonly currentUsername: string | null;
}

/**
 * 作者主页未公开/不存在时的提示（与原先文案一致）。
 * 如果访问者正是该用户本人（登录用户名与路由一致），补一条去账户设置开启公开主页的入口；
 * 其他访客看不到这条链接，避免暴露账户信息。
 */
export function AuthorHomeUnavailable({ username, currentUsername }: AuthorHomeUnavailableProps) {
  const isOwnProfile = currentUsername !== null && currentUsername === username;
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-serif text-h1 text-ink">这个主页还没有公开</h1>
      <p className="mt-3 text-body text-muted">
        作者可能没有开启主页，或者链接有误。单个展览的分享链接仍然可以直接打开。
      </p>
      {isOwnProfile ? (
        <Link
          viewTransition
          to="/account"
          className="mt-6 inline-block text-caption text-accent underline-offset-4 transition-colors duration-150 ease-out hover:underline motion-reduce:transition-none"
        >
          去账户设置开启公开主页 →
        </Link>
      ) : null}
    </div>
  );
}

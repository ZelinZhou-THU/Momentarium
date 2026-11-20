import { useState } from "react";
import { Link } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { ErrorState, Reveal, Spinner, Toast } from "../../components/ui";
import { PasswordForm } from "./components/PasswordForm";
import { ProfileForm } from "./components/ProfileForm";
import { useMyProfile } from "./hooks/useMyProfile";

/** 账户设置：账户概况 → 公开资料 → 修改密码。 */
export default function AccountPage() {
  const { state, reload, replace } = useMyProfile();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-bg">
      <AppTopBar />

      <main className="mx-auto w-full max-w-content px-8 py-12">
        <Reveal>
          <h1 className="font-serif text-display text-ink">账户设置</h1>
        </Reveal>

        {state.status === "loading" ? (
          <div className="flex justify-center py-24">
            <Spinner label="正在读取账户" />
          </div>
        ) : state.status === "error" ? (
          <div className="mt-8">
            <ErrorState message={state.message} onRetry={reload} />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Reveal index={1} className="lg:col-span-2">
              <section className="h-full rounded-xl border border-line bg-surface p-6" aria-label="账户概况">
                <p className="text-caption text-muted">用户名</p>
                <p className="text-h2 text-ink">{state.profile.username}</p>
                <p className="mt-2 text-caption text-muted">
                  注册于 {new Date(state.profile.createdAt).toLocaleDateString("zh-CN")}
                </p>
                {state.profile.homepagePublic ? (
                  <Link viewTransition className="mt-3 inline-block text-caption text-accent underline" to={`/u/${state.profile.username}`}>
                    查看我的作者主页 →
                  </Link>
                ) : null}
              </section>
            </Reveal>

            <Reveal index={2}>
              <section className="h-full rounded-xl border border-line bg-surface p-6" aria-label="公开资料">
                <h2 className="text-h2 text-ink">公开资料</h2>
                <div className="mt-4">
                  <ProfileForm profile={state.profile} onSaved={replace} onMessage={setToastMessage} />
                </div>
              </section>
            </Reveal>

            <Reveal index={3}>
              <section className="h-full rounded-xl border border-line bg-surface p-6" aria-label="修改密码">
                <h2 className="text-h2 text-ink">修改密码</h2>
                <div className="mt-4">
                  <PasswordForm onMessage={setToastMessage} />
                </div>
              </section>
            </Reveal>
          </div>
        )}
      </main>

      {toastMessage === null ? null : (
        <Toast message={toastMessage} tone="info" onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}

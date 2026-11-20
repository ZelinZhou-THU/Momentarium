import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoginAPI } from "../../apis/users/LoginAPI";
import { Button, ErrorState, Input } from "../../components/ui";
import { setSession } from "../../stores/sessionStore";
import { AuthPageShell } from "./components/AuthPageShell";
import { registerPathWithNext, safeAuthRedirect } from "./functions/authRedirect";
import { describeAuthError } from "./functions/describeAuthError";
import {
  EMPTY_CREDENTIAL_ERRORS,
  hasCredentialErrors,
  validateCredentials,
} from "./functions/validateCredentials";
import type { AuthSubmitState, CredentialErrors } from "./objects/AuthForm";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 登录成功后的站内回跳（如邀请页）；非法值回退到站点首页（再按角色分流）。
  const next = safeAuthRedirect(searchParams.get("next"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>(EMPTY_CREDENTIAL_ERRORS);
  const [submitState, setSubmitState] = useState<AuthSubmitState>({ status: "idle" });

  const isSubmitting = submitState.status === "submitting";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const credentials = { username: username.trim(), password };
    const errors = validateCredentials(credentials);
    setFieldErrors(errors);
    if (hasCredentialErrors(errors)) {
      return;
    }

    setSubmitState({ status: "submitting" });
    new LoginAPI(credentials.username, credentials.password)
      .send()
      .then((authResponse) => {
        setSession(authResponse.token, authResponse.user);
        navigate(next, { replace: true, viewTransition: true });
      })
      .catch((error: unknown) => {
        setSubmitState({ status: "error", message: describeAuthError(error) });
      });
  };

  return (
    <AuthPageShell
      title="回到你的档案馆"
      description="登录后继续整理照片、章节与尚未发布的三维记忆场景。"
      footer={
        <>
          还没有账号？
          <Link
            viewTransition
            className="ml-1 text-accent underline underline-offset-4 transition-colors duration-150 hover:text-ink"
            to={registerPathWithNext(next)}
          >
            创建一个
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        <Input
          label="用户名"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={fieldErrors.username ?? undefined}
          disabled={isSubmitting}
        />
        <Input
          label="密码"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password ?? undefined}
          disabled={isSubmitting}
        />
        {submitState.status === "error" ? (
          <ErrorState title="登录失败" message={submitState.message} />
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          登录
        </Button>
      </form>
    </AuthPageShell>
  );
}

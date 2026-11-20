import { useState } from "react";
import { ChangePasswordAPI } from "../../../apis/users/ChangePasswordAPI";
import { Button, Input } from "../../../components/ui";
import { setSession } from "../../../stores/sessionStore";
import { describeAccountError } from "../functions/describeAccountError";
import { hasPasswordErrors, validatePasswordChange } from "../functions/validatePasswordChange";
import type { PasswordFormValues } from "../objects/AccountPage";

const EMPTY: PasswordFormValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

export interface PasswordFormProps {
  readonly onMessage: (message: string) => void;
}

/** 修改密码：成功后用新令牌替换会话（其它设备的旧令牌已失效），并清空表单。 */
export function PasswordForm({ onMessage }: PasswordFormProps) {
  const [values, setValues] = useState<PasswordFormValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = validatePasswordChange(values);
  const shown = (message: string | null): string | undefined => (submitted && message !== null ? message : undefined);

  const submit = (): void => {
    setSubmitted(true);
    if (hasPasswordErrors(errors)) {
      return;
    }
    setSaving(true);
    new ChangePasswordAPI(values.currentPassword, values.newPassword)
      .send()
      .then(
        (auth) => {
          setSession(auth.token, auth.user);
          setValues(EMPTY);
          setSubmitted(false);
          onMessage("密码已修改，其它设备需要重新登录");
        },
        (error: unknown) => onMessage(describeAccountError(error)),
      )
      .finally(() => setSaving(false));
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label="当前密码"
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        error={shown(errors.currentPassword)}
        onChange={(event) => setValues({ ...values, currentPassword: event.target.value })}
      />
      <Input
        label="新密码"
        type="password"
        autoComplete="new-password"
        hint="8–72 个字符"
        value={values.newPassword}
        error={shown(errors.newPassword)}
        onChange={(event) => setValues({ ...values, newPassword: event.target.value })}
      />
      <Input
        label="再次输入新密码"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        error={shown(errors.confirmPassword)}
        onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })}
      />
      <div>
        <Button type="submit" variant="secondary" loading={saving}>
          修改密码
        </Button>
      </div>
    </form>
  );
}

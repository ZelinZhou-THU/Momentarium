import { useState } from "react";
import { UpdateMyProfileAPI } from "../../../apis/users/UpdateMyProfileAPI";
import { Button, Input, Textarea } from "../../../components/ui";
import type { ProfileView } from "../../../objects/ProfileView";
import { describeAccountError } from "../functions/describeAccountError";
import { hasProfileErrors, validateProfileForm } from "../functions/validateProfileForm";
import type { ProfileFormValues } from "../objects/AccountPage";

export interface ProfileFormProps {
  readonly profile: ProfileView;
  readonly onSaved: (profile: ProfileView) => void;
  readonly onMessage: (message: string) => void;
}

/** 公开资料：显示名、简介、是否开启作者主页（开启后公开页显示作者入口）。 */
export function ProfileForm({ profile, onSaved, onMessage }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>({
    displayName: profile.displayName,
    bio: profile.bio,
    homepagePublic: profile.homepagePublic,
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = validateProfileForm(values);
  const shown = (message: string | null): string | undefined => (submitted && message !== null ? message : undefined);

  const submit = (): void => {
    setSubmitted(true);
    if (hasProfileErrors(errors)) {
      return;
    }
    setSaving(true);
    new UpdateMyProfileAPI(values.displayName, values.bio, values.homepagePublic)
      .send()
      .then(
        (saved) => {
          onSaved(saved);
          onMessage("资料已保存");
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
        label="显示名"
        value={values.displayName}
        error={shown(errors.displayName)}
        onChange={(event) => setValues({ ...values, displayName: event.target.value })}
      />
      <Textarea
        label="简介"
        hint="最多 200 个字，会显示在你的作者主页上。"
        value={values.bio}
        error={shown(errors.bio)}
        onChange={(event) => setValues({ ...values, bio: event.target.value })}
      />
      <label className="flex items-start gap-3 text-body text-ink">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-accent"
          checked={values.homepagePublic}
          onChange={(event) => setValues({ ...values, homepagePublic: event.target.checked })}
        />
        <span>
          公开我的作者主页
          <span className="block text-caption text-muted">
            开启后，任何人都能在 /u/{profile.username} 看到你已发布的展览，展览公开页也会显示作者入口；关闭后主页不可访问，单个展览链接不受影响。
          </span>
        </span>
      </label>
      <div>
        <Button type="submit" loading={saving}>
          保存资料
        </Button>
      </div>
    </form>
  );
}

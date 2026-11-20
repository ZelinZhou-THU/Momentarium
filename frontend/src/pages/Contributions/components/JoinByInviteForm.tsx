import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { inviteReturnPath } from "../../Invite/functions/inviteCopy";
import { INVITE_INPUT_INVALID_NOTICE, inviteTokenFromInput } from "../functions/inviteInput";

/**
 * 粘贴邀请链接加入：邀请是创建者分享的通用链接，没有「发给我的待接受邀请」，
 * 因此给一个入口，粘贴整条链接或邀请码后进入邀请页（登录、预览、加入沿用邀请页流程）。
 */
export function JoinByInviteForm() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const token = inviteTokenFromInput(value);
    if (token === null) {
      setNotice(INVITE_INPUT_INVALID_NOTICE);
      return;
    }
    navigate(inviteReturnPath(token));
  };

  return (
    <form onSubmit={submit} aria-label="通过邀请链接加入展览" className="flex flex-col gap-2">
      <label htmlFor="join-by-invite" className="text-caption text-muted">
        收到邀请链接了？粘贴到这里加入另一场展览
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="join-by-invite"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setNotice(null);
          }}
          placeholder="粘贴邀请链接或邀请码"
          autoComplete="off"
          aria-describedby={notice === null ? undefined : "join-by-invite-notice"}
          aria-invalid={notice !== null}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={value.trim() === ""}
          className="rounded-md border border-line bg-surface px-4 py-2 text-caption text-ink transition duration-150 ease-out hover:bg-accentSoft disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          打开邀请
        </button>
      </div>
      {notice === null ? null : (
        <p id="join-by-invite-notice" role="alert" className="text-caption text-danger">
          {notice}
        </p>
      )}
    </form>
  );
}

import { useEffect, useState } from "react";
import { ApiError } from "../../../apis/shared/ApiError";
import { GetMyProfileAPI } from "../../../apis/users/GetMyProfileAPI";
import type { ProfileView } from "../../../objects/ProfileView";
import { clearSession } from "../../../stores/sessionStore";
import { describeAccountError } from "../functions/describeAccountError";
import type { ProfileLoadState } from "../objects/AccountPage";

export interface MyProfileModel {
  readonly state: ProfileLoadState;
  readonly reload: () => void;
  readonly replace: (profile: ProfileView) => void;
}

/** 读取账户资料；保存成功后用 replace 直接换成服务端返回的新视图，不再重新请求。 */
export const useMyProfile = (): MyProfileModel => {
  const [state, setState] = useState<ProfileLoadState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setState({ status: "loading" });
    new GetMyProfileAPI().send().then(
      (profile) => setState({ status: "ready", profile }),
      (error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
          clearSession();
          return;
        }
        setState({ status: "error", message: describeAccountError(error) });
      },
    );
  }, [reloadCount]);

  return {
    state,
    reload: () => setReloadCount((count) => count + 1),
    replace: (profile) => setState({ status: "ready", profile }),
  };
};

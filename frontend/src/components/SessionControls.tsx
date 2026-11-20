import { useNavigate } from "react-router-dom";
import { LogoutAPI } from "../apis/users/LogoutAPI";
import { clearSession, useSessionUser } from "../stores/sessionStore";
import { UserMenu } from "./UserMenu";

/** 顶栏右侧会话区（深色顶栏）：当前用户菜单（账户设置 / 作者主页 / 登出）；登出会清会话并回登录页。 */
export function SessionControls() {
  const navigate = useNavigate();
  const user = useSessionUser();

  const handleLogout = () => {
    new LogoutAPI()
      .send()
      .catch(() => undefined)
      .then(() => {
        clearSession();
        navigate("/login", { replace: true, viewTransition: true });
      });
  };

  return user === null ? null : <UserMenu username={user.username} onLogout={handleLogout} />;
}

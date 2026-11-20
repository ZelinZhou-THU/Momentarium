import { Navigate } from "react-router-dom";
import { Spinner } from "../../components/ui";
import { useHomeDestination } from "./hooks/useHomeDestination";

/** 站点首页 `/`（登录）：不展示内容，只按角色把人送到合适的并列空间。 */
export default function HomePage() {
  const destination = useHomeDestination();

  return destination.status === "loading" ? (
    <main className="flex min-h-screen w-full items-center justify-center bg-bg px-8">
      <Spinner label="正在打开" />
    </main>
  ) : (
    <Navigate to={destination.path} replace />
  );
}

import { NavLink } from "react-router-dom";
import { MAIN_NAV_ITEMS } from "./mainNavItems";

const LINK_BASE =
  "whitespace-nowrap rounded-md px-3 py-1 text-caption transition-colors duration-150 ease-out motion-reduce:transition-none";

/** 顶栏主导航：并列的「我的展览」「我参与的」；路径前缀匹配，所以在某个展览的工作台里「我的展览」仍高亮。 */
export function MainNav() {
  return (
    <nav aria-label="主导航" className="flex items-center gap-2">
      {MAIN_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          viewTransition
          to={item.to}
          className={({ isActive }) =>
            `${LINK_BASE} ${
              isActive
                ? "bg-surface/15 text-surface"
                : "text-surface/70 hover:bg-surface/10 hover:text-surface"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

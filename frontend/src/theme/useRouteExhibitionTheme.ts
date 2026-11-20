import { useLayoutEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useRememberedExhibitionScenePalette } from "../stores/exhibitionPaletteStore";
import { deriveExhibitionTheme, themeVariables } from "./deriveExhibitionTheme";
import { exhibitionIdOfPath } from "./exhibitionRoute";

/**
 * 按当前路由给整站上色：在某个展览的页面里，用它登记过的场景主色覆盖 <html> 上的颜色变量；
 * 离开展览页面、主色未知或推导不出可读配色时移除覆盖，回到 index.css 的默认配色。
 * 写在 <html> 上，弹窗与顶栏等挂在页面之外的元素也一起跟随；layout effect 保证首帧就是正确颜色。
 */
export const useRouteExhibitionTheme = (): void => {
  const exhibitionId = exhibitionIdOfPath(useLocation().pathname);
  const palette = useRememberedExhibitionScenePalette(exhibitionId);
  const theme = useMemo(() => (palette === null ? null : deriveExhibitionTheme(palette)), [palette]);

  useLayoutEffect(() => {
    const variables = theme === null ? [] : Object.entries(themeVariables(theme));
    const style = document.documentElement.style;
    variables.forEach(([name, value]) => style.setProperty(name, value));
    return () => variables.forEach(([name]) => style.removeProperty(name));
  }, [theme]);
};

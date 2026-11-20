import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { appRoutes } from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("找不到挂载节点 #root");
}

// 数据路由（而非 BrowserRouter）：useBlocker 与页面切换动画都依赖它；路由表在 App.tsx 中声明。
const router = createBrowserRouter(appRoutes);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

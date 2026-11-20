# 跨端与浏览器验收

`smoke.ps1`、`curation-e2e.ps1`、`scene-e2e.ps1` 使用运行中的后端；参数和范围见根 README 与各脚本说明。使用 fake 模式运行本页回归。

## ScenePanel 离线浏览器回归

使用真实 React 面板、iframe 与 WebGL，注入 fake 客户端。覆盖语法错误、build 抛错和同步超时后的四图恢复、封面、重复评审、离屏延迟、成功场景刷新与生成中取消；不是完整业务 E2E，也不覆盖照片准备阶段取消。

前置：已安装前端依赖、Python Playwright 及 Chromium，测试环境支持 WebGL。没有新增项目依赖；如机器未安装浏览器测试工具，先按本机环境安装。执行时无需后端、数据库或模型。

```powershell
# 终端一，在 frontend/ 中；端口必须空闲，strictPort 防止误连其它服务。
pnpm exec vite --host 127.0.0.1 --port 5178 --strictPort

# 终端二，在仓库根目录中。
python tests/e2e/scene-panel-browser.py
```

页面位于 `frontend/tests/browser/scene-panel/`；合成图取自 `tests/fixtures/smoke/synthetic-smoke-1024.jpg`，vendor 由测试脚本本地注入，API 与外部请求均阻断。不需要 `.vite` 中的临时 HTML、配置或照片。仅由 Vite 开发服务器按路径提供测试页，生产构建仍从 `frontend/index.html` 进入。

结果与截图写入被忽略的 `backend/target/scene-panel-browser/`，成功退出码为 0。报告和截图留在本机。`--timeout-only` 仅复验超时及后续就绪/取消用例。

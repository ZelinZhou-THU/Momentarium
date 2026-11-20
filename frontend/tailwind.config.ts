import type { Config } from "tailwindcss";

// Momentarium 设计系统（spec §11.6）：8 色 token、6 档字号、2 档圆角、8px 间距网格。
// 视觉定位：私人记忆档案馆 —— 克制、编辑感、留白充分，不做 SaaS 后台与霓虹科技感。
// 约定：颜色、字号、圆角、间距、阴影、动效全部由本配置限定，页面只写这些 token 对应的类名。

// 颜色 token 取自 CSS 变量（默认值在 index.css 的 :root，即胡桃木配色）；展览相关页面按场景主色
// 覆盖这些变量（src/theme），类名不变。变量存 RGB 通道，`text-surface/60` 这类透明度写法照常可用。
const themeColor = (variable: string): string => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // 8 个颜色 token，不新增第二强调色 / 第二套色板；除 danger 外随展览场景配色变化（v0.9.8）。
    // night(默认 #3A2E26，胡桃木棕)：深色点缀——顶栏、视觉重心卡片、当前分区、照片墙/场景舞台、
    // 未保存提醒，以及公开页与沉浸式场景覆盖层；不做大面积表单底色。深色底上文字用 surface，
    // 主按钮用 accentSoft 底（陶土 accent 在深棕上对比不足）。
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      bg: themeColor("--color-bg"),
      surface: themeColor("--color-surface"),
      ink: themeColor("--color-ink"),
      muted: themeColor("--color-muted"),
      line: themeColor("--color-line"),
      accent: themeColor("--color-accent"),
      accentSoft: themeColor("--color-accent-soft"),
      danger: "#B3261E",
      night: themeColor("--color-night"),
    },
    // 两族字体：展示用衬线（展览标题、场景入口导语），正文用无衬线。
    fontFamily: {
      serif: [
        "'Noto Serif SC'",
        "'Source Han Serif SC'",
        "'Songti SC'",
        "SimSun",
        "serif",
      ],
      sans: [
        "'Noto Sans SC'",
        "'PingFang SC'",
        "'Microsoft YaHei'",
        "system-ui",
        "-apple-system",
        "'Segoe UI'",
        "sans-serif",
      ],
    },
    // 字号阶梯固定 6 档（字号/行高），标题字距 -1%，正文 0；行高均 ≥1.4。
    fontSize: {
      display: ["44px", { lineHeight: "52px", letterSpacing: "-0.01em" }],
      h1: ["30px", { lineHeight: "40px", letterSpacing: "-0.01em" }],
      h2: ["20px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
      body: ["15px", { lineHeight: "26px", letterSpacing: "0" }],
      caption: ["13px", { lineHeight: "20px", letterSpacing: "0" }],
      micro: ["11px", { lineHeight: "16px", letterSpacing: "0" }],
    },
    // 圆角只有两档：控件 rounded-md(8px)、卡片 rounded-xl(16px)；圆角 none 仅用于清除。
    borderRadius: {
      none: "0",
      md: "8px",
      xl: "16px",
    },
    // 8px 间距网格（保留 4px 半格用于描边级微间距），不提供 2px/6px/10px 等任意步进。
    spacing: {
      0: "0px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      5: "20px",
      6: "24px",
      8: "32px",
      10: "40px",
      12: "48px",
      14: "56px",
      16: "64px",
      20: "80px",
      24: "96px",
      32: "128px",
      px: "1px",
    },
    // 重阴影只留 shadow-sm 一档，其余移除。
    boxShadow: {
      sm: "0 1px 2px 0 rgb(29 27 24 / 0.05)",
    },
    // 动效分两档（spec §11.6，v0.9.8）：
    // - 微交互 150–250ms ease-out（悬停、按下、收放），只做渐隐与 ≤8px 位移；
    // - 场景切换 300–600ms（页面切换、共享元素补间、进入场景、大图翻页、内容与列表逐项进场），
    //   由渐隐、位移（≤24px）与共享元素补间组成；不做弹跳、旋转与视差。
    // 500ms 也用于沉浸观看的开场字幕渐隐。所有动画尊重 prefers-reduced-motion。
    transitionDuration: {
      DEFAULT: "200ms",
      150: "150ms",
      200: "200ms",
      250: "250ms",
      500: "500ms",
    },
    extend: {
      // 入场动画；使用处配 motion-reduce:animate-none。
      // fade-in：渐显（大图文字、开场字幕、含 fixed 子元素的分区）；rise-in：渐显 + 上浮 12px（内容与列表逐项进场，配 staggerDelay）；
      // slide-from-*：大图翻页时新照片从翻页方向滑入 24px。
      // fade-in 用 backwards 而不是 both：结束后若仍保留动画值，Chrome 会让元素继续充当层叠上下文，
      // 场景分区里 fixed 的沉浸层（z-50）就被困在其中，压在吸顶分区栏（z-20）下面（11-01 录制发现）。
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        riseIn: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
        slideFromRight: { from: { opacity: "0", transform: "translateX(24px)" }, to: { opacity: "1", transform: "none" } },
        slideFromLeft: { from: { opacity: "0", transform: "translateX(-24px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-in": "fadeIn 250ms ease-out backwards",
        "rise-in": "riseIn 400ms cubic-bezier(0.2, 0, 0, 1) both",
        "slide-from-right": "slideFromRight 300ms ease-out both",
        "slide-from-left": "slideFromLeft 300ms ease-out both",
      },
      // 页面内容最大宽度 1200px；页面左右留白用 px-8(32px) 起。
      maxWidth: {
        content: "1200px",
      },
      // 默认描边与 focus ring 直接落到设计 token，避免误用 Tailwind 默认灰蓝。
      borderColor: {
        DEFAULT: "rgb(var(--color-line))",
      },
      ringColor: {
        DEFAULT: "rgb(var(--color-accent))",
      },
    },
  },
  plugins: [],
};

export default config;

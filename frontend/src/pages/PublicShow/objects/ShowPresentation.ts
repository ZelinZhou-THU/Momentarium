/**
 * 看展界面的"外框"文案：同一套先导页与 3D 游览，公开页与作者的草稿预览只在这里不同。
 * 组件只读这些字段，不判断自己是公开还是预览。
 */
export interface ShowPresentation {
  /** 先导页顶部小字（如「Momentarium · 公开记忆场景」）。 */
  readonly eyebrow: string;
  /** 先导页标题下方的版本说明。 */
  readonly versionLabel: string;
  /** 3D 游览右上角的短标签。 */
  readonly sceneBadge: string;
  /** 需要提醒观看者的一句话（如场景基于旧策展内容）；null 不显示。 */
  readonly notice: string | null;
  /** 先导页左上角返回入口（预览回工作台）；null 不显示。 */
  readonly backLink: { readonly label: string; readonly to: string } | null;
}

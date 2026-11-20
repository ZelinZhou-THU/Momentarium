export interface OpeningCurtainProps {
  readonly title: string;
  readonly narration: string;
  readonly badge: string;
  /** 场景是否已搭好（决定底部是等待提示还是操作提示）。 */
  readonly built: boolean;
  /** 幕布是否已拉开：true 时渐隐并不再拦截操作。 */
  readonly lifted: boolean;
}

/**
 * 开场字幕：进入场景时盖在 3D 上的“幕布”，展示展览标题与入口导语，
 * 把场景搭建的等待变成开场；搭好且停留够久后渐隐，露出场景。
 */
export function OpeningCurtain({ title, narration, badge, built, lifted }: OpeningCurtainProps) {
  return (
    <div
      role={lifted ? undefined : "status"}
      aria-hidden={lifted}
      className={`absolute inset-0 z-10 flex items-center justify-center bg-night px-8 transition-opacity duration-500 ease-out motion-reduce:transition-none ${
        lifted ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex w-full max-w-xl animate-fade-in flex-col items-center text-center motion-reduce:animate-none">
        <p className="text-micro tracking-wide text-surface/60">{badge}</p>
        <h2 className="mt-4 font-serif text-h1 text-surface">{title}</h2>
        {narration.trim() === "" ? null : (
          <>
            <span aria-hidden="true" className="mt-6 block h-px w-12 bg-accent" />
            <p className="mt-6 font-serif text-body text-surface/80">{narration}</p>
          </>
        )}
        {built ? null : (
          <span
            aria-hidden="true"
            className="mt-12 block h-1 w-8 animate-pulse rounded-md bg-surface/60 motion-reduce:animate-none"
          />
        )}
        <p className={`text-caption text-surface/60 ${built ? "mt-12" : "mt-3"}`}>
          {built ? "拖动旋转 · 滚轮缩放 · 点击照片查看大图" : "正在搭建三维场景…（首次加载约需几秒）"}
        </p>
      </div>
    </div>
  );
}

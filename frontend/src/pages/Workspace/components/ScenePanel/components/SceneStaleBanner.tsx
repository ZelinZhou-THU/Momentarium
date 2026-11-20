/**
 * 当前采用场景已过期（素材或策展内容在它生成之后变过，例如采用了投稿）的提示：
 * 说明为什么不能修订、发布前要做什么；重新生成的按钮就在舞台里，这里不重复放。
 */
export function SceneStaleBanner() {
  return (
    <div role="status" className="mt-6 rounded-xl border border-accent bg-accentSoft p-5">
      <h3 className="font-serif text-h2 text-ink">素材已变化，场景需要重新生成</h3>
      <p className="mt-2 text-caption text-ink">
        当前场景是按较早的照片或策展内容生成的（例如采用了新的投稿）。已发布的公开页不受影响；
        要发布最新内容，请先重新生成场景。过期的场景不能做自然语言修订。
      </p>
    </div>
  );
}

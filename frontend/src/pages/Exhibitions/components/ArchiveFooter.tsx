/**
 * 档案页脚：与顶栏同为 night 深色的通栏，一句馆藏引文 + 版本信息，给页面一个落幕的收尾。
 * 放在内容容器之外（通栏），由页面用 flex 把它压在视口底部。
 */
export function ArchiveFooter() {
  return (
    <footer className="bg-night">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-start justify-between gap-8 px-8 py-12">
        <p className="max-w-md font-serif text-h2 text-surface">
          照片会褪色，记忆会因为被再看一次而重新发光。
        </p>
        <div className="text-right">
          <p className="text-micro text-surface/60">MOMENTARIUM · 私人记忆档案馆</p>
          <p className="mt-2 text-micro text-surface/60">2026 · 第一版</p>
        </div>
      </div>
    </footer>
  );
}

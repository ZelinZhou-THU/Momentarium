import { Button } from "../../../components/ui";
import type { ArchiveSummary } from "../functions/buildArchiveSummary";

export interface ArchiveMastheadProps {
  readonly summary: ArchiveSummary;
  readonly onCreate: () => void;
}

interface StatItem {
  readonly label: string;
  readonly value: number;
}

/** 编辑式 masthead：eyebrow + 大号 serif 标题 + 克制导语 + 细规则线 + 馆藏统计。 */
export function ArchiveMasthead({ summary, onCreate }: ArchiveMastheadProps) {
  const stats: readonly StatItem[] = [
    { label: "展览", value: summary.exhibitionCount },
    { label: "照片", value: summary.photoCount },
    { label: "已发布", value: summary.publishedCount },
    // 有待处理的回忆时才出现，提醒创建者去各展览的「投稿」分区。
    ...(summary.pendingContributionCount > 0
      ? [{ label: "待处理回忆", value: summary.pendingContributionCount }]
      : []),
  ];

  return (
    <header className="border-b border-line pb-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-micro text-muted">私人记忆档案馆 · PRIVATE MEMORY ARCHIVE</p>
          <h1 className="mt-4 font-serif text-display text-ink">我的展览</h1>
          <p className="mt-4 max-w-xl text-body text-muted">
            把散落的照片，收进会呼吸的房间。一次旅行、一段季节，都值得被重新排布、重新观看。
          </p>
        </div>
        <Button onClick={onCreate} className="shrink-0">
          新建展览
        </Button>
      </div>

      <dl className="mt-10 flex flex-wrap gap-x-16 gap-y-6 border-t border-line pt-6">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-micro text-muted">{stat.label}</dt>
            <dd className="mt-1 font-serif text-h1 text-ink">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

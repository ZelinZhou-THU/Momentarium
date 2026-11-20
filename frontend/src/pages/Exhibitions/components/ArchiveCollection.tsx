import { Link } from "react-router-dom";
import { useAuthorizedImage } from "../../../apis/shared/useAuthorizedImage";
import { Button, PaletteStrip } from "../../../components/ui";
import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import { staggerDelay } from "../../../motion/stagger";
import { exhibitionThemeStyle } from "../../../theme/deriveExhibitionTheme";
import { formatArchiveDate } from "../functions/formatArchiveDate";

export interface ArchiveCollectionProps {
  readonly exhibitions: readonly ExhibitionSummary[];
  readonly onOpen: (exhibition: ExhibitionSummary) => void;
  /** 看展：纯观看界面（先导页 + 全屏场景），不进工作台。 */
  readonly onView: (exhibition: ExhibitionSummary) => void;
  readonly onRename: (exhibition: ExhibitionSummary) => void;
  readonly onDelete: (exhibition: ExhibitionSummary) => void;
}

interface ArchiveCoverProps {
  readonly exhibition: ExhibitionSummary;
  /** 档案编号（feature 为 01，其余从 02 起）。 */
  readonly number: number;
  readonly className: string;
}

const archiveNumber = (number: number): string => String(number).padStart(2, "0");

const coverUrlOf = (exhibition: ExhibitionSummary): string =>
  exhibition.photoCount === 0 || exhibition.cover.imageUrl.length === 0
    ? ""
    : `${exhibition.cover.imageUrl}?v=${encodeURIComponent(exhibition.updatedAt)}`;

/**
 * 封面：作者态二进制路由经 Bearer 换成 blob；无照片/加载中/失败都使用设计过的编号占位，
 * 不出现裸「暂无封面」文案。
 */
function ArchiveCover({ exhibition, number, className }: ArchiveCoverProps) {
  const image = useAuthorizedImage(coverUrlOf(exhibition));
  const showImage = image.objectUrl !== null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-line bg-accentSoft ${className}`}
    >
      {showImage ? (
        <img
          src={image.objectUrl ?? ""}
          alt={`${exhibition.title} 封面`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
          <span className="font-serif text-display text-accent">{archiveNumber(number)}</span>
          <span className="h-px w-10 bg-line" />
          <span className="text-micro text-muted">等待第一张照片</span>
        </div>
      )}
    </div>
  );
}

interface ArchiveStatusProps {
  readonly exhibition: ExhibitionSummary;
}

/** 档案的场景主色：一行细色条，没有成功场景时不显示。 */
function ArchivePalette({ exhibition }: { readonly exhibition: ExhibitionSummary }) {
  return <PaletteStrip colors={exhibition.scenePalette} label="场景主色" swatchClassName="h-2 w-6" />;
}

/** 发布状态：草稿 / 已发布 vN / 有未发布修改；需要关注时用 accentSoft 底 + accent 字。 */
function ArchiveStatus({ exhibition }: ArchiveStatusProps) {
  const publication = exhibition.publication;
  const needsAttention = publication === null || exhibition.hasUnpublishedChanges;
  const label =
    publication === null
      ? "草稿"
      : exhibition.hasUnpublishedChanges
        ? "有未发布修改"
        : `已发布 v${publication.version}`;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-micro ${
        needsAttention ? "bg-accentSoft text-accent" : "text-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1 w-1 rounded-md ${needsAttention ? "bg-accent" : "bg-muted"}`}
      />
      {label}
    </span>
  );
}

/** 待处理的投稿提示：有人提交了回忆等你看（或已采用的回忆有新版本）；直达该展览的「投稿」分区。 */
function ArchivePendingContributions({ exhibition }: { readonly exhibition: ExhibitionSummary }) {
  return exhibition.pendingContributionCount === 0 ? null : (
    <Link
      viewTransition
      to={`/exhibitions/${exhibition.id}?tab=contributions`}
      className="inline-flex items-center gap-1 rounded-md bg-accentSoft px-2 py-1 text-micro text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {exhibition.pendingContributionCount} 段回忆待处理 →
    </Link>
  );
}

interface ArchiveItemProps {
  readonly exhibition: ExhibitionSummary;
  readonly number: number;
  readonly flipped: boolean;
  readonly onOpen: () => void;
  readonly onView: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}

/**
 * 收藏区次要作品：两列交错（封面左/右交替），编号 + serif 标题 + 元信息 + 状态 + 场景主色；
 * 整块套用该展览的局部配色（占位封面、状态标签、悬停色跟随它的场景）。
 */
function ArchiveItem({ exhibition, number, flipped, onOpen, onView, onRename, onDelete }: ArchiveItemProps) {
  return (
    <li
      style={{ ...exhibitionThemeStyle(exhibition.scenePalette), animationDelay: staggerDelay(number - 1) }}
      className="grid grid-cols-1 gap-5 animate-rise-in motion-reduce:animate-none md:grid-cols-2 md:items-center"
    >
      <button
        type="button"
        onClick={onOpen}
        className={`block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
          flipped ? "md:order-2" : ""
        }`}
        aria-label={`打开展览：${exhibition.title}`}
      >
        <ArchiveCover exhibition={exhibition} number={number} className="aspect-video w-full" />
      </button>

      <div className={flipped ? "md:order-1" : ""}>
        <p className="text-micro text-muted">档案 {archiveNumber(number)}</p>
        <h2 className="mt-2 font-serif text-h2 text-ink">
          <button
            type="button"
            onClick={onOpen}
            className="text-left transition-colors duration-150 ease-out hover:text-accent motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {exhibition.title}
          </button>
        </h2>
        <p className="mt-2 text-caption text-muted">
          {exhibition.photoCount} 张照片 · 更新于 {formatArchiveDate(exhibition.updatedAt)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ArchiveStatus exhibition={exhibition} />
          <ArchivePalette exhibition={exhibition} />
          <ArchivePendingContributions exhibition={exhibition} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1">
          <Button variant="secondary" size="sm" onClick={onView}>
            看展
          </Button>
          <Button variant="ghost" size="sm" onClick={onRename}>
            重命名
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>
    </li>
  );
}

interface ArchiveFeatureProps {
  readonly exhibition: ExhibitionSummary;
  readonly onOpen: () => void;
  readonly onView: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}

/** 第一件作品：大版式 feature（大封面 + serif 大标题 + 元信息 + 发布状态 + 场景主色 + 操作），套用该展览的局部配色。 */
function ArchiveFeature({ exhibition, onOpen, onView, onRename, onDelete }: ArchiveFeatureProps) {
  return (
    <article
      style={exhibitionThemeStyle(exhibition.scenePalette)}
      className="grid grid-cols-1 gap-8 border-b border-line pb-12 animate-rise-in motion-reduce:animate-none lg:grid-cols-2 lg:items-end"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        aria-label={`打开展览：${exhibition.title}`}
      >
        <ArchiveCover exhibition={exhibition} number={1} className="aspect-video w-full" />
      </button>

      <div className="pb-2">
        <p className="text-micro text-muted">FEATURED · 最新整理</p>
        <h2 className="mt-4 font-serif text-display text-ink">
          <button
            type="button"
            onClick={onOpen}
            className="text-left transition-colors duration-150 ease-out hover:text-accent motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {exhibition.title}
          </button>
        </h2>
        <p className="mt-4 text-caption text-muted">
          {exhibition.photoCount} 张照片 · 更新于 {formatArchiveDate(exhibition.updatedAt)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ArchiveStatus exhibition={exhibition} />
          <ArchivePalette exhibition={exhibition} />
          <ArchivePendingContributions exhibition={exhibition} />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onView}>
            看展
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpen}>
            打开工作台
          </Button>
          <Button variant="ghost" size="sm" onClick={onRename}>
            重命名
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>
    </article>
  );
}

/** 收藏区：第一件作品 feature 大版式，其余两列交错档案布局。 */
export function ArchiveCollection({
  exhibitions,
  onOpen,
  onView,
  onRename,
  onDelete,
}: ArchiveCollectionProps) {
  const feature = exhibitions[0];
  const rest = exhibitions.slice(1);

  return (
    <div>
      <ArchiveFeature
        exhibition={feature}
        onOpen={() => onOpen(feature)}
        onView={() => onView(feature)}
        onRename={() => onRename(feature)}
        onDelete={() => onDelete(feature)}
      />

      {rest.length === 0 ? null : (
        <ul className="mt-12 grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
          {rest.map((exhibition, index) => (
            <ArchiveItem
              key={exhibition.id}
              exhibition={exhibition}
              number={index + 2}
              flipped={index % 2 === 1}
              onOpen={() => onOpen(exhibition)}
              onView={() => onView(exhibition)}
              onRename={() => onRename(exhibition)}
              onDelete={() => onDelete(exhibition)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

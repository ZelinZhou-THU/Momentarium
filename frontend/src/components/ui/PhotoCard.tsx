import { classNames } from "./classNames";

export interface PhotoCardProps {
  src: string;
  alt: string;
  caption?: string;
  selected?: boolean;
  // 传入后整张卡片成为可选中按钮（照片墙 / 策展选片）；不传则是纯展示卡片。
  onSelect?: () => void;
  // 底色：light（纸色，默认）或 dark（深色照片墙）。
  tone?: "light" | "dark";
}

const frameClasses = (selected: boolean, tone: "light" | "dark"): string =>
  classNames(
    "block w-full overflow-hidden rounded-xl border bg-accentSoft",
    selected
      ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg"
      : tone === "dark"
        ? "border-surface/10"
        : "border-line",
  );

export function PhotoCard({ src, alt, caption, selected = false, onSelect, tone = "light" }: PhotoCardProps) {
  const thumbnail = <img src={src} alt={alt} loading="lazy" className="aspect-square w-full object-cover" />;

  return (
    <figure className="flex flex-col gap-2">
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={classNames(
            frameClasses(selected, tone),
            "transition-opacity duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
        >
          {thumbnail}
        </button>
      ) : (
        <div className={frameClasses(selected, tone)}>{thumbnail}</div>
      )}
      {caption ? <figcaption className={classNames("truncate text-caption", tone === "dark" ? "text-surface/70" : "text-muted")}>{caption}</figcaption> : null}
    </figure>
  );
}

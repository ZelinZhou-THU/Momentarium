import { Link } from "react-router-dom";
import { Button } from "../../../components/ui";

export interface ArchiveEmptyProps {
  readonly onCreate: () => void;
  /** 我参与过的别人的展览数；大于 0 时提示可以去「我参与的」（空馆不等于什么都没有）。 */
  readonly participatedExhibitionCount?: number;
}

interface StartStep {
  readonly index: string;
  readonly title: string;
  readonly description: string;
}

const START_STEPS: readonly StartStep[] = [
  {
    index: "01",
    title: "上传照片",
    description: "3 张以上原始照片，一次旅行或一段季节都可以。",
  },
  {
    index: "02",
    title: "分进章节",
    description: "给每段记忆起标题与叙事，所有照片都要放进章节。",
  },
  {
    index: "03",
    title: "生成场景并发布",
    description: "让场景替照片说话；发布后即可作为公开记忆场景分享。",
  },
];

/** 空馆：线稿式展柜装饰 + 编号排版的三步说明，不使用插图库/emoji。 */
export function ArchiveEmpty({ onCreate, participatedExhibitionCount = 0 }: ArchiveEmptyProps) {
  return (
    <section className="rounded-xl border border-line bg-surface px-8 py-16 lg:px-16">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-micro text-muted">ARCHIVE · 空馆</p>
          <h2 className="mt-4 font-serif text-display text-ink">还没有可以陈列的记忆</h2>
          <p className="mt-4 max-w-md text-body text-muted">
            从一个主题开始：一次旅行、一段季节，或某个人的房间。照片收进来之后，这里会有封面、章节与一段可以走进去的场景。
          </p>
          <div className="mt-8">
            <Button onClick={onCreate}>新建第一个展览</Button>
          </div>
          {participatedExhibitionCount > 0 ? (
            <p className="mt-6 text-caption text-muted">
              你已参与 {participatedExhibitionCount} 场别人的展览，
              <Link
                viewTransition
                to="/contributions"
                className="text-ink underline underline-offset-4"
              >
                去「我参与的」看看 →
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="rounded-xl border border-line bg-bg px-8 py-10 text-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 240 240"
              fill="none"
              strokeWidth="1"
              className="mx-auto h-32 w-32 text-line"
              stroke="currentColor"
            >
              <rect x="24" y="48" width="192" height="144" />
              <line x1="24" y1="88" x2="216" y2="88" />
              <line x1="80" y1="48" x2="80" y2="192" />
              <line x1="120" y1="88" x2="120" y2="192" />
              <line x1="160" y1="88" x2="160" y2="192" />
              <rect x="44" y="112" width="24" height="32" />
              <rect x="132" y="112" width="24" height="32" />
              <circle cx="120" cy="24" r="12" className="text-accent" stroke="currentColor" />
              <line x1="120" y1="12" x2="120" y2="36" className="text-accent" stroke="currentColor" />
            </svg>
            <p className="mt-4 text-micro text-muted">展柜 · 等待第一件作品</p>
          </div>
        </div>
      </div>

      <ol className="mt-16 grid gap-8 border-t border-line pt-8 md:grid-cols-3">
        {START_STEPS.map((step) => (
          <li key={step.index}>
            <p className="text-micro text-accent">{step.index}</p>
            <p className="mt-2 font-serif text-h2 text-ink">{step.title}</p>
            <p className="mt-2 text-caption text-muted">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

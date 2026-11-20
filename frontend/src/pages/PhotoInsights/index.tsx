import { Link, Navigate, useParams } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { ErrorState, Reveal, Spinner } from "../../components/ui";
import { InsightsSummary } from "./components/InsightsSummary";
import { PhotoInsightCard } from "./components/PhotoInsightCard";
import { SceneReadingPanel } from "./components/SceneReadingPanel";
import { usePhotoInsights } from "./hooks/usePhotoInsights";

/** 照片记忆档案：整体解读 → 场景对照 → 按章节的逐张解读。 */
export default function PhotoInsightsPage() {
  const { id } = useParams<{ id: string }>();
  return id === undefined ? <Navigate to="/exhibitions" replace /> : <PhotoInsightsContent exhibitionId={id} />;
}

function PhotoInsightsContent({ exhibitionId }: { readonly exhibitionId: string }) {
  const { state, reload } = usePhotoInsights(exhibitionId);

  return (
    <div className="min-h-screen bg-bg">
      <AppTopBar>
        <Link viewTransition className="text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none" to={`/exhibitions/${exhibitionId}?tab=curation`}>
          ← 返回工作台
        </Link>
      </AppTopBar>

      <main className="mx-auto w-full max-w-content px-8 py-12">
        {state.status === "loading" ? (
          <div className="flex justify-center py-24">
            <Spinner label="正在读取照片解读" />
          </div>
        ) : state.status === "error" ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <>
            <Reveal>
              <p className="text-caption text-muted">记忆档案</p>
              <h1 className="mt-1 font-serif text-display text-ink">{state.view.exhibitionTitle}</h1>
            </Reveal>

            {state.view.analyzedCount === 0 ? (
              <Reveal index={1}>
                <p className="mt-6 text-body text-muted">
                  AI 还没有解读这些照片。在工作台「策展」分区打开「AI 灵感」生成主题时，会逐张解读照片并保存在这里。
                </p>
              </Reveal>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Reveal index={1}>
                  <InsightsSummary view={state.view} />
                </Reveal>
                <Reveal index={2}>
                  <SceneReadingPanel brief={state.view.latestBrief} />
                </Reveal>
              </div>
            )}

            {state.view.chapters.map((chapter) => (
              <section key={chapter.key} className="mt-12">
                <h2 className="text-h1 text-ink">{chapter.title ?? "未分组"}</h2>
                <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {chapter.photos.map((item, index) => (
                    <Reveal key={item.photo.id} index={index}>
                      <PhotoInsightCard item={item} />
                    </Reveal>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

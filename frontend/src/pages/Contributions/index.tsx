import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { ErrorState, Spinner } from "../../components/ui";
import { ContributionCard } from "./components/ContributionCard";
import { ContributionEditor } from "./components/ContributionEditor";
import { JoinByInviteForm } from "./components/JoinByInviteForm";
import { groupContributionsByExhibition } from "./functions/contributionGroups";
import { useContributions } from "./hooks/useContributions";
import type { ContributionEditorTarget } from "./objects/ContributionsState";

interface ExhibitionContext {
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
}

/**
 * 我参与的（登录）：受邀参与的展览与我写给它们的回忆。回忆优先——先写一段文字，照片可选（0/1 张），地点可选。
 * 主按钮「写一段回忆」打开单页编辑器；保存草稿/提交给策展人两个动作；
 * 卡片展示草稿/待审/已采用/修改待确认/未被采用/已撤回；被撤销参与时提示并保留查看/撤回。
 */
export default function ContributionsPage() {
  const [searchParams] = useSearchParams();
  const queryExhibitionId = searchParams.get("exhibitionId");
  const queryTitle = searchParams.get("title");
  const { state, reload } = useContributions();
  const [revokedNotice, setRevokedNotice] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<ContributionEditorTarget | null>(null);
  const [selectedExhibitionId, setSelectedExhibitionId] = useState<string | null>(
    queryExhibitionId,
  );

  const groups = state.status === "ready" ? groupContributionsByExhibition(state.contributions) : [];
  const queryContext: ExhibitionContext | null =
    queryExhibitionId === null
      ? null
      : {
          exhibitionId: queryExhibitionId,
          exhibitionTitle: queryTitle ?? "刚刚加入的展览",
        };
  const contexts: readonly ExhibitionContext[] = [
    ...groups.map((group) => ({
      exhibitionId: group.exhibitionId,
      exhibitionTitle: group.exhibitionTitle,
    })),
    ...(queryContext !== null &&
    !groups.some((group) => group.exhibitionId === queryContext.exhibitionId)
      ? [queryContext]
      : []),
  ];
  const activeExhibitionId =
    editor?.kind === "create"
      ? editor.exhibitionId
      : editor?.kind === "edit"
        ? editor.contribution.exhibitionId
        : (selectedExhibitionId ?? contexts[0]?.exhibitionId ?? null);
  const activeContext = contexts.find((context) => context.exhibitionId === activeExhibitionId) ?? null;

  const openCreate = (): void => {
    if (activeContext === null) {
      return;
    }
    setPhotoNotice(null);
    setEditor({
      kind: "create",
      exhibitionId: activeContext.exhibitionId,
      exhibitionTitle: activeContext.exhibitionTitle,
    });
  };

  // 编辑器取代列表出现：列表可能滚得很远，打开编辑器时回到页面顶部，从标题开始看。
  const isEditorOpen = editor !== null;
  useEffect(() => {
    if (isEditorOpen) {
      window.scrollTo({ top: 0 });
    }
  }, [isEditorOpen]);

  const closeEditor = (): void => {
    setEditor(null);
    reload();
  };

  return (
    <div className="min-h-screen bg-bg">
      <AppTopBar />
      <main className="mx-auto w-full max-w-content px-8 py-16">
        <div>
          <h1 className="font-serif text-h1 text-ink">我参与的</h1>
          <p className="mt-2 text-body text-muted">
            你受邀参与的展览，和你写给它们的回忆。先写下一段回忆，照片与地点都可以稍后补；策展人会逐条查看并决定是否采用。
          </p>
        </div>

        {revokedNotice ? (
          <p className="mt-6 rounded-md border border-line bg-accentSoft px-4 py-3 text-caption text-ink">
            参与关系已被创建者撤销：不能再保存或提交新的回忆，但既有回忆仍可查看与撤回。
          </p>
        ) : null}
        {photoNotice === null ? null : (
          <p className="mt-6 rounded-md border border-line bg-accentSoft px-4 py-3 text-caption text-ink">
            {photoNotice}
            <button
              type="button"
              className="ml-2 underline underline-offset-4"
              onClick={() => setPhotoNotice(null)}
            >
              知道了
            </button>
          </p>
        )}

        <div className="mt-10 flex flex-col gap-10">
          {state.status === "loading" ? <Spinner label="正在读取回忆" /> : null}

          {state.status === "error" ? (
            <ErrorState title="无法读取回忆" message={state.message} onRetry={reload} />
          ) : null}

          {state.status === "ready" ? (
            editor !== null ? (
              <ContributionEditor
                target={editor}
                onSaved={closeEditor}
                onCancel={() => setEditor(null)}
                onRevoked={() => setRevokedNotice(true)}
                onPhotoError={(message) => setPhotoNotice(message)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-caption text-muted">投稿到哪场展览</span>
                    {contexts.length === 0 ? (
                      <span className="text-caption text-muted">
                        还没有可投稿的展览，请通过策展人分享的邀请链接加入（可在下方粘贴链接）。
                      </span>
                    ) : (
                      <select
                        aria-label="选择展览"
                        value={activeExhibitionId ?? ""}
                        onChange={(event) => setSelectedExhibitionId(event.target.value)}
                        className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-2 text-body text-ink"
                      >
                        {contexts.map((context) => (
                          <option key={context.exhibitionId} value={context.exhibitionId}>
                            {context.exhibitionTitle}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={openCreate}
                    disabled={activeContext === null}
                    className="rounded-md bg-accent px-6 py-3 text-body font-medium text-surface transition duration-150 ease-out hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    写一段回忆
                  </button>
                </div>

                <JoinByInviteForm />

                {groups.length === 0 ? (
                  <div className="rounded-xl border border-line bg-surface p-8 text-center">
                    <h2 className="font-serif text-h2 text-ink">还没有回忆</h2>
                    <p className="mt-2 text-body text-muted">
                      点「写一段回忆」开始；可以只写文字，也可以附上一张照片。
                    </p>
                  </div>
                ) : (
                  groups.map((group) => (
                    <section key={group.exhibitionId} className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                        <h2 className="font-serif text-h2 text-ink">{group.exhibitionTitle}</h2>
                        <span className="text-caption text-muted">{group.contributions.length} 段回忆</span>
                      </div>
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {group.contributions.map((contribution) => (
                          <ContributionCard
                            key={`${contribution.id}-${contribution.version}`}
                            contribution={contribution}
                            onEdit={(target) => {
                              setPhotoNotice(null);
                              setEditor({ kind: "edit", contribution: target });
                            }}
                            onWithdrawn={reload}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </>
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}

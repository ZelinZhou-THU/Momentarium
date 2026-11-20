import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { Button, ConfirmDialog, ErrorState, Reveal, Spinner, Tabs } from "../../components/ui";
import type { TabItem } from "../../components/ui";
import type { ExhibitionDetail } from "../../objects/gallery/ExhibitionDetail";
import type { PreviewLocationState } from "../PublicShow/objects/PreviewLocationState";
import ScenePanel from "./components/ScenePanel";
import type { SceneImmersiveAction, ScenePanelPhoto } from "./components/ScenePanel";
import { AiInspirationPanel } from "./components/AiInspirationPanel";
import { ContributionPanel } from "./components/ContributionPanel";
import { CurationPanel } from "./components/CurationPanel";
import { MapPanel } from "./components/MapPanel";
import { NextStepHint } from "./components/NextStepHint";
import { PhotoPanel } from "./components/PhotoPanel";
import { PublishBar } from "./components/PublishBar";
import { countPhotos } from "./functions/countPhotos";
import { buildWorkspaceNextStep } from "./functions/buildWorkspaceNextStep";
import { describeAppliedProposalNotice } from "./functions/describeInspirationStatus";
import { formatUpdatedAt } from "./functions/formatUpdatedAt";
import {
  DEFAULT_WORKSPACE_TAB,
  WORKSPACE_TABS,
  describeContributionsTabBadge,
  describeMapTabBadge,
  describePublishTabBadge,
  describeSceneTabBadge,
  withWorkspaceLocation,
} from "./functions/workspaceTabs";
import type { WorkspaceTabId } from "./functions/workspaceTabs";
import { useSceneCover } from "./hooks/useSceneCover";
import { useCurationDraft } from "./hooks/useCurationDraft";
import { useExhibitionWorkspace } from "./hooks/useExhibitionWorkspace";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { useWorkspaceTabs } from "./hooks/useWorkspaceTabs";

/** 工作台：页头（标题 + 深色"下一步"卡片）+ 分区栏 + 业务区域（照片 / 策展与 AI 灵感 / 场景 / 发布）。 */
export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();

  if (id === undefined) {
    return <Navigate to="/exhibitions" replace />;
  }

  return <WorkspaceContent exhibitionId={id} />;
}

function WorkspaceContent({ exhibitionId }: { readonly exhibitionId: string }) {
  const { detailState, reload, refreshSilently } = useExhibitionWorkspace(exhibitionId);

  return (
    <div className="min-h-screen bg-bg">
      <AppTopBar>
        <Link
          viewTransition
          className="hidden text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none sm:inline"
          to="/exhibitions"
        >
          ← 我的展览
        </Link>
      </AppTopBar>

      {detailState.status === "loading" ? (
        <main className="mx-auto flex w-full max-w-content justify-center px-8 py-24">
          <Spinner label="正在打开展览" />
        </main>
      ) : detailState.status === "error" ? (
        <main className="mx-auto w-full max-w-content px-8 py-12">
          <ErrorState message={detailState.message} onRetry={reload} />
        </main>
      ) : (
        <WorkspaceRegions
          detail={detailState.detail}
          onChanged={reload}
          onSilentRefresh={refreshSilently}
        />
      )}
    </div>
  );
}

interface WorkspaceRegionsProps {
  readonly detail: ExhibitionDetail;
  /** 草稿数据变化（上传/策展保存等）：重新拉取详情（页面保持挂载，未保存草稿会被保留并对齐）。 */
  readonly onChanged: () => void;
  /** 场景运行/发布等后台状态变化：静默刷新 detail，不闪 loading、不重置草稿。 */
  readonly onSilentRefresh: () => void;
}

/**
 * 展览就绪后的业务区域集合：分 tab 常驻挂载，只切换可见性（场景轮询/截图不中断）。
 * 当前分区记在网址 ?tab= 中；没有时固定落到「照片」（工作台的起点、位置可预期），并立即写回网址；
 * 「下一步」只在顶部提示并提供一键前往，不再决定落点，也不会在上传、保存后把用户带离当前分区。
 */
function WorkspaceRegions({ detail, onChanged, onSilentRefresh }: WorkspaceRegionsProps) {
  const curation = useCurationDraft(detail, onChanged);
  const nextStep = buildWorkspaceNextStep(detail, curation.isDirty);
  const { activeTab, isImmersive, searchParams, changeTab, changeImmersive } = useWorkspaceTabs(DEFAULT_WORKSPACE_TAB);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<WorkspaceTabId>>(() => new Set([activeTab]));
  useEffect(() => {
    setVisitedTabs((visited) => visited.has(activeTab) ? visited : new Set([...visited, activeTab]));
  }, [activeTab]);
  const hasVisited = (tab: WorkspaceTabId): boolean => activeTab === tab || visitedTabs.has(tab);
  const leaveBlocker = useUnsavedChangesGuard(curation.isDirty);
  const navigate = useNavigate();
  // 还没有章节时，首次落在策展就把悬浮的「AI 灵感」展开。
  const [isInspirationOpen, setIsInspirationOpen] = useState(() => nextStep.openInspiration);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const sceneBadge = describeSceneTabBadge(detail);
  const publishBadge = describePublishTabBadge(detail);
  const mapBadge = describeMapTabBadge(detail);
  const contributionsBadge = describeContributionsTabBadge(detail);
  const tabs: readonly TabItem[] = WORKSPACE_TABS.map((tab) => {
    switch (tab.id) {
      case "photos":
        return { id: tab.id, label: tab.label, badge: String(countPhotos(detail)) };
      case "curation":
        return {
          id: tab.id,
          label: tab.label,
          badge: String(curation.draft.groups.length),
          dot: curation.isDirty,
        };
      case "contributions":
        return contributionsBadge === null
          ? { id: tab.id, label: tab.label }
          : { id: tab.id, label: tab.label, badge: contributionsBadge.label, dot: contributionsBadge.dot };
      case "map":
        return { id: tab.id, label: tab.label, badge: mapBadge.label, dot: mapBadge.dot };
      case "scene":
        return { id: tab.id, label: tab.label, badge: sceneBadge.label, dot: sceneBadge.dot };
      case "publish":
        return { id: tab.id, label: tab.label, badge: publishBadge.label, dot: publishBadge.dot };
    }
  });

  const goToNextStep = (): void => {
    if (nextStep.openInspiration) {
      setIsInspirationOpen(true);
    }
    changeTab(nextStep.tab);
  };

  // 切换分区后，页面若已滚过分区栏，就停在分区栏刚好吸顶的位置（新分区从头看起），而不是回到页面顶端：
  // 分区栏在切换前后的位置一致，过渡里滑动的底板才不会上下漂移。
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (header === null) {
      return;
    }
    const tabBarTop = header.getBoundingClientRect().bottom + window.scrollY;
    if (window.scrollY > tabBarTop) {
      window.scrollTo({ top: tabBarTop });
    }
  }, [activeTab]);

  const panelClass = (tabId: WorkspaceTabId): string => (activeTab === tabId ? "" : "hidden");
  // 三维场景分区里有沉浸观看的 fixed 覆盖层，进场只渐显、不带位移。
  const sceneClass = activeTab === "scene" ? "animate-fade-in motion-reduce:animate-none" : "hidden";

  // 沉浸观看里的"下一步"：只在流程走到发布时给出，点了直接去发布分区（同时退出沉浸）。
  const immersiveNextAction: SceneImmersiveAction | null =
    nextStep.tab === "publish" && !nextStep.done
      ? { label: nextStep.title, onSelect: () => changeTab("publish") }
      : null;

  return (
    <>
      <header ref={headerRef} className="mx-auto flex w-full max-w-content flex-wrap items-end justify-between gap-6 px-8 pb-8 pt-12">
        <Reveal>
          <p className="text-micro text-muted">展览工作台</p>
          <h1 className="mt-2 font-serif text-display text-ink">{detail.title}</h1>
          <p className="mt-2 text-caption text-muted">
            {countPhotos(detail)} 张照片 · {curation.draft.groups.length} 个章节 · 更新于{" "}
            {formatUpdatedAt(detail.updatedAt)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {/* 看展 / 记忆档案 / 场景版本：离开工作台进入独立页面（有未保存策展时由离开保护先确认）。 */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const from: PreviewLocationState = {
                  backTo: `/exhibitions/${detail.id}?${withWorkspaceLocation(searchParams, activeTab, false).toString()}`,
                  backLabel: "← 返回工作台",
                };
                navigate(`/exhibitions/${detail.id}/view`, { state: from, viewTransition: true });
              }}
            >
              看展
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/exhibitions/${detail.id}/insights`, { viewTransition: true })}>
              记忆档案
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/exhibitions/${detail.id}/scenes`, { viewTransition: true })}>
              场景版本
            </Button>
          </div>
        </Reveal>
        <Reveal index={1}>
          <NextStepHint
            nextStep={nextStep}
            isAtTarget={activeTab === nextStep.tab && (!nextStep.openInspiration || isInspirationOpen)}
            onGo={goToNextStep}
          />
        </Reveal>
      </header>

      <div className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-content px-8">
          <Tabs items={tabs} activeId={activeTab} onChange={changeTab} ariaLabel="工作台分区" />
        </div>
      </div>

      {/* 内容区至少一屏高（扣掉吸顶的分区栏）：即使切到很短的分区，页面也能滚到分区栏吸顶处，
          分区栏的位置前后一致，切换分区时滑动的底板才只水平移动。 */}
      <main className="mx-auto min-h-[calc(100vh-57px)] w-full max-w-content px-8 py-10">
        <div
          role="tabpanel"
          id="tabpanel-photos"
          aria-labelledby="tab-photos"
          hidden={activeTab !== "photos"}
          className={panelClass("photos")}
        >
          {hasVisited("photos") ? <Reveal>
            <PhotoPanel exhibition={detail} onChanged={onChanged} />
          </Reveal> : null}
        </div>

        <div
          role="tabpanel"
          id="tabpanel-curation"
          aria-labelledby="tab-curation"
          hidden={activeTab !== "curation"}
          className={panelClass("curation")}
        >
          {hasVisited("curation") ? <>
          <Reveal>
            <CurationPanel
              curation={curation}
              exhibition={detail}
              aiNotice={aiNotice}
              onDismissAiNotice={() => setAiNotice(null)}
            />
          </Reveal>
          {/* 悬浮的 AI 灵感是 position: fixed，不能放进带 transform 的进场动画里。 */}
          <AiInspirationPanel
            expanded={isInspirationOpen}
            exhibition={detail}
            onApplyGroups={(groups, sourceLabel) => {
              curation.replaceGroups(groups);
              setAiNotice(describeAppliedProposalNotice(sourceLabel, groups.length));
            }}
            onExpandedChange={setIsInspirationOpen}
          />
          </> : null}
        </div>

        <div
          role="tabpanel"
          id="tabpanel-contributions"
          aria-labelledby="tab-contributions"
          hidden={activeTab !== "contributions"}
          className={panelClass("contributions")}
        >
          {hasVisited("contributions") ? <Reveal>
            <ContributionPanel exhibition={detail} onChanged={onChanged} />
          </Reveal> : null}
        </div>

        <div
          role="tabpanel"
          id="tabpanel-map"
          aria-labelledby="tab-map"
          hidden={activeTab !== "map"}
          className={panelClass("map")}
        >
          {hasVisited("map") ? <Reveal>
            <MapPanel exhibition={detail} onChanged={onChanged} />
          </Reveal> : null}
        </div>

        <div
          role="tabpanel"
          id="tabpanel-scene"
          aria-labelledby="tab-scene"
          hidden={activeTab !== "scene"}
          className={sceneClass}
        >
          <SceneSection
            detail={detail}
            onRunChanged={onSilentRefresh}
            immersive={isImmersive}
            onImmersiveChange={changeImmersive}
            immersiveNextAction={immersiveNextAction}
            visible={activeTab === "scene"}
          />
        </div>

        <div
          role="tabpanel"
          id="tabpanel-publish"
          aria-labelledby="tab-publish"
          hidden={activeTab !== "publish"}
          className={panelClass("publish")}
        >
          <Reveal>
            <PublishBar detail={detail} onChanged={onSilentRefresh} />
          </Reveal>
        </div>
      </main>

      <ConfirmDialog
        open={leaveBlocker.state === "blocked"}
        title="离开前保存策展吗？"
        message="策展草稿还有未保存的修改，离开后这些修改会丢失。"
        confirmLabel="放弃修改并离开"
        cancelLabel="留下继续编辑"
        tone="danger"
        onConfirm={() => leaveBlocker.proceed?.()}
        onCancel={() => leaveBlocker.reset?.()}
      />
    </>
  );
}

interface SceneSectionProps {
  readonly detail: ExhibitionDetail;
  readonly onRunChanged: () => void;
  readonly immersive: boolean;
  readonly onImmersiveChange: (immersive: boolean) => void;
  readonly immersiveNextAction: SceneImmersiveAction | null;
  readonly visible: boolean;
}

/**
 * 三维场景区域：把策展后的照片（id + 内容路由）交给 scene3d 的 ScenePanel。
 * 生成过程中每次状态变化都会静默刷新 detail（换新对象），所以按照片内容键记忆数组，
 * 照片没变时 identity 保持稳定，避免沙箱展示图被中止后重新准备。
 */
function SceneSection({
  detail,
  onRunChanged,
  immersive,
  onImmersiveChange,
  immersiveNextAction,
  visible,
}: SceneSectionProps) {
  const { saveSceneCover, cancelSceneCover } = useSceneCover(detail.id, onRunChanged);
  const photoSources: readonly ScenePanelPhoto[] = [
    ...detail.groups.flatMap((group) => group.photos),
    ...detail.ungroupedPhotos,
  ].map((photo) => ({ id: photo.id, contentUrl: photo.contentUrl }));
  const photoSourcesKey = photoSources.map((photo) => `${photo.id}|${photo.contentUrl}`).join(",");
  const scenePhotos = useMemo(() => photoSources, [photoSourcesKey]);

  return (
    <ScenePanel
      exhibitionId={detail.id}
      photos={scenePhotos}
      visible={visible}
      initialRun={detail.sceneRun}
      currentRun={detail.currentSceneRun}
      sceneStale={detail.sceneStale}
      onSaveSceneCover={saveSceneCover}
      onCancelSceneCover={cancelSceneCover}
      onRunChanged={onRunChanged}
      exhibitionTitle={detail.title}
      immersive={immersive}
      onImmersiveChange={onImmersiveChange}
      immersiveNextAction={immersiveNextAction}
    />
  );
}

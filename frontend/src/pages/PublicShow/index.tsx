import type { ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";
import { IntroGate } from "./components/IntroGate";
import {
  PublicShowError,
  PublicShowLoading,
  PublicShowNotFound,
  ShowPreviewUnavailable,
} from "./components/PublicShowStatus";
import { SceneView } from "./components/SceneView";
import { publicShowPresentation } from "./functions/buildDraftPreview";
import { useDraftPreviewShow } from "./hooks/useDraftPreviewShow";
import { usePublishedShow } from "./hooks/usePublishedShow";
import type { PublishedShowController } from "./hooks/usePublishedShow";
import { readPreviewLocationState } from "./objects/PreviewLocationState";
import type { ShowPresentation } from "./objects/ShowPresentation";
import type { PublicExhibitionView } from "./functions/publicShowDtos";

/**
 * 公开记忆场景页（/show/:id，spec §11.1/§11.2）：先导页（IntroGate）→ 全屏只读 3D（SceneView）。
 * 数据全部来自公开路由（无令牌）：getpublishedexhibition + getpublishedscene；
 * 未发布/链接失效 → “未找到或未发布”，加载/错误/WebGL 不可用均有明确状态。
 */
export default function PublicShowPage() {
  const params = useParams<{ id: string }>();
  const controller = usePublishedShow(params.id ?? "");
  return (
    <ShowStages
      controller={controller}
      presentationFor={publicShowPresentation}
      notFound={<PublicShowNotFound />}
    />
  );
}

/**
 * 作者看展预览（/exhibitions/:id/view，需登录）：与公开页同一套先导页与 3D 游览，
 * 内容是当前草稿 + 最近一次通过评审的场景，未发布也能看；不能看时说明原因并给返回工作台。
 */
export function DraftPreviewShowPage() {
  const params = useParams<{ id: string }>();
  const exhibitionId = params.id ?? "";
  const controller = useDraftPreviewShow(exhibitionId);
  const from = readPreviewLocationState(useLocation().state);
  const presentation =
    controller.presentation === null || from === null
      ? controller.presentation
      : { ...controller.presentation, backLink: { label: from.backLabel, to: from.backTo } };
  return (
    <ShowStages
      controller={controller}
      presentationFor={(exhibition) => presentation ?? publicShowPresentation(exhibition)}
      notFound={
        <ShowPreviewUnavailable
          reason={controller.unavailableReason ?? "暂时无法预览这场展览。"}
          backTo={from?.backTo ?? `/exhibitions/${exhibitionId}`}
          backLabel={from?.backLabel ?? "← 返回工作台"}
        />
      }
    />
  );
}

interface ShowStagesProps {
  readonly controller: PublishedShowController;
  readonly presentationFor: (exhibition: PublicExhibitionView) => ShowPresentation;
  readonly notFound: ReactNode;
}

/** 看展的各阶段：加载 → 先导页 → 3D 游览（公开页与预览共用）。 */
function ShowStages({ controller, presentationFor, notFound }: ShowStagesProps) {
  const { state, enter, exit, retry } = controller;
  switch (state.status) {
    case "loading":
      return <PublicShowLoading />;
    case "notfound":
      return <>{notFound}</>;
    case "error":
      return <PublicShowError message={state.message} onRetry={retry} />;
    case "entering":
      return (
        <IntroGate
          exhibition={state.exhibition}
          presentation={presentationFor(state.exhibition)}
          isEntering
          onEnter={enter}
        />
      );
    case "ready":
      return state.playing !== null ? (
        <SceneView
          exhibition={state.exhibition}
          playing={state.playing}
          presentation={presentationFor(state.exhibition)}
          onExit={exit}
        />
      ) : (
        <IntroGate
          exhibition={state.exhibition}
          presentation={presentationFor(state.exhibition)}
          isEntering={false}
          onEnter={enter}
        />
      );
  }
}

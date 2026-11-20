import { Button } from "../../../../../components/ui";
import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";

export interface SceneCandidateBannerProps {
  readonly candidate: SceneRunView;
  readonly accepting: boolean;
  readonly error: string | null;
  /** 当前场景已过期（素材变了）：后端会以 SCENE_REVISION_STALE 拒绝采用，所以直接禁用并说明。 */
  readonly stale?: boolean;
  readonly onAccept: () => void;
  readonly onDismiss: () => void;
}

/**
 * 未采用的修订候选：明确它不是当前场景；采用只切草稿指针，公开页仍需重新发布。
 * 候选的评审/预览由舞台与结果区展示，这里只提供采用/放弃与说明。
 */
export function SceneCandidateBanner({
  candidate,
  accepting,
  error,
  stale = false,
  onAccept,
  onDismiss,
}: SceneCandidateBannerProps) {
  return (
    <div className="mt-6 rounded-xl border border-accent bg-accentSoft p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-h2 text-ink">修订候选（未采用）</h3>
        <p className="text-micro text-ink">
          基于运行 {candidate.parentRunId?.slice(0, 8) ?? "上一版本"}
        </p>
      </div>
      {candidate.revisionInstruction === null ? null : (
        <p className="mt-2 whitespace-pre-wrap text-caption text-ink">
          修订要求：{candidate.revisionInstruction}
        </p>
      )}
      <p className="mt-2 text-caption text-ink">
        这是候选预览，当前采用场景、配色与已发布内容都没有改变。采用后只更新草稿的当前场景，公开页需要重新发布才会变化。
      </p>
      {stale ? (
        <p className="mt-2 text-caption text-danger">
          素材已变化，这个修订候选已无法采用；可以放弃它，重新生成场景。
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={onAccept} loading={accepting} disabled={stale}>
          采用这次修订
        </Button>
        <Button variant="secondary" onClick={onDismiss} disabled={accepting}>
          放弃
        </Button>
        {error === null ? null : <p className="text-caption text-danger">{error}</p>}
      </div>
    </div>
  );
}

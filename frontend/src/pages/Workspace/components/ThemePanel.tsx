import { useEffect, useState } from "react";
import { SuggestThemesAPI } from "../../../apis/curation/SuggestThemesAPI";
import { describeCurationError } from "../../../apis/curation/describeCurationError";
import { Button, Input } from "../../../components/ui";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { ThemeProposal } from "../../../objects/curation/ThemeProposal";
import { draftGroupsFromThemeProposal } from "../functions/draftGroupsFromThemeProposal";
import type { ThemeRequestPhase } from "../functions/describeInspirationStatus";
import type { CurationDraftGroup } from "../objects/CurationDraft";

const MAX_HINT_LENGTH = 200;

type ThemeRequestState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "ready"; readonly proposals: readonly ThemeProposal[] };

export interface ThemePanelProps {
  readonly exhibition: ExhibitionDetail;
  /** 应用提案：只是把分组填入策展草稿，仍需用户在 CurationPanel 保存（sourceLabel 用于提示来源）。 */
  readonly onApplyGroups: (groups: readonly CurationDraftGroup[], sourceLabel: string) => void;
  /** 请求阶段变化（AI 灵感收起时显示摘要）。 */
  readonly onPhaseChange?: (phase: ThemeRequestPhase) => void;
}

/** ThemePanel：方向提示 → suggestthemes → 2–3 个主题提案 → 应用为策展草稿。 */
export function ThemePanel({ exhibition, onApplyGroups, onPhaseChange }: ThemePanelProps) {
  const [hint, setHint] = useState("");
  const [requestState, setRequestState] = useState<ThemeRequestState>({ status: "idle" });
  const [appliedProposalName, setAppliedProposalName] = useState<string | null>(null);

  useEffect(() => {
    onPhaseChange?.(
      requestState.status === "ready"
        ? { status: "ready", proposalCount: requestState.proposals.length }
        : { status: requestState.status },
    );
  }, [requestState]);

  const requestThemes = () => {
    setRequestState({ status: "loading" });
    setAppliedProposalName(null);
    const trimmedHint = hint.trim();
    new SuggestThemesAPI(exhibition.id, trimmedHint.length === 0 ? null : trimmedHint).send().then(
      (response) => setRequestState({ status: "ready", proposals: response.proposals }),
      (error: unknown) => {
        setRequestState({ status: "failed", message: describeCurationError(error) });
      },
    );
  };

  const applyProposal = (proposal: ThemeProposal) => {
    onApplyGroups(draftGroupsFromThemeProposal(proposal, exhibition), `主题提案「${proposal.name}」`);
    setAppliedProposalName(proposal.name);
  };

  const isLoading = requestState.status === "loading";

  return (
    <section aria-labelledby="theme-panel-title" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
      <header>
        <h2 id="theme-panel-title" className="font-serif text-h2 text-ink">
          主题提案
        </h2>
        <p className="mt-2 text-caption text-muted">
          给 AI 一个方向（可选），生成章节结构提案；应用后只填入草稿，保存后才生效。
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex-1">
          <Input
            label={`方向提示（可选，≤${MAX_HINT_LENGTH} 字）`}
            value={hint}
            maxLength={MAX_HINT_LENGTH}
            placeholder="例如：更安静、按时间顺序、突出雨与海"
            onChange={(event) => setHint(event.target.value)}
            disabled={isLoading}
          />
        </div>
        <Button variant="secondary" loading={isLoading} onClick={requestThemes}>
          生成主题提案
        </Button>
      </div>

      {requestState.status === "failed" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-caption text-danger">
            {requestState.message}
          </p>
          <Button variant="ghost" size="sm" onClick={requestThemes}>
            重试
          </Button>
        </div>
      ) : null}

      {requestState.status === "ready" ? (
        requestState.proposals.length === 0 ? (
          <p className="mt-4 text-body text-muted">还没有可用的提案，调整提示后再试一次。</p>
        ) : (
          <ul className="mt-6 grid gap-4">
            {requestState.proposals.map((proposal) => (
              <li key={proposal.name} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                <div>
                  <h3 className="font-serif text-h2 text-ink">{proposal.name}</h3>
                  <p className="mt-2 text-body text-muted">{proposal.concept}</p>
                </div>
                <ul className="flex flex-col gap-1 text-caption text-muted">
                  {proposal.groups.map((group) => (
                    <li key={group.title}>
                      {group.title}（{group.photoIds.length} 张）
                    </li>
                  ))}
                </ul>
                <div>
                  <Button variant="secondary" size="sm" onClick={() => applyProposal(proposal)}>
                    应用此提案
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {appliedProposalName === null ? null : (
        <p role="status" className="mt-4 text-caption text-accent">
          已把「{appliedProposalName}」填入策展草稿，确认内容后在底部保存。
        </p>
      )}
    </section>
  );
}

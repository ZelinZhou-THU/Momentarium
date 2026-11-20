import { useEffect, useState } from "react";
import { AdoptContributionAPI } from "../../../../apis/gallery/AdoptContributionAPI";
import { CloseContributionInviteAPI } from "../../../../apis/gallery/CloseContributionInviteAPI";
import { CreateContributionInviteAPI } from "../../../../apis/gallery/CreateContributionInviteAPI";
import { DeclineContributionAPI } from "../../../../apis/gallery/DeclineContributionAPI";
import { GetContributionManagementAPI } from "../../../../apis/gallery/GetContributionManagementAPI";
import { ListContributionsAPI } from "../../../../apis/gallery/ListContributionsAPI";
import { RemoveMemoryAPI } from "../../../../apis/gallery/RemoveMemoryAPI";
import { RevokeContributorAPI } from "../../../../apis/gallery/RevokeContributorAPI";
import { describeContributionError } from "../../../../apis/gallery/describeContributionError";
import { ErrorState, Spinner } from "../../../../components/ui";
import type { ContributionSummary } from "../../../../objects/gallery/Contribution";
import type { ContributionInviteCreated } from "../../../../objects/gallery/ContributionInvite";
import type { ContributionManagementResponse } from "../../../../objects/gallery/ContributionManagement";
import type { ExhibitionDetail } from "../../../../objects/gallery/ExhibitionDetail";
import { AdoptContributionDialog } from "./components/AdoptContributionDialog";
import { ContributionReviewList } from "./components/ContributionReviewList";
import { InviteLinksSection } from "./components/InviteLinksSection";
import {
  collectAdoptedMemories,
  findAdoptedSnapshot,
  declinedContributions,
  otherContributions,
  pendingReviewContributions,
  withdrawnContributions,
} from "./functions/contributionManagement";
import type { AdoptionFormValues } from "./functions/contributionManagement";

type PanelState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly management: ContributionManagementResponse;
      readonly contributions: readonly ContributionSummary[];
    };

export interface ContributionPanelProps {
  readonly exhibition: ExhibitionDetail;
  readonly onChanged: () => void;
}

/**
 * 工作台第 6 分区「投稿」：邀请/参与者管理 + 投稿审阅（待审、待确认更新）+ 采用对话框 + 已采用讲述移除。
 * 数据只读两条消息（getcontributionmanagement / listcontributions），采用与移除后刷新面板并通知工作台刷新草稿。
 */
export function ContributionPanel({ exhibition, onChanged }: ContributionPanelProps) {
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<ContributionInviteCreated | null>(null);
  const [creating, setCreating] = useState(false);
  const [closingInviteId, setClosingInviteId] = useState<string | null>(null);
  const [revokingContributorId, setRevokingContributorId] = useState<string | null>(null);
  const [removingMemoryId, setRemovingMemoryId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [keptVersionIds, setKeptVersionIds] = useState<readonly string[]>([]);
  const [adoptTarget, setAdoptTarget] = useState<ContributionSummary | null>(null);
  const [adoptSubmitting, setAdoptSubmitting] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    Promise.all([
      new GetContributionManagementAPI(exhibition.id).send({ signal: controller.signal }),
      new ListContributionsAPI(exhibition.id).send({ signal: controller.signal }),
    ]).then(
      ([management, contributions]) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", management, contributions: contributions.contributions });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: describeContributionError(error) });
        }
      },
    );
    return () => controller.abort();
  }, [exhibition.id, reloadCount]);

  const reload = (): void => setReloadCount((count) => count + 1);

  const createInvite = (): void => {
    setActionError(null);
    setCreating(true);
    new CreateContributionInviteAPI(exhibition.id).send().then(
      (invite) => {
        setCreating(false);
        setCreatedInvite(invite);
        reload();
      },
      (error: unknown) => {
        setCreating(false);
        setActionError(describeContributionError(error));
      },
    );
  };

  const closeInvite = (inviteId: string): void => {
    setActionError(null);
    setClosingInviteId(inviteId);
    new CloseContributionInviteAPI(exhibition.id, inviteId).send().then(
      () => {
        setClosingInviteId(null);
        reload();
      },
      (error: unknown) => {
        setClosingInviteId(null);
        setActionError(describeContributionError(error));
      },
    );
  };

  const revokeContributor = (contributorId: string): void => {
    setActionError(null);
    setRevokingContributorId(contributorId);
    new RevokeContributorAPI(exhibition.id, contributorId).send().then(
      () => {
        setRevokingContributorId(null);
        reload();
      },
      (error: unknown) => {
        setRevokingContributorId(null);
        setActionError(describeContributionError(error));
      },
    );
  };

  const removeMemory = (photoId: string, memoryId: string): void => {
    setActionError(null);
    setRemovingMemoryId(memoryId);
    new RemoveMemoryAPI(photoId, memoryId).send().then(
      () => {
        setRemovingMemoryId(null);
        reload();
        onChanged();
      },
      (error: unknown) => {
        setRemovingMemoryId(null);
        setActionError(describeContributionError(error));
      },
    );
  };

  const declineContribution = (contribution: ContributionSummary): void => {
    setActionError(null);
    setDecliningId(contribution.id);
    new DeclineContributionAPI(contribution.id, contribution.version).send().then(
      () => {
        setDecliningId(null);
        reload();
        // 不采用没有改动草稿，但待处理数变了：刷新详情让「投稿」页签徽标同步。
        onChanged();
      },
      (error: unknown) => {
        setDecliningId(null);
        setActionError(describeContributionError(error));
      },
    );
  };

  const keepCurrentVersion = (contribution: ContributionSummary): void => {
    setKeptVersionIds((ids) =>
      ids.includes(contribution.id) ? ids : [...ids, contribution.id],
    );
  };

  const submitAdoption = (values: AdoptionFormValues): void => {
    if (adoptTarget === null) {
      return;
    }
    setAdoptError(null);
    setAdoptSubmitting(true);
    new AdoptContributionAPI(
      adoptTarget.id,
      adoptTarget.version,
      values.caption,
      values.location,
      values.groupId,
    ).send().then(
      () => {
        setAdoptSubmitting(false);
        setAdoptTarget(null);
        reload();
        onChanged();
      },
      (error: unknown) => {
        setAdoptSubmitting(false);
        setAdoptError(describeContributionError(error));
      },
    );
  };

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="font-serif text-h1 text-ink">投稿</h2>
        <p className="mt-2 text-body text-muted">
          分享邀请链接，邀请读者写下一段回忆并附一张照片；采用会把照片与讲述收进草稿，
          逐条审阅、采用或不采用后，讲述会随展览一起发布。
        </p>
      </div>

      {actionError === null ? null : (
        <p className="rounded-md border border-line bg-accentSoft px-4 py-3 text-caption text-danger">
          {actionError}
        </p>
      )}

      {state.status === "loading" ? <Spinner label="正在读取投稿" /> : null}
      {state.status === "error" ? (
        <ErrorState title="无法读取投稿" message={state.message} onRetry={reload} />
      ) : null}

      {state.status === "ready" ? (
        <>
          <InviteLinksSection
            invites={state.management.invites}
            participants={state.management.participants}
            createdInvite={createdInvite}
            creating={creating}
            closingInviteId={closingInviteId}
            revokingContributorId={revokingContributorId}
            onCreate={createInvite}
            onClose={closeInvite}
            onRevoke={revokeContributor}
          />
          <ContributionReviewList
            reviewContributions={pendingReviewContributions(state.contributions)}
            declinedContributions={declinedContributions(state.contributions)}
            withdrawnContributions={withdrawnContributions(state.contributions)}
            otherContributions={otherContributions(state.contributions)}
            adoptedMemories={collectAdoptedMemories(exhibition)}
            removingMemoryId={removingMemoryId}
            keptVersionIds={keptVersionIds}
            decliningId={decliningId}
            onAdopt={(contribution) => {
              setAdoptError(null);
              setAdoptTarget(contribution);
            }}
            onDecline={declineContribution}
            onKeepVersion={keepCurrentVersion}
            onRemoveMemory={removeMemory}
          />
        </>
      ) : null}

      {adoptTarget === null ? null : (
        <AdoptContributionDialog
          contribution={adoptTarget}
          current={findAdoptedSnapshot(adoptTarget, collectAdoptedMemories(exhibition))}
          groups={exhibition.groups}
          submitting={adoptSubmitting}
          error={adoptError}
          onCancel={() => {
            if (!adoptSubmitting) {
              setAdoptTarget(null);
            }
          }}
          onSubmit={submitAdoption}
        />
      )}
    </section>
  );
}

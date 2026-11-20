import { useEffect, useState } from "react";
import { GetChatHistoryAPI } from "../../../apis/curation/GetChatHistoryAPI";
import { RefineCurationAPI } from "../../../apis/curation/RefineCurationAPI";
import { describeCurationError } from "../../../apis/curation/describeCurationError";
import { Button, Input } from "../../../components/ui";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { GroupInput } from "../../../objects/gallery/GroupInput";
import type {
  ChatMessageView,
  ChatHistoryResponse,
} from "../../../objects/curation/ChatHistoryResponse";
import type { CurationProposal } from "../../../objects/curation/CurationProposal";

const MAX_INSTRUCTION_LENGTH = 500;

type HistoryState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "ready"; readonly messages: readonly ChatMessageView[] };

type RefineState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "ready";
      readonly reply: string;
      readonly proposal: CurationProposal;
    };

export interface ChatPanelProps {
  readonly exhibition: ExhibitionDetail;
  /** 应用 AI 提案：转成草稿，仍需用户在 CurationPanel 保存；AI 不直接改库。 */
  readonly onApplyProposalGroups: (groups: readonly GroupInput[]) => void;
}

/** ChatPanel：修订指令 → refinecuration → 回复 + 提案摘要 → 用户确认后应用。 */
export function ChatPanel({ exhibition, onApplyProposalGroups }: ChatPanelProps) {
  const [historyState, setHistoryState] = useState<HistoryState>({ status: "loading" });
  const [instruction, setInstruction] = useState("");
  const [refineState, setRefineState] = useState<RefineState>({ status: "idle" });
  const [applied, setApplied] = useState(false);

  const loadHistory = () => {
    setHistoryState({ status: "loading" });
    new GetChatHistoryAPI(exhibition.id).send().then(
      (response: ChatHistoryResponse) =>
        setHistoryState({ status: "ready", messages: response.messages }),
      (error: unknown) =>
        setHistoryState({ status: "failed", message: describeCurationError(error) }),
    );
  };

  useEffect(() => {
    loadHistory();
    // 展览切换或保存后详情刷新时重新拉取历史。
  }, [exhibition.id, exhibition.updatedAt]);

  const sendInstruction = () => {
    const trimmed = instruction.trim();
    if (trimmed.length === 0) {
      return;
    }
    setRefineState({ status: "submitting" });
    setApplied(false);
    new RefineCurationAPI(exhibition.id, trimmed).send().then(
      (response) => {
        setRefineState({ status: "ready", reply: response.reply, proposal: response.proposal });
        setInstruction("");
        loadHistory();
      },
      (error: unknown) => setRefineState({ status: "failed", message: describeCurationError(error) }),
    );
  };

  const applyProposal = (proposal: CurationProposal) => {
    onApplyProposalGroups(proposal.groups);
    setApplied(true);
  };

  const isSubmitting = refineState.status === "submitting";

  return (
    <section aria-labelledby="chat-panel-title" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
      <header>
        <h2 id="chat-panel-title" className="font-serif text-h2 text-ink">
          与策展助手对话
        </h2>
        <p className="mt-2 text-caption text-muted">
          用一句话描述想怎么改（顺序、章节、语气）；提案确认后才会写入草稿。
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        {historyState.status === "loading" ? (
          <p className="text-caption text-muted">正在读取对话记录…</p>
        ) : historyState.status === "failed" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-caption text-danger">
              {historyState.message}
            </p>
            <Button variant="ghost" size="sm" onClick={loadHistory}>
              重试
            </Button>
          </div>
        ) : historyState.messages.length === 0 ? (
          <p className="text-body text-muted">还没有对话；先写一条修改指令试试。</p>
        ) : (
          <ul className="flex max-h-screen flex-col gap-3 overflow-y-auto">
            {historyState.messages.map((message, index) => (
              <li
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "self-end rounded-xl bg-accentSoft px-4 py-3 text-body text-ink"
                    : "self-start rounded-xl border border-line bg-bg px-4 py-3 text-body text-muted"
                }
              >
                {message.content}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex-1">
            <Input
              label={`修改指令（≤${MAX_INSTRUCTION_LENGTH} 字）`}
              value={instruction}
              maxLength={MAX_INSTRUCTION_LENGTH}
              placeholder="例如：把雨天的照片放在最前面，第一章改名叫「雨先落下」"
              onChange={(event) => setInstruction(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <Button variant="secondary" loading={isSubmitting} onClick={sendInstruction}>
            发送指令
          </Button>
        </div>

        {refineState.status === "failed" ? (
          <p role="alert" className="text-caption text-danger">
            {refineState.message}
          </p>
        ) : null}

        {refineState.status === "ready" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg p-4">
            <p className="text-body text-ink">{refineState.reply}</p>
            <ul className="flex flex-col gap-1 text-caption text-muted">
              {refineState.proposal.groups.map((group) => (
                <li key={group.title}>
                  {group.title}（{group.photos.length} 张）
                </li>
              ))}
            </ul>
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={applied}
                onClick={() => applyProposal(refineState.proposal)}
              >
                {applied ? "已填入草稿" : "应用提案"}
              </Button>
            </div>
            {applied ? (
              <p role="status" className="text-caption text-accent">
                已填入策展草稿，确认后在底部保存。
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

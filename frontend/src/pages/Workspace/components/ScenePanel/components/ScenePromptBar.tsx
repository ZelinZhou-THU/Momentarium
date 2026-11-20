import { Button, Textarea } from "../../../../../components/ui";

export interface ScenePromptBarProps {
  readonly hint: string;
  readonly onHintChange: (hint: string) => void;
  readonly maxLength: number;
  readonly canGenerate: boolean;
  readonly canCancel: boolean;
  readonly isActionPending: boolean;
  readonly onGenerate: () => void;
  readonly onCancel: () => void;
}

/** 场景区域顶部：氛围提示输入 + 生成/停止动作（氛围提示只作为题面参考）。 */
export function ScenePromptBar({
  hint,
  onHintChange,
  maxLength,
  canGenerate,
  canCancel,
  isActionPending,
  onGenerate,
  onCancel,
}: ScenePromptBarProps) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Textarea
        label="氛围提示（可选）"
        hint={`${hint.length}/${maxLength} 字 · 仅作为题面参考，不改变策展结构`}
        value={hint}
        maxLength={maxLength}
        rows={2}
        placeholder="例如：像雨后傍晚的海边，安静、潮湿、有一点怀念。"
        onChange={(event) => onHintChange(event.target.value)}
        disabled={isActionPending}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onGenerate} loading={isActionPending} disabled={!canGenerate}>
          生成三维场景
        </Button>
        {canCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={isActionPending}>
            停止生成
          </Button>
        ) : null}
        <p className="text-caption text-muted">真实模型生成通常需要几分钟（含渲染与评审），期间会显示阶段进度与已用时间。</p>
      </div>
    </div>
  );
}

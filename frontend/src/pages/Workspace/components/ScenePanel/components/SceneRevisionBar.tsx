import { Button, Textarea } from "../../../../../components/ui";
import {
  describeInstructionCount,
  SCENE_INSTRUCTION_MAX_LENGTH,
} from "../functions/sceneRevision";

export interface SceneRevisionBarProps {
  readonly instruction: string;
  readonly onInstructionChange: (instruction: string) => void;
  readonly canRevise: boolean;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly disabledReason: string | null;
  readonly onSubmit: () => void;
}

/**
 * 当前采用场景的自然语言修订输入：只改当前场景；提交后异步生成候选，
 * 候选不会自动成为当前，需在候选条上显式采用。
 */
export function SceneRevisionBar({
  instruction,
  onInstructionChange,
  canRevise,
  isPending,
  error,
  disabledReason,
  onSubmit,
}: SceneRevisionBarProps) {
  return (
    <div className="mt-6 rounded-xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-h2 text-ink">修订当前场景</h3>
        <p className="text-micro text-muted">{describeInstructionCount(instruction)}</p>
      </div>
      <p className="mt-1 text-caption text-muted">
        用一句话说明要改的地方：只会修改点名元素与直接依赖，其他构图、材质和机位保持原样。修订结果是候选，采用后才成为当前场景。
      </p>
      <div className="mt-3">
        <Textarea
          label="修订要求"
          hint="1–500 个字；允许换行，不能包含 NUL 等控制字符。"
          value={instruction}
          // HTML maxLength 按 UTF-16 码元计数；按最坏 2 码元/码点放宽，真正上限由校验按码点执行。
          maxLength={SCENE_INSTRUCTION_MAX_LENGTH * 2}
          rows={3}
          placeholder="例如：把灯塔的暖光调亮一点，雾稍微淡一些，其他构图和机位保持原样。"
          onChange={(event) => onInstructionChange(event.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          loading={isPending}
          disabled={!canRevise}
          onClick={onSubmit}
        >
          提交修订
        </Button>
        {disabledReason === null ? null : (
          <p className="text-caption text-muted">{disabledReason}</p>
        )}
        {error === null ? null : <p className="text-caption text-danger">{error}</p>}
      </div>
    </div>
  );
}

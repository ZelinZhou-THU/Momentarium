import type { ReactNode } from "react";
import { staggerDelay } from "../../motion/stagger";
import { classNames } from "./classNames";

export interface RevealProps {
  /** 第几个出场（从 0 开始）：越靠后越晚，间隔见 staggerDelay。 */
  readonly index?: number;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * 内容进场：挂载（或所在分区由隐藏变为可见）时渐显并上浮。
 * 页面里数据到位后真正渲染的区块用它包起来，页面切换时看到的是内容依次出现，而不是整页硬换。
 * 注意：进场动画期间带 transform，里面不要放 position: fixed 的元素。
 */
export function Reveal({ index = 0, className, children }: RevealProps) {
  return (
    <div
      style={{ animationDelay: staggerDelay(index) }}
      className={classNames("animate-rise-in motion-reduce:animate-none", className)}
    >
      {children}
    </div>
  );
}

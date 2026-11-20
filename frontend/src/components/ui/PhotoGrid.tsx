import type { ReactNode } from "react";
import { classNames } from "./classNames";

export type PhotoGridColumns = 2 | 3 | 4;

export interface PhotoGridProps {
  columns?: PhotoGridColumns;
  children: ReactNode;
}

const columnClasses: Record<PhotoGridColumns, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

// 照片墙网格：只负责列数与间距，照片卡/选中态由使用方组合 PhotoCard。
export function PhotoGrid({ columns = 3, children }: PhotoGridProps) {
  return <div className={classNames("grid gap-3", columnClasses[columns])}>{children}</div>;
}

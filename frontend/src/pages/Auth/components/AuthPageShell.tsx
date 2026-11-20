import type { ReactNode } from "react";
import { Reveal } from "../../../components/ui";

export interface AuthPageShellProps {
  readonly title: string;
  readonly description: string;
  readonly footer: ReactNode;
  readonly children: ReactNode;
}

/** 登录 / 注册共用版式：留白、衬线标题、窄栏表单，像一个安静的档案馆入口。 */
export function AuthPageShell({ title, description, footer, children }: AuthPageShellProps) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-bg px-8 py-16">
      <Reveal className="w-full max-w-md">
        <p className="font-serif text-h2 text-ink">Momentarium</p>
        <p className="mt-1 text-micro text-muted">私人记忆档案馆</p>

        <h1 className="mt-12 font-serif text-h1 text-ink">{title}</h1>
        <p className="mt-2 text-body text-muted">{description}</p>

        <div className="mt-10">{children}</div>

        <div className="mt-10 border-t border-line pt-6 text-caption text-muted">{footer}</div>
      </Reveal>
    </main>
  );
}

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { ErrorState, Reveal, Spinner, Toast } from "../../components/ui";
import type { ExhibitionSummary } from "../../objects/gallery/ExhibitionSummary";
import type { PreviewLocationState } from "../PublicShow/objects/PreviewLocationState";
import { ArchiveCollection } from "./components/ArchiveCollection";
import { ArchiveEmpty } from "./components/ArchiveEmpty";
import { ArchiveFooter } from "./components/ArchiveFooter";
import { ArchiveMasthead } from "./components/ArchiveMasthead";
import { CreateExhibitionDialog } from "./components/CreateExhibitionDialog";
import { DeleteExhibitionDialog } from "./components/DeleteExhibitionDialog";
import { RenameExhibitionDialog } from "./components/RenameExhibitionDialog";
import { buildArchiveSummary } from "./functions/buildArchiveSummary";
import { useMyExhibitions } from "./hooks/useMyExhibitions";
import { useParticipatedExhibitionCount } from "./hooks/useParticipatedExhibitionCount";

/** 从展览列表去看展：返回时回到列表。 */
const PREVIEW_FROM_ARCHIVE: PreviewLocationState = { backTo: "/exhibitions", backLabel: "← 我的展览" };

/**
 * 我的展览（私人记忆档案馆首页）：编辑式 masthead + 馆藏统计 + feature/档案收藏布局 + 页脚引文；
 * 列表区域保留 loading / empty / ready / error 四态，新建/重命名/删除对话框与 Toast 不变。
 */
export default function ExhibitionsPage() {
  const navigate = useNavigate();
  const { listState, reload } = useMyExhibitions();
  const participatedCount = useParticipatedExhibitionCount(listState.status === "empty");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ExhibitionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExhibitionSummary | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToastMessage(null), []);
  const openCreate = useCallback(() => setIsCreateOpen(true), []);
  const summary = buildArchiveSummary(listState.status === "ready" ? listState.exhibitions : []);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <AppTopBar />

      <main className="mx-auto w-full max-w-content flex-1 px-8 py-16">
        <Reveal>
          <ArchiveMasthead summary={summary} onCreate={openCreate} />
        </Reveal>

        <div className="mt-12">
          {listState.status === "loading" ? (
            <div className="flex justify-center py-24">
              <Spinner label="正在加载展览" />
            </div>
          ) : listState.status === "error" ? (
            <ErrorState message={listState.message} onRetry={reload} />
          ) : listState.status === "empty" ? (
            <ArchiveEmpty onCreate={openCreate} participatedExhibitionCount={participatedCount} />
          ) : (
            <ArchiveCollection
              exhibitions={listState.exhibitions}
              onOpen={(exhibition) => navigate(`/exhibitions/${exhibition.id}`, { viewTransition: true })}
              onView={(exhibition) =>
                navigate(`/exhibitions/${exhibition.id}/view`, { state: PREVIEW_FROM_ARCHIVE, viewTransition: true })
              }
              onRename={setRenameTarget}
              onDelete={setDeleteTarget}
            />
          )}
        </div>
      </main>

      <Reveal index={4}>
        <ArchiveFooter />
      </Reveal>

      <CreateExhibitionDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={reload}
      />
      <RenameExhibitionDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={reload}
      />
      <DeleteExhibitionDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={reload}
        onFailed={setToastMessage}
      />
      {toastMessage === null ? null : (
        <Toast message={toastMessage} tone="error" onDismiss={dismissToast} />
      )}
    </div>
  );
}

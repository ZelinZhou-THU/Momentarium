import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmPhotoLocationCandidateAPI } from "../../../../../apis/curation/ConfirmPhotoLocationCandidateAPI";
import { GetPhotoLocationCandidatesAPI } from "../../../../../apis/curation/GetPhotoLocationCandidatesAPI";
import { SuggestPhotoLocationAPI } from "../../../../../apis/curation/SuggestPhotoLocationAPI";
import { ClearPhotoLocationAPI } from "../../../../../apis/gallery/ClearPhotoLocationAPI";
import { describeGalleryError } from "../../../../../apis/gallery/describeGalleryError";
import { describePlaceSearchError } from "../../../../../apis/gallery/describePlaceSearchError";
import { SearchPlacesAPI } from "../../../../../apis/gallery/SearchPlacesAPI";
import { SetPhotoLocationAPI } from "../../../../../apis/gallery/SetPhotoLocationAPI";
import type { ExhibitionDetail } from "../../../../../objects/gallery/ExhibitionDetail";
import type {
  LocationGranularity,
  PhotoLocationView,
} from "../../../../../objects/gallery/PhotoLocationView";
import type { PlaceCandidate } from "../../../../../objects/gallery/PlaceSearchResponse";
import type { PhotoLocationCandidate } from "../../../../../objects/curation/PhotoLocationCandidatesResponse";
import { buildLocationRows, defaultSelectedPhotoId } from "../functions/buildLocationRows";
import type { LocationRow } from "../functions/buildLocationRows";
import { describeCandidateError } from "../functions/describeCandidate";
import {
  applyMapPoint,
  applyPlaceCandidate,
  createLocationDraft,
  validateLocationDraft,
} from "../functions/locationDraft";
import type {
  CandidateConfirmState,
  LocationCandidateState,
  LocationDraftErrors,
  LocationDraft,
  LocationSaveState,
  LocationSearchState,
} from "../objects/MapPanelState";
import type { GeoPoint } from "../../../../../objects/gallery/GeoPoint";

export interface LocationPanelModel {
  readonly rows: readonly LocationRow[];
  readonly selectedRow: LocationRow | null;
  readonly draft: LocationDraft | null;
  readonly searchState: LocationSearchState;
  readonly saveState: LocationSaveState;
  /** 上次保存尝试的字段校验错误；null 表示没有未处理错误。 */
  readonly errors: LocationDraftErrors | null;
  readonly isSaving: boolean;
  readonly candidateState: LocationCandidateState;
  readonly ignoredCandidateIds: readonly string[];
  readonly candidateConfirmState: CandidateConfirmState;
  selectPhoto(photoId: string): void;
  updateDraft(patch: Partial<Omit<LocationDraft, "photoId">>): void;
  searchPlaces(query: string): void;
  clearSearch(): void;
  applyCandidate(candidate: PlaceCandidate): void;
  pickPoint(point: GeoPoint): void;
  saveLocation(): void;
  clearLocation(): void;
  suggestCandidates(): void;
  refreshCandidates(): void;
  ignoreCandidate(candidateId: string): void;
  confirmCandidate(candidate: PhotoLocationCandidate, granularity: LocationGranularity): void;
}

/** 位置草稿的签名：服务端位置没变时刷新 detail 不重置用户正在编辑的表单。 */
const locationSignatureOf = (row: LocationRow | null, location: PhotoLocationView | null): string =>
  row === null || location === null
    ? "none"
    : [
        row.photoId,
        location.source,
        location.status,
        location.name,
        location.latitude,
        location.longitude,
        location.granularity,
      ].join("|");

/**
 * 地图分区的页面状态与副作用编排（业务状态在 React，地图库只在 MapView 边缘加载）：
 * 选照片 → 载入/新建草稿 → 搜索地点或地图落点 → 校验 → 保存/清除 → 让工作台刷新详情。
 * 保存失败保留草稿；清除后回到“未知”；两者都不阻断照片/策展/发布等其他分区。
 */
export const useLocationPanel = (
  detail: ExhibitionDetail,
  onChanged: () => void,
): LocationPanelModel => {
  const rows = useMemo(() => buildLocationRows(detail), [detail]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(() =>
    defaultSelectedPhotoId(rows),
  );
  const selectedRow = rows.find((row) => row.photoId === selectedPhotoId) ?? null;
  const locationSignature = locationSignatureOf(selectedRow, selectedRow?.location ?? null);

  const [draft, setDraft] = useState<LocationDraft | null>(() =>
    selectedRow === null ? null : createLocationDraft(selectedRow.photoId, selectedRow.location),
  );
  const [searchState, setSearchState] = useState<LocationSearchState>({ status: "idle" });
  const [saveState, setSaveState] = useState<LocationSaveState>({ status: "idle" });
  const [errors, setErrors] = useState<LocationDraftErrors | null>(null);
  const [candidateState, setCandidateState] = useState<LocationCandidateState>({
    status: "idle",
  });
  const [ignoredCandidateIds, setIgnoredCandidateIds] = useState<readonly string[]>([]);
  const [candidateConfirmState, setCandidateConfirmState] = useState<CandidateConfirmState>({
    status: "idle",
  });
  const searchAbortRef = useRef<AbortController | null>(null);
  const candidateAbortRef = useRef<AbortController | null>(null);

  /** 读取当前照片已存候选（不触发 AI）；选中照片时调用。 */
  const loadCandidates = useCallback((photoId: string): void => {
    candidateAbortRef.current?.abort();
    const controller = new AbortController();
    candidateAbortRef.current = controller;
    setCandidateState({ status: "loading", origin: "stored" });
    setIgnoredCandidateIds([]);
    setCandidateConfirmState({ status: "idle" });
    new GetPhotoLocationCandidatesAPI(photoId).send({ signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) {
          return;
        }
        setCandidateState(
          response.candidates.length === 0
            ? { status: "empty", origin: "stored" }
            : {
                status: "ready",
                origin: "stored",
                candidates: response.candidates,
                model: response.model,
                generatedAt: response.generatedAt,
              },
        );
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setCandidateState({
          status: "failed",
          origin: "stored",
          message: describeCandidateError(error),
        });
      },
    );
  }, []);

  // 选中照片或服务端位置变化时重置草稿与提示；同一个位置被静默刷新不会打断编辑。
  useEffect(() => {
    if (selectedRow === null) {
      setDraft(null);
      return;
    }
    setDraft(createLocationDraft(selectedRow.photoId, selectedRow.location));
    setErrors(null);
    setSaveState({ status: "idle" });
  }, [selectedPhotoId, locationSignature]);

  // 刷新后选中的照片可能已被删除：回到默认选中项。
  useEffect(() => {
    if (selectedPhotoId !== null && rows.some((row) => row.photoId === selectedPhotoId)) {
      return;
    }
    setSelectedPhotoId(defaultSelectedPhotoId(rows));
  }, [rows, selectedPhotoId]);

  // 选中照片时只读取已存候选，不自动调用 AI；候选未确认不进入地图。
  useEffect(() => {
    if (selectedPhotoId === null) {
      setCandidateState({ status: "idle" });
      return;
    }
    loadCandidates(selectedPhotoId);
    return () => candidateAbortRef.current?.abort();
  }, [selectedPhotoId, loadCandidates]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      candidateAbortRef.current?.abort();
    },
    [],
  );

  const selectPhoto = useCallback((photoId: string): void => {
    searchAbortRef.current?.abort();
    setSelectedPhotoId(photoId);
    setSearchState({ status: "idle" });
    setSaveState({ status: "idle" });
    setErrors(null);
  }, []);

  const updateDraft = useCallback(
    (patch: Partial<Omit<LocationDraft, "photoId">>): void => {
      setDraft((current) => (current === null ? null : { ...current, ...patch }));
      setErrors(null);
    },
    [],
  );

  const searchPlaces = useCallback((query: string): void => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setSearchState({ status: "error", message: "请输入要搜索的地点名称" });
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchState({ status: "searching" });
    new SearchPlacesAPI(trimmed).send({ signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) {
          return;
        }
        setSearchState(
          response.candidates.length === 0
            ? { status: "empty" }
            : { status: "results", candidates: response.candidates },
        );
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setSearchState({ status: "error", message: describePlaceSearchError(error) });
      },
    );
  }, []);

  const clearSearch = useCallback((): void => {
    searchAbortRef.current?.abort();
    setSearchState({ status: "idle" });
  }, []);

  const applyCandidate = useCallback((candidate: PlaceCandidate): void => {
    setDraft((current) => (current === null ? null : applyPlaceCandidate(current, candidate)));
    setErrors(null);
  }, []);

  const pickPoint = useCallback((point: GeoPoint): void => {
    setDraft((current) => (current === null ? null : applyMapPoint(current, point)));
    setErrors(null);
  }, []);

  const saveLocation = useCallback((): void => {
    if (draft === null) {
      return;
    }
    const validation = validateLocationDraft(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors(null);
    setSaveState({ status: "saving" });
    new SetPhotoLocationAPI(
      draft.photoId,
      validation.name,
      draft.granularity,
      validation.point?.latitude ?? null,
      validation.point?.longitude ?? null,
    )
      .send()
      .then(
        (view) => {
          setSaveState({ status: "idle" });
          setDraft(createLocationDraft(view.photoId, view));
          onChanged();
        },
        (error: unknown) => {
          setSaveState({ status: "failed", message: describeGalleryError(error) });
        },
      );
  }, [draft, onChanged]);

  const clearLocation = useCallback((): void => {
    if (selectedRow === null) {
      return;
    }
    setSaveState({ status: "saving" });
    new ClearPhotoLocationAPI(selectedRow.photoId).send().then(
      () => {
        setSaveState({ status: "idle" });
        setDraft(createLocationDraft(selectedRow.photoId, null));
        onChanged();
      },
      (error: unknown) => {
        setSaveState({ status: "failed", message: describeGalleryError(error) });
      },
    );
  }, [selectedRow, onChanged]);

  const suggestCandidates = useCallback((): void => {
    if (selectedPhotoId === null) {
      return;
    }
    candidateAbortRef.current?.abort();
    const controller = new AbortController();
    candidateAbortRef.current = controller;
    setIgnoredCandidateIds([]);
    setCandidateConfirmState({ status: "idle" });
    setCandidateState({ status: "generating" });
    new SuggestPhotoLocationAPI(selectedPhotoId).send({ signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) {
          return;
        }
        setCandidateState(
          response.candidates.length === 0
            ? { status: "empty", origin: "suggested" }
            : {
                status: "ready",
                origin: "suggested",
                candidates: response.candidates,
                model: response.model,
                generatedAt: response.generatedAt,
              },
        );
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setCandidateState({
          status: "failed",
          origin: "suggested",
          message: describeCandidateError(error),
        });
      },
    );
  }, [selectedPhotoId]);

  const refreshCandidates = useCallback((): void => {
    if (selectedPhotoId !== null) {
      loadCandidates(selectedPhotoId);
    }
  }, [selectedPhotoId, loadCandidates]);

  const ignoreCandidate = useCallback((candidateId: string): void => {
    setIgnoredCandidateIds((ids) =>
      ids.includes(candidateId) ? ids : [...ids, candidateId],
    );
  }, []);

  const confirmCandidate = useCallback(
    (candidate: PhotoLocationCandidate, granularity: LocationGranularity): void => {
      if (selectedPhotoId === null) {
        return;
      }
      setCandidateConfirmState({ status: "confirming", candidateId: candidate.id });
      new ConfirmPhotoLocationCandidateAPI(selectedPhotoId, candidate.id, granularity)
        .send()
        .then(
          (view) => {
            setCandidateConfirmState({ status: "idle" });
            setDraft(createLocationDraft(view.photoId, view));
            onChanged();
          },
          (error: unknown) => {
            setCandidateConfirmState({
              status: "failed",
              message: describeCandidateError(error),
            });
          },
        );
    },
    [selectedPhotoId, onChanged],
  );

  return {
    rows,
    selectedRow,
    draft,
    searchState,
    saveState,
    errors,
    isSaving: saveState.status === "saving",
    candidateState,
    ignoredCandidateIds,
    candidateConfirmState,
    selectPhoto,
    updateDraft,
    searchPlaces,
    clearSearch,
    applyCandidate,
    pickPoint,
    saveLocation,
    clearLocation,
    suggestCandidates,
    refreshCandidates,
    ignoreCandidate,
    confirmCandidate,
  };
};

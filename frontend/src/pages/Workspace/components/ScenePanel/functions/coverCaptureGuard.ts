export const matchesCoverRequest = (
  pending: { readonly requestId: string } | null,
  requestId: string | undefined,
): boolean => pending !== null && requestId !== undefined && pending.requestId === requestId;

export const canRequestSceneCover = (built: boolean, stale: boolean, actionPending: boolean): boolean =>
  built && !stale && !actionPending;

export type OfflineOperationKind =
  | "candidate.create"
  | "candidate.update"
  | "interview.save"
  | "candidate.quickAction";

export type OfflineOperation = {
  id: string;
  kind: OfflineOperationKind;
  createdAt: string;
  candidateId?: string;
  baseUpdatedAt?: string;
  payload: Record<string, unknown>;
};

export type OfflineSyncItemResult = {
  operationId: string;
  status: "applied" | "duplicate" | "conflict" | "error";
  candidateId?: string;
  displayId?: number;
  message?: string;
  serverUpdatedAt?: string;
};

export type OfflineSyncResponse = {
  ok: boolean;
  results: OfflineSyncItemResult[];
};

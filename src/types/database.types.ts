export type UUID = string;

export type CEFRLevel = 'B1' | 'B2' | 'C1' | 'C2';

export type SyncStatus = 'synced' | 'pending';

export type WorkspaceTab = 'writing' | 'speaking' | 'vocab_srs';

export type HighlightCategory = 'Nominalization' | 'Inversion' | 'Hedging' | 'Cohesion';

export type SM2QualityRating = 0 | 1 | 2 | 3;

export type SyncTableName =
  | 'vocab_vault'
  | 'synonym_clusters'
  | 'exercises_vault'
  | 'srs_logs';

export type SyncOperationType = 'UPSERT' | 'DELETE';

/**
 * Chuỗi đại diện cho cấu trúc tsvector đã chuẩn hóa từ PostgreSQL
 * Thay thế hoàn toàn kiểu `any` để đảm bảo TypeScript Strict Mode 100%
 */
export type TSVectorRepresentation = string | null;

export interface IUserCredentials {
  supabaseUrl: string;
  supabaseKey: string;
  geminiKey: string;
}

export interface IVocabWord {
  id: UUID;
  word: string;
  cefr: CEFRLevel;
  nuance: string;
  academic_alternative: string;
  spoken_idiom: string;
  cluster_id: UUID | null;
  tsvector_search: TSVectorRepresentation;
  sync_status: SyncStatus;
  updated_at: string;
  created_at: string;
}

export interface INuanceMatrixMap {
  formality: string;
  collocation: string;
  register_warning: string;
}

export interface ISynonymCluster {
  id: UUID;
  root_concept: string;
  tier_b1: string;
  tier_b2: string;
  tier_c1: string;
  tier_c2: string;
  nuance_matrix: INuanceMatrixMap;
  sync_status: SyncStatus;
  updated_at: string;
  created_at: string;
}

export interface IExerciseDraft {
  id: UUID;
  vocab_id: UUID | null;
  word_target: string;
  academic_example: string;
  speaking_example: string;
  user_rewrite: string;
  is_draft: boolean;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  last_fluency_ms: number;
  next_review_at: string;
  sync_status: SyncStatus;
  updated_at: string;
  created_at: string;
}

export interface ISRSLog {
  id: UUID;
  exercise_id: UUID;
  quality_rating: SM2QualityRating;
  time_spent_ms: number;
  previous_interval: number;
  new_interval: number;
  previous_ease: number;
  new_ease: number;
  reviewed_at: string;
  sync_status: SyncStatus;
  updated_at: string;
}

export type SyncPayloadRecord =
  | IVocabWord
  | ISynonymCluster
  | IExerciseDraft
  | ISRSLog;

export interface ISyncQueueItem {
  id: UUID;
  table: SyncTableName;
  operation: SyncOperationType;
  recordId: UUID;
  payload: SyncPayloadRecord;
  retryCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export type ToastSeverity = 'error' | 'warning' | 'success' | 'info';

export interface IToastNotification {
  id: UUID;
  severity: ToastSeverity;
  title: string;
  message: string;
  createdAt: number;
  durationMs: number;
}

export interface IAcademicCritiqueItem {
  originalSnippet: string;
  highlightType: HighlightCategory;
  suggestedText: string;
  explanation: string;
  startIndex: number;
  endIndex: number;
}

export interface ISpeakingNaturalizerItem {
  originalSnippet: string;
  overlyFormalWord: string;
  suggestedText: string;
  phrasalVerbUsed: string;
  explanation: string;
  startIndex: number;
  endIndex: number;
}

export interface IAIExampleResponse {
  academic_example: string;
  speaking_example: string;
}

export interface IAppState {
  _hasHydrated: boolean;
  activeTab: WorkspaceTab;
  credentials: IUserCredentials;
  vocabVault: IVocabWord[];
  synonymClusters: ISynonymCluster[];
  exercisesVault: IExerciseDraft[];
  srsLogs: ISRSLog[];
  syncQueue: ISyncQueueItem[];
  toasts: IToastNotification[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;

  // Actions
  setHasHydrated: (hydrated: boolean) => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  setCredentials: (creds: IUserCredentials) => void;
  resetToDefaultCredentials: () => void;
  setOnlineStatus: (online: boolean) => void;
  setSyncingStatus: (syncing: boolean) => void;
  setLastSyncedAt: (timestamp: string) => void;

  // Optimistic CRUD Actions
  upsertVocabWord: (word: IVocabWord) => void;
  updateVocabField: (
    id: UUID,
    field: 'word' | 'nuance' | 'academic_alternative' | 'spoken_idiom' | 'cefr',
    value: string
  ) => void;
  bulkSeedVocabIfNeeded: (count: number) => void;
  upsertSynonymCluster: (cluster: ISynonymCluster) => void;
  upsertExerciseDraft: (exercise: IExerciseDraft) => void;
  recordSRSReviewOptimistic: (
    updatedExercise: IExerciseDraft,
    logEntry: ISRSLog
  ) => void;

  // Remote Reconciliation Actions (Last-Write-Wins)
  reconcileRemoteExercise: (remoteExercise: IExerciseDraft) => void;
  reconcileRemoteVocab: (remoteVocab: IVocabWord) => void;

  // Queue Management Actions
  enqueueSyncOperation: (
    table: SyncTableName,
    operation: SyncOperationType,
    recordId: UUID,
    payload: SyncPayloadRecord
  ) => void;
  dequeueSyncOperation: (queueItemId: UUID) => void;
  markQueueItemFailed: (queueItemId: UUID, errorMessage: string) => void;
  markEntitySynced: (table: SyncTableName, recordId: UUID, syncedAt: string) => void;

  // Toast Actions
  addToast: (
    severity: ToastSeverity,
    title: string,
    message: string,
    durationMs?: number
  ) => void;
  dismissToast: (id: UUID) => void;
  clearAllToasts: () => void;
}
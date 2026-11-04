import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import {
  CEFRLevel,
  IAppState,
  IExerciseDraft,
  ISRSLog,
  ISyncQueueItem,
  ISynonymCluster,
  IToastNotification,
  IUserCredentials,
  IVocabWord,
  SyncOperationType,
  SyncPayloadRecord,
  SyncTableName,
  ToastSeverity,
  UUID,
  WorkspaceTab,
} from '@/types/database.types';

/**
 * Hàm chuẩn hóa Supabase URL:
 * Tự động cắt bỏ `/rest/v1/`, `/realtime/v1/`, `/auth/v1/` hoặc dấu `/` ở cuối
 * để đảm bảo `@supabase/supabase-js` không bị lỗi 404 PostgREST hoặc đứt kết nối WebSocket.
 */
export function sanitizeSupabaseBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/realtime\/v1\/?$/i, '')
    .replace(/\/auth\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

/**
 * Bộ 3 Credentials của bạn được nạp sẵn để hệ thống hoạt động tức thì ngay khi khởi chạy
 * mà vẫn cho phép thay đổi linh hoạt trên thanh CloudSyncBar (BYOK).
 */
export const DEFAULT_BOOTSTRAP_CREDENTIALS: IUserCredentials = {
  supabaseUrl: sanitizeSupabaseBaseUrl(
    'https://igetygmsrksbhfhismat.supabase.co/rest/v1/'
  ),
  supabaseKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZXR5Z21zcmtzYmhmaGlzbWF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyODg5MTAsImV4cCI6MjEwNzg2NDkxMH0.KsK-fHAZrArAFzYgqXr96Ni9mClWxGJPGd9E88yCXD4',
  geminiKey: 'AIzaSyD5B79uSbvAh24J0ZUafGcgfgFy9ixX7cI',
};

/**
 * Bộ tạo UUID v4 chuẩn RFC4122 hoạt động mọi môi trường
 */
export function generateDeterministicUUID(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const randomNibble = (Math.random() * 16) | 0;
    const value = char === 'x' ? randomNibble : (randomNibble & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Safe Storage Adapter tránh crash khi chạy SSR trên Next.js 14 hoặc khi bộ nhớ đầy
 */
const safeLocalStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Bỏ qua nếu trình duyệt chặn QuotaExceededError ở chế độ ẩn danh
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Không làm sập tiến trình
    }
  },
};

const INITIAL_CLUSTERS: ISynonymCluster[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    root_concept: 'Important / Significant',
    tier_b1: 'important',
    tier_b2: 'significant',
    tier_c1: 'pivotal',
    tier_c2: 'paramount',
    nuance_matrix: {
      formality: 'Academic Band 8.5+ ưu tiên pivotal (vai trò bước ngoặt) và paramount (tối thượng).',
      collocation: 'of paramount importance / play a pivotal role in',
      register_warning: 'Không dùng paramount trực tiếp trước danh từ đếm được số ít mang nghĩa thông thường.',
    },
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    root_concept: 'Problem / Difficulty',
    tier_b1: 'problem',
    tier_b2: 'obstacle',
    tier_c1: 'predicament',
    tier_c2: 'conundrum',
    nuance_matrix: {
      formality: 'Conundrum chỉ bài toán nan giải không có lời giải dễ dàng; predicament chỉ tình thế tiến thoái lưỡng nan.',
      collocation: 'pose a formidable conundrum / alleviate a fiscal predicament',
      register_warning: 'Tránh dùng conundrum cho các sự cố kỹ thuật nhỏ nhặt hằng ngày.',
    },
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    root_concept: 'Change / Modify',
    tier_b1: 'change',
    tier_b2: 'alter',
    tier_c1: 'overhaul',
    tier_c2: 'metamorphose',
    nuance_matrix: {
      formality: 'Overhaul rất mạnh cho chính sách/hệ thống; metamorphose mang sắc thái biến đổi bản chất.',
      collocation: 'undergo a systemic overhaul / radically alter the trajectory',
      register_warning: 'Overhaul dùng cho hệ thống, cơ chế; không dùng cho cảm xúc cá nhân.',
    },
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const INITIAL_VOCAB: IVocabWord[] = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    word: 'ubiquitous',
    cefr: 'C2',
    nuance: 'Hiện diện ở khắp mọi nơi cùng một thời điểm (thường dùng cho công nghệ, thiết bị số).',
    academic_alternative: 'pervasive / omnipresent',
    spoken_idiom: 'popping up everywhere',
    cluster_id: '11111111-1111-4111-8111-111111111101',
    tsvector_search: "'everywher':8B 'omnipres':5B 'pervas':4B 'pop':6B 'ubiquit':1A",
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    word: 'exacerbate',
    cefr: 'C1',
    nuance: 'Làm trầm trọng thêm một vấn đề, khủng hoảng hoặc tình trạng tiêu cực vốn đã tồn tại.',
    academic_alternative: 'aggravate / compound',
    spoken_idiom: 'make things way worse',
    cluster_id: '11111111-1111-4111-8111-111111111102',
    tsvector_search: "'aggrav':2B 'compound':3B 'exacerb':1A 'make':4B 'wors':7B",
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    word: 'mitigate',
    cefr: 'C1',
    nuance: 'Giảm thiểu mức độ nghiêm trọng, thiệt hại hoặc rủi ro của một hiện tượng bất lợi.',
    academic_alternative: 'alleviate / attenuate',
    spoken_idiom: 'take the edge off',
    cluster_id: '11111111-1111-4111-8111-111111111103',
    tsvector_search: "'allevi':2B 'attenu':3B 'edg':6B 'mitig':1A",
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const INITIAL_EXERCISES: IExerciseDraft[] = [
  {
    id: '33333333-3333-4333-8333-333333333301',
    vocab_id: '22222222-2222-4222-8222-222222222202',
    word_target: 'exacerbate',
    academic_example:
      'The proliferation of unregulated short-term rentals appears to exacerbate housing affordability crises across major metropolitan areas.',
    speaking_example:
      'To be honest / cutting public transport budgets only ends up making traffic congestion way worse // especially during rush hours.',
    user_rewrite: '',
    is_draft: false,
    ease_factor: 2.5,
    interval_days: 1,
    repetitions: 1,
    last_fluency_ms: 3400,
    next_review_at: '2026-01-01T00:00:00.000Z',
    sync_status: 'synced',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

export const useAppStore = create<IAppState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      activeTab: 'writing',
      credentials: {
        ...DEFAULT_BOOTSTRAP_CREDENTIALS,
      },
      vocabVault: INITIAL_VOCAB,
      synonymClusters: INITIAL_CLUSTERS,
      exercisesVault: INITIAL_EXERCISES,
      srsLogs: [],
      syncQueue: [],
      toasts: [],
      isOnline: true,
      isSyncing: false,
      lastSyncedAt: null,

      setHasHydrated: (hydrated: boolean): void => {
        set({ _hasHydrated: hydrated });
      },

      setActiveTab: (tab: WorkspaceTab): void => {
        set({ activeTab: tab });
      },

      setCredentials: (creds: IUserCredentials): void => {
        set({
          credentials: {
            supabaseUrl: sanitizeSupabaseBaseUrl(creds.supabaseUrl),
            supabaseKey: creds.supabaseKey.trim(),
            geminiKey: creds.geminiKey.trim(),
          },
        });
      },

      resetToDefaultCredentials: (): void => {
        set({
          credentials: {
            ...DEFAULT_BOOTSTRAP_CREDENTIALS,
          },
        });
      },

      setOnlineStatus: (online: boolean): void => {
        set({ isOnline: online });
      },

      setSyncingStatus: (syncing: boolean): void => {
        set({ isSyncing: syncing });
      },

      setLastSyncedAt: (timestamp: string): void => {
        set({ lastSyncedAt: timestamp });
      },

      upsertVocabWord: (word: IVocabWord): void => {
        const nowIso = new Date().toISOString();
        const optimisticRecord: IVocabWord = {
          ...word,
          sync_status: 'pending',
          updated_at: nowIso,
        };

        set((state) => {
          const exists = state.vocabVault.some((item) => item.id === word.id);
          const nextVault = exists
            ? state.vocabVault.map((item) => (item.id === word.id ? optimisticRecord : item))
            : [optimisticRecord, ...state.vocabVault];

          return { vocabVault: nextVault };
        });

        get().enqueueSyncOperation('vocab_vault', 'UPSERT', optimisticRecord.id, optimisticRecord);
      },

      updateVocabField: (
        id: UUID,
        field: 'word' | 'nuance' | 'academic_alternative' | 'spoken_idiom' | 'cefr',
        value: string
      ): void => {
        const state = get();
        const target = state.vocabVault.find((w) => w.id === id);
        if (!target) {
          return;
        }

        const trimmedValue = value.trim();
        if (target[field] === trimmedValue) {
          return;
        }

        const nowIso = new Date().toISOString();
        const updatedRecord: IVocabWord = {
          ...target,
          [field]:
            field === 'cefr'
              ? ((['B1', 'B2', 'C1', 'C2'].includes(trimmedValue)
                  ? trimmedValue
                  : target.cefr) as CEFRLevel)
              : trimmedValue,
          sync_status: 'pending',
          updated_at: nowIso,
        };

        set((current) => ({
          vocabVault: current.vocabVault.map((item) =>
            item.id === id ? updatedRecord : item
          ),
        }));

        get().enqueueSyncOperation('vocab_vault', 'UPSERT', updatedRecord.id, updatedRecord);
      },

      bulkSeedVocabIfNeeded: (count: number): void => {
        const currentVault = get().vocabVault;
        if (currentVault.length >= count) {
          return;
        }

        const cefrPool: CEFRLevel[] = ['B1', 'B2', 'C1', 'C2'];
        const academicStems: string[] = [
          'proliferation',
          'ameliorate',
          'juxtaposition',
          'dichotomy',
          'ephemeral',
          'corroborate',
          'paradigm',
          'hegemony',
          'pragmatic',
          'unprecedented',
          'ramification',
          'discrepancy',
        ];
        const generated: IVocabWord[] = [...currentVault];
        const baseTimestamp = new Date().toISOString();

        for (let i = currentVault.length; i < count; i++) {
          const stem = academicStems[i % academicStems.length];
          const level = cefrPool[i % cefrPool.length];
          const paddedIndex = String(i + 1).padStart(5, '0');
          generated.push({
            id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
            word: `${stem}_${paddedIndex}`,
            cefr: level,
            nuance: `Sắc thái học thuật chuyên sâu số #${paddedIndex} dùng cho IELTS Writing Task 2`,
            academic_alternative: `formal_${stem}_${paddedIndex}`,
            spoken_idiom: `natural_phrase_${paddedIndex}`,
            cluster_id: INITIAL_CLUSTERS[i % INITIAL_CLUSTERS.length].id,
            tsvector_search: `'${stem}':1A`,
            sync_status: 'synced',
            created_at: baseTimestamp,
            updated_at: baseTimestamp,
          });
        }

        set({ vocabVault: generated });
      },

      upsertSynonymCluster: (cluster: ISynonymCluster): void => {
        const nowIso = new Date().toISOString();
        const optimisticCluster: ISynonymCluster = {
          ...cluster,
          sync_status: 'pending',
          updated_at: nowIso,
        };

        set((state) => {
          const exists = state.synonymClusters.some((c) => c.id === cluster.id);
          const nextClusters = exists
            ? state.synonymClusters.map((c) => (c.id === cluster.id ? optimisticCluster : c))
            : [optimisticCluster, ...state.synonymClusters];

          return { synonymClusters: nextClusters };
        });

        get().enqueueSyncOperation(
          'synonym_clusters',
          'UPSERT',
          optimisticCluster.id,
          optimisticCluster
        );
      },

      upsertExerciseDraft: (exercise: IExerciseDraft): void => {
        const nowIso = new Date().toISOString();
        const optimisticExercise: IExerciseDraft = {
          ...exercise,
          sync_status: 'pending',
          updated_at: nowIso,
        };

        set((state) => {
          const exists = state.exercisesVault.some((ex) => ex.id === exercise.id);
          const nextExercises = exists
            ? state.exercisesVault.map((ex) =>
                ex.id === exercise.id ? optimisticExercise : ex
              )
            : [optimisticExercise, ...state.exercisesVault];

          return { exercisesVault: nextExercises };
        });

        get().enqueueSyncOperation(
          'exercises_vault',
          'UPSERT',
          optimisticExercise.id,
          optimisticExercise
        );
      },

      recordSRSReviewOptimistic: (
        updatedExercise: IExerciseDraft,
        logEntry: ISRSLog
      ): void => {
        const nowIso = new Date().toISOString();
        const nextExercise: IExerciseDraft = {
          ...updatedExercise,
          sync_status: 'pending',
          updated_at: nowIso,
        };
        const nextLog: ISRSLog = {
          ...logEntry,
          sync_status: 'pending',
          updated_at: nowIso,
        };

        set((state) => ({
          exercisesVault: state.exercisesVault.map((ex) =>
            ex.id === nextExercise.id ? nextExercise : ex
          ),
          srsLogs: [nextLog, ...state.srsLogs],
        }));

        get().enqueueSyncOperation('exercises_vault', 'UPSERT', nextExercise.id, nextExercise);
        get().enqueueSyncOperation('srs_logs', 'UPSERT', nextLog.id, nextLog);
      },

      reconcileRemoteExercise: (remoteExercise: IExerciseDraft): void => {
        set((state) => {
          const existing = state.exercisesVault.find((ex) => ex.id === remoteExercise.id);
          if (!existing) {
            return {
              exercisesVault: [
                { ...remoteExercise, sync_status: 'synced' },
                ...state.exercisesVault,
              ],
            };
          }

          // Last-Write-Wins (LWW): Chỉ ghi đè nếu bản ghi từ Server mới hơn bản ghi Local
          const remoteTime = new Date(remoteExercise.updated_at).getTime();
          const localTime = new Date(existing.updated_at).getTime();

          if (remoteTime >= localTime) {
            return {
              exercisesVault: state.exercisesVault.map((ex) =>
                ex.id === remoteExercise.id
                  ? { ...remoteExercise, sync_status: 'synced' }
                  : ex
              ),
            };
          }

          return state;
        });
      },

      reconcileRemoteVocab: (remoteVocab: IVocabWord): void => {
        set((state) => {
          const existing = state.vocabVault.find((w) => w.id === remoteVocab.id);
          if (!existing) {
            return {
              vocabVault: [{ ...remoteVocab, sync_status: 'synced' }, ...state.vocabVault],
            };
          }

          const remoteTime = new Date(remoteVocab.updated_at).getTime();
          const localTime = new Date(existing.updated_at).getTime();

          if (remoteTime >= localTime) {
            return {
              vocabVault: state.vocabVault.map((w) =>
                w.id === remoteVocab.id ? { ...remoteVocab, sync_status: 'synced' } : w
              ),
            };
          }

          return state;
        });
      },

      enqueueSyncOperation: (
        table: SyncTableName,
        operation: SyncOperationType,
        recordId: UUID,
        payload: SyncPayloadRecord
      ): void => {
        const nowIso = new Date().toISOString();

        set((state) => {
          const existingIndex = state.syncQueue.findIndex(
            (item) => item.table === table && item.recordId === recordId
          );

          if (existingIndex > -1) {
            const updatedQueue = [...state.syncQueue];
            updatedQueue[existingIndex] = {
              ...updatedQueue[existingIndex],
              operation,
              payload,
              errorMessage: null,
              lastAttemptAt: null,
            };
            return { syncQueue: updatedQueue };
          }

          const newItem: ISyncQueueItem = {
            id: generateDeterministicUUID(),
            table,
            operation,
            recordId,
            payload,
            retryCount: 0,
            lastAttemptAt: null,
            errorMessage: null,
            createdAt: nowIso,
          };

          return {
            syncQueue: [...state.syncQueue, newItem],
          };
        });
      },

      dequeueSyncOperation: (queueItemId: UUID): void => {
        set((state) => ({
          syncQueue: state.syncQueue.filter((item) => item.id !== queueItemId),
        }));
      },

      markQueueItemFailed: (queueItemId: UUID, errorMessage: string): void => {
        const nowIso = new Date().toISOString();
        set((state) => ({
          syncQueue: state.syncQueue.map((item) =>
            item.id === queueItemId
              ? {
                  ...item,
                  retryCount: item.retryCount + 1,
                  lastAttemptAt: nowIso,
                  errorMessage,
                }
              : item
          ),
        }));
      },

      markEntitySynced: (table: SyncTableName, recordId: UUID, syncedAt: string): void => {
        set((state) => {
          if (table === 'vocab_vault') {
            return {
              lastSyncedAt: syncedAt,
              vocabVault: state.vocabVault.map((w) =>
                w.id === recordId ? { ...w, sync_status: 'synced' } : w
              ),
            };
          }
          if (table === 'synonym_clusters') {
            return {
              lastSyncedAt: syncedAt,
              synonymClusters: state.synonymClusters.map((c) =>
                c.id === recordId ? { ...c, sync_status: 'synced' } : c
              ),
            };
          }
          if (table === 'exercises_vault') {
            return {
              lastSyncedAt: syncedAt,
              exercisesVault: state.exercisesVault.map((ex) =>
                ex.id === recordId ? { ...ex, sync_status: 'synced' } : ex
              ),
            };
          }
          if (table === 'srs_logs') {
            return {
              lastSyncedAt: syncedAt,
              srsLogs: state.srsLogs.map((log) =>
                log.id === recordId ? { ...log, sync_status: 'synced' } : log
              ),
            };
          }
          return { lastSyncedAt: syncedAt };
        });
      },

      addToast: (
        severity: ToastSeverity,
        title: string,
        message: string,
        durationMs: number = 5000
      ): void => {
        const toast: IToastNotification = {
          id: generateDeterministicUUID(),
          severity,
          title,
          message,
          createdAt: Date.now(),
          durationMs,
        };
        set((state) => ({
          toasts: [...state.toasts.slice(-4), toast],
        }));
      },

      dismissToast: (id: UUID): void => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      clearAllToasts: (): void => {
        set({ toasts: [] });
      },
    }),
    {
      name: 'ielts-nuance-storage',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        credentials: state.credentials,
        vocabVault: state.vocabVault,
        synonymClusters: state.synonymClusters,
        exercisesVault: state.exercisesVault,
        srsLogs: state.srsLogs,
        syncQueue: state.syncQueue,
        lastSyncedAt: state.lastSyncedAt,
      }),
      merge: (persistedState, currentState) => {
        const typedPersisted = persistedState as Partial<IAppState> | undefined;
        if (!typedPersisted) {
          return currentState;
        }

        // Chống lỗi Hydration Shadowing: Nếu localStorage cũ có key rỗng, tự bù bằng DEFAULT_BOOTSTRAP_CREDENTIALS
        const mergedCredentials: IUserCredentials = {
          supabaseUrl: sanitizeSupabaseBaseUrl(
            typedPersisted.credentials?.supabaseUrl || DEFAULT_BOOTSTRAP_CREDENTIALS.supabaseUrl
          ),
          supabaseKey:
            typedPersisted.credentials?.supabaseKey?.trim() ||
            DEFAULT_BOOTSTRAP_CREDENTIALS.supabaseKey,
          geminiKey:
            typedPersisted.credentials?.geminiKey?.trim() ||
            DEFAULT_BOOTSTRAP_CREDENTIALS.geminiKey,
        };

        return {
          ...currentState,
          ...typedPersisted,
          credentials: mergedCredentials,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);
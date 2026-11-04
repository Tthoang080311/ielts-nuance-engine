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

export const DEFAULT_BOOTSTRAP_CREDENTIALS: IUserCredentials = {
  supabaseUrl: sanitizeSupabaseBaseUrl(
    'https://igetygmsrksbhfhismat.supabase.co/rest/v1/'
  ),
  supabaseKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZXR5Z21zcmtzYmhmaGlzbWF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyODg5MTAsImV4cCI6MjEwNzg2NDkxMH0.KsK-fHAZrArAFzYgqXr96Ni9mClWxGJPGd9E88yCXD4',
  geminiKey: 'AQ.Ab8RN6ID7F1p5oLZYSPCurA87RtwxuH63kU8Br32tbZPOE3HQ',
};

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
      // Ignore storage quota errors
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore storage errors
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

        if (target[field] === value) {
          return;
        }

        const nowIso = new Date().toISOString();
        const updatedRecord: IVocabWord = {
          ...target,
          [field]:
            field === 'cefr'
              ? ((['B1', 'B2', 'C1', 'C2'].includes(value.trim())
                  ? value.trim()
                  : target.cefr) as CEFRLevel)
              : value,
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
        const academicStems: Array<{
          word: string;
          alt: string;
          idiom: string;
          nuance: string;
        }> = [
          {
            word: 'proliferation',
            alt: 'rapid expansion / surge',
            idiom: 'mushrooming everywhere',
            nuance: 'Sự gia tăng nhanh chóng về số lượng (công nghệ, vũ khí, thông tin).',
          },
          {
            word: 'ameliorate',
            alt: 'improve / alleviate',
            idiom: 'make things better',
            nuance: 'Cải thiện một tình trạng tồi tệ hoặc khó khăn trở nên dễ chịu hơn.',
          },
          {
            word: 'juxtaposition',
            alt: 'side-by-side contrast',
            idiom: 'putting side by side',
            nuance: 'Đặt hai yếu tố đối lập cạnh nhau để làm nổi bật sự tương phản.',
          },
          {
            word: 'dichotomy',
            alt: 'sharp division / contrast',
            idiom: 'night and day difference',
            nuance: 'Sự phân chia tách biệt hoàn toàn giữa hai mặt đối lập.',
          },
          {
            word: 'corroborate',
            alt: 'substantiate / verify',
            idiom: 'back up a claim',
            nuance: 'Củng cố, xác nhận một giả thuyết bằng bằng chứng thực nghiệm.',
          },
          {
            word: 'ramification',
            alt: 'consequence / implication',
            idiom: 'knock-on effect',
            nuance: 'Hệ lụy phức tạp và lâu dài phát sinh từ một quyết định chính sách.',
          },
        ];

        const generated: IVocabWord[] = [...currentVault];
        const baseTimestamp = new Date().toISOString();

        for (let i = currentVault.length; i < count; i++) {
          const item = academicStems[i % academicStems.length];
          const level = cefrPool[i % cefrPool.length];
          const paddedIndex = String(i + 1).padStart(4, '0');
          generated.push({
            id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
            word: `${item.word} #${paddedIndex}`,
            cefr: level,
            nuance: item.nuance,
            academic_alternative: item.alt,
            spoken_idiom: item.idiom,
            cluster_id: INITIAL_CLUSTERS[i % INITIAL_CLUSTERS.length].id,
            tsvector_search: `'${item.word}':1A`,
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
        const next
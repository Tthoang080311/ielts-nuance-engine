'use client';

import { useEffect, useCallback, useRef } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { cloudManager, CloudConfigurationError } from '@/lib/dynamicClients';
import { useAppStore } from '@/store/useAppStore';
import { IExerciseDraft, IVocabWord } from '@/types/database.types';

const MAX_QUEUE_RETRIES = 5;

export interface IUseSupabaseSyncResult {
  flushSyncQueue: () => Promise<void>;
  pullLatestFromCloud: () => Promise<void>;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}

export function useSupabaseSync(): IUseSupabaseSyncResult {
  const hasHydrated = useAppStore((s) => s._hasHydrated);
  const credentials = useAppStore((s) => s.credentials);
  const syncQueue = useAppStore((s) => s.syncQueue);
  const isOnline = useAppStore((s) => s.isOnline);
  const isSyncing = useAppStore((s) => s.isSyncing);

  const setOnlineStatus = useAppStore((s) => s.setOnlineStatus);
  const setSyncingStatus = useAppStore((s) => s.setSyncingStatus);
  const dequeueSyncOperation = useAppStore((s) => s.dequeueSyncOperation);
  const markQueueItemFailed = useAppStore((s) => s.markQueueItemFailed);
  const markEntitySynced = useAppStore((s) => s.markEntitySynced);
  const reconcileRemoteExercise = useAppStore((s) => s.reconcileRemoteExercise);
  const reconcileRemoteVocab = useAppStore((s) => s.reconcileRemoteVocab);
  const addToast = useAppStore((s) => s.addToast);

  const isFlushingRef = useRef<boolean>(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  /**
   * Duyệt tuần tự mảng syncQueue, đẩy từng bản ghi lên Supabase.
   * Thành công -> xóa khỏi syncQueue & đánh dấu 'synced'.
   * Thất bại -> tăng retryCount & bắn Toast phẳng 2D góc phải dưới.
   */
  const flushSyncQueue = useCallback(async (): Promise<void> => {
    if (isFlushingRef.current) {
      return;
    }

    const currentQueue = useAppStore.getState().syncQueue;
    if (currentQueue.length === 0) {
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOnlineStatus(false);
      return;
    }

    if (!cloudManager.hasValidSupabaseConfig()) {
      return;
    }

    isFlushingRef.current = true;
    setSyncingStatus(true);

    try {
      const supabase = cloudManager.getSupabase();

      for (const item of currentQueue) {
        if (item.retryCount >= MAX_QUEUE_RETRIES) {
          continue;
        }

        try {
          if (item.operation === 'UPSERT') {
            const payloadToPush = {
              ...item.payload,
              sync_status: 'synced' as const,
            };

            const { error } = await supabase
              .from(item.table)
              .upsert(payloadToPush as Record<string, unknown>, { onConflict: 'id' });

            if (error) {
              throw new Error(`[${item.table}] ${error.message} (Code: ${error.code})`);
            }
          } else if (item.operation === 'DELETE') {
            const { error } = await supabase
              .from(item.table)
              .delete()
              .eq('id', item.recordId);

            if (error) {
              throw new Error(`[${item.table}] ${error.message} (Code: ${error.code})`);
            }
          }

          const syncedTimestamp = new Date().toISOString();
          dequeueSyncOperation(item.id);
          markEntitySynced(item.table, item.recordId, syncedTimestamp);
        } catch (itemError: unknown) {
          const errorMessage =
            itemError instanceof Error
              ? itemError.message
              : 'Lỗi không xác định khi đồng bộ bản ghi lên Supabase.';
          markQueueItemFailed(item.id, errorMessage);
          addToast(
            'error',
            'Lỗi Đồng Bộ Hàng Đợi (Offline Queue)',
            `Không thể đẩy bản ghi [${item.table}]: ${errorMessage}`
          );
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof CloudConfigurationError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Không thể khởi tạo kết nối Supabase.';
      addToast('error', 'Ngắt Kết Nối Đám Mây', message);
    } finally {
      isFlushingRef.current = false;
      setSyncingStatus(false);
    }
  }, [
    addToast,
    dequeueSyncOperation,
    markEntitySynced,
    markQueueItemFailed,
    setOnlineStatus,
    setSyncingStatus,
  ]);

  /**
   * Kéo dữ liệu mới nhất từ Supabase khi khởi động hoặc khi đổi khóa BYOK
   */
  const pullLatestFromCloud = useCallback(async (): Promise<void> => {
    if (!cloudManager.hasValidSupabaseConfig()) {
      return;
    }

    try {
      const supabase = cloudManager.getSupabase();

      const [exercisesResult, vocabResult] = await Promise.all([
        supabase
          .from('exercises_vault')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(200),
        supabase
          .from('vocab_vault')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(500),
      ]);

      if (exercisesResult.error) {
        throw new Error(`Tải exercises_vault thất bại: ${exercisesResult.error.message}`);
      }
      if (vocabResult.error) {
        throw new Error(`Tải vocab_vault thất bại: ${vocabResult.error.message}`);
      }

      if (Array.isArray(exercisesResult.data)) {
        for (const row of exercisesResult.data) {
          reconcileRemoteExercise(row as IExerciseDraft);
        }
      }

      if (Array.isArray(vocabResult.data)) {
        for (const row of vocabResult.data) {
          reconcileRemoteVocab(row as IVocabWord);
        }
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Không thể tải dữ liệu từ Supabase Cloud.';
      addToast('error', 'Đồng Bộ Đám Mây Thất Bại', msg);
    }
  }, [addToast, reconcileRemoteExercise, reconcileRemoteVocab]);

  /**
   * Lắng nghe sự kiện mạng Online / Offline của trình duyệt
   */
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setOnlineStatus(window.navigator.onLine);

    const handleOnline = (): void => {
      setOnlineStatus(true);
      addToast(
        'info',
        'Đã Khôi Phục Kết Nối Mạng',
        'Đang tự động xả hàng đợi đồng bộ (syncQueue) lên Supabase...'
      );
      void flushSyncQueue();
    };

    const handleOffline = (): void => {
      setOnlineStatus(false);
      addToast(
        'warning',
        'Chế Độ Offline-First Kích Hoạt',
        'Mất kết nối mạng. Mọi thao tác được lưu an toàn vào bộ nhớ cục bộ và syncQueue.'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addToast, flushSyncQueue, setOnlineStatus]);

  /**
   * Khởi tạo kênh Realtime `public:exercises_vault` lắng nghe INSERT & UPDATE
   */
  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!cloudManager.hasValidSupabaseConfig()) {
      return;
    }

    let isMounted = true;

    try {
      const supabase = cloudManager.getSupabase();

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel('public:exercises_vault')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'exercises_vault',
          },
          (payload: RealtimePostgresChangesPayload<IExerciseDraft>) => {
            if (!isMounted || !payload.new || typeof payload.new !== 'object') {
              return;
            }
            if ('id' in payload.new && typeof payload.new.id === 'string') {
              reconcileRemoteExercise(payload.new as IExerciseDraft);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'exercises_vault',
          },
          (payload: RealtimePostgresChangesPayload<IExerciseDraft>) => {
            if (!isMounted || !payload.new || typeof payload.new !== 'object') {
              return;
            }
            if ('id' in payload.new && typeof payload.new.id === 'string') {
              reconcileRemoteExercise(payload.new as IExerciseDraft);
            }
          }
        )
        .subscribe((status, err) => {
          if (err && isMounted) {
            addToast(
              'error',
              'Lỗi Kênh Realtime',
              `Kênh public:exercises_vault gặp sự cố: ${err.message}`
            );
          }
          if (status === 'SUBSCRIBED' && isMounted) {
            void flushSyncQueue();
            void pullLatestFromCloud();
          }
        });

      channelRef.current = channel;
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Không thể đăng ký kênh Realtime Supabase.';
      addToast('error', 'Lỗi Khởi Tạo Realtime', errMsg);
    }

    return () => {
      isMounted = false;
      if (channelRef.current && cloudManager.hasValidSupabaseConfig()) {
        try {
          const supabase = cloudManager.getSupabase();
          void supabase.removeChannel(channelRef.current);
        } catch {
          // Bỏ qua nếu client đã đóng
        }
        channelRef.current = null;
      }
    };
  }, [
    hasHydrated,
    credentials.supabaseUrl,
    credentials.supabaseKey,
    addToast,
    flushSyncQueue,
    pullLatestFromCloud,
    reconcileRemoteExercise,
  ]);

  /**
   * Tự động kích hoạt flushSyncQueue khi có phần tử mới được đẩy vào hàng đợi và mạng đang Online
   */
  useEffect(() => {
    if (!hasHydrated || !isOnline || syncQueue.length === 0) {
      return;
    }

    const actionableItems = syncQueue.filter((item) => item.retryCount < MAX_QUEUE_RETRIES);
    if (actionableItems.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void flushSyncQueue();
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasHydrated, isOnline, syncQueue, flushSyncQueue]);

  return {
    flushSyncQueue,
    pullLatestFromCloud,
    isOnline,
    isSyncing,
    pendingCount: syncQueue.length,
  };
}
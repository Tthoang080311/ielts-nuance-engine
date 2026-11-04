'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  Copy,
  ClipboardPaste,
  RefreshCw,
  KeyRound,
  Check,
  RotateCcw,
  Database,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAppStore, sanitizeSupabaseBaseUrl } from '@/store/useAppStore';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { cloudManager } from '@/lib/dynamicClients';
import { IUserCredentials } from '@/types/database.types';

function isValidCredentialsObject(value: unknown): value is IUserCredentials {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.supabaseUrl === 'string' &&
    typeof record.supabaseKey === 'string' &&
    typeof record.geminiKey === 'string'
  );
}

export const CloudSyncBar: React.FC = () => {
  const hasHydrated = useAppStore((s) => s._hasHydrated);
  const credentials = useAppStore((s) => s.credentials);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const setCredentials = useAppStore((s) => s.setCredentials);
  const resetToDefaultCredentials = useAppStore((s) => s.resetToDefaultCredentials);
  const addToast = useAppStore((s) => s.addToast);

  const { flushSyncQueue, pullLatestFromCloud, isOnline, isSyncing, pendingCount } =
    useSupabaseSync();

  const [supabaseUrlInput, setSupabaseUrlInput] = useState<string>(credentials.supabaseUrl);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState<string>(credentials.supabaseKey);
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>(credentials.geminiKey);
  const [quickPasteCode, setQuickPasteCode] = useState<string>('');
  const [showSecrets, setShowSecrets] = useState<boolean>(false);
  const [copiedBadge, setCopiedBadge] = useState<boolean>(false);

  useEffect(() => {
    if (hasHydrated) {
      setSupabaseUrlInput(credentials.supabaseUrl);
      setSupabaseKeyInput(credentials.supabaseKey);
      setGeminiKeyInput(credentials.geminiKey);
    }
  }, [
    hasHydrated,
    credentials.supabaseUrl,
    credentials.supabaseKey,
    credentials.geminiKey,
  ]);

  const handleApplyKeys = useCallback(
    (e: React.FormEvent<HTMLFormElement>): void => {
      e.preventDefault();
      try {
        const cleanedUrl = sanitizeSupabaseBaseUrl(supabaseUrlInput);
        const nextCreds: IUserCredentials = {
          supabaseUrl: cleanedUrl,
          supabaseKey: supabaseKeyInput.trim(),
          geminiKey: geminiKeyInput.trim(),
        };

        cloudManager.validateSupabaseCredentials(nextCreds);
        cloudManager.validateGeminiCredentials(nextCreds);

        setCredentials(nextCreds);
        setSupabaseUrlInput(cleanedUrl);

        addToast(
          'success',
          'Đã Cập Nhật Khóa BYOK',
          'Hệ thống đã kết nối Supabase & Gemini API thành công.'
        );
        void flushSyncQueue();
        void pullLatestFromCloud();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Thông tin khóa BYOK không hợp lệ. Vui lòng kiểm tra lại.';
        addToast('error', 'Lỗi Cấu Hình BYOK', message);
      }
    },
    [
      supabaseUrlInput,
      supabaseKeyInput,
      geminiKeyInput,
      setCredentials,
      addToast,
      flushSyncQueue,
      pullLatestFromCloud,
    ]
  );

  /**
   * Mã hóa btoa(JSON.stringify(keys)) chuẩn cho nút "Copy Mã iPad"
   */
  const handleCopyIpadCode = useCallback(async (): Promise<void> => {
    try {
      const keysToEncode: IUserCredentials = {
        supabaseUrl: sanitizeSupabaseBaseUrl(supabaseUrlInput),
        supabaseKey: supabaseKeyInput.trim(),
        geminiKey: geminiKeyInput.trim(),
      };

      const encodedCode = window.btoa(JSON.stringify(keysToEncode));

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(encodedCode);
      } else {
        setQuickPasteCode(encodedCode);
      }

      setCopiedBadge(true);
      window.setTimeout(() => setCopiedBadge(false), 2000);

      addToast(
        'success',
        'Đã Sao Chép Mã iPad (Base64)',
        'Hãy gửi chuỗi mã này qua iPad và bấm "Dán Mã Nhanh" để đồng bộ tức thì.'
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Không thể mã hóa bộ khóa sang Base64.';
      addToast('error', 'Lỗi Tạo Mã iPad', msg);
    }
  }, [supabaseUrlInput, supabaseKeyInput, geminiKeyInput, addToast]);

  /**
   * Giải mã JSON.parse(atob(code)) chuẩn cho nút "Dán Mã Nhanh"
   */
  const handleQuickDecodePaste = useCallback(async (): Promise<void> => {
    try {
      let rawCode = quickPasteCode.trim();

      if (
        !rawCode &&
        navigator.clipboard &&
        typeof navigator.clipboard.readText === 'function'
      ) {
        try {
          rawCode = (await navigator.clipboard.readText()).trim();
        } catch {
          // Nếu trình duyệt chặn quyền đọc clipboard tự động, yêu cầu dán vào ô input
        }
      }

      if (!rawCode) {
        throw new Error(
          'Vui lòng dán chuỗi mã Base64 vào ô "Mã iPad" trước khi bấm Dán Mã Nhanh.'
        );
      }

      const decodedJsonString = window.atob(rawCode);
      const parsedObject: unknown = JSON.parse(decodedJsonString);

      if (!isValidCredentialsObject(parsedObject)) {
        throw new Error(
          'Cấu trúc mã Base64 không chứa đủ 3 trường supabaseUrl, supabaseKey, geminiKey.'
        );
      }

      const normalizedCreds: IUserCredentials = {
        supabaseUrl: sanitizeSupabaseBaseUrl(parsedObject.supabaseUrl),
        supabaseKey: parsedObject.supabaseKey.trim(),
        geminiKey: parsedObject.geminiKey.trim(),
      };

      cloudManager.validateSupabaseCredentials(normalizedCreds);
      cloudManager.validateGeminiCredentials(normalizedCreds);

      setSupabaseUrlInput(normalizedCreds.supabaseUrl);
      setSupabaseKeyInput(normalizedCreds.supabaseKey);
      setGeminiKeyInput(normalizedCreds.geminiKey);
      setCredentials(normalizedCreds);
      setQuickPasteCode('');

      addToast(
        'success',
        'Đã Nạp Mã iPad Thành Công',
        'Toàn bộ khóa Supabase & Gemini đã được đồng bộ hóa.'
      );
      void flushSyncQueue();
      void pullLatestFromCloud();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Mã Base64 không hợp lệ hoặc bị cắt cụt khi sao chép.';
      addToast('error', 'Giải Mã Thất Bại', msg);
    }
  }, [quickPasteCode, setCredentials, addToast, flushSyncQueue, pullLatestFromCloud]);

  const handleRestoreBootstrapKeys = useCallback((): void => {
    resetToDefaultCredentials();
    const restored = useAppStore.getState().credentials;
    setSupabaseUrlInput(restored.supabaseUrl);
    setSupabaseKeyInput(restored.supabaseKey);
    setGeminiKeyInput(restored.geminiKey);
    addToast(
      'info',
      'Đã Khôi Phục Key Mặc Định',
      'Đã nạp lại bộ khóa Supabase & Gemini gốc của hệ thống.'
    );
    void flushSyncQueue();
    void pullLatestFromCloud();
  }, [resetToDefaultCredentials, addToast, flushSyncQueue, pullLatestFromCloud]);

  return (
    <header className="w-full bg-surface border-b border-borderLight px-4 py-3 text-textPrimary">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-3">
        {/* Dòng trạng thái hệ thống & Omni-Sync Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-borderLight">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold uppercase tracking-wider bg-matcha text-textPrimary border border-borderLight rounded-sm">
              IELTS NUANCE OMNI-SYNC
            </span>
            <span className="text-xs font-medium text-mutedText">
              D3 Offline-First Engine • Botanical Flat 2D
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Trạng thái mạng */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-sm ${
                isOnline
                  ? 'bg-surface border-matcha text-textPrimary'
                  : 'bg-warningSurface border-warningFlat text-textPrimary'
              }`}
            >
              {isOnline ? (
                <Cloud className="w-3.5 h-3.5 text-matcha" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-warningFlat" />
              )}
              <span>{isOnline ? 'ONLINE' : 'OFFLINE QUEUE'}</span>
            </div>

            {/* Số bản ghi đang chờ trong syncQueue */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-background border border-borderLight rounded-sm">
              <span>Queue:</span>
              <strong className="font-bold">{pendingCount}</strong>
              <span>pending</span>
            </div>

            {/* Mốc thời gian đồng bộ gần nhất */}
            {lastSyncedAt && (
              <span className="text-xs font-mono text-mutedText hidden md:inline">
                Last Sync: {new Date(lastSyncedAt).toLocaleTimeString()}
              </span>
            )}

            {/* Nút cưỡng bức đồng bộ ngay */}
            <button
              type="button"
              onClick={() => {
                void flushSyncQueue();
                void pullLatestFromCloud();
              }}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng Bộ Ngay'}</span>
            </button>

            {/* Nút khôi phục bộ Key gốc của bạn */}
            <button
              type="button"
              onClick={handleRestoreBootstrapKeys}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-background text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
              title="Khôi phục bộ Key Supabase & Gemini mặc định"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Key Gốc</span>
            </button>
          </div>
        </div>

        {/* Form 3 Input tĩnh BYOK + Cụm mã hóa iPad */}
        <form
          onSubmit={handleApplyKeys}
          className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end"
        >
          {/* Input 1: Supabase URL */}
          <div className="lg:col-span-3 flex flex-col gap-1">
            <label
              htmlFor="byok-supabase-url"
              className="text-[11px] font-bold uppercase tracking-wider text-mutedText flex items-center gap-1"
            >
              <Database className="w-3 h-3" />
              <span>1. Supabase Project URL</span>
            </label>
            <input
              id="byok-supabase-url"
              type="text"
              value={supabaseUrlInput}
              onChange={(e) => setSupabaseUrlInput(e.target.value)}
              placeholder="https://xxx.supabase.co"
              className="w-full h-8 px-2.5 text-xs font-mono bg-background text-textPrimary border border-borderLight rounded-sm"
              required
            />
          </div>

          {/* Input 2: Supabase Anon Key */}
          <div className="lg:col-span-3 flex flex-col gap-1">
            <label
              htmlFor="byok-supabase-key"
              className="text-[11px] font-bold uppercase tracking-wider text-mutedText flex items-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              <span>2. Supabase Anon Key</span>
            </label>
            <input
              id="byok-supabase-key"
              type={showSecrets ? 'text' : 'password'}
              value={supabaseKeyInput}
              onChange={(e) => setSupabaseKeyInput(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              className="w-full h-8 px-2.5 text-xs font-mono bg-background text-textPrimary border border-borderLight rounded-sm"
              required
            />
          </div>

          {/* Input 3: Gemini API Key */}
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label
              htmlFor="byok-gemini-key"
              className="text-[11px] font-bold uppercase tracking-wider text-mutedText flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>3. Gemini API Key</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                id="byok-gemini-key"
                type={showSecrets ? 'text' : 'password'}
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full h-8 px-2.5 text-xs font-mono bg-background text-textPrimary border border-borderLight rounded-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowSecrets((prev) => !prev)}
                aria-label={showSecrets ? 'Ẩn khóa bí mật' : 'Hiện khóa bí mật'}
                className="h-8 px-2 bg-background border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 shrink-0"
              >
                {showSecrets ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Cụm nút Lưu + Copy Mã iPad + Dán Mã Nhanh */}
          <div className="lg:col-span-4 flex flex-wrap items-center gap-1.5">
            <button
              type="submit"
              className="h-8 px-3 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              Lưu Key
            </button>

            <button
              type="button"
              onClick={() => {
                void handleCopyIpadCode();
              }}
              className="h-8 px-2.5 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 inline-flex items-center gap-1"
            >
              {copiedBadge ? (
                <Check className="w-3.5 h-3.5 text-matcha" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>Copy Mã iPad</span>
            </button>

            <input
              type="text"
              value={quickPasteCode}
              onChange={(e) => setQuickPasteCode(e.target.value)}
              placeholder="Dán mã Base64..."
              aria-label="Ô nhập mã Base64 cho iPad"
              className="h-8 w-28 flex-1 min-w-[100px] px-2 text-xs font-mono bg-background text-textPrimary border border-borderLight rounded-sm"
            />

            <button
              type="button"
              onClick={() => {
                void handleQuickDecodePaste();
              }}
              className="h-8 px-2.5 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 inline-flex items-center gap-1 shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Dán Mã Nhanh</span>
            </button>
          </div>
        </form>
      </div>
    </header>
  );
};

export default CloudSyncBar;
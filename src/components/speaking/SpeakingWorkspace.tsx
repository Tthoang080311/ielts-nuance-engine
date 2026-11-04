'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, Sparkles, Volume2, BookmarkPlus, Check, RotateCcw } from 'lucide-react';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import { useDebounce } from '@/hooks/useDebounce';
import { IExerciseDraft, ISpeakingNaturalizerItem } from '@/types/database.types';

const INITIAL_SPEAKING_SCRIPT =
  'In my opinion, furthermore, governments must utilize all available financial resources to resolve traffic congestion. Thus, public transport systems will be improved significantly.';

export const SpeakingWorkspace: React.FC = () => {
  const geminiKey = useAppStore((s) => s.credentials.geminiKey);
  const upsertExerciseDraft = useAppStore((s) => s.upsertExerciseDraft);
  const addToast = useAppStore((s) => s.addToast);

  const [scriptText, setScriptText] = useState<string>(INITIAL_SPEAKING_SCRIPT);
  const [upgrades, setUpgrades] = useState<ISpeakingNaturalizerItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [elapsedTimerSeconds, setElapsedTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);

  // Timer đếm thời gian nói (05:00 max)
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = window.setInterval(() => {
        setElapsedTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  const debouncedScript = useDebounce<string>(scriptText, 600);

  const runNaturalizer = useCallback(
    async (textToProcess: string): Promise<void> => {
      const cleaned = textToProcess.trim();
      if (cleaned.length < 15) {
        setUpgrades([]);
        return;
      }

      if (!geminiKey || geminiKey.length < 15) {
        addToast(
          'warning',
          'Thiếu Gemini API Key',
          'Vui lòng nhập Gemini API Key trên thanh Cloud Sync Bar.'
        );
        return;
      }

      setIsAnalyzing(true);
      try {
        const response = await fetch('/api/speak-naturalizer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spokenText: cleaned, geminiKey: geminiKey.trim() }),
        });

        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error('Không thể phân tích kịch bản nói.');
        }

        if (Array.isArray(payload)) {
          setUpgrades(payload as ISpeakingNaturalizerItem[]);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Lỗi kết nối tới speak-naturalizer API.';
        addToast('error', 'Lỗi Speaking Naturalizer', msg);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [geminiKey, addToast]
  );

  useEffect(() => {
    if (debouncedScript.trim().length >= 15) {
      void runNaturalizer(debouncedScript);
    }
  }, [debouncedScript, runNaturalizer]);

  const handleSaveSpeakingToSRS = useCallback(
    (item: ISpeakingNaturalizerItem): void => {
      const nowIso = new Date().toISOString();
      const draftExercise: IExerciseDraft = {
        id: generateDeterministicUUID(),
        vocab_id: null,
        word_target: `[Speaking Phrasal] ${item.phrasalVerbUsed}`,
        academic_example: item.originalSnippet,
        speaking_example: item.suggestedText,
        user_rewrite: item.explanation,
        is_draft: true,
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        last_fluency_ms: 0,
        next_review_at: nowIso,
        sync_status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
      };

      upsertExerciseDraft(draftExercise);
      addToast(
        'success',
        'Đã Lưu Vào Kho SRS',
        `Phrasal Verb "${item.phrasalVerbUsed}" đã được đồng bộ vào hệ thống.`
      );
    },
    [upsertExerciseDraft, addToast]
  );

  const formatTimer = (totalSec: number): string => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* CỘT TRÁI: NHẬP SCRIPT & TIMER */}
      <div className="lg:col-span-6 flex flex-col gap-3 bg-surface border border-borderLight rounded-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-borderLight">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-textPrimary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Natural Speaking Script Lab
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-background border border-borderLight rounded-sm">
              Timer: {formatTimer(elapsedTimerSeconds)} / 05:00
            </span>
            <button
              type="button"
              onClick={() => setIsTimerRunning((prev) => !prev)}
              className="px-2.5 py-1 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              {isTimerRunning ? 'Dừng' : 'Bắt đầu nói'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsTimerRunning(false);
                setElapsedTimerSeconds(0);
              }}
              aria-label="Đặt lại bộ đếm giờ"
              className="p-1 bg-surface border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-mutedText leading-relaxed">
          Nhập câu trả lời IELTS Speaking Part 2/3 của bạn. Hệ thống sẽ lọc bỏ từ nối văn viết quá cứng nhắc (*moreover*, *thus*) và đề xuất **Phrasal Verbs** kèm ký hiệu ngắt nhịp `/` và `//`.
        </p>

        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          rows={12}
          placeholder="Nhập script nói của bạn tại đây..."
          className="w-full p-3 text-xs leading-relaxed bg-background text-textPrimary border border-borderLight rounded-sm font-sans"
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void runNaturalizer(scriptText)}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAnalyzing ? 'Đang phân tích...' : 'Lọc Phrasal Verbs'}</span>
          </button>
        </div>
      </div>

      {/* CỘT PHẢI: KẾT QUẢ NÂNG CẤP VĂN NÓI & RHYTHM CHUNKING */}
      <div className="lg:col-span-6 flex flex-col gap-3 bg-surface border border-borderLight rounded-sm p-4">
        <div className="pb-3 border-b border-borderLight flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-textPrimary" />
            <span>Spoken Upgrades & Rhythm Chunking ({upgrades.length})</span>
          </h3>
          <span className="text-[11px] font-mono text-mutedText">
            / = Nghỉ ngắn • // = Nghỉ chuyển ý
          </span>
        </div>

        <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
          {upgrades.length === 0 ? (
            <div className="p-6 bg-background border border-borderLight rounded-sm text-center text-xs text-mutedText">
              {isAnalyzing
                ? 'AI đang tìm từ overly formal để thay thế...'
                : 'Chưa phát hiện từ cần chuyển đổi sang văn nói.'}
            </div>
          ) : (
            upgrades.map((item, idx) => (
              <article
                key={`${item.startIndex}-${idx}`}
                className="p-3 bg-background border border-borderLight rounded-sm flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-matchaLight border border-matcha rounded-sm">
                    Phrasal Verb: {item.phrasalVerbUsed}
                  </span>
                  <span className="text-[11px] text-mutedText">Formal: {item.overlyFormalWord}</span>
                </div>

                <div className="p-2 bg-surface border border-matcha rounded-sm text-xs">
                  <span className="font-bold uppercase text-[10px] block text-mutedText">
                    Nâng cấp văn nói (Có nhịp ngắt / và //):
                  </span>
                  <p className="mt-1 font-mono font-bold text-textPrimary text-sm">
                    {item.suggestedText}
                  </p>
                </div>

                <p className="text-xs text-mutedText">
                  <strong>Giải thích: </strong> {item.explanation}
                </p>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleSaveSpeakingToSRS(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>+ Lưu vào kho SRS</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeakingWorkspace;
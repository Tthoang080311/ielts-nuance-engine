'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic,
  Sparkles,
  Volume2,
  BookmarkPlus,
  Check,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import { useDebounce } from '@/hooks/useDebounce';
import { IExerciseDraft, ISpeakingNaturalizerItem } from '@/types/database.types';

const SAMPLE_PROMPTS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: 'Chủ đề Giáo dục (Câu của bạn)',
    text: 'In my opinion, I think that people should go to school rather than self learning.',
  },
  {
    label: 'Chủ đề Giao thông & Chính sách',
    text: 'In my opinion, furthermore, governments must utilize all available financial resources to resolve traffic congestion. Thus, public transport systems will be improved significantly.',
  },
  {
    label: 'Chủ đề Công nghệ & Đời sống',
    text: 'I think that smartphones are very important because people utilize them every day, and it is very hard to live without the internet.',
  },
];

/**
 * Hiển thị trực quan dấu ngắt nhịp `/` (nghỉ ngắn) và `//` (nghỉ chuyển ý) thành các badge màu dễ luyện đọc
 */
const RhythmChunkRenderer: React.FC<{ text: string }> = React.memo(({ text }) => {
  const tokens = text.split(/(\/\/|\/)/g);
  return (
    <p className="mt-1 font-mono text-sm leading-relaxed text-textPrimary flex flex-wrap items-center gap-1">
      {tokens.map((token, idx) => {
        if (token === '//') {
          return (
            <span
              key={idx}
              title="Nghỉ dài chuyển ý (0.8 giây) & hạ giọng"
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-warningSurface text-warningFlat border border-warningFlat rounded-sm"
            >
              // nghỉ 0.8s
            </span>
          );
        }
        if (token === '/') {
          return (
            <span
              key={idx}
              title="Nghỉ lấy hơi ngắn (0.3 giây)"
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-matchaLight text-textPrimary border border-matcha rounded-sm"
            >
              / nghỉ 0.3s
            </span>
          );
        }
        return (
          <span key={idx} className="font-semibold">
            {token.trim()}
          </span>
        );
      })}
    </p>
  );
});

RhythmChunkRenderer.displayName = 'RhythmChunkRenderer';

export const SpeakingWorkspace: React.FC = () => {
  const geminiKey = useAppStore((s) => s.credentials.geminiKey);
  const upsertExerciseDraft = useAppStore((s) => s.upsertExerciseDraft);
  const addToast = useAppStore((s) => s.addToast);

  const [scriptText, setScriptText] = useState<string>(SAMPLE_PROMPTS[0].text);
  const [upgrades, setUpgrades] = useState<ISpeakingNaturalizerItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [elapsedTimerSeconds, setElapsedTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = window.setInterval(() => {
        setElapsedTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  const debouncedScript = useDebounce<string>(scriptText, 400);

  const runNaturalizer = useCallback(
    async (textToProcess: string): Promise<void> => {
      const cleaned = textToProcess.trim();
      if (cleaned.length < 8) {
        setUpgrades([]);
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
    if (debouncedScript.trim().length >= 8) {
      void runNaturalizer(debouncedScript);
    }
  }, [debouncedScript, runNaturalizer]);

  /**
   * Đọc phát âm mẫu câu nâng cấp bằng Web Speech API (ngắt nghỉ đúng nhịp / và //)
   */
  const handleSpeakAloud = useCallback(
    (textWithMarkers: string): void => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        addToast('warning', 'Trình duyệt không hỗ trợ TTS', 'Thiết bị của bạn không hỗ trợ đọc âm thanh.');
        return;
      }
      window.speechSynthesis.cancel();
      const naturalPauseText = textWithMarkers
        .replace(/\/\//g, ' ... ')
        .replace(/\//g, ' , ');
      const utterance = new SpeechSynthesisUtterance(naturalPauseText);
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    },
    [addToast]
  );

  /**
   * Áp dụng thay thế trực tiếp cụm từ văn nói vào kịch bản bên trái
   */
  const handleApplyUpgrade = useCallback(
    (item: ISpeakingNaturalizerItem): void => {
      const cleanSuggested = item.suggestedText
        .replace(/\s*\/\/\s*/g, ', ')
        .replace(/\s*\/\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      setScriptText((current) => {
        const idx = current.indexOf(item.originalSnippet);
        if (idx !== -1) {
          return (
            current.slice(0, idx) +
            cleanSuggested +
            current.slice(idx + item.originalSnippet.length)
          );
        }
        return cleanSuggested;
      });

      addToast(
        'success',
        'Đã Thay Thế Diễn Đạt Văn Nói',
        `Đã áp dụng "${item.phrasalVerbUsed}" vào kịch bản của bạn.`
      );
    },
    [addToast]
  );

  const handleSaveSpeakingToSRS = useCallback(
    (item: ISpeakingNaturalizerItem): void => {
      const nowIso = new Date().toISOString();
      const draftExercise: IExerciseDraft = {
        id: generateDeterministicUUID(),
        vocab_id: null,
        word_target: `[Speaking] ${item.phrasalVerbUsed}`,
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
        `Cụm "${item.phrasalVerbUsed}" đã được đưa vào Đấu trường phản xạ SRS.`
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
      {/* CỘT TRÁI: NHẬP SCRIPT & BỘ MẪU CÂU TEST NHANH */}
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

        {/* Các nút nạp câu mẫu nhanh */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase text-mutedText">
            Nạp nhanh câu thử nghiệm:
          </span>
          {SAMPLE_PROMPTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setScriptText(sample.text)}
              className="px-2 py-1 text-[11px] font-semibold bg-background text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              {sample.label}
            </button>
          ))}
        </div>

        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          rows={11}
          placeholder="Nhập câu trả lời IELTS Speaking của bạn tại đây. Hệ thống sẽ tự động bắt lỗi lặp từ Vietlish, động từ B1 yếu và nâng cấp lên Phrasal Verbs Band 8.0+..."
          className="w-full p-3 text-sm leading-relaxed bg-background text-textPrimary border border-borderLight rounded-sm font-sans"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-mutedText">
            {isAnalyzing
              ? '⚡ Đang phẫu thuật từ vựng & chèn nhịp ngắt...'
              : `✓ Đã phát hiện ${upgrades.length} điểm nâng cấp Band 8.0+`}
          </span>

          <button
            type="button"
            onClick={() => void runNaturalizer(scriptText)}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAnalyzing ? 'Đang phân tích...' : 'Phẫu Thuật Câu Nói Ngay'}</span>
          </button>
        </div>
      </div>

      {/* CỘT PHẢI: KẾT QUẢ PHẪU THUẬT VĂN NÓI, NGHE TTS & RHYTHM CHUNKING */}
      <div className="lg:col-span-6 flex flex-col gap-3 bg-surface border border-borderLight rounded-sm p-4">
        <div className="pb-3 border-b border-borderLight flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-textPrimary" />
            <span>Spoken Upgrades & Rhythm Chunking ({upgrades.length})</span>
          </h3>
          <span className="text-[11px] font-mono text-mutedText">
            / = Nghỉ 0.3s • // = Nhấn chuyển ý 0.8s
          </span>
        </div>

        <div className="flex flex-col gap-3 max-h-[540px] overflow-y-auto pr-1">
          {upgrades.length === 0 ? (
            <div className="p-6 bg-background border border-borderLight rounded-sm text-center text-xs text-mutedText">
              Hãy nhập ít nhất một câu tiếng Anh vào ô bên trái để hệ thống phân tích.
            </div>
          ) : (
            upgrades.map((item, idx) => (
              <article
                key={`${item.startIndex}-${idx}`}
                className="p-3 bg-background border border-borderLight rounded-sm flex flex-col gap-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-matcha text-textPrimary border border-textPrimary rounded-sm">
                    ★ Upgrade: {item.phrasalVerbUsed}
                  </span>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-warningSurface text-textPrimary border border-warningFlat rounded-sm">
                    {item.overlyFormalWord}
                  </span>
                </div>

                {/* Câu gốc bị gạch ngang */}
                <div className="p-2 bg-dangerSurface border border-dangerFlat rounded-sm text-xs">
                  <span className="font-bold uppercase text-[10px] block text-dangerFlat">
                    Cụm gốc của bạn:
                  </span>
                  <p className="mt-0.5 line-through text-textPrimary">
                    {item.originalSnippet}
                  </p>
                </div>

                {/* Câu nâng cấp kèm thẻ nhịp điệu trực quan */}
                <div className="p-2.5 bg-surface border border-matcha rounded-sm text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold uppercase text-[10px] text-mutedText">
                      Diễn đạt Band 8.0+ (Kèm nhịp thở):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSpeakAloud(item.suggestedText)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-background text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>🔊 Nghe Mẫu</span>
                    </button>
                  </div>
                  <RhythmChunkRenderer text={item.suggestedText} />
                </div>

                <p className="text-xs text-mutedText leading-relaxed">
                  <strong className="text-textPrimary">Phân tích chấm điểm: </strong>
                  {item.explanation}
                </p>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-borderLight">
                  <button
                    type="button"
                    onClick={() => handleSaveSpeakingToSRS(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>+ Lưu vào kho SRS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyUpgrade(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Áp Dụng Vào Script</span>
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

'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Sparkles,
  Check,
  BookmarkPlus,
  FileText,
  AlertCircle,
  Wand2,
  RotateCcw,
} from 'lucide-react';
import { RealTimeClock } from '@/components/writing/RealTimeClock';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import {
  HighlightCategory,
  IAcademicCritiqueItem,
  IExerciseDraft,
} from '@/types/database.types';

const LOCAL_ESSAY_DRAFT_KEY = 'ielts-nuance-writing-draft-v1';

const DEFAULT_TASK2_PROMPT =
  'Some people believe that governments should always allocate maximum funding to technological research and never subsidize traditional arts. To what extent do you agree or disagree?';

const INITIAL_SAMPLE_ESSAY =
  'People always think that modern technology is the only factor that drives economic prosperity. Governments never consider how cultural heritage shapes national identity when they cut arts budgets. Furthermore, because cities grow very fast and people move from rural areas to urban centers, social cohesion becomes weak.';

interface IMemoizedEssayTextareaProps {
  value: string;
  onChange: (nextValue: string) => void;
}

/**
 * Textarea Editor được bọc trong React.memo để cô lập chu kỳ render 60FPS.
 * Khi danh sách AI Critique hoặc đồng hồ cập nhật ở component ngoài,
 * vùng gõ văn bản tuyệt đối không bị giật lag.
 */
const MemoizedEssayTextarea: React.FC<IMemoizedEssayTextareaProps> = React.memo(
  ({ value, onChange }) => {
    const handleTextChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        onChange(e.target.value);
      },
      [onChange]
    );

    return (
      <textarea
        value={value}
        onChange={handleTextChange}
        spellCheck={false}
        placeholder="Nhập bài viết IELTS Writing Task 2 của bạn tại đây. Hệ thống sẽ tự động phân tích sau 500ms ngừng gõ..."
        className="w-full h-[460px] p-4 text-sm leading-relaxed bg-background text-textPrimary border border-borderLight rounded-sm resize-y font-sans"
      />
    );
  }
);

MemoizedEssayTextarea.displayName = 'MemoizedEssayTextarea';

function getHighlightBadgeStyle(category: HighlightCategory): string {
  switch (category) {
    case 'Hedging':
      return 'bg-warningSurface border-warningFlat text-textPrimary';
    case 'Nominalization':
      return 'bg-matchaLight border-matcha text-textPrimary';
    case 'Inversion':
      return 'bg-surface border-textPrimary text-textPrimary';
    case 'Cohesion':
    default:
      return 'bg-background border-borderLight text-textPrimary';
  }
}

function isAcademicCritiqueArray(data: unknown): data is IAcademicCritiqueItem[] {
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const rec = item as Record<string, unknown>;
    return (
      typeof rec.originalSnippet === 'string' &&
      (rec.highlightType === 'Nominalization' ||
        rec.highlightType === 'Inversion' ||
        rec.highlightType === 'Hedging' ||
        rec.highlightType === 'Cohesion') &&
      typeof rec.suggestedText === 'string' &&
      typeof rec.explanation === 'string' &&
      typeof rec.startIndex === 'number' &&
      typeof rec.endIndex === 'number'
    );
  });
}

export const WritingWorkspace: React.FC = () => {
  const geminiKey = useAppStore((s) => s.credentials.geminiKey);
  const upsertExerciseDraft = useAppStore((s) => s.upsertExerciseDraft);
  const addToast = useAppStore((s) => s.addToast);

  const [essayPrompt, setEssayPrompt] = useState<string>(DEFAULT_TASK2_PROMPT);
  const [essayText, setEssayText] = useState<string>(INITIAL_SAMPLE_ESSAY);
  const [critiques, setCritiques] = useState<IAcademicCritiqueItem[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    HighlightCategory | 'ALL'
  >('ALL');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [lastAnalyzedHash, setLastAnalyzedHash] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);

  // Khôi phục bản nháp bài luận khi nhấn F5
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const savedDraft = window.localStorage.getItem(LOCAL_ESSAY_DRAFT_KEY);
      if (savedDraft && savedDraft.trim().length > 0) {
        setEssayText(savedDraft);
      }
    } catch {
      // An toàn nếu localStorage bị khóa
    }
  }, []);

  const handleEssayChange = useCallback((nextValue: string): void => {
    setEssayText(nextValue);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_ESSAY_DRAFT_KEY, nextValue);
      } catch {
        // Không làm gián đoạn luồng gõ 60fps
      }
    }
  }, []);

  // Debounce 500ms theo đúng thiết kế kiến trúc
  const debouncedEssayText = useDebounce<string>(essayText, 500);

  const wordCount = useMemo((): number => {
    const trimmed = essayText.trim();
    if (!trimmed) {
      return 0;
    }
    return trimmed.split(/\s+/).length;
  }, [essayText]);

  const sentenceCount = useMemo((): number => {
    const trimmed = essayText.trim();
    if (!trimmed) {
      return 0;
    }
    return trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  }, [essayText]);

  const runAcademicGrader = useCallback(
    async (textToGrade: string, forceRun: boolean = false): Promise<void> => {
      const cleaned = textToGrade.trim();
      if (cleaned.length < 25) {
        setCritiques([]);
        return;
      }

      if (!forceRun && cleaned === lastAnalyzedHash) {
        return;
      }

      if (!geminiKey || geminiKey.trim().length < 15) {
        addToast(
          'warning',
          'Thiếu Gemini API Key',
          'Vui lòng kiểm tra Gemini API Key trên thanh Cloud Sync Bar để chấm tự động.'
        );
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsAnalyzing(true);

      try {
        const response = await fetch('/api/academic-grader', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            essayText: cleaned,
            geminiKey: geminiKey.trim(),
          }),
          signal: controller.signal,
        });

        const payload: unknown = await response.json();

        if (!response.ok) {
          const errorMessage =
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof (payload as Record<string, unknown>).error === 'string'
              ? ((payload as Record<string, unknown>).error as string)
              : `HTTP ${response.status}: Không thể phân tích bài viết.`;
          throw new Error(errorMessage);
        }

        if (!isAcademicCritiqueArray(payload)) {
          throw new Error('Dữ liệu trả về từ AI không khớp JSON Schema chuẩn.');
        }

        setCritiques(payload);
        setLastAnalyzedHash(cleaned);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Lỗi kết nối tới Edge API /api/academic-grader.';
        addToast('error', 'Lỗi AI Academic Grader', message);
      } finally {
        if (abortControllerRef.current === controller) {
          setIsAnalyzing(false);
        }
      }
    },
    [geminiKey, lastAnalyzedHash, addToast]
  );

  // Tự động gọi AI sau 500ms ngừng gõ
  useEffect(() => {
    const cleaned = debouncedEssayText.trim();
    if (cleaned.length >= 25 && cleaned !== lastAnalyzedHash) {
      void runAcademicGrader(cleaned, false);
    }
  }, [debouncedEssayText, lastAnalyzedHash, runAcademicGrader]);

  /**
   * Áp dụng gợi ý sửa câu trực tiếp vào văn bản gốc dựa trên tọa độ hoặc đối sánh chuỗi
   */
  const handleApplySuggestion = useCallback(
    (item: IAcademicCritiqueItem): void => {
      setEssayText((currentText) => {
        let updatedText = currentText;
        const sliceCandidate = currentText.slice(item.startIndex, item.endIndex);

        if (sliceCandidate === item.originalSnippet) {
          updatedText =
            currentText.slice(0, item.startIndex) +
            item.suggestedText +
            currentText.slice(item.endIndex);
        } else {
          const fallbackIdx = currentText.indexOf(item.originalSnippet);
          if (fallbackIdx !== -1) {
            updatedText =
              currentText.slice(0, fallbackIdx) +
              item.suggestedText +
              currentText.slice(fallbackIdx + item.originalSnippet.length);
          }
        }

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(LOCAL_ESSAY_DRAFT_KEY, updatedText);
          } catch {
            // Bỏ qua lỗi ghi storage
          }
        }
        return updatedText;
      });

      setCritiques((prev) =>
        prev.filter((c) => c.originalSnippet !== item.originalSnippet)
      );

      addToast(
        'success',
        `Đã Nâng Cấp ${item.highlightType}`,
        'Cấu trúc học thuật Band 8.5+ đã được thay thế trực tiếp vào bài luận.'
      );
    },
    [addToast]
  );

  /**
   * Lưu cấu trúc nâng cấp vào kho thẻ ôn tập SRS (Optimistic UI -> Zustand -> syncQueue -> Supabase)
   */
  const handleSaveToSRSVault = useCallback(
    (item: IAcademicCritiqueItem): void => {
      const nowIso = new Date().toISOString();
      const draftExercise: IExerciseDraft = {
        id: generateDeterministicUUID(),
        vocab_id: null,
        word_target: `[${item.highlightType}] ${item.originalSnippet.slice(0, 48)}`,
        academic_example: item.suggestedText,
        speaking_example: item.explanation,
        user_rewrite: item.originalSnippet,
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
        'Đã Lưu Vào Kho SRS (Offline-First)',
        `Thẻ "${item.highlightType}" đã được ghi vào LocalStorage và đẩy lên hàng đợi đồng bộ Supabase.`
      );
    },
    [upsertExerciseDraft, addToast]
  );

  const filteredCritiques = useMemo((): IAcademicCritiqueItem[] => {
    if (activeCategoryFilter === 'ALL') {
      return critiques;
    }
    return critiques.filter((item) => item.highlightType === activeCategoryFilter);
  }, [critiques, activeCategoryFilter]);

  const handleTimeExpired = useCallback((): void => {
    addToast(
      'warning',
      'Hết Thời Gian 40 Phút Làm Bài',
      'Đồng hồ mô phỏng phòng thi IELTS Writing Task 2 đã kết thúc.'
    );
  }, [addToast]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* CỘT TRÁI (7 CỘT): ĐỒNG HỒ 40 PHÚT + ĐỀ BÀI + EDITOR 60FPS */}
      <div className="lg:col-span-7 flex flex-col gap-3 bg-surface border border-borderLight rounded-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-borderLight">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-textPrimary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              IELTS Writing Task 2 • 60FPS Offline Editor
            </h2>
          </div>

          <RealTimeClock onTimeExpired={handleTimeExpired} />
        </div>

        {/* Đề bài Task 2 */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="task2-prompt-input"
            className="text-[11px] font-bold uppercase tracking-wider text-mutedText"
          >
            Chủ đề bài luận (Task 2 Prompt):
          </label>
          <input
            id="task2-prompt-input"
            type="text"
            value={essayPrompt}
            onChange={(e) => setEssayPrompt(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-background text-textPrimary border border-borderLight rounded-sm"
          />
        </div>

        {/* Trình soạn thảo bọc React.memo */}
        <MemoizedEssayTextarea value={essayText} onChange={handleEssayChange} />

        {/* Thanh thống kê số từ & nút chấm cưỡng bức */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-borderLight">
          <div className="flex items-center gap-3 text-xs font-mono">
            <span
              className={`px-2 py-1 border rounded-sm font-bold ${
                wordCount >= 250
                  ? 'bg-matchaLight border-matcha text-textPrimary'
                  : 'bg-background border-borderLight text-textPrimary'
              }`}
            >
              Words: {wordCount} / 250+
            </span>
            <span className="px-2 py-1 bg-background border border-borderLight rounded-sm">
              Sentences: {sentenceCount}
            </span>
            <span className="text-mutedText">
              {isAnalyzing ? '⚡ Gemini 3.8 Flash đang chấm...' : '✓ Tự động lưu F5'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleEssayChange(INITIAL_SAMPLE_ESSAY)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-background text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Nạp Bài Mẫu Test Lỗi</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void runAcademicGrader(essayText, true);
              }}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAnalyzing ? 'Đang Chấm...' : 'Chấm Nuance Ngay'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CỘT PHẢI (5 CỘT): BẢNG PHẨU THUẬT CÂU & CHẨN ĐOÁN BAND 8.5+ */}
      <div className="lg:col-span-5 flex flex-col gap-3 bg-surface border border-borderLight rounded-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-borderLight">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-textPrimary" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              AI Nuance Surgery ({filteredCritiques.length})
            </h3>
          </div>

          {/* Bộ lọc theo loại lỗi học thuật */}
          <div className="flex flex-wrap items-center gap-1">
            {(['ALL', 'Nominalization', 'Hedging', 'Inversion', 'Cohesion'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2 py-0.5 text-[11px] font-bold border rounded-sm transition-colors duration-150 ${
                    activeCategoryFilter === cat
                      ? 'bg-matcha border-textPrimary text-textPrimary'
                      : 'bg-background border-borderLight text-mutedText hover:bg-matchaLight'
                  }`}
                >
                  {cat}
                </button>
              )
            )}
          </div>
        </div>

        {/* Danh sách các thẻ chẩn đoán */}
        <div className="flex flex-col gap-3 max-h-[540px] overflow-y-auto pr-1">
          {filteredCritiques.length === 0 ? (
            <div className="p-6 bg-background border border-borderLight rounded-sm text-center flex flex-col items-center gap-2">
              <AlertCircle className="w-5 h-5 text-mutedText" />
              <p className="text-xs font-semibold text-textPrimary">
                {isAnalyzing
                  ? 'Đang quét cấu trúc Nominalization, Inversion, Hedging & Cohesion...'
                  : 'Chưa có phát hiện cần nâng cấp hoặc văn bản quá ngắn.'}
              </p>
              <p className="text-[11px] text-mutedText">
                Hãy thử viết câu có từ tuyệt đối (&quot;always&quot;, &quot;never&quot;) hoặc mệnh đề dài để AI tự động phẫu thuật sau 500ms.
              </p>
            </div>
          ) : (
            filteredCritiques.map((item, idx) => (
              <article
                key={`${item.startIndex}-${item.endIndex}-${idx}`}
                className="p-3 bg-background border border-borderLight rounded-sm flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-bold uppercase border rounded-sm ${getHighlightBadgeStyle(
                      item.highlightType
                    )}`}
                  >
                    {item.highlightType}
                  </span>
                  <span className="text-[11px] font-mono text-mutedText">
                    char [{item.startIndex}:{item.endIndex}]
                  </span>
                </div>

                {/* Câu gốc của học viên */}
                <div className="p-2 bg-dangerSurface border border-dangerFlat rounded-sm text-xs">
                  <span className="font-bold uppercase text-[10px] block text-dangerFlat">
                    Bản gốc (Cần nâng cấp):
                  </span>
                  <p className="mt-0.5 line-through text-textPrimary">
                    {item.originalSnippet}
                  </p>
                </div>

                {/* Câu nâng cấp Band 8.5+ */}
                <div className="p-2 bg-surface border border-matcha rounded-sm text-xs">
                  <span className="font-bold uppercase text-[10px] block text-mutedText">
                    Đề xuất Band 8.5+ ({item.highlightType}):
                  </span>
                  <p className="mt-0.5 font-semibold text-textPrimary">
                    {item.suggestedText}
                  </p>
                </div>

                {/* Giải thích học thuật */}
                <p className="text-xs text-mutedText leading-relaxed">
                  <strong className="text-textPrimary">Phân tích: </strong>
                  {item.explanation}
                </p>

                {/* Cụm nút hành động */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSaveToSRSVault(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>+ Lưu vào kho SRS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplySuggestion(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Áp Dụng Thay Thế</span>
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

export default WritingWorkspace;
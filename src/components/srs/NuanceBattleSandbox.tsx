'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Zap,
  Timer,
  Eye,
  CheckCircle2,
  RotateCcw,
  Flame,
  Layers,
} from 'lucide-react';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import { evaluateSM2 } from '@/lib/sm2Engine';
import { ActionBar } from '@/components/srs/ActionBar';
import { IExerciseDraft, ISRSLog, SM2QualityRating } from '@/types/database.types';

const MAX_RECORDED_FLUENCY_MS = 120000;

function getFluencyTierBadge(ms: number): { label: string; style: string } {
  if (ms <= 2500) {
    return {
      label: '⚡ Phản xạ Bản xứ (Native Reflex)',
      style: 'bg-matcha text-textPrimary border-textPrimary',
    };
  }
  if (ms <= 5500) {
    return {
      label: '✓ Phản xạ Khá (Band 7.5 Pace)',
      style: 'bg-matchaLight text-textPrimary border-matcha',
    };
  }
  return {
    label: '⚠ Ngập ngừng (Cần luyện tốc độ)',
    style: 'bg-warningSurface text-textPrimary border-warningFlat',
  };
}

export const NuanceBattleSandbox: React.FC = () => {
  const exercisesVault = useAppStore((s) => s.exercisesVault);
  const srsLogs = useAppStore((s) => s.srsLogs);
  const recordSRSReviewOptimistic = useAppStore((s) => s.recordSRSReviewOptimistic);
  const addToast = useAppStore((s) => s.addToast);

  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [measuredTimeMs, setMeasuredTimeMs] = useState<number>(0);
  const [practiceAllMode, setPracticeAllMode] = useState<boolean>(false);
  const [userAttemptInput, setUserAttemptInput] = useState<string>('');

  // Tham chiếu lưu mốc performance.now() chính xác tới micro-giây
  const startTimerRef = useRef<number>(0);

  /**
   * Lọc các thẻ từ exercises_vault có next_review_at <= NOW()
   * Nếu người dùng bật chế độ "Luyện Toàn Bộ Kho", hiển thị tất cả thẻ
   */
  const dueCards = useMemo((): IExerciseDraft[] => {
    const nowMs = Date.now();
    const filtered = exercisesVault.filter((card) => {
      if (practiceAllMode) {
        return true;
      }
      const dueTime = new Date(card.next_review_at).getTime();
      return Number.isNaN(dueTime) || dueTime <= nowMs;
    });

    return filtered.sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime()
    );
  }, [exercisesVault, practiceAllMode]);

  const currentCard: IExerciseDraft | undefined = dueCards[0];

  /**
   * ENGINE MICRO-TIMER:
   * Khởi tạo `const start = performance.now()` ngay khi thẻ hiện tại sẵn sàng ở mặt trước
   */
  useEffect(() => {
    if (!currentCard) {
      return;
    }
    const start = performance.now();
    startTimerRef.current = start;
    setIsFlipped(false);
    setMeasuredTimeMs(0);
    setUserAttemptInput('');
  }, [currentCard?.id]);

  /**
   * Khi user bấm lật thẻ, tính `timeSpentMs = Math.round(performance.now() - start)`
   */
  const handleFlipCard = useCallback((): void => {
    if (!currentCard || isFlipped) {
      return;
    }
    const rawElapsed = Math.round(performance.now() - startTimerRef.current);
    const timeSpentMs = Math.max(10, Math.min(rawElapsed, MAX_RECORDED_FLUENCY_MS));
    setMeasuredTimeMs(timeSpentMs);
    setIsFlipped(true);
  }, [currentCard, isFlipped]);

  /**
   * Xử lý chấm điểm SM-2, ghi đè chỉ số Fluency (`last_fluency_ms`) vào DB qua Optimistic Queue
   */
  const handleRateCard = useCallback(
    (quality: SM2QualityRating): void => {
      if (!currentCard || !isFlipped) {
        return;
      }

      const finalFluencyMs =
        measuredTimeMs > 0
          ? measuredTimeMs
          : Math.max(
              10,
              Math.min(
                Math.round(performance.now() - startTimerRef.current),
                MAX_RECORDED_FLUENCY_MS
              )
            );

      const sm2Result = evaluateSM2(
        quality,
        currentCard.repetitions,
        currentCard.ease_factor,
        currentCard.interval_days
      );

      const nowIso = new Date().toISOString();

      const updatedExercise: IExerciseDraft = {
        ...currentCard,
        user_rewrite: userAttemptInput.trim() || currentCard.user_rewrite,
        is_draft: false,
        ease_factor: sm2Result.nextEase,
        interval_days: sm2Result.nextInterval,
        repetitions: sm2Result.nextRepetitions,
        last_fluency_ms: finalFluencyMs,
        next_review_at: sm2Result.reviewDate,
        sync_status: 'pending',
        updated_at: nowIso,
      };

      const logEntry: ISRSLog = {
        id: generateDeterministicUUID(),
        exercise_id: currentCard.id,
        quality_rating: quality,
        time_spent_ms: finalFluencyMs,
        previous_interval: currentCard.interval_days,
        new_interval: sm2Result.nextInterval,
        previous_ease: currentCard.ease_factor,
        new_ease: sm2Result.nextEase,
        reviewed_at: nowIso,
        sync_status: 'pending',
        updated_at: nowIso,
      };

      recordSRSReviewOptimistic(updatedExercise, logEntry);

      addToast(
        'success',
        `Đã Chấm SM-2 (Phản xạ: ${finalFluencyMs}ms)`,
        `Lịch ôn tiếp theo: ${
          sm2Result.nextInterval === 0
            ? 'Sau 10 phút'
            : `${sm2Result.nextInterval} ngày tới`
        } • Ease: ${sm2Result.nextEase}`
      );
    },
    [
      currentCard,
      isFlipped,
      measuredTimeMs,
      userAttemptInput,
      recordSRSReviewOptimistic,
      addToast,
    ]
  );

  const averageFluencyMs = useMemo((): number => {
    if (srsLogs.length === 0) {
      return 0;
    }
    const sum = srsLogs.reduce((acc, item) => acc + item.time_spent_ms, 0);
    return Math.round(sum / srsLogs.length);
  }, [srsLogs]);

  return (
    <div className="w-full bg-surface border border-borderLight rounded-sm p-4 mb-4">
      {/* Header Thống kê SM-2 & Micro-Timer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-borderLight mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-textPrimary" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Nuance Battle Sandbox • SM-2 & Micro-Timer Engine
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 bg-matchaLight border border-matcha rounded-sm font-bold">
            Thẻ Đến Hạn: {dueCards.length} / {exercisesVault.length}
          </span>
          <span className="px-2.5 py-1 bg-background border border-borderLight rounded-sm">
            Avg Fluency: {averageFluencyMs > 0 ? `${averageFluencyMs}ms` : 'N/A'}
          </span>
          <button
            type="button"
            onClick={() => setPracticeAllMode((prev) => !prev)}
            className={`px-2.5 py-1 font-sans font-semibold border rounded-sm transition-colors duration-150 ${
              practiceAllMode
                ? 'bg-matcha border-textPrimary text-textPrimary'
                : 'bg-surface border-borderLight text-textPrimary hover:bg-matchaLight'
            }`}
          >
            {practiceAllMode ? 'Đang Mở: Toàn Bộ Kho' : 'Chế Độ: Chỉ Thẻ Đến Hạn'}
          </button>
        </div>
      </div>

      {/* Trạng thái hoàn thành toàn bộ thẻ đến hạn */}
      {!currentCard ? (
        <div className="p-8 bg-background border border-borderLight rounded-sm text-center flex flex-col items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-matcha" />
          <h4 className="text-sm font-bold uppercase tracking-wider">
            Tuyệt vời! Bạn đã hoàn thành toàn bộ thẻ đến hạn hôm nay.
          </h4>
          <p className="text-xs text-mutedText max-w-md">
            Bạn có thể tạo thêm câu mẫu mới từ trình AI Example Generator bên dưới hoặc bật chế độ ôn tập toàn bộ kho thẻ.
          </p>
          {exercisesVault.length > 0 && (
            <button
              type="button"
              onClick={() => setPracticeAllMode(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              <Layers className="w-4 h-4" />
              <span>Ôn Tập Toàn Bộ ({exercisesVault.length} Thẻ)</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Thông số Metadata của thẻ hiện tại */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-background border border-borderLight rounded-sm text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-textPrimary">
                Target: {currentCard.word_target}
              </span>
              <span className="text-mutedText">
                Reps: {currentCard.repetitions} • Interval: {currentCard.interval_days}d • EF:{' '}
                {Number(currentCard.ease_factor).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-textPrimary" />
              <span>
                Last Fluency:{' '}
                <strong>
                  {currentCard.last_fluency_ms > 0
                    ? `${currentCard.last_fluency_ms}ms`
                    : 'Chưa đo'}
                </strong>
              </span>
            </div>
          </div>

          {/* Mặt trước của thẻ: Thử thách phản xạ */}
          <div className="p-4 bg-background border border-borderLight rounded-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-mutedText flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-textPrimary" />
                <span>Mặt Trước: Kích Hoạt Phản Xạ Chủ Động</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  startTimerRef.current = performance.now();
                  setIsFlipped(false);
                  setMeasuredTimeMs(0);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-surface border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Micro-Timer</span>
              </button>
            </div>

            <p className="text-sm font-bold text-textPrimary">
              Hãy viết hoặc đọc to câu ứng dụng Band 8.5+ sử dụng mục tiêu:{' '}
              <span className="px-2 py-0.5 bg-matchaLight border border-matcha rounded-sm font-mono">
                {currentCard.word_target}
              </span>
            </p>

            {currentCard.user_rewrite && (
              <p className="text-xs text-mutedText">
                <strong>Gợi ý ngữ cảnh / Bản gốc: </strong>
                {currentCard.user_rewrite}
              </p>
            )}

            <input
              type="text"
              value={userAttemptInput}
              onChange={(e) => setUserAttemptInput(e.target.value)}
              placeholder="Gõ nhanh câu trả lời của bạn trước khi lật thẻ (Tùy chọn)..."
              className="w-full h-9 px-3 text-xs bg-surface text-textPrimary border border-borderLight rounded-sm"
            />

            {!isFlipped && (
              <button
                type="button"
                onClick={handleFlipCard}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 inline-flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>Lật Thẻ & Chốt Tốc Độ Phản Xạ (Micro-Timer)</span>
              </button>
            )}
          </div>

          {/* Mặt sau của thẻ: Hiển thị đáp án + Kết quả đo Micro-Timer + Thanh chấm ActionBar */}
          {isFlipped && (
            <div className="p-4 bg-surface border border-matcha rounded-sm flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-borderLight">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Mặt Sau • Đáp Án Chuẩn Học Thuật & Văn Nói
                </span>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-background border border-borderLight rounded-sm">
                    ⏱ Thời gian phản xạ: {measuredTimeMs} ms
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-bold border rounded-sm ${
                      getFluencyTierBadge(measuredTimeMs).style
                    }`}
                  >
                    {getFluencyTierBadge(measuredTimeMs).label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-background border border-borderLight rounded-sm">
                  <span className="text-[10px] font-bold uppercase text-mutedText block mb-1">
                    Academic Writing Example (Nominalization / Hedging):
                  </span>
                  <p className="font-semibold text-textPrimary leading-relaxed">
                    {currentCard.academic_example}
                  </p>
                </div>

                <div className="p-3 bg-background border border-borderLight rounded-sm">
                  <span className="text-[10px] font-bold uppercase text-mutedText block mb-1">
                    Natural Speaking Upgrade (Phrasal Verbs & / //):
                  </span>
                  <p className="font-mono text-textPrimary leading-relaxed">
                    {currentCard.speaking_example}
                  </p>
                </div>
              </div>

              {/* Thanh 4 nút chấm điểm SM-2 có bắt phím mũi tên toàn cục */}
              <ActionBar
                repetitions={currentCard.repetitions}
                easeFactor={currentCard.ease_factor}
                intervalDays={currentCard.interval_days}
                disabled={!isFlipped}
                onSelectRating={handleRateCard}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NuanceBattleSandbox;
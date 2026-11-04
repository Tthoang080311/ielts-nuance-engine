'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';

const FORTY_MINUTES_MS = 40 * 60 * 1000;

interface IRealTimeClockProps {
  onTimeExpired?: () => void;
}

function formatMillisecondsToMMSS(ms: number): {
  minutes: string;
  seconds: string;
  deciseconds: string;
  isCritical: boolean;
} {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const decis = Math.floor((clamped % 1000) / 100);

  return {
    minutes: String(mins).padStart(2, '0'),
    seconds: String(secs).padStart(2, '0'),
    deciseconds: String(decis),
    isCritical: clamped <= 5 * 60 * 1000, // Cảnh báo khi còn dưới 5 phút
  };
}

export const RealTimeClock: React.FC<IRealTimeClockProps> = React.memo(
  ({ onTimeExpired }) => {
    const [remainingMs, setRemainingMs] = useState<number>(FORTY_MINUTES_MS);
    const [isRunning, setIsRunning] = useState<boolean>(false);

    const rafIdRef = useRef<number | null>(null);
    const lastFrameTimestampRef = useRef<number | null>(null);
    const remainingMsRef = useRef<number>(FORTY_MINUTES_MS);
    const expiredTriggeredRef = useRef<boolean>(false);

    const stopLoop = useCallback((): void => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimestampRef.current = null;
    }, []);

    const tick = useCallback(
      (now: number): void => {
        if (lastFrameTimestampRef.current === null) {
          lastFrameTimestampRef.current = now;
        }

        const deltaMs = now - lastFrameTimestampRef.current;
        lastFrameTimestampRef.current = now;

        const nextRemaining = Math.max(0, remainingMsRef.current - deltaMs);
        remainingMsRef.current = nextRemaining;

        // Cập nhật state hiển thị mượt mà
        setRemainingMs(nextRemaining);

        if (nextRemaining <= 0) {
          setIsRunning(false);
          stopLoop();
          if (!expiredTriggeredRef.current && onTimeExpired) {
            expiredTriggeredRef.current = true;
            onTimeExpired();
          }
          return;
        }

        rafIdRef.current = window.requestAnimationFrame(tick);
      },
      [onTimeExpired, stopLoop]
    );

    useEffect(() => {
      if (isRunning) {
        lastFrameTimestampRef.current = performance.now();
        rafIdRef.current = window.requestAnimationFrame(tick);
      } else {
        stopLoop();
      }

      return () => {
        stopLoop();
      };
    }, [isRunning, tick, stopLoop]);

    const handleToggleRun = useCallback((): void => {
      if (remainingMsRef.current <= 0) {
        remainingMsRef.current = FORTY_MINUTES_MS;
        expiredTriggeredRef.current = false;
        setRemainingMs(FORTY_MINUTES_MS);
      }
      setIsRunning((prev) => !prev);
    }, []);

    const handleReset = useCallback((): void => {
      setIsRunning(false);
      stopLoop();
      remainingMsRef.current = FORTY_MINUTES_MS;
      expiredTriggeredRef.current = false;
      setRemainingMs(FORTY_MINUTES_MS);
    }, [stopLoop]);

    const { minutes, seconds, deciseconds, isCritical } =
      formatMillisecondsToMMSS(remainingMs);

    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-sm transition-colors duration-150 ${
          isCritical
            ? 'bg-dangerSurface border-dangerFlat text-textPrimary'
            : 'bg-background border-borderLight text-textPrimary'
        }`}
      >
        <Clock className="w-4 h-4 text-textPrimary shrink-0" />
        <div
          className="font-mono text-sm font-bold tracking-wider min-w-[82px]"
          aria-label="Đồng hồ đếm ngược 40 phút"
        >
          <span>{minutes}</span>
          <span>:</span>
          <span>{seconds}</span>
          <span className="text-xs text-mutedText">.{deciseconds}</span>
        </div>

        <button
          type="button"
          onClick={handleToggleRun}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
        >
          {isRunning ? (
            <>
              <Pause className="w-3 h-3" />
              <span>Tạm dừng</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              <span>Bắt đầu</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleReset}
          aria-label="Đặt lại 40 phút"
          className="p-1 bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }
);

RealTimeClock.displayName = 'RealTimeClock';

export default RealTimeClock;
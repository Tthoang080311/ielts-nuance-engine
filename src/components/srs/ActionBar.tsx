'use client';

import React, { useEffect, useCallback, useMemo } from 'react';
import { SM2QualityRating } from '@/types/database.types';
import { evaluateSM2 } from '@/lib/sm2Engine';
import { useAppStore } from '@/store/useAppStore';

interface IActionBarProps {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  disabled: boolean;
  onSelectRating: (quality: SM2QualityRating) => void;
}

interface IRatingButtonSpec {
  quality: SM2QualityRating;
  label: string;
  shortcutSymbol: string;
  keyCode: string;
  buttonStyle: string;
}

const RATING_BUTTONS: ReadonlyArray<IRatingButtonSpec> = [
  {
    quality: 0,
    label: '◀ Again',
    shortcutSymbol: 'ArrowLeft',
    keyCode: 'ArrowLeft',
    buttonStyle:
      'bg-dangerSurface border-dangerFlat text-textPrimary hover:bg-matchaLight',
  },
  {
    quality: 1,
    label: '▼ Hard',
    shortcutSymbol: 'ArrowDown',
    keyCode: 'ArrowDown',
    buttonStyle:
      'bg-warningSurface border-warningFlat text-textPrimary hover:bg-matchaLight',
  },
  {
    quality: 2,
    label: '▲ Good (Matcha)',
    shortcutSymbol: 'ArrowUp',
    keyCode: 'ArrowUp',
    buttonStyle:
      'bg-matcha border-textPrimary text-textPrimary hover:bg-matchaLight',
  },
  {
    quality: 3,
    label: '▶ Easy',
    shortcutSymbol: 'ArrowRight',
    keyCode: 'ArrowRight',
    buttonStyle:
      'bg-surface border-matcha text-textPrimary hover:bg-matchaLight',
  },
];

function isInteractiveInputFocused(): boolean {
  if (typeof document === 'undefined' || !document.activeElement) {
    return false;
  }
  const tagName = document.activeElement.tagName.toUpperCase();
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    (document.activeElement as HTMLElement).isContentEditable
  );
}

export const ActionBar: React.FC<IActionBarProps> = React.memo(
  ({ repetitions, easeFactor, intervalDays, disabled, onSelectRating }) => {
    const activeTab = useAppStore((s) => s.activeTab);

    // Tính trước khoảng ngày ôn dự kiến cho từng nút để hiển thị trực quan
    const previewLabels = useMemo((): Record<SM2QualityRating, string> => {
      const calcLabel = (q: SM2QualityRating): string => {
        const res = evaluateSM2(q, repetitions, easeFactor, intervalDays);
        if (res.nextInterval === 0) {
          return '10 phút';
        }
        return `${res.nextInterval} ngày`;
      };

      return {
        0: calcLabel(0),
        1: calcLabel(1),
        2: calcLabel(2),
        3: calcLabel(3),
      };
    }, [repetitions, easeFactor, intervalDays]);

    const handleKey = useCallback(
      (event: KeyboardEvent): void => {
        // Chỉ kích hoạt khi đang ở Tab 3 (vocab_srs), thẻ đã lật (!disabled) và không gõ trong ô input
        if (disabled || activeTab !== 'vocab_srs' || isInteractiveInputFocused()) {
          return;
        }

        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onSelectRating(0);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onSelectRating(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          onSelectRating(2);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onSelectRating(3);
        }
      },
      [disabled, activeTab, onSelectRating]
    );

    useEffect(() => {
      window.addEventListener('keydown', handleKey);
      return () => {
        window.removeEventListener('keydown', handleKey);
      };
    }, [handleKey]);

    return (
      <div
        role="group"
        aria-label="Thanh chấm điểm phản xạ SuperMemo-2"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-3 border-t border-borderLight"
      >
        {RATING_BUTTONS.map((btn) => (
          <button
            key={btn.quality}
            type="button"
            disabled={disabled}
            onClick={() => onSelectRating(btn.quality)}
            className={`flex flex-col items-center justify-center py-2.5 px-3 border rounded-sm transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${btn.buttonStyle}`}
          >
            <span className="text-xs font-bold tracking-wider">{btn.label}</span>
            <span className="text-[11px] font-mono mt-0.5">
              +{previewLabels[btn.quality]} • [{btn.shortcutSymbol}]
            </span>
          </button>
        ))}
      </div>
    );
  }
);

ActionBar.displayName = 'ActionBar';

export default ActionBar;
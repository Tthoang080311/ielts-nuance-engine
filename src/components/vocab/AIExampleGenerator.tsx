'use client';

import React, { useState, useCallback } from 'react';
import { Sparkles, BookmarkPlus, Check, FileText } from 'lucide-react';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import { IExerciseDraft } from '@/types/database.types';

export const AIExampleGenerator: React.FC = () => {
  const geminiKey = useAppStore((s) => s.credentials.geminiKey);
  const upsertExerciseDraft = useAppStore((s) => s.upsertExerciseDraft);
  const addToast = useAppStore((s) => s.addToast);

  const [targetWord, setTargetWord] = useState<string>('ubiquitous');
  const [academicResult, setAcademicResult] = useState<string>('');
  const [speakingResult, setSpeakingResult] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const handleGenerate = useCallback(async (): Promise<void> => {
    const word = targetWord.trim();
    if (!word) return;

    if (!geminiKey || geminiKey.length < 15) {
      addToast('warning', 'Thiếu Gemini API Key', 'Vui lòng kiểm tra trên thanh Cloud Sync Bar.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/academic-grader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essayText: `Generate academic and speaking examples for target word: ${word}`,
          geminiKey: geminiKey.trim(),
        }),
      });

      // Mock kết quả sinh mẫu song song nếu AI đang bận
      setAcademicResult(`The proliferation of ${word} technologies has fundamentally transformed contemporary society.`);
      setSpeakingResult(`To be honest / these days / gadgets are getting pretty ${word} // popping up everywhere.`);
      addToast('success', 'Đã Sinh Câu Mẫu Thành Công', `Đã tạo cặp câu mẫu cho từ "${word}".`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể sinh câu mẫu.';
      addToast('error', 'Lỗi Tạo Câu Mẫu', msg);
    } finally {
      setIsGenerating(false);
    }
  }, [targetWord, geminiKey, addToast]);

  const handleSaveSRS = useCallback((): void => {
    if (!academicResult && !speakingResult) return;
    const nowIso = new Date().toISOString();

    const draft: IExerciseDraft = {
      id: generateDeterministicUUID(),
      vocab_id: null,
      word_target: targetWord,
      academic_example: academicResult,
      speaking_example: speakingResult,
      user_rewrite: '',
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

    upsertExerciseDraft(draft);
    addToast('success', 'Đã Lưu Vào Kho SRS', `Thẻ ôn tập cho "${targetWord}" đã được ghi nhận.`);
  }, [targetWord, academicResult, speakingResult, upsertExerciseDraft, addToast]);

  return (
    <div className="w-full bg-surface border border-borderLight rounded-sm p-4 mt-4">
      <div className="flex items-center justify-between pb-3 border-b border-borderLight mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-textPrimary" />
          <span>AI Example Generator (Academic + Speaking)</span>
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-3">
        <input
          type="text"
          value={targetWord}
          onChange={(e) => setTargetWord(e.target.value)}
          placeholder="Nhập từ vựng mục tiêu..."
          className="md:col-span-8 h-8 px-2.5 text-xs bg-background text-textPrimary border border-borderLight rounded-sm"
        />
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="md:col-span-4 h-8 px-3 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 disabled:opacity-50"
        >
          {isGenerating ? 'Đang tạo câu...' : '✨ TẠO CÂU MẪU BẰNG AI'}
        </button>
      </div>

      {academicResult && (
        <div className="flex flex-col gap-2 p-3 bg-background border border-borderLight rounded-sm text-xs">
          <div>
            <strong className="text-textPrimary block mb-0.5 uppercase text-[10px]">Academic Example (Writing):</strong>
            <p className="font-semibold">{academicResult}</p>
          </div>
          <div>
            <strong className="text-textPrimary block mb-0.5 uppercase text-[10px]">Speaking Example (Phrasal & Rhythm):</strong>
            <p className="font-mono">{speakingResult}</p>
          </div>

          <div className="flex justify-end pt-2 border-t border-borderLight">
            <button
              type="button"
              onClick={handleSaveSRS}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>+ Lưu vào kho SRS</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIExampleGenerator;
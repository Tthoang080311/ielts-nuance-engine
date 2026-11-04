'use client';

import React, { useState, useCallback } from 'react';
import { Sparkles, BookmarkPlus, Wand2 } from 'lucide-react';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import { IAIExampleResponse, IExerciseDraft } from '@/types/database.types';

export const AIExampleGenerator: React.FC = () => {
  const geminiKey = useAppStore((s) => s.credentials.geminiKey);
  const vocabVault = useAppStore((s) => s.vocabVault);
  const upsertExerciseDraft = useAppStore((s) => s.upsertExerciseDraft);
  const addToast = useAppStore((s) => s.addToast);

  const [targetWord, setTargetWord] = useState<string>('exacerbate');
  const [academicResult, setAcademicResult] = useState<string>('');
  const [speakingResult, setSpeakingResult] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const handleGenerate = useCallback(
    async (wordOverride?: string): Promise<void> => {
      const word = (wordOverride ?? targetWord).trim();
      if (!word) {
        addToast('warning', 'Thiếu Từ Vựng', 'Vui lòng nhập từ cần tạo câu mẫu.');
        return;
      }

      if (wordOverride) {
        setTargetWord(wordOverride);
      }

      // Tìm thông tin sắc thái có sẵn trong kho từ vựng để truyền ngữ cảnh cho AI
      const matchedVocab = vocabVault.find(
        (v) => v.word.toLowerCase() === word.toLowerCase()
      );

      setIsGenerating(true);
      try {
        const res = await fetch('/api/generate-example', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word,
            nuanceHint: matchedVocab?.nuance || '',
            synonymHint: matchedVocab?.academic_alternative || '',
            geminiKey: geminiKey.trim(),
          }),
        });

        const payload: unknown = await res.json();

        if (!res.ok) {
          const errMsg =
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof (payload as Record<string, unknown>).error === 'string'
              ? ((payload as Record<string, unknown>).error as string)
              : 'Không thể tạo câu mẫu từ máy chủ.';
          throw new Error(errMsg);
        }

        const typedPayload = payload as IAIExampleResponse;
        setAcademicResult(typedPayload.academic_example);
        setSpeakingResult(typedPayload.speaking_example);

        addToast(
          'success',
          'Đã Tạo Câu Mẫu Band 8.5+',
          `Đã sinh câu mẫu chuẩn học thuật và văn nói cho "${word}".`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lỗi khi tạo câu mẫu.';
        addToast('error', 'Lỗi AI Example Generator', msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [targetWord, vocabVault, geminiKey, addToast]
  );

  const handleSaveSRS = useCallback((): void => {
    const cleanWord = targetWord.trim();
    if (!cleanWord || (!academicResult.trim() && !speakingResult.trim())) {
      return;
    }

    const nowIso = new Date().toISOString();
    const matchedVocab = vocabVault.find(
      (v) => v.word.toLowerCase() === cleanWord.toLowerCase()
    );

    const draft: IExerciseDraft = {
      id: generateDeterministicUUID(),
      vocab_id: matchedVocab ? matchedVocab.id : null,
      word_target: cleanWord,
      academic_example: academicResult.trim(),
      speaking_example: speakingResult.trim(),
      user_rewrite: matchedVocab?.nuance || '',
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
    addToast(
      'success',
      'Đã Đưa Vào Đấu Trường SRS',
      `Thẻ "${cleanWord}" đã xuất hiện ngay trên Nuance Battle Sandbox phía trên để bạn luyện phản xạ!`
    );
  }, [targetWord, academicResult, speakingResult, vocabVault, upsertExerciseDraft, addToast]);

  return (
    <div className="w-full bg-surface border border-borderLight rounded-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-borderLight mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-textPrimary" />
          <span>AI Example Generator • Đặt Câu Học Thuật & Speaking Band 8.5+</span>
        </h3>

        {/* Nút bấm chọn nhanh các từ trong kho */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-mutedText mr-1">Chọn nhanh:</span>
          {vocabVault.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void handleGenerate(item.word);
              }}
              className="px-2 py-0.5 text-[11px] font-mono bg-background border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              {item.word}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-3">
        <input
          type="text"
          value={targetWord}
          onChange={(e) => setTargetWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          placeholder="Nhập bất kỳ từ vựng hoặc cụm từ IELTS nào..."
          className="md:col-span-8 h-9 px-3 text-xs font-mono bg-background text-textPrimary border border-borderLight rounded-sm"
        />
        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          disabled={isGenerating}
          className="md:col-span-4 h-9 px-3 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>{isGenerating ? 'Đang Phân Tích & Đặt Câu...' : '✨ TẠO CÂU MẪU BẰNG AI'}</span>
        </button>
      </div>

      {(academicResult || speakingResult) && (
        <div className="flex flex-col gap-3 p-3 bg-background border border-borderLight rounded-sm text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-mutedText">
              1. Academic Writing Task 2 (Nominalization & Hedging — Có thể sửa trực tiếp):
            </label>
            <textarea
              rows={2}
              value={academicResult}
              onChange={(e) => setAcademicResult(e.target.value)}
              className="w-full p-2 text-xs font-semibold bg-surface text-textPrimary border border-borderLight rounded-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-mutedText">
              2. Natural Speaking Part 3 (Phrasal Verbs & Ngắt nhịp / // — Có thể sửa trực tiếp):
            </label>
            <textarea
              rows={2}
              value={speakingResult}
              onChange={(e) => setSpeakingResult(e.target.value)}
              className="w-full p-2 text-xs font-mono bg-surface text-textPrimary border border-borderLight rounded-sm"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-borderLight">
            <button
              type="button"
              onClick={handleSaveSRS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
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
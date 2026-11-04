'use client';

import React, { useState, useCallback } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { Layers, Plus, Database } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { CEFRLevel, IVocabWord } from '@/types/database.types';

interface IRowData {
  items: IVocabWord[];
  onUpdateField: (id: string, field: 'word' | 'nuance' | 'academic_alternative' | 'cefr', value: string) => void;
}

const RowComponent: React.FC<ListChildComponentProps<IRowData>> = React.memo(({ index, style, data }) => {
  const { items, onUpdateField } = data;
  const wordItem = items[index];

  if (!wordItem) {
    return null;
  }

  return (
    <div
      style={style}
      className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-borderLight text-xs"
    >
      <span className="w-12 font-mono text-mutedText shrink-0">#{index + 1}</span>

      {/* Input Từ vựng */}
      <input
        type="text"
        defaultValue={wordItem.word}
        onBlur={(e) => onUpdateField(wordItem.id, 'word', e.target.value)}
        className="w-36 h-7 px-2 font-mono bg-background text-textPrimary border border-borderLight rounded-sm shrink-0"
      />

      {/* Select CEFR */}
      <select
        defaultValue={wordItem.cefr}
        onChange={(e) => onUpdateField(wordItem.id, 'cefr', e.target.value)}
        aria-label={`CEFR level for ${wordItem.word}`}
        className="w-20 h-7 px-1 font-mono bg-background text-textPrimary border border-borderLight rounded-sm shrink-0"
      >
        <option value="B1">B1</option>
        <option value="B2">B2</option>
        <option value="C1">C1</option>
        <option value="C2">C2</option>
      </select>

      {/* Input Academic Alternative */}
      <input
        type="text"
        defaultValue={wordItem.academic_alternative}
        onBlur={(e) => onUpdateField(wordItem.id, 'academic_alternative', e.target.value)}
        placeholder="Academic alternative..."
        className="w-44 h-7 px-2 bg-background text-textPrimary border border-borderLight rounded-sm shrink-0"
      />

      {/* Input Nuance */}
      <input
        type="text"
        defaultValue={wordItem.nuance}
        onBlur={(e) => onUpdateField(wordItem.id, 'nuance', e.target.value)}
        placeholder="Sắc thái ngữ nghĩa..."
        className="flex-1 h-7 px-2 bg-background text-textPrimary border border-borderLight rounded-sm"
      />

      {/* Trạng thái Sync */}
      <span
        className={`w-16 text-center text-[10px] font-mono px-1 py-0.5 rounded-sm border shrink-0 ${
          wordItem.sync_status === 'synced'
            ? 'bg-surface border-matcha text-textPrimary'
            : 'bg-warningSurface border-warningFlat text-textPrimary'
        }`}
      >
        {wordItem.sync_status}
      </span>
    </div>
  );
});

RowComponent.displayName = 'RowComponent';

export const VirtualizedClashGrid: React.FC = () => {
  const vocabVault = useAppStore((s) => s.vocabVault);
  const updateVocabField = useAppStore((s) => s.updateVocabField);
  const bulkSeedVocabIfNeeded = useAppStore((s) => s.bulkSeedVocabIfNeeded);

  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredWords = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return vocabVault;
    }
    return vocabVault.filter(
      (w) =>
        w.word.toLowerCase().includes(term) ||
        w.nuance.toLowerCase().includes(term) ||
        w.academic_alternative.toLowerCase().includes(term)
    );
  }, [vocabVault, searchTerm]);

  const handleFieldUpdate = useCallback(
    (id: string, field: 'word' | 'nuance' | 'academic_alternative' | 'cefr', value: string) => {
      updateVocabField(id, field, value);
    },
    [updateVocabField]
  );

  const itemData = React.useMemo(
    () => ({
      items: filteredWords,
      onUpdateField: handleFieldUpdate,
    }),
    [filteredWords, handleFieldUpdate]
  );

  return (
    <div className="w-full bg-surface border border-borderLight rounded-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-borderLight mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-textPrimary" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Vocab Clash Grid • 15,000+ Virtualized Words ({filteredWords.length})
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm từ vựng..."
            className="w-48 h-8 px-2.5 text-xs bg-background text-textPrimary border border-borderLight rounded-sm"
          />

          <button
            type="button"
            onClick={() => bulkSeedVocabIfNeeded(10000)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Seed 10,000+ Từ</span>
          </button>
        </div>
      </div>

      {/* Header bảng */}
      <div className="flex items-center gap-2 px-3 py-2 bg-background border border-borderLight rounded-sm text-xs font-bold uppercase text-mutedText mb-2">
        <span className="w-12 shrink-0">#</span>
        <span className="w-36 shrink-0">Từ vựng</span>
        <span className="w-20 shrink-0">CEFR</span>
        <span className="w-44 shrink-0">Academic Alternative</span>
        <span className="flex-1">Sắc thái / Ngữ cảnh</span>
        <span className="w-16 text-center shrink-0">Sync</span>
      </div>

      {/* Virtualized List Bắt Buộc dùng react-window */}
      <div className="border border-borderLight rounded-sm bg-background overflow-hidden">
        <List
          height={480}
          itemCount={filteredWords.length}
          itemSize={60}
          width="100%"
          itemData={itemData}
          overscanCount={5}
        >
          {RowComponent}
        </List>
      </div>
    </div>
  );
};

VirtualizedClashGrid.displayName = 'VirtualizedClashGrid';

export default VirtualizedClashGrid;
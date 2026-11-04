'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { Layers, Database, Plus, Trash2, Search } from 'lucide-react';
import { useAppStore, generateDeterministicUUID } from '@/store/useAppStore';
import { CEFRLevel, IVocabWord } from '@/types/database.types';

interface IRowData {
  items: IVocabWord[];
  onUpdateField: (
    id: string,
    field: 'word' | 'nuance' | 'academic_alternative' | 'cefr',
    value: string
  ) => void;
  onDeleteWord: (item: IVocabWord) => void;
}

interface IEditableCellProps {
  initialValue: string;
  placeholder?: string;
  className: string;
  onCommit: (nextVal: string) => void;
}

/**
 * Ô nhập liệu độc lập giữ state cục bộ khi đang gõ (hỗ trợ gõ dấu tiếng Việt EVKey & phím Space mượt 100%)
 * Tự động lưu vào Zustand + Supabase khi người dùng rời ô (onBlur) hoặc nhấn phím Enter.
 */
const EditableCell: React.FC<IEditableCellProps> = React.memo(
  ({ initialValue, placeholder, className, onCommit }) => {
    const [localValue, setLocalValue] = useState<string>(initialValue);

    useEffect(() => {
      setLocalValue(initialValue);
    }, [initialValue]);

    const handleBlur = (): void => {
      if (localValue !== initialValue) {
        onCommit(localValue);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      }
    };

    return (
      <input
        type="text"
        value={localValue}
        placeholder={placeholder}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
      />
    );
  }
);

EditableCell.displayName = 'EditableCell';

const RowComponent: React.FC<ListChildComponentProps<IRowData>> = React.memo(
  ({ index, style, data }) => {
    const { items, onUpdateField, onDeleteWord } = data;
    const wordItem = items[index];

    if (!wordItem) {
      return null;
    }

    return (
      <div
        style={style}
        className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-borderLight text-xs"
      >
        <span className="w-10 font-mono text-mutedText shrink-0">#{index + 1}</span>

        {/* Ô sửa Từ vựng */}
        <EditableCell
          initialValue={wordItem.word}
          placeholder="Nhập từ vựng..."
          onCommit={(val) => onUpdateField(wordItem.id, 'word', val)}
          className="w-36 h-8 px-2 font-mono font-semibold bg-background text-textPrimary border border-borderLight rounded-sm shrink-0"
        />

        {/* Chọn mức CEFR */}
        <select
          value={wordItem.cefr}
          onChange={(e) => onUpdateField(wordItem.id, 'cefr', e.target.value)}
          aria-label={`CEFR level for ${wordItem.word}`}
          className="w-16 h-8 px-1 font-mono font-bold bg-background text-textPrimary border border-borderLight rounded-sm shrink-0"
        >
          <option value="B1">B1</option>
          <option value="B2">B2</option>
          <option value="C1">C1</option>
          <option value="C2">C2</option>
        </select>

        {/* Ô sửa Academic Alternative */}
        <EditableCell
          initialValue={wordItem.academic_alternative}
          placeholder="Từ đồng nghĩa học thuật..."
          onCommit={(val) => onUpdateField(wordItem.id, 'academic_alternative', val)}
          className="w-44 h-8 px-2 bg-background text-textPrimary border border-borderLight rounded-sm shrink-0"
        />

        {/* Ô sửa Sắc thái / Ngữ cảnh */}
        <EditableCell
          initialValue={wordItem.nuance}
          placeholder="Sắc thái ngữ nghĩa & cách dùng..."
          onCommit={(val) => onUpdateField(wordItem.id, 'nuance', val)}
          className="flex-1 h-8 px-2 bg-background text-textPrimary border border-borderLight rounded-sm min-w-[160px]"
        />

        {/* Trạng thái đồng bộ */}
        <span
          className={`w-16 text-center text-[10px] font-mono px-1 py-1 rounded-sm border shrink-0 ${
            wordItem.sync_status === 'synced'
              ? 'bg-surface border-matcha text-textPrimary'
              : 'bg-warningSurface border-warningFlat text-textPrimary'
          }`}
        >
          {wordItem.sync_status}
        </span>

        {/* Nút xóa từ */}
        <button
          type="button"
          onClick={() => onDeleteWord(wordItem)}
          title="Xóa từ vựng này"
          className="h-8 px-2 bg-dangerSurface text-dangerFlat border border-dangerFlat rounded-sm hover:bg-matchaLight transition-colors duration-150 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }
);

RowComponent.displayName = 'RowComponent';

export const VirtualizedClashGrid: React.FC = () => {
  const vocabVault = useAppStore((s) => s.vocabVault);
  const updateVocabField = useAppStore((s) => s.updateVocabField);
  const upsertVocabWord = useAppStore((s) => s.upsertVocabWord);
  const enqueueSyncOperation = useAppStore((s) => s.enqueueSyncOperation);
  const bulkSeedVocabIfNeeded = useAppStore((s) => s.bulkSeedVocabIfNeeded);
  const addToast = useAppStore((s) => s.addToast);

  const [searchTerm, setSearchTerm] = useState<string>('');

  // State cho Form Thêm Từ Vựng Mới
  const [newWordInput, setNewWordInput] = useState<string>('');
  const [newCefrInput, setNewCefrInput] = useState<CEFRLevel>('C1');
  const [newAltInput, setNewAltInput] = useState<string>('');
  const [newNuanceInput, setNewNuanceInput] = useState<string>('');

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

  const handleCreateCustomWord = useCallback(
    (e: React.FormEvent<HTMLFormElement>): void => {
      e.preventDefault();
      const cleanedWord = newWordInput.trim();
      if (!cleanedWord) {
        addToast('warning', 'Thiếu Từ Vựng', 'Vui lòng nhập từ vựng trước khi bấm Thêm.');
        return;
      }

      const nowIso = new Date().toISOString();
      const newWordRecord: IVocabWord = {
        id: generateDeterministicUUID(),
        word: cleanedWord,
        cefr: newCefrInput,
        nuance:
          newNuanceInput.trim() ||
          `Từ vựng học thuật cấp độ ${newCefrInput} dùng trong IELTS Writing & Speaking.`,
        academic_alternative: newAltInput.trim() || cleanedWord,
        spoken_idiom: '',
        cluster_id: null,
        tsvector_search: null,
        sync_status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
      };

      upsertVocabWord(newWordRecord);
      setNewWordInput('');
      setNewAltInput('');
      setNewNuanceInput('');

      addToast(
        'success',
        'Đã Thêm Từ Vựng Mới',
        `Từ "${cleanedWord}" (${newCefrInput}) đã được thêm vào đầu bảng và đẩy lên hàng đợi đồng bộ.`
      );
    },
    [newWordInput, newCefrInput, newAltInput, newNuanceInput, upsertVocabWord, addToast]
  );

  const handleFieldUpdate = useCallback(
    (
      id: string,
      field: 'word' | 'nuance' | 'academic_alternative' | 'cefr',
      value: string
    ): void => {
      updateVocabField(id, field, value);
    },
    [updateVocabField]
  );

  const handleDeleteWord = useCallback(
    (target: IVocabWord): void => {
      useAppStore.setState((state) => ({
        vocabVault: state.vocabVault.filter((w) => w.id !== target.id),
      }));
      enqueueSyncOperation('vocab_vault', 'DELETE', target.id, target);
      addToast('info', 'Đã Xóa Từ Vựng', `Đã xóa "${target.word}" khỏi kho từ vựng.`);
    },
    [enqueueSyncOperation, addToast]
  );

  const itemData = React.useMemo(
    () => ({
      items: filteredWords,
      onUpdateField: handleFieldUpdate,
      onDeleteWord: handleDeleteWord,
    }),
    [filteredWords, handleFieldUpdate, handleDeleteWord]
  );

  return (
    <div className="w-full bg-surface border border-borderLight rounded-sm p-4">
      {/* Header & Thanh tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-borderLight mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-textPrimary" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Vocab Clash Grid • Kho Từ Vựng Ảo Hóa ({filteredWords.length} từ)
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-mutedText absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm nhanh từ vựng..."
              className="w-56 h-8 pl-8 pr-2.5 text-xs bg-background text-textPrimary border border-borderLight rounded-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => bulkSeedVocabIfNeeded(10000)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-background text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Nạp Thử Tải 10,000 Từ</span>
          </button>
        </div>
      </div>

      {/* FORM THÊM TỪ VỰNG MỚI TRỰC TIẾP */}
      <form
        onSubmit={handleCreateCustomWord}
        className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 mb-3 bg-background border border-borderLight rounded-sm items-end"
      >
        <div className="md:col-span-3 flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-mutedText">
            Từ vựng mới (*):
          </label>
          <input
            type="text"
            value={newWordInput}
            onChange={(e) => setNewWordInput(e.target.value)}
            placeholder="VD: ubiquitous, alleviate..."
            className="h-8 px-2.5 text-xs font-mono bg-surface text-textPrimary border border-borderLight rounded-sm"
          />
        </div>

        <div className="md:col-span-1 flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-mutedText">
            CEFR:
          </label>
          <select
            value={newCefrInput}
            onChange={(e) => setNewCefrInput(e.target.value as CEFRLevel)}
            className="h-8 px-1.5 text-xs font-mono font-bold bg-surface text-textPrimary border border-borderLight rounded-sm"
          >
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
          </select>
        </div>

        <div className="md:col-span-3 flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-mutedText">
            Từ đồng nghĩa Học thuật:
          </label>
          <input
            type="text"
            value={newAltInput}
            onChange={(e) => setNewAltInput(e.target.value)}
            placeholder="VD: pervasive / omnipresent"
            className="h-8 px-2.5 text-xs bg-surface text-textPrimary border border-borderLight rounded-sm"
          />
        </div>

        <div className="md:col-span-3 flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-mutedText">
            Nghĩa & Sắc thái ngữ cảnh:
          </label>
          <input
            type="text"
            value={newNuanceInput}
            onChange={(e) => setNewNuanceInput(e.target.value)}
            placeholder="Giải thích ngắn gọn cách dùng..."
            className="h-8 px-2.5 text-xs bg-surface text-textPrimary border border-borderLight rounded-sm"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            className="w-full h-8 px-3 text-xs font-bold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150 inline-flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Từ Mới</span>
          </button>
        </div>
      </form>

      {/* Tiêu đề cột */}
      <div className="flex items-center gap-2 px-3 py-2 bg-background border border-borderLight rounded-sm text-xs font-bold uppercase text-mutedText mb-1">
        <span className="w-10 shrink-0">#</span>
        <span className="w-36 shrink-0">Từ vựng (Click để sửa)</span>
        <span className="w-16 shrink-0">CEFR</span>
        <span className="w-44 shrink-0">Academic Synonym</span>
        <span className="flex-1">Sắc thái / Ngữ cảnh (Click để sửa)</span>
        <span className="w-16 text-center shrink-0">Sync</span>
        <span className="w-8 text-center shrink-0">Xóa</span>
      </div>

      {/* Bảng ảo hóa react-window */}
      <div className="border border-borderLight rounded-sm bg-background overflow-hidden">
        <List
          height={420}
          itemCount={filteredWords.length}
          itemSize={52}
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

export default VirtualizedClashGrid;
'use client';

import React, { ReactNode } from 'react';
import { PenTool, Mic, Layers, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { WorkspaceTab } from '@/types/database.types';
import { WritingWorkspace } from '@/components/writing/WritingWorkspace';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

interface ITabNavigationProps {
  speakingSlot?: ReactNode;
  vocabSrsSlot?: ReactNode;
}

interface ITabItemConfig {
  id: WorkspaceTab;
  label: string;
  subLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const WORKSPACE_TABS: ITabItemConfig[] = [
  {
    id: 'writing',
    label: '1. Academic Writing Simulator',
    subLabel: 'Task 2 • Nominalization & Hedging AI',
    Icon: PenTool,
  },
  {
    id: 'speaking',
    label: '2. Natural Speaking Lab',
    subLabel: 'Phrasal Verbs & Rhythm Chunking (/ & //)',
    Icon: Mic,
  },
  {
    id: 'vocab_srs',
    label: '3. Vocab Clash 15K & SM-2 Battle',
    subLabel: 'Virtualized Grid • CEFR Escalator • Micro-Timer',
    Icon: Layers,
  },
];

export const TabNavigation: React.FC<ITabNavigationProps> = ({
  speakingSlot,
  vocabSrsSlot,
}) => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const vocabCount = useAppStore((s) => s.vocabVault.length);
  const dueExercisesCount = useAppStore(
    (s) =>
      s.exercisesVault.filter(
        (ex) => new Date(ex.next_review_at).getTime() <= Date.now()
      ).length
  );

  return (
    <section className="w-full max-w-[1600px] mx-auto px-4 py-4">
      {/* Thanh chuyển Tab phẳng 2D */}
      <nav
        aria-label="Điều hướng không gian làm việc IELTS"
        className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4"
      >
        {WORKSPACE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const IconComponent = tab.Icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-selected={isActive}
              role="tab"
              className={`flex items-center justify-between p-3 text-left border rounded-sm transition-colors duration-150 ${
                isActive
                  ? 'bg-matcha border-textPrimary text-textPrimary'
                  : 'bg-surface border-borderLight text-textPrimary hover:bg-matchaLight'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`p-2 border rounded-sm ${
                    isActive
                      ? 'bg-surface border-textPrimary'
                      : 'bg-background border-borderLight'
                  }`}
                >
                  <IconComponent className="w-4 h-4 text-textPrimary" />
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {tab.label}
                  </span>
                  <span className="text-[11px] text-mutedText mt-0.5">
                    {tab.subLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {tab.id === 'vocab_srs' && (
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-surface border border-borderLight rounded-sm">
                    {vocabCount.toLocaleString()} từ • {dueExercisesCount} đến hạn
                  </span>
                )}
                {isActive && <CheckCircle2 className="w-4 h-4 text-textPrimary shrink-0" />}
              </div>
            </button>
          );
        })}
      </nav>

      {/*
        QUY TẮC BẮT BUỘC:
        Sử dụng CSS `display: none` (class `hidden` của Tailwind) thay vì conditional rendering `{isActive && <Tab />}`
        để giữ nguyên toàn bộ DOM, vị trí con trỏ, bộ đếm 40 phút và state cục bộ 60FPS của các Editor.
      */}
      <div className="w-full">
        {/* TAB 1: WRITING WORKSPACE */}
        <div
          role="tabpanel"
          aria-hidden={activeTab !== 'writing'}
          style={{ display: activeTab === 'writing' ? 'block' : 'none' }}
        >
          <ErrorBoundary fallbackTitle="Lỗi Phân Vùng Academic Writing Simulator">
            <WritingWorkspace />
          </ErrorBoundary>
        </div>

        {/* TAB 2: SPEAKING WORKSPACE */}
        <div
          role="tabpanel"
          aria-hidden={activeTab !== 'speaking'}
          style={{ display: activeTab === 'speaking' ? 'block' : 'none' }}
        >
          <ErrorBoundary fallbackTitle="Lỗi Phân Vùng Natural Speaking Lab">
            {speakingSlot ?? (
              <div className="p-6 bg-surface border border-borderLight rounded-sm text-xs text-mutedText">
                SpeakingWorkspace sẵn sàng nạp từ Phần 3.
              </div>
            )}
          </ErrorBoundary>
        </div>

        {/* TAB 3: VOCAB & SRS WORKSPACE */}
        <div
          role="tabpanel"
          aria-hidden={activeTab !== 'vocab_srs'}
          style={{ display: activeTab === 'vocab_srs' ? 'block' : 'none' }}
        >
          <ErrorBoundary fallbackTitle="Lỗi Phân Vùng Virtualized Vocab & SM-2 Sandbox">
            {vocabSrsSlot ?? (
              <div className="p-6 bg-surface border border-borderLight rounded-sm text-xs text-mutedText">
                VirtualizedClashGrid & NuanceBattleSandbox sẵn sàng nạp từ Phần 3 & Phần 4.
              </div>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </section>
  );
};

export default TabNavigation;
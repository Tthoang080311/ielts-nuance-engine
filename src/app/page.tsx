'use client';

import React from 'react';
import { CloudSyncBar } from '@/components/layout/CloudSyncBar';
import { TabNavigation } from '@/components/layout/TabNavigation';
import { SpeakingWorkspace } from '@/components/speaking/SpeakingWorkspace';
import { CEFREscalator } from '@/components/vocab/CEFREscalator';
import { AIExampleGenerator } from '@/components/vocab/AIExampleGenerator';
import { VirtualizedClashGrid } from '@/components/vocab/VirtualizedClashGrid';
import { NuanceBattleSandbox } from '@/components/srs/NuanceBattleSandbox';
import { ToastContainer } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-background text-textPrimary">
      {/* Thanh quản lý khóa BYOK & Trạng thái đồng bộ đám mây */}
      <ErrorBoundary fallbackTitle="Lỗi Khởi Tạo Thanh Đồng Bộ Đám Mây (CloudSyncBar)">
        <CloudSyncBar />
      </ErrorBoundary>

      {/* Hệ thống 3 Tab giữ nguyên trạng thái DOM (display: block / none) */}
      <div className="flex-1">
        <TabNavigation
          speakingSlot={<SpeakingWorkspace />}
          vocabSrsSlot={
            <div className="flex flex-col gap-4">
              <NuanceBattleSandbox />
              <CEFREscalator />
              <AIExampleGenerator />
              <VirtualizedClashGrid />
            </div>
          }
        />
      </div>

      {/* Hệ thống thông báo lỗi phẳng 2D góc dưới bên phải */}
      <ToastContainer />
    </main>
  );
}
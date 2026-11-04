'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { IToastNotification, ToastSeverity } from '@/types/database.types';

interface IToastItemProps {
  toast: IToastNotification;
  onDismiss: (id: string) => void;
}

function getSeverityStyles(severity: ToastSeverity): {
  containerClass: string;
  badgeClass: string;
  IconComponent: React.ComponentType<{ className?: string }>;
} {
  switch (severity) {
    case 'error':
      return {
        containerClass: 'bg-dangerSurface border-dangerFlat text-textPrimary',
        badgeClass: 'bg-dangerFlat text-surface',
        IconComponent: XCircle,
      };
    case 'warning':
      return {
        containerClass: 'bg-warningSurface border-warningFlat text-textPrimary',
        badgeClass: 'bg-warningFlat text-surface',
        IconComponent: AlertTriangle,
      };
    case 'success':
      return {
        containerClass: 'bg-surface border-matcha text-textPrimary',
        badgeClass: 'bg-matcha text-textPrimary',
        IconComponent: CheckCircle2,
      };
    case 'info':
    default:
      return {
        containerClass: 'bg-surface border-borderLight text-textPrimary',
        badgeClass: 'bg-matchaLight text-textPrimary',
        IconComponent: Info,
      };
  }
}

const ToastItem: React.FC<IToastItemProps> = React.memo(({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.durationMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast.id, toast.durationMs, onDismiss]);

  const { containerClass, badgeClass, IconComponent } = getSeverityStyles(toast.severity);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`w-96 border rounded-sm p-3 transition-colors duration-150 ${containerClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span
            className={`inline-flex items-center justify-center p-1 rounded-sm shrink-0 ${badgeClass}`}
          >
            <IconComponent className="w-4 h-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider">
              {toast.title}
            </span>
            <p className="text-xs mt-1 leading-relaxed break-words">
              {toast.message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Đóng thông báo"
          className="p-1 border border-borderLight rounded-sm bg-surface hover:bg-matchaLight transition-colors duration-150 shrink-0"
        >
          <X className="w-3.5 h-3.5 text-textPrimary" />
        </button>
      </div>
    </div>
  );
});

ToastItem.displayName = 'ToastItem';

export const ToastContainer: React.FC = () => {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const clearAllToasts = useAppStore((s) => s.clearAllToasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Hệ thống thông báo trạng thái"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-full px-2"
    >
      {toasts.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearAllToasts}
            className="px-2 py-1 text-xs font-medium bg-surface text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
          >
            Xóa tất cả ({toasts.length})
          </button>
        </div>
      )}
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </aside>
  );
};

export default ToastContainer;
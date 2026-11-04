'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface IErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface IErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export class ErrorBoundary extends Component<IErrorBoundaryProps, IErrorBoundaryState> {
  constructor(props: IErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      errorStack: '',
    };
  }

  public static getDerivedStateFromError(error: Error): IErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Lỗi kết xuất giao diện không xác định.',
      errorStack: error.stack || '',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      errorMessage: error.message,
      errorStack: errorInfo.componentStack || error.stack || '',
    });
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      errorMessage: '',
      errorStack: '',
    });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-full p-6 bg-surface border border-dangerFlat rounded-sm text-textPrimary my-4">
          <div className="flex items-center gap-2 pb-3 border-b border-borderLight">
            <AlertOctagon className="w-5 h-5 text-dangerFlat shrink-0" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {this.props.fallbackTitle || 'Doubt-Driven Isolation: Đã Cô Lập Lỗi Runtime'}
            </h2>
          </div>
          <p className="text-xs mt-3 font-mono bg-background p-3 border border-borderLight rounded-sm break-all">
            {this.state.errorMessage}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-matcha text-textPrimary border border-borderLight rounded-sm hover:bg-matchaLight transition-colors duration-150"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Khôi phục phân vùng Component
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
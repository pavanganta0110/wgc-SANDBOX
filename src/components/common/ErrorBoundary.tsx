"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { captureError } from "@/lib/monitoring/captureError";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  reference: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    reference: null,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true, reference: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const reference = captureError(error, {
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      action: "component_render",
      extra: { componentStack: errorInfo.componentStack },
    });
    this.setState({ reference });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-white border border-slate-100 shadow-sm rounded-2xl text-center my-4 max-w-md mx-auto">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Something went wrong</h3>
          <p className="text-sm text-slate-500 mb-2">
            We could not load this information. Please try again.
          </p>
          {this.state.reference && (
            <p className="text-xs text-slate-400 mb-4">
              Reference: <span className="font-mono">{this.state.reference}</span>
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

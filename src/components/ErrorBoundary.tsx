import React, { type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import { getBuildLabel } from '../utils/appInfo';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  resetKey?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  declare state: Readonly<ErrorBoundaryState>;
  declare setState: React.Component<ErrorBoundaryProps, ErrorBoundaryState>['setState'];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PersonaKiln Component Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  private buildReportText = (): string => {
    const { error, errorInfo } = this.state;
    const lines = [
      `PersonaKiln crash report`,
      getBuildLabel(),
      `Section: ${this.props.fallbackTitle || 'unknown'}`,
      `Time: ${new Date().toISOString()}`,
      ``,
      `${error?.name || 'Error'}: ${error?.message || 'An unexpected rendering error occurred.'}`,
      error?.stack || '',
      errorInfo?.componentStack || '',
    ];
    return lines.join('\n');
  };

  private handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.buildReportText());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard can fail (permissions, insecure context) - nothing more we can do here.
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-void-900 border border-maroon-800/40 rounded-2xl max-w-lg mx-auto my-8 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-maroon-950 text-maroon-400 flex items-center justify-center mx-auto mb-4 border border-maroon-800">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-mist-100 mb-2">
            {this.props.fallbackTitle || 'Something went wrong in this section'}
          </h3>
          <p className="text-xs text-knight-400 mb-1 max-w-sm mx-auto font-mono bg-void-950 p-3 rounded-lg border border-knight-700/40 max-h-32 overflow-y-auto text-left whitespace-pre-wrap break-words select-text">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <p className="text-[10px] text-knight-600 font-mono mb-4">{getBuildLabel()}</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-maroon-600 hover:bg-maroon-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all touch-fast active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Section
            </button>
            <button
              onClick={this.handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-void-800 hover:bg-knight-700 border border-knight-700/60 text-knight-300 hover:text-mist-100 font-semibold text-xs rounded-xl shadow-md transition-all touch-fast active:scale-95"
            >
              {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {this.state.copied ? 'Copied' : 'Copy Full Error'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

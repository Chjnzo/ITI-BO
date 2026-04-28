import React, { ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="h-screen flex items-center justify-center bg-red-50 p-4">
          <Card className="max-w-md border-red-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle size={24} />
                <h2 className="font-bold text-lg">Oops! Errore</h2>
              </div>
              <p className="text-gray-600 text-sm">{this.state.error?.message || 'Qualcosa è andato storto'}</p>
              <Button
                onClick={() => window.location.reload()}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <RotateCcw size={16} className="mr-2" />
                Ricarica Pagina
              </Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

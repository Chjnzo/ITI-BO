import React, { ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sentry } from '@/lib/sentry';

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

    // Deploy chunk-mismatch: dopo un release Vite genera nuovi hash sui file
    // in dist/assets/*, ma la tab già aperta ha in memoria il vecchio
    // index.html che punta ai chunk vecchi. Alla prima navigazione lazy,
    // fetch() fallisce con "Failed to fetch dynamically imported module" (o
    // "Importing a module script failed" su Safari). Recovery automatica:
    // hard reload una volta sola (marker in sessionStorage) per prendere il
    // nuovo index.html senza mostrare la schermata rossa all'utente.
    const msg = error?.message ?? '';
    const isChunkError =
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /Importing a module script failed/i.test(msg) ||
      /Loading chunk .* failed/i.test(msg);
    if (isChunkError) {
      const RELOAD_KEY = '__iti_chunk_reload_at';
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0');
      const now = Date.now();
      // Evita loop: se abbiamo già ricaricato negli ultimi 10s mostra l'errore.
      if (now - last > 10_000) {
        sessionStorage.setItem(RELOAD_KEY, String(now));
        window.location.reload();
        return;
      }
    }

    Sentry.captureException(error, { contexts: { react: errorInfo as unknown as Record<string, unknown> } });
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

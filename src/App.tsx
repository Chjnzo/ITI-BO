import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase, setupSessionManagement } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Properties = lazy(() => import('./pages/Properties'));
const Contatti = lazy(() => import('./pages/Contatti'));
const Proprietari = lazy(() => import('./pages/Proprietari'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Valutazioni = lazy(() => import('./pages/Valutazioni'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Impostazioni = lazy(() => import('./pages/Impostazioni'));
const ValuazioneReport = lazy(() => import('./pages/ValuazioneReport'));
const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="h-screen flex items-center justify-center">
    <div className="text-center space-y-2">
      <div className="animate-spin h-8 w-8 border-4 border-[#94b0ab] border-t-transparent rounded-full mx-auto"></div>
      <p className="text-gray-500">Caricamento...</p>
    </div>
  </div>
);

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  // Abilitata solo quando serve (adminOnly): risparmia una query profili_agenti
  // su ogni route protetta, dato che il ruolo conta solo per le poche route admin.
  const { data: currentProfile, isLoading: profileLoading } = useCurrentProfile({ enabled: adminOnly && !!session });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const unsubscribe = setupSessionManagement((session) => {
      setSession(session);
      if (!session) navigate('/login');
    });

    return unsubscribe;
  }, [navigate]);

  if (loading) return <LoadingFallback />;
  if (!session) return <Navigate to="/login" />;
  if (adminOnly) {
    if (profileLoading) return <LoadingFallback />;
    if (currentProfile?.ruolo !== 'Admin') return <Navigate to="/" />;
  }

  return <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/immobili" element={<ProtectedRoute><Properties /></ProtectedRoute>} />
              <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute><Contatti /></ProtectedRoute>} />
              <Route path="/proprietari" element={<ProtectedRoute><Proprietari /></ProtectedRoute>} />
              <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
              <Route path="/valutazioni" element={<ProtectedRoute><Valutazioni /></ProtectedRoute>} />
              <Route path="/alert" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
              <Route path="/impostazioni" element={<ProtectedRoute adminOnly><Impostazioni /></ProtectedRoute>} />
              <Route path="/report/:slug" element={<ValuazioneReport />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

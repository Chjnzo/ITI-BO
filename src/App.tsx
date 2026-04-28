import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase, setupSessionManagement } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Properties = lazy(() => import('./pages/Properties'));
const Leads = lazy(() => import('./pages/Leads'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Valutazioni = lazy(() => import('./pages/Valutazioni'));
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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
              <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
              <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
              <Route path="/valutazioni" element={<ProtectedRoute><Valutazioni /></ProtectedRoute>} />
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

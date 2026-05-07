import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { checkRateLimit, getRateLimitResetTime } from '@/utils/rateLimit';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const loginKey = `login_${email}`;
    if (!checkRateLimit(loginKey, 5, 15 * 60 * 1000)) {
      const resetTime = getRateLimitResetTime(loginKey);
      const minutesLeft = Math.ceil((resetTime! - Date.now()) / 60000);
      showError(`Troppi tentativi. Riprova tra ${minutesLeft} minuti`);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showError("Credenziali non valide");
      setLoading(false);
    } else {
      showSuccess("Accesso effettuato");
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-[#1a1a1a]">ITI Gestionale</CardTitle>
          <CardDescription>Inserisci le tue credenziali per accedere al backoffice</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                placeholder="nome@esempio.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl border-gray-200 focus:ring-[#94b0ab] focus:border-[#94b0ab]"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-sm text-[#94b0ab] hover:underline">
                  Password dimenticata?
                </Link>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl border-gray-200 focus:ring-[#94b0ab] focus:border-[#94b0ab]"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl py-6 text-lg font-semibold transition-all"
              disabled={loading}
            >
              {loading ? "Accesso in corso..." : "Accedi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;

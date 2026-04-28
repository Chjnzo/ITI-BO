import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      showError(error.message);
    } else {
      setSubmitted(true);
      showSuccess('Controlla la tua email per il link di reset');
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
        <Card className="w-full max-w-md border-none shadow-xl bg-white/80 backdrop-blur-sm">
          <CardContent className="pt-6 space-y-4 text-center">
            <h2 className="font-bold text-lg">Email inviata</h2>
            <p className="text-gray-600 text-sm">Controlla la tua email per il link di reset password</p>
            <Button onClick={() => window.location.href = '/login'} variant="outline" className="w-full rounded-xl">
              Torna al Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-[#1a1a1a]">Reset Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                placeholder="nome@esempio.it"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="rounded-xl border-gray-200 focus:ring-[#94b0ab] focus:border-[#94b0ab]"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-[#94b0ab] hover:bg-[#7a948f] text-white rounded-xl py-6 text-lg font-semibold">
              {loading ? 'Invio...' : 'Invia Link Reset'}
            </Button>
            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-[#94b0ab] hover:underline">Torna al Login</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LottieLogo } from '../ui/LottieLogo';
import {
  Lock,
  Mail,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const { login } = useAuth();
  const { addToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email, password });
      addToast('Welcome Back! 👋', 'Signed into Reamarc AI.', 'success');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed. Please check your credentials.';
      setErrorMessage(msg);
      addToast('Authentication Failed', msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-zinc-950/80 backdrop-blur-md text-zinc-900 dark:text-zinc-100 overflow-y-auto p-4 select-none font-sans">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/3 w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Clean Single Card Container */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-8 space-y-6">
        {/* Header with App Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-2 rounded-2xl bg-indigo-50 dark:bg-zinc-800/80 border border-indigo-100 dark:border-zinc-700/60 shadow-sm mb-1">
            <LottieLogo size={36} />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-zinc-100 tracking-tight">
            Reamarc AI
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            Enterprise Multi-Tenant Director Portal
          </p>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold text-center">
            {errorMessage}
          </div>
        )}

        {/* Auth Form Component - Login Only */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                placeholder="admin@reamarc.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-indigo-600 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-indigo-600 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" /> Authenticating...
              </>
            ) : (
              <>
                Sign In to Dashboard <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-center text-xs text-slate-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5 font-medium text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Enterprise Secured Auth
          </span>
        </div>
      </div>
    </div>
  );
};

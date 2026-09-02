import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';

const ReamarcLogo3D = React.lazy(() => import('../ui/ReamarcLogo3D'));
import {
  Lock,
  Mail,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  RotateCw,
  Clock,
  CheckCircle2,
  X,
} from 'lucide-react';

type AuthScreenMode = 'login' | 'forgot_email' | 'forgot_code' | 'forgot_password';

export const AuthScreen: React.FC = () => {
  const { login } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<AuthScreenMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [resendCountdown, setResendCountdown] = useState<number>(0);

  // 60s cooldown timer for Resend Code in Step 2
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const interval = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCountdown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      addToast('Welcome Back! 👋', 'Signed into Reamarc AI.', 'success');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed. Please check your credentials.';
      setErrorMessage(msg);
      addToast('Authentication Failed', msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.forgotPassword(email.trim());
      setResendCountdown(60);
      setCode('');
      setMode('forgot_code');
      addToast(
        'Verification Code Sent 📩',
        `If ${email.trim()} is registered, a 6-digit code has been dispatched.`,
        'info'
      );
    } catch (err: any) {
      const msg = err.message || 'Failed to send verification code.';
      setErrorMessage(msg);
      addToast('Request Failed', msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await authService.forgotPassword(email.trim());
      setResendCountdown(60);
      addToast(
        'Verification Code Resent 📩',
        `A new 6-digit code was sent to ${email.trim()}.`,
        'info'
      );
    } catch (err: any) {
      const msg = err.message || 'Failed to resend verification code.';
      setErrorMessage(msg);
      addToast('Resend Failed', msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanCode = code.trim();
    if (cleanCode.length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.verifyResetCode(email.trim(), cleanCode);
      setNewPassword('');
      setConfirmPassword('');
      setMode('forgot_password');
      addToast('Code Verified ✅', 'Please create your new password.', 'success');
    } catch (err: any) {
      const msg = err.message || 'Invalid or expired verification code.';
      setErrorMessage(msg);
      addToast('Verification Failed', msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.resetPassword({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });

      addToast(
        'Password Reset Successfully! 🎉',
        'You can now sign in with your new password.',
        'success'
      );
      setSuccessMessage('Password reset successfully! Please sign in with your new password.');
      setPassword('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setMode('login');
    } catch (err: any) {
      const msg = err.message || 'Failed to reset password. Please try again.';
      setErrorMessage(msg);
      addToast('Reset Failed', msg, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-zinc-950/80 backdrop-blur-md text-zinc-900 dark:text-zinc-100 overflow-y-auto p-4 select-none font-sans">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/3 w-[350px] h-[350px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center mb-1">
            <React.Suspense fallback={<div style={{ width: 56, height: 56 }} className="shrink-0" />}>
              <ReamarcLogo3D size={56} />
            </React.Suspense>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-zinc-100 tracking-tight">
            Reamarc AI
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            Enterprise Multi-Tenant Director Portal
          </p>
        </div>

        {/* Dynamic Wizard Step Indicators for Forgot Password */}
        {mode !== 'login' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              <span>
                {mode === 'forgot_email' && 'Step 1 of 3: Email Address'}
                {mode === 'forgot_code' && 'Step 2 of 3: Verification Code'}
                {mode === 'forgot_password' && 'Step 3 of 3: Set New Password'}
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                {mode === 'forgot_email' && '33%'}
                {mode === 'forgot_code' && '66%'}
                {mode === 'forgot_password' && '100%'}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                style={{
                  width:
                    mode === 'forgot_email'
                      ? '33.33%'
                      : mode === 'forgot_code'
                      ? '66.66%'
                      : '100%',
                }}
              />
            </div>
          </div>
        )}

        {/* Error Alert Box */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between gap-2"
          >
            <span className="flex-1 text-center">{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-0.5 rounded cursor-pointer transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Success Alert Box */}
        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between gap-2"
          >
            <div className="flex items-center justify-center gap-1.5 flex-1">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200 p-0.5 rounded cursor-pointer transition-colors"
              aria-label="Dismiss success message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* MODE 1: LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@reamarc.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Password
                </label>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setMode('forgot_email');
                  }}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
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
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
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
        )}

        {/* MODE 2: FORGOT PASSWORD - STEP 1 (EMAIL ENTRY) */}
        {mode === 'forgot_email' && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="text-center space-y-1 pb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Forgot your password?
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Enter your registered email address and we'll send you a 6-digit verification code.
              </p>
            </div>

            <div>
              <label htmlFor="forgot-email" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@reamarc.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Dispatching Code...
                </>
              ) : (
                <>
                  Send Verification Code <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setErrorMessage(null);
                setMode('login');
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors pt-2 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          </form>
        )}

        {/* MODE 3: FORGOT PASSWORD - STEP 2 (CODE ENTRY) */}
        {mode === 'forgot_code' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="text-center space-y-1 pb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Enter Verification Code
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                We sent a 6-digit code to{' '}
                <span className="font-semibold text-blue-600 dark:text-blue-400">{email}</span>.
                Code expires in 10 minutes.
              </p>
            </div>

            <div>
              <label htmlFor="forgot-code" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 text-center">
                6-Digit Security Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="forgot-code"
                  name="code"
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCode(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text');
                    const digits = pasted.replace(/\D/g, '').slice(0, 6);
                    if (digits) {
                      setCode(digits);
                      if (errorMessage) setErrorMessage(null);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-4 py-3 text-center text-lg tracking-[0.4em] font-numeric font-bold text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Resend Code & Cooldown Section */}
            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setErrorMessage(null);
                  setMode('forgot_email');
                }}
                className="text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 underline cursor-pointer text-[11px] disabled:opacity-50"
              >
                Change Email
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCountdown > 0 || isSubmitting}
                className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed text-[11px]"
              >
                {resendCountdown > 0 ? (
                  <>
                    <Clock className="w-3.5 h-3.5" /> Resend code in {resendCountdown}s
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5" /> Resend Code
                  </>
                )}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || code.trim().length !== 6}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Verifying Code...
                </>
              ) : (
                <>
                  Verify Code <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setErrorMessage(null);
                setMode('login');
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors pt-1 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          </form>
        )}

        {/* MODE 4: FORGOT PASSWORD - STEP 3 (NEW PASSWORD ENTRY) */}
        {mode === 'forgot_password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="text-center space-y-1 pb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Create New Password
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Choose a secure password for your account (minimum 6 characters).
              </p>
            </div>

            <div>
              <label htmlFor="new-password" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="new-password"
                  name="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-blue-600 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Validation indicators */}
            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    newPassword.length >= 6 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'
                  }`}
                />
                <span className={newPassword.length >= 6 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                  At least 6 characters
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    confirmPassword && newPassword === confirmPassword
                      ? 'bg-emerald-500'
                      : 'bg-slate-300 dark:bg-zinc-600'
                  }`}
                />
                <span
                  className={
                    confirmPassword && newPassword === confirmPassword
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : ''
                  }
                >
                  Passwords match
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                newPassword.length < 6 ||
                newPassword !== confirmPassword
              }
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Updating Password...
                </>
              ) : (
                <>
                  Reset Password <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setErrorMessage(null);
                setMode('login');
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors pt-1 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Cancel and Return to Sign In
            </button>
          </form>
        )}

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


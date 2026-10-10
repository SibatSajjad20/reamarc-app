import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  Clock,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';

type AuthScreenMode = 'login' | 'forgot_email' | 'forgot_code' | 'forgot_password';

export const AuthScreen: React.FC = () => {
  const { login } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<AuthScreenMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Forgot password states
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: cleanEmail, password });
      addToast('Signed in', undefined, 'success');
    } catch (err: any) {
      const msg = err.message || 'Incorrect email or password.';
      setErrorMessage(msg);
      addToast('Authentication Failed', msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.forgotPassword(cleanEmail);
      setResendCountdown(60);
      setCode('');
      setMode('forgot_code');
      addToast(
        'Code sent',
        `If ${cleanEmail} is registered, a 6-digit code has been dispatched.`,
        'info'
      );
    } catch (err: any) {
      const msg = err.message || 'Failed to send verification code.';
      setErrorMessage(msg);
      addToast('Request Failed', msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0 || isSubmitting) return;
    const cleanEmail = email.trim();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await authService.forgotPassword(cleanEmail);
      setResendCountdown(60);
      addToast(
        'Code resent',
        `A new 6-digit code was sent to ${cleanEmail}.`,
        'info'
      );
    } catch (err: any) {
      const msg = err.message || 'Failed to resend verification code.';
      setErrorMessage(msg);
      addToast('Resend Failed', msg, 'error');
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
      addToast('Code verified', 'Please create your new password.', 'success');
    } catch (err: any) {
      const msg = err.message || 'Invalid or expired verification code.';
      setErrorMessage(msg);
      addToast('Verification Failed', msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
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
        'Password updated',
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
      addToast('Reset Failed', msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#FAF9FD] dark:bg-[#0A0B10] flex flex-col justify-between p-7 sm:p-11 overflow-x-hidden selection:bg-[#4F46E5]/20 text-slate-900 dark:text-slate-100">
      {/* Ambient glowing radial light sources matching mockup */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Top-right vivid violet bloom */}
        <div
          className="absolute -top-[10%] -right-[5%] w-[65vw] h-[65vw] max-w-[850px] max-h-[850px] rounded-full blur-[110px] pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(180, 160, 255, 0.42) 0%, rgba(206, 190, 255, 0.22) 50%, rgba(250, 249, 253, 0) 75%)',
          }}
        />
        {/* Bottom-left soft lavender glow */}
        <div
          className="absolute -bottom-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[750px] max-h-[750px] rounded-full blur-[120px] pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(195, 180, 255, 0.28) 0%, rgba(220, 210, 255, 0.12) 50%, rgba(250, 249, 253, 0) 75%)',
          }}
        />
        {/* Subtle center ambient warmth */}
        <div
          className="absolute top-[25%] right-[20%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full blur-[130px] pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(225, 215, 255, 0.3) 0%, rgba(250, 249, 253, 0) 70%)',
          }}
        />
      </div>

      {/* Top Header: Logo + Brand Name */}
      <header className="relative z-10 flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-[#4F46E5] text-white font-bold text-[17px] flex items-center justify-center shadow-xs select-none">
            R
          </div>
          <span className="text-[18px] font-bold tracking-tight text-[#0F172A] dark:text-white">
            Reamarc
          </span>
        </div>
      </header>

      {/* Center Login Card */}
      <main className="relative z-10 my-auto py-8 flex items-center justify-center w-full">
        <div className="w-full max-w-[470px] bg-white dark:bg-[#14161F] rounded-[24px] p-8 sm:p-11 shadow-[0_20px_50px_rgba(79,70,229,0.06),0_1px_3px_rgba(0,0,0,0.02)] border border-[#EDEDF5] dark:border-slate-800/80 transition-all">
          {/* Alerts */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5 animate-in fade-in duration-150"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-6 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs flex items-start gap-2.5 animate-in fade-in duration-150"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* MODE 1: LOGIN */}
          {mode === 'login' && (
            <div className="animate-in fade-in duration-150">
              <h1 className="text-[30px] font-bold text-[#0F172A] dark:text-white tracking-[-0.025em] leading-[36px]">
                Welcome back
              </h1>
              <p className="text-[15px] text-[#64748B] dark:text-slate-400 mt-2 font-normal">
                Sign in to your workspace to continue.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-4">
                {/* Work email */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-[13px] font-semibold text-[#1E293B] dark:text-slate-200 mb-2"
                  >
                    Work email
                  </label>
                  <div className="relative flex items-center">
                    <Mail
                      className="w-[18px] h-[18px] text-[#94A3B8] dark:text-slate-500 absolute left-3.5 pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                      required
                      className="w-full h-11 pl-10.5 pr-4 bg-white dark:bg-[#1A1C28] border border-[#E2E8F0] dark:border-slate-700/80 rounded-[10px] text-[14px] text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10 transition-all shadow-2xs"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <label
                      htmlFor="login-password"
                      className="text-[13px] font-semibold text-[#1E293B] dark:text-slate-200"
                    >
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
                      className="text-[13px] font-semibold text-[#4F46E5] hover:text-[#4338CA] dark:text-[#8D7EFF] dark:hover:text-[#A79CFF] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Lock
                      className="w-[18px] h-[18px] text-[#94A3B8] dark:text-slate-500 absolute left-3.5 pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                      required
                      className="w-full h-11 pl-10.5 pr-10.5 bg-white dark:bg-[#1A1C28] border border-[#E2E8F0] dark:border-slate-700/80 rounded-[10px] text-[14px] text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10 transition-all shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3.5 p-0.5 text-[#94A3B8] hover:text-[#64748B] dark:text-slate-500 dark:hover:text-slate-300 transition-colors focus:outline-none cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Keep me signed in */}
                <div className="pt-1">
                  <label className="flex items-center gap-2.5 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isSubmitting}
                      className="sr-only"
                    />
                    <div
                      className={`w-[17px] h-[17px] rounded-[4px] border flex items-center justify-center transition-colors ${
                        rememberMe
                          ? 'bg-[#4F46E5] border-[#4F46E5] text-white'
                          : 'bg-white dark:bg-[#1A1C28] border-[#CBD5E1] dark:border-slate-600'
                      }`}
                    >
                      {rememberMe && <Check className="w-3 h-3" strokeWidth={3} />}
                    </div>
                    <span className="text-[13px] text-[#334155] dark:text-slate-300 font-normal">
                      Keep me signed in
                    </span>
                  </label>
                </div>

                {/* Submit button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[46px] rounded-[10px] bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-[15px] transition-all shadow-sm shadow-[#4F46E5]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      'Sign in'
                    )}
                  </button>
                </div>

                {/* Footer note inside card */}
                <p className="text-[13px] text-[#64748B] dark:text-slate-400 text-center pt-3">
                  New to Reamarc? Ask your admin for an invite.
                </p>
              </form>
            </div>
          )}

          {/* MODE 2: FORGOT PASSWORD - STEP 1 (EMAIL ENTRY) */}
          {mode === 'forgot_email' && (
            <div className="animate-in fade-in duration-150">
              <h1 className="text-[26px] sm:text-[28px] font-bold text-[#0F172A] dark:text-white tracking-[-0.025em] leading-tight">
                Forgot your password?
              </h1>
              <p className="text-[14px] text-[#64748B] dark:text-slate-400 mt-2 font-normal">
                Enter your registered email address and we'll send you a 6-digit verification code.
              </p>

              <form onSubmit={handleSendCode} className="mt-8 space-y-4">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-[13px] font-semibold text-[#1E293B] dark:text-slate-200 mb-2"
                  >
                    Work email
                  </label>
                  <div className="relative flex items-center">
                    <Mail
                      className="w-[18px] h-[18px] text-[#94A3B8] dark:text-slate-500 absolute left-3.5 pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <input
                      id="forgot-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                      required
                      autoFocus
                      className="w-full h-11 pl-10.5 pr-4 bg-white dark:bg-[#1A1C28] border border-[#E2E8F0] dark:border-slate-700/80 rounded-[10px] text-[14px] text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10 transition-all shadow-2xs"
                    />
                  </div>
                </div>

                <div className="pt-3 space-y-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[46px] rounded-[10px] bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-[15px] transition-all shadow-sm shadow-[#4F46E5]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Sending code…</span>
                      </>
                    ) : (
                      'Send verification code'
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('login');
                    }}
                    className="w-full h-10 rounded-[10px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/40 text-[13px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to sign in</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* MODE 3: FORGOT PASSWORD - STEP 2 (CODE ENTRY) */}
          {mode === 'forgot_code' && (
            <div className="animate-in fade-in duration-150">
              <h1 className="text-[26px] sm:text-[28px] font-bold text-[#0F172A] dark:text-white tracking-[-0.025em] leading-tight">
                Enter verification code
              </h1>
              <p className="text-[14px] text-[#64748B] dark:text-slate-400 mt-2 font-normal">
                We sent a 6-digit code to{' '}
                <span className="font-semibold text-[#0F172A] dark:text-slate-200">{email}</span>. Code expires in 10 minutes.
              </p>

              <form onSubmit={handleVerifyCode} className="mt-8 space-y-5">
                <div className="space-y-2 text-center">
                  <label htmlFor="otp-input" className="block text-[13px] font-semibold text-[#1E293B] dark:text-slate-200 text-left">
                    6-digit verification code
                  </label>
                  <InputOTP
                    id="otp-input"
                    maxLength={6}
                    value={code}
                    onChange={(val) => {
                      setCode(val);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    autoFocus
                  >
                    <InputOTPGroup className="gap-2 sm:gap-2.5">
                      <InputOTPSlot index={0} className="h-12 w-11 rounded-[10px] border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#1A1C28] text-base" />
                      <InputOTPSlot index={1} className="h-12 w-11 rounded-[10px] border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#1A1C28] text-base" />
                      <InputOTPSlot index={2} className="h-12 w-11 rounded-[10px] border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#1A1C28] text-base" />
                      <InputOTPSlot index={3} className="h-12 w-11 rounded-[10px] border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#1A1C28] text-base" />
                      <InputOTPSlot index={4} className="h-12 w-11 rounded-[10px] border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#1A1C28] text-base" />
                      <InputOTPSlot index={5} className="h-12 w-11 rounded-[10px] border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#1A1C28] text-base" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {/* Resend and change email row */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('forgot_email');
                    }}
                    className="text-[#64748B] hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer disabled:opacity-50"
                  >
                    Change email
                  </button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCountdown > 0 || isSubmitting}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#4F46E5] hover:text-[#4338CA] dark:text-[#8D7EFF] disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                  >
                    {resendCountdown > 0 ? (
                      <>
                        <Clock className="w-3.5 h-3.5" /> Resend in {resendCountdown}s
                      </>
                    ) : (
                      <>
                        <RotateCw className="w-3.5 h-3.5" /> Resend code
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-3 space-y-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || code.trim().length !== 6}
                    className="w-full h-[46px] rounded-[10px] bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-[15px] transition-all shadow-sm shadow-[#4F46E5]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      'Verify code'
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('login');
                    }}
                    className="w-full h-10 rounded-[10px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/40 text-[13px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to sign in</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* MODE 4: FORGOT PASSWORD - STEP 3 (NEW PASSWORD ENTRY) */}
          {mode === 'forgot_password' && (
            <div className="animate-in fade-in duration-150">
              <h1 className="text-[26px] sm:text-[28px] font-bold text-[#0F172A] dark:text-white tracking-[-0.025em] leading-tight">
                Create new password
              </h1>
              <p className="text-[14px] text-[#64748B] dark:text-slate-400 mt-2 font-normal">
                Choose a secure password for your account (minimum 8 characters).
              </p>

              <form onSubmit={handleResetPassword} className="mt-8 space-y-4">
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-[13px] font-semibold text-[#1E293B] dark:text-slate-200 mb-2"
                  >
                    New password
                  </label>
                  <div className="relative flex items-center">
                    <Lock
                      className="w-[18px] h-[18px] text-[#94A3B8] dark:text-slate-500 absolute left-3.5 pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <input
                      id="new-password"
                      name="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                      required
                      autoFocus
                      className="w-full h-11 pl-10.5 pr-10.5 bg-white dark:bg-[#1A1C28] border border-[#E2E8F0] dark:border-slate-700/80 rounded-[10px] text-[14px] text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10 transition-all shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-3.5 p-0.5 text-[#94A3B8] hover:text-[#64748B] dark:text-slate-500 dark:hover:text-slate-300 transition-colors focus:outline-none cursor-pointer"
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-[13px] font-semibold text-[#1E293B] dark:text-slate-200 mb-2"
                  >
                    Confirm new password
                  </label>
                  <div className="relative flex items-center">
                    <Lock
                      className="w-[18px] h-[18px] text-[#94A3B8] dark:text-slate-500 absolute left-3.5 pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <input
                      id="confirm-password"
                      name="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                      required
                      className="w-full h-11 pl-10.5 pr-10.5 bg-white dark:bg-[#1A1C28] border border-[#E2E8F0] dark:border-slate-700/80 rounded-[10px] text-[14px] text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/10 transition-all shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((p) => !p)}
                      className="absolute right-3.5 p-0.5 text-[#94A3B8] hover:text-[#64748B] dark:text-slate-500 dark:hover:text-slate-300 transition-colors focus:outline-none cursor-pointer"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Validation indicators */}
                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="flex items-center gap-2 text-[#64748B] dark:text-slate-400">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        newPassword.length >= 8
                          ? 'bg-emerald-500'
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                    <span
                      className={
                        newPassword.length >= 8
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : ''
                      }
                    >
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[#64748B] dark:text-slate-400">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        confirmPassword && newPassword === confirmPassword
                          ? 'bg-emerald-500'
                          : 'bg-slate-300 dark:bg-slate-600'
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

                <div className="pt-3 space-y-2">
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                    className="w-full h-[46px] rounded-[10px] bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-[15px] transition-all shadow-sm shadow-[#4F46E5]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Updating password…</span>
                      </>
                    ) : (
                      'Update password'
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('login');
                    }}
                    className="w-full h-10 rounded-[10px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/40 text-[13px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to sign in</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Page Footer */}
      <footer className="relative z-10 flex items-center justify-between w-full text-[13px] text-[#64748B] dark:text-slate-500 pt-4">
        <span>© 2026 Reamarc</span>
        <div className="flex items-center gap-1.5">
          <span className="hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors">Privacy</span>
          <span>·</span>
          <span className="hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors">Terms</span>
        </div>
      </footer>
    </div>
  );
};

export default AuthScreen;

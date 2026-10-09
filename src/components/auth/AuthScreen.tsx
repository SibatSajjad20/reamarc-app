import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';
import { BrandMark } from '../ui/BrandMark';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Callout } from '../ui/Callout';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { Clock, RotateCw } from 'lucide-react';

type AuthScreenMode = 'login' | 'forgot_email' | 'forgot_code' | 'forgot_password';

export const AuthScreen: React.FC = () => {
  const { login } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<AuthScreenMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
    <div className="flex h-screen w-full bg-canvas text-fg overflow-hidden select-none">
      {/* Left panel: Form column */}
      <div className="w-full lg:w-[600px] shrink-0 bg-surface flex flex-col p-8 sm:p-10 border-r border-border overflow-y-auto min-h-full">
        {/* Brand header */}
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <span className="text-[15px] font-semibold text-fg">Reamarc</span>
        </div>

        {/* Centered form wrapper */}
        <div className="w-full max-w-[380px] m-auto py-8">
          {/* Alerts */}
          {errorMessage && (
            <Callout
              variant="danger"
              role="alert"
              className="mb-5 animate-in fade-in duration-120"
            >
              {errorMessage}
            </Callout>
          )}

          {successMessage && (
            <Callout
              variant="success"
              role="status"
              className="mb-5 animate-in fade-in duration-120"
            >
              {successMessage}
            </Callout>
          )}

          {/* MODE 1: LOGIN */}
          {mode === 'login' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-[240ms] ease-[var(--ease-standard)]">
              <h1 className="text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-fg">
                Sign in to Reamarc
              </h1>
              <p className="text-body text-fg-muted mt-1.5">
                Welcome back. Use your work email.
              </p>

              <form onSubmit={handleLogin} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="block text-label font-medium text-fg">
                    Work email
                  </label>
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@reamarc.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-label font-medium text-fg">
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
                      className="text-ui font-medium text-accent-text hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(!!checked)}
                    disabled={isSubmitting}
                  />
                  <label
                    htmlFor="remember-me"
                    className="text-ui font-normal text-fg-2 cursor-pointer select-none"
                  >
                    Keep me signed in on this device
                  </label>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    block
                    size="lg"
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    className="h-10 text-body font-medium"
                  >
                    {isSubmitting ? 'Signing in…' : 'Sign in'}
                  </Button>
                </div>

                <p className="text-small text-fg-muted mt-5 text-center">
                  New to Reamarc? Ask your admin for an invite.
                </p>
              </form>
            </div>
          )}

          {/* MODE 2: FORGOT PASSWORD - STEP 1 (EMAIL ENTRY) */}
          {mode === 'forgot_email' && (
            <div className="animate-in fade-in duration-160">
              <h1 className="text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-fg">
                Forgot your password?
              </h1>
              <p className="text-body text-fg-muted mt-1.5">
                Enter your registered email address and we'll send you a 6-digit verification code.
              </p>

              <form onSubmit={handleSendCode} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="forgot-email" className="block text-label font-medium text-fg">
                    Work email
                  </label>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@reamarc.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    required
                    autoFocus
                  />
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    type="submit"
                    variant="primary"
                    block
                    size="lg"
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    className="h-10 text-body font-medium"
                  >
                    {isSubmitting ? 'Sending code…' : 'Send verification code'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    block
                    size="md"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('login');
                    }}
                    className="text-ui font-medium text-fg-2 hover:text-fg"
                  >
                    Back to sign in
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* MODE 3: FORGOT PASSWORD - STEP 2 (CODE ENTRY) */}
          {mode === 'forgot_code' && (
            <div className="animate-in fade-in duration-160">
              <h1 className="text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-fg">
                Enter verification code
              </h1>
              <p className="text-body text-fg-muted mt-1.5">
                We sent a 6-digit code to{' '}
                <span className="font-medium text-fg">{email}</span>. Code expires in 10 minutes.
              </p>

              <form onSubmit={handleVerifyCode} className="mt-7 space-y-5">
                <div className="space-y-2 text-center">
                  <label htmlFor="otp-input" className="block text-label font-medium text-fg">
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
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {/* Resend and change email row */}
                <div className="flex items-center justify-between text-small pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('forgot_email');
                    }}
                    className="text-fg-muted hover:text-fg underline cursor-pointer disabled:opacity-50"
                  >
                    Change email
                  </button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCountdown > 0 || isSubmitting}
                    className="inline-flex items-center gap-1.5 font-medium text-accent-text hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                  >
                    {resendCountdown > 0 ? (
                      <>
                        <Clock className="w-3.5 h-3.5" /> Resend code in {resendCountdown}s
                      </>
                    ) : (
                      <>
                        <RotateCw className="w-3.5 h-3.5" /> Resend code
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    type="submit"
                    variant="primary"
                    block
                    size="lg"
                    loading={isSubmitting}
                    disabled={isSubmitting || code.trim().length !== 6}
                    className="h-10 text-body font-medium"
                  >
                    {isSubmitting ? 'Verifying…' : 'Verify code'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    block
                    size="md"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('login');
                    }}
                    className="text-ui font-medium text-fg-2 hover:text-fg"
                  >
                    Back to sign in
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* MODE 4: FORGOT PASSWORD - STEP 3 (NEW PASSWORD ENTRY) */}
          {mode === 'forgot_password' && (
            <div className="animate-in fade-in duration-160">
              <h1 className="text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-fg">
                Create new password
              </h1>
              <p className="text-body text-fg-muted mt-1.5">
                Choose a secure password for your account (minimum 8 characters).
              </p>

              <form onSubmit={handleResetPassword} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="new-password" className="block text-label font-medium text-fg">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    name="new-password"
                    type="password"
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
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="block text-label font-medium text-fg">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                {/* Validation indicators */}
                <div className="space-y-1 pt-1 text-small">
                  <div className="flex items-center gap-2 text-fg-muted">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        newPassword.length >= 8 ? 'bg-success-dot' : 'bg-border-strong'
                      }`}
                    />
                    <span className={newPassword.length >= 8 ? 'text-success-fg font-medium' : ''}>
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-fg-muted">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        confirmPassword && newPassword === confirmPassword
                          ? 'bg-success-dot'
                          : 'bg-border-strong'
                      }`}
                    />
                    <span
                      className={
                        confirmPassword && newPassword === confirmPassword
                          ? 'text-success-fg font-medium'
                          : ''
                      }
                    >
                      Passwords match
                    </span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    type="submit"
                    variant="primary"
                    block
                    size="lg"
                    loading={isSubmitting}
                    disabled={
                      isSubmitting ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                    className="h-10 text-body font-medium"
                  >
                    {isSubmitting ? 'Updating password…' : 'Update password'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    block
                    size="md"
                    disabled={isSubmitting}
                    onClick={() => {
                      setErrorMessage(null);
                      setMode('login');
                    }}
                    className="text-ui font-medium text-fg-2 hover:text-fg"
                  >
                    Back to sign in
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-small text-fg-muted flex items-center justify-between pt-6 mt-auto">
          <span>© 2026 Reamarc</span>
          <span>Privacy · Terms · Help</span>
        </div>
      </div>

      {/* Right panel: Static preview panel (hidden on smaller screens) */}
      <div className="hidden lg:flex flex-1 bg-canvas flex-col justify-center py-14 pl-16 pr-10 overflow-hidden relative select-none animate-in fade-in duration-[240ms] delay-[60ms] ease-[var(--ease-standard)]">
        <div className="max-w-[520px]">
          <h2 className="text-[22px] leading-[30px] font-semibold tracking-[-0.015em] text-fg">
            Attendance, daily logs, leads and content approvals in one place.
          </h2>
          <p className="text-small text-fg-muted mt-2">
            Built for the Reamarc team and its clients.
          </p>
        </div>

        <div className="mt-8 w-[980px] max-w-full rounded-lg border border-border overflow-hidden shadow-lg bg-surface">
          <picture>
            <source srcSet="/login-shot.webp" type="image/webp" />
            <img
              src="/login-shot.webp"
              alt="Reamarc operations hub preview"
              className="w-full block"
            />
          </picture>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;

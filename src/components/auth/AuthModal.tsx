import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Lock, Mail, Sparkles, ArrowRight, Eye, EyeOff } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, login } = useAuth();
  const { addToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      addToast('Missing Fields', 'Please fill in all required fields.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email, password });
      addToast('Signed in', undefined, 'success');
      setEmail('');
      setPassword('');
      closeAuthModal();
    } catch (err: any) {
      addToast('Authentication Failed', err.message || 'Check your credentials and try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      maxWidth="md"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-subtle border border-border flex items-center justify-center text-accent-text">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fg">
              Sign In to Reamarc
            </h2>
            <p className="text-xs text-fg-muted mt-0.5 font-normal">
              Access your social campaigns and AI inbox.
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-medium text-fg mb-1.5">Email Address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-fg-muted absolute left-3.5 top-3" />
            <input
              type="email"
              placeholder="admin@reamarc.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-subtle border border-border focus:border-accent rounded-lg pl-10 pr-4 py-2.5 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-fg mb-1.5">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-fg-muted absolute left-3.5 top-3" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-subtle border border-border focus:border-accent rounded-lg pl-10 pr-10 py-2.5 text-xs text-fg placeholder:text-fg-muted focus:outline-hidden transition-colors"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3 text-fg-muted hover:text-fg"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50 text-xs font-medium transition-colors cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Sparkles className="w-4 h-4 animate-spin" /> Authenticating...
            </>
          ) : (
            <>
              Sign In <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
};


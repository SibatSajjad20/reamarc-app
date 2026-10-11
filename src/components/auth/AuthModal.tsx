import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { FormDialog, FormDialogHeader, FormDialogBody } from '../ui/FormDialogLayout';
import { FormFooter } from '../ui/FormFooter';
import { Button } from '../ui/button';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

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
    <FormDialog
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      maxWidth="md"
    >
      <FormDialogHeader
        title="Sign In to Reamarc"
        subtitle="Access your social campaigns and AI inbox."
        icon={<Lock className="w-5 h-5 text-accent-text" />}
        onClose={closeAuthModal}
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <FormDialogBody className="space-y-4">
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
        </FormDialogBody>

        <FormFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={closeAuthModal}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Sign In
          </Button>
        </FormFooter>
      </form>
    </FormDialog>
  );
};

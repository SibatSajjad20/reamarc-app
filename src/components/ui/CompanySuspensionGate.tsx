import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { Button } from './button';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingProvider';

export const CompanySuspensionGate: React.FC = () => {
  const { logout } = useAuth();
  const { companyName, logoUrl } = useBranding();

  return (
    <div className="min-h-screen w-full bg-canvas flex flex-col items-center justify-center p-4 sm:p-6 text-fg">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-lg text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <BrandMark size={56} initial={companyName.charAt(0)} logoUrl={logoUrl || undefined} />
            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-1 border-2 border-surface">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-fg">Access Paused</h1>
          <p className="text-sm text-fg-muted leading-relaxed">
            Workspace access for <span className="font-semibold text-fg">{companyName}</span> has been temporarily paused.
          </p>
        </div>

        <div className="p-3.5 bg-subtle/50 rounded-xl border border-border/60 text-xs text-fg-muted text-left space-y-1.5">
          <p className="font-medium text-fg">What should I do?</p>
          <p>
            Please contact your organization's system administrator or workspace billing owner to reactivate company access.
          </p>
        </div>

        <div className="pt-2">
          <Button
            variant="outline"
            onClick={() => void logout()}
            className="w-full flex items-center justify-center gap-2 text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompanySuspensionGate;

import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CompanyBrandingForm } from '@/components/settings/sections/CompanyBrandingForm';
import { ownerBrandingAdapter } from '@/services/companyBrandingService';
import type { Company } from '@/services/ownerService';

interface CompanyBrandingSheetProps {
  company: Company | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export const CompanyBrandingSheet: React.FC<CompanyBrandingSheetProps> = ({
  company,
  onClose,
  onSaved,
}) => {
  return (
    <Sheet open={Boolean(company)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[520px] p-0 flex flex-col h-full bg-surface overflow-x-hidden min-w-0"
      >
        <SheetHeader className="p-5 border-b border-border shrink-0">
          <SheetTitle className="text-h2 font-semibold text-fg">
            {company?.name} branding
          </SheetTitle>
          <SheetDescription className="text-small text-fg-muted break-words">
            Logo, display name and accent colour for {company?.name}.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 overflow-y-auto overflow-x-hidden flex-1 min-w-0">
          {company && (
            <CompanyBrandingForm
              variant="drawer"
              adapter={ownerBrandingAdapter(company.id)}
              onSaved={() => void onSaved?.()}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

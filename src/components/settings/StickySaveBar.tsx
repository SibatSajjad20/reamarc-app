import React from 'react';
import { Button } from '@/components/ui/button';

interface StickySaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saveLabel?: string;
  errorMessage?: string | null;
}

export const StickySaveBar: React.FC<StickySaveBarProps> = ({
  isDirty,
  isSaving,
  onDiscard,
  onSave,
  saveLabel = 'Save changes',
  errorMessage,
}) => {
  if (!isDirty) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[92vw] bg-surface/95 backdrop-blur-md border border-border rounded-xl px-5 py-3 shadow-lg flex flex-wrap items-center justify-between gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-180">
      <div className="flex items-center gap-2 text-xs font-medium text-fg">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
        <span>You have unsaved changes</span>
        {errorMessage && (
          <span className="text-danger ml-2 font-normal">({errorMessage})</span>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onDiscard}
          disabled={isSaving}
        >
          Discard
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={isSaving}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
};

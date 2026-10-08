import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({ open, onOpenChange }) => {
  const isMac =
    typeof window !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(window.navigator.userAgent);

  const metaKey = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const shortcuts = [
    {
      description: 'Search pages and actions',
      keys: [`${metaKey}`, 'K'],
    },
    {
      description: 'Show keyboard shortcuts',
      keys: [`${metaKey}`, '/'],
    },
    {
      description: 'Close active modal or panel',
      keys: ['Esc'],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="sm" className="p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-h2 font-semibold text-fg">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs text-fg-muted mt-1">
            Global hotkeys available across Reamarc.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 space-y-2">
          {shortcuts.map((item) => (
            <div
              key={item.description}
              className="flex items-center justify-between py-2 px-2.5 rounded-md hover:bg-hover transition-colors"
            >
              <span className="text-[13px] text-fg-2">{item.description}</span>
              <div className="flex items-center gap-1">
                {item.keys.map((k) => (
                  <kbd
                    key={k}
                    className="font-mono text-xs leading-[18px] border border-border rounded px-1.5 py-0.5 text-fg-muted bg-surface select-none shadow-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

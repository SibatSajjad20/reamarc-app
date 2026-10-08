import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { TriangleAlert, Info } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  typeToConfirm?: string;
}

export interface AlertOptions {
  title: string;
  description?: string;
}

export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
};

export const useAlert = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useAlert must be used within ConfirmProvider');
  return ctx.alert;
};

export const usePrompt = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('usePrompt must be used within ConfirmProvider');
  return ctx.prompt;
};

type DialogState =
  | { type: 'none' }
  | {
      type: 'confirm';
      options: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      type: 'alert';
      options: AlertOptions;
      resolve: () => void;
    }
  | {
      type: 'prompt';
      options: PromptOptions;
      resolve: (value: string | null) => void;
    };

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState>({ type: 'none' });
  const [typedValue, setTypedValue] = useState('');
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setTypedValue('');
      setState({ type: 'confirm', options, resolve });
    });
  }, []);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      setState({ type: 'alert', options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setTypedValue(options.defaultValue || '');
      setState({ type: 'prompt', options, resolve });
    });
  }, []);

  const handleClose = () => {
    if (state.type === 'confirm') {
      state.resolve(false);
    } else if (state.type === 'alert') {
      state.resolve();
    } else if (state.type === 'prompt') {
      state.resolve(null);
    }
    setState({ type: 'none' });
  };

  const handleConfirm = () => {
    if (state.type === 'confirm') {
      state.resolve(true);
    } else if (state.type === 'alert') {
      state.resolve();
    } else if (state.type === 'prompt') {
      state.resolve(typedValue);
    }
    setState({ type: 'none' });
  };

  const isOpen = state.type !== 'none';

  return (
    <ConfirmContext.Provider value={{ confirm, alert, prompt }}>
      {children}

      <AlertDialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay,50)] bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150" />
          <AlertDialogPrimitive.Content
            className="fixed left-[50%] top-[50%] z-[var(--z-dialog,51)] grid w-full max-w-[400px] translate-x-[-50%] translate-y-[-50%] bg-surface border border-border rounded-lg shadow-lg p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 outline-none"
          >
            {state.type === 'confirm' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  {state.options.tone === 'danger' ? (
                    <div className="w-10 h-10 rounded-full bg-danger-bg flex items-center justify-center text-danger-fg shrink-0">
                      <TriangleAlert size={20} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-fg-muted shrink-0">
                      <Info size={20} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <AlertDialogPrimitive.Title className="text-h2 font-semibold text-fg tracking-tight">
                      {state.options.title}
                    </AlertDialogPrimitive.Title>
                    {state.options.description && (
                      <AlertDialogPrimitive.Description className="text-body text-fg-muted mt-1 leading-normal">
                        {state.options.description}
                      </AlertDialogPrimitive.Description>
                    )}
                  </div>
                </div>

                {state.options.typeToConfirm && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-small text-fg-muted">
                      Type <strong className="text-fg font-mono">{state.options.typeToConfirm}</strong> to confirm:
                    </label>
                    <Input
                      value={typedValue}
                      onChange={(e) => setTypedValue(e.target.value)}
                      placeholder={state.options.typeToConfirm}
                      autoFocus
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <AlertDialogPrimitive.Cancel asChild>
                    <Button
                      ref={cancelButtonRef}
                      variant="secondary"
                      onClick={handleClose}
                    >
                      {state.options.cancelLabel || 'Cancel'}
                    </Button>
                  </AlertDialogPrimitive.Cancel>
                  <AlertDialogPrimitive.Action asChild>
                    <Button
                      variant={state.options.tone === 'danger' ? 'danger' : 'primary'}
                      onClick={handleConfirm}
                      disabled={
                        Boolean(state.options.typeToConfirm && typedValue !== state.options.typeToConfirm)
                      }
                    >
                      {state.options.confirmLabel || (state.options.tone === 'danger' ? 'Delete' : 'Confirm')}
                    </Button>
                  </AlertDialogPrimitive.Action>
                </div>
              </div>
            )}

            {state.type === 'alert' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-fg-muted shrink-0">
                    <Info size={20} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <AlertDialogPrimitive.Title className="text-h2 font-semibold text-fg tracking-tight">
                      {state.options.title}
                    </AlertDialogPrimitive.Title>
                    {state.options.description && (
                      <AlertDialogPrimitive.Description className="text-body text-fg-muted mt-1 leading-normal">
                        {state.options.description}
                      </AlertDialogPrimitive.Description>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <AlertDialogPrimitive.Action asChild>
                    <Button onClick={handleConfirm}>
                      OK
                    </Button>
                  </AlertDialogPrimitive.Action>
                </div>
              </div>
            )}

            {state.type === 'prompt' && (
              <div className="space-y-4">
                <div>
                  <AlertDialogPrimitive.Title className="text-h2 font-semibold text-fg tracking-tight">
                    {state.options.title}
                  </AlertDialogPrimitive.Title>
                  {state.options.label && (
                    <AlertDialogPrimitive.Description className="text-body text-fg-muted mt-1 leading-normal">
                      {state.options.label}
                    </AlertDialogPrimitive.Description>
                  )}
                </div>

                <Input
                  value={typedValue}
                  onChange={(e) => setTypedValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                  autoFocus
                />

                <div className="flex items-center justify-end gap-2 pt-2">
                  <AlertDialogPrimitive.Cancel asChild>
                    <Button variant="secondary" onClick={handleClose}>
                      Cancel
                    </Button>
                  </AlertDialogPrimitive.Cancel>
                  <AlertDialogPrimitive.Action asChild>
                    <Button onClick={handleConfirm}>
                      OK
                    </Button>
                  </AlertDialogPrimitive.Action>
                </div>
              </div>
            )}
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </ConfirmContext.Provider>
  );
};

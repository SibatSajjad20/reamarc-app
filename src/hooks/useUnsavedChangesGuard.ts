import { useCallback, useEffect, useRef } from 'react';
import { useConfirm } from '../components/ui/ConfirmProvider';

export async function requestInAppNavigation(guard: (() => Promise<boolean>) | null | undefined): Promise<boolean> {
  if (!guard) return true;
  return guard();
}

export function useUnsavedChangesGuard(isDirty: boolean) {
  const confirm = useConfirm();
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const confirmDiscard = useCallback(async () => {
    if (!dirtyRef.current) return true;
    return confirm({
      title: 'Discard changes?',
      description: 'You have unsaved changes. If you leave, they will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
  }, [confirm]);

  return { confirmDiscard, isDirty };
}

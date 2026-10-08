import React from 'react';
import type { ToastMessage } from '../types';

export interface ToastProps {
  toasts?: ToastMessage[];
  onDismiss?: (id: string) => void;
}

/**
 * @deprecated Toasts are rendered via Sonner in ToastProvider (src/context/ToastContext.tsx).
 * Kept for backwards compatibility.
 */
export const ToastContainer: React.FC<ToastProps> = () => null;

export default ToastContainer;

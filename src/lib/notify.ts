export type FileUrlNotifyType = 'success' | 'info' | 'warning' | 'error';

export type FileUrlNotifier = (
  title: string,
  message?: string,
  type?: FileUrlNotifyType
) => void;

let activeNotifier: FileUrlNotifier | null = null;

export const setFileUrlNotifier = (notifier: FileUrlNotifier | null) => {
  activeNotifier = notifier;
};

export const notifyFileUrl = (
  title: string,
  message?: string,
  type: FileUrlNotifyType = 'error'
) => {
  if (activeNotifier) {
    activeNotifier(title, message, type);
  } else if (typeof window !== 'undefined' && window.alert) {
    window.alert(message ? `${title}\n\n${message}` : title);
  }
};

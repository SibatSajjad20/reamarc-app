import React from 'react';
import { cn } from '../../lib/utils';
import { htmlToPlainText, sanitizeTaskHtml, TASK_DESC_HTML_CLASS } from '../../utils/taskDescriptionHtml';

export const TaskDescriptionHtml: React.FC<{
  html?: string | null;
  className?: string;
  clamp?: boolean;
}> = ({ html, className, clamp = false }) => {
  const sanitized = sanitizeTaskHtml(html || '');
  const plain = htmlToPlainText(html || '');
  if (!plain) {
    return <span className={cn('text-fg-faint italic', className)}>—</span>;
  }
  return (
    <span
      title={plain}
      className={cn(TASK_DESC_HTML_CLASS, clamp && 'line-clamp-2', 'leading-snug text-fg', className)}
      dangerouslySetInnerHTML={{ __html: sanitized || plain }}
    />
  );
};

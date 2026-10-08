import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { DailyLogForm } from './DailyLogForm';
import type { DailyLogEntry, DailyLogColumn } from '../../types/dailyLog';

export interface DailyLogModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: DailyLogEntry | null;
  prefilledDate?: string;
  columns?: DailyLogColumn[];
  activeSheet: string;
  currentUser?: { name?: string; role?: string; full_name?: string; department?: string } | null;
  existingEntries?: DailyLogEntry[];
  onClose: () => void;
  onSaved: (entry: DailyLogEntry) => void;
  onRefreshRequired?: () => void;
}

export const DailyLogModal: React.FC<DailyLogModalProps> = ({
  isOpen,
  mode,
  initialData,
  prefilledDate,
  columns = [],
  activeSheet,
  currentUser,
  existingEntries = [],
  onClose,
  onSaved,
  onRefreshRequired,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent maxWidth="lg" className="p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border bg-subtle/40">
          <DialogTitle>
            {mode === 'create' ? 'Add daily log entry' : 'Edit daily log entry'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? `Logging for sheet: ${activeSheet}`
              : `Updating entry (v${initialData?.version || 1}) · ${initialData?.month_sheet || activeSheet}`}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          <DailyLogForm
            mode={mode}
            initialData={initialData}
            prefilledDate={prefilledDate}
            columns={columns}
            activeSheet={activeSheet}
            currentUser={currentUser}
            existingEntries={existingEntries}
            onClose={onClose}
            onSaved={onSaved}
            onRefreshRequired={onRefreshRequired}
            layout="dialog"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

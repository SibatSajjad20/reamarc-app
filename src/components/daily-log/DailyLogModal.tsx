import React from 'react';
import { FormDialog } from '../ui/FormDialogLayout';
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
  onDateChange?: (date: string) => void;
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
  onDateChange,
}) => {
  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={mode === 'create' ? 'Add daily log entry' : 'Edit daily log entry'}
      subtitle={
        mode === 'create'
          ? `Logging for sheet: ${activeSheet}`
          : `Updating entry (v${initialData?.version || 1}) · ${initialData?.month_sheet || activeSheet}`
      }
    >
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
        onDateChange={onDateChange}
      />
    </FormDialog>
  );
};

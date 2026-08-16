import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Briefcase,
  Plus,
  Trash2,
  Edit2,
  Check,
  Code,
} from 'lucide-react';
import { useDesignations } from '../../hooks/useDesignations';

interface ManageDesignationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManageDesignationsModal: React.FC<ManageDesignationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { designations, addDesignation, updateDesignation, removeDesignation } = useDesignations();
  const [newTitle, setNewTitle] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!newTitle.trim()) {
      setErrorMsg('Designation title cannot be empty.');
      return;
    }
    const success = addDesignation(newTitle.trim());
    if (!success) {
      setErrorMsg('This designation already exists.');
      return;
    }
    setNewTitle('');
  };

  const handleStartEdit = (index: number, currentText: string) => {
    setEditingIndex(index);
    setEditingText(currentText);
    setErrorMsg(null);
  };

  const handleSaveEdit = (oldTitle: string) => {
    if (!editingText.trim()) {
      setErrorMsg('Designation title cannot be empty.');
      return;
    }
    const success = updateDesignation(oldTitle, editingText.trim());
    if (!success) {
      setErrorMsg('A designation with this title already exists.');
      return;
    }
    setEditingIndex(null);
    setEditingText('');
  };

  const handleDelete = (title: string) => {
    if (designations.length <= 1) {
      setErrorMsg('You must have at least one designation.');
      return;
    }
    removeDesignation(title);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center w-screen h-screen bg-black/60 backdrop-blur-xs animate-fadeIn p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#12141c] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-scaleIn overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Manage Designations</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Add, edit, or remove organization job titles</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900">
              {errorMsg}
            </div>
          )}

          {/* Add New Designation Form */}
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. Media Buyer, QA Engineer..."
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                setErrorMsg(null);
              }}
              className="flex-1 px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition shadow-sm shadow-indigo-600/20 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          {/* Designation List */}
          <div className="space-y-1.5 pt-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Current Designations ({designations.length})
            </span>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              {designations.map((title, idx) => {
                const isEditing = editingIndex === idx;
                return (
                  <div
                    key={title}
                    className="flex items-center justify-between p-3 bg-white dark:bg-[#12141c] hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(title);
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                          autoFocus
                          className="flex-1 px-2.5 py-1 text-xs bg-zinc-50 dark:bg-zinc-900 border border-indigo-500 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(title)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-md transition cursor-pointer"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIndex(null)}
                          className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg">
                          <Code className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(idx, title)}
                          className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                          title="Edit title"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {designations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDelete(title)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                            title="Delete designation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition cursor-pointer shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

import React, { useState } from 'react';
import { X, Sparkles, MessageSquare, Tag, AlertCircle } from 'lucide-react';
import type { PlatformType } from '../../types';
import { PlatformIcon } from '../../utils/platform';

interface ReviewFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitFeedback: (feedback: string, presetTags: string[]) => Promise<void>;
  currentCopy: string;
  platform: PlatformType;
  campaignTitle?: string;
}

const PRESET_FEEDBACK_TAGS = [
  { id: 'punchy', label: '⚡ Make Punchier', desc: 'Shorten paragraphs & use active voice' },
  { id: 'professional', label: '💼 More Professional', desc: 'Formal B2B executive tone' },
  { id: 'cta', label: '🎯 Stronger Call-to-Action', desc: 'Add high-converting CTA' },
  { id: 'stats', label: '📊 Include Stats & SLA', desc: 'Emphasize data & performance metrics' },
  { id: 'soften', label: '🌿 Soften Tone', desc: 'More conversational & approachable' },
  { id: 'compliance', label: '🔒 Add Compliance/Disclaimer', desc: 'Include legal/regulatory notice' },
];

export const ReviewFeedbackModal: React.FC<ReviewFeedbackModalProps> = ({
  isOpen,
  onClose,
  onSubmitFeedback,
  currentCopy,
  platform,
  campaignTitle = 'Social Media Campaign',
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleTag = (tagLabel: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagLabel)
        ? prev.filter((t) => t !== tagLabel)
        : [...prev, tagLabel]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTags.length === 0 && !feedbackText.trim()) {
      setErrorMsg('Please select at least one preset tag or type custom feedback notes.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onSubmitFeedback(feedbackText.trim(), selectedTags);
      setFeedbackText('');
      setSelectedTags([]);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not process rewrite request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className="w-full max-w-2xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800/80 flex items-start justify-between bg-slate-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-zinc-100">
                  Review & Guide AI Rewrite
                </h3>
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                  <PlatformIcon platform={platform} className="w-3.5 h-3.5" />
                  {platform}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
                Provide notes or tap tags to instruct Gemini AI on exact adjustments for {campaignTitle}.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Current Script Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Current Post Draft</span>
              <span className="text-[11px] font-normal text-slate-400 dark:text-zinc-500">Read-Only</span>
            </label>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 max-h-28 overflow-y-auto font-mono leading-relaxed">
              {currentCopy}
            </div>
          </div>

          {/* Quick Preset Feedback Tags */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>One-Click Feedback Tags (Select multiple):</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_FEEDBACK_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag.label);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.label)}
                    className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/20'
                        : 'bg-white dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span className="text-xs font-bold">{tag.label}</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium mt-1">
                      {tag.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Freeform Instructions Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              Detailed Revision Notes & Context (Optional):
            </label>
            <textarea
              rows={3}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g. 'Make it less promotional, emphasize our 99.9% uptime SLA, and end with a link to our whitepaper...'"
              className="w-full bg-slate-50 dark:bg-zinc-900/60 border border-slate-300 dark:border-zinc-800 rounded-2xl p-3.5 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 transition-colors font-sans resize-none"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Rewriting with Gemini AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Submit Review & Rewrite Post</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

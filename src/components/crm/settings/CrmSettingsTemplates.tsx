import React, { useEffect, useState, useRef } from 'react';
import { Loader2, Plus, Trash2, MessageSquareText, Sparkles, Check, Copy } from 'lucide-react';
import { crmService } from '../../../services/crmService';
import { useToast } from '../../../context/ToastContext';
import type { CrmTemplate } from '../../../types/crm';

const PLACEHOLDERS = [
  { tag: 'first_name', label: 'First Name', example: 'Alex' },
  { tag: 'name', label: 'Full Name', example: 'Alex Miller' },
  { tag: 'company', label: 'Company', example: 'Acme Digital' },
  { tag: 'service', label: 'Service', example: 'Performance Marketing' },
  { tag: 'city', label: 'City', example: 'Dubai' },
  { tag: 'source', label: 'Source', example: 'Website' },
];

export const CrmSettingsTemplates: React.FC = () => {
  const { addToast } = useToast();
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hi {{first_name}}, this is Reamarc. Thanks for your interest in our {{service}} services!');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmService.listTemplates();
      setTemplates(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleInsertTag = (tag: string) => {
    const el = textareaRef.current;
    const tagText = `{{${tag}}}`;
    if (!el) {
      setBody((prev) => `${prev} ${tagText}`);
      return;
    }
    const start = el.selectionStart || body.length;
    const end = el.selectionEnd || body.length;
    const newBody = body.substring(0, start) + tagText + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      el.focus();
      const pos = start + tagText.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!body.trim()) {
      setError('Template body is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await crmService.createTemplate({
        name: name.trim(),
        body: body.trim(),
        is_default: isDefault,
      });
      setName('');
      setBody('Hi {{first_name}}, this is Reamarc. Thanks for reaching out!');
      setIsDefault(false);
      addToast('Template created', `"${name.trim()}" is ready to use.`, 'success');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (tpl: CrmTemplate) => {
    try {
      await crmService.updateTemplate(tpl.id, { is_default: true });
      addToast('Default template updated', `"${tpl.name}" is now the primary template.`, 'success');
      await load();
    } catch (err: any) {
      addToast('Failed to update', err?.message || 'Could not set default.', 'warning');
    }
  };

  const handleDelete = async (tpl: CrmTemplate) => {
    setDeletingId(tpl.id);
    try {
      await crmService.deleteTemplate(tpl.id);
      addToast('Template deleted', `"${tpl.name}" removed.`, 'info');
      await load();
    } catch (err: any) {
      addToast('Failed to delete', err?.message || 'Could not delete template.', 'warning');
    } finally {
      setDeletingId(null);
    }
  };

  const copyTemplateContent = (tpl: CrmTemplate) => {
    navigator.clipboard.writeText(tpl.body);
    setCopiedId(tpl.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Preview interpolation with sample dummy lead
  const getLivePreview = () => {
    let preview = body;
    PLACEHOLDERS.forEach(({ tag, example }) => {
      preview = preview.replaceAll(`{{${tag}}}`, example);
    });
    return preview;
  };

  return (
    <div className="space-y-6">
      {/* Intro Header Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Outreach & WhatsApp Message Templates</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Create reusable templates with smart merge tags for instant customer outreach and automated follow-ups.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-numeric">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </span>
        </div>
      </div>

      {/* Main Grid: Configured Templates List + Create Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Configured Templates */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Active Templates
            </h3>
            {loading && <span className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>}
          </div>

          {loading && templates.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
              <p className="text-xs text-zinc-400">Fetching templates…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-dashed border-zinc-300 dark:border-zinc-800 text-center space-y-2">
              <MessageSquareText className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No message templates created yet</p>
              <p className="text-[11px] text-zinc-400">Use the form to create your first outreach template.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((tpl) => {
                const isDeleting = deletingId === tpl.id;
                const isCopied = copiedId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className="group p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-2xs space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {tpl.name}
                        </span>
                        {tpl.is_default && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-2.5 h-2.5" />
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyTemplateContent(tpl)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                          title="Copy raw text"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        {!tpl.is_default && (
                          <button
                            type="button"
                            onClick={() => void handleSetDefault(tpl)}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition cursor-pointer"
                          >
                            Set default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(tpl)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-50"
                          title="Delete template"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/60 font-sans text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {tpl.body}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Create Template Form + Live Preview */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Create Template
          </h3>

          <form
            onSubmit={handleCreate}
            className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4"
          >
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Inbound Website Lead Welcome"
                className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Message Body
                </label>
                <span className="text-[10px] text-zinc-400 font-numeric">{body.length} characters</span>
              </div>

              {/* Dynamic tag chips */}
              <div className="mb-2">
                <span className="text-[10px] font-medium text-zinc-400 block mb-1">Click to insert dynamic tag:</span>
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDERS.map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleInsertTag(tag)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 border border-zinc-200/60 dark:border-zinc-700/60 transition cursor-pointer"
                      title={`Insert {{${tag}}}`}
                    >
                      +{label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Write your template text here with dynamic tags..."
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition leading-relaxed font-sans"
                required
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500"
              />
              <span>Set as default template for new outreach</span>
            </label>

            {/* Real-time Interactive Preview Box */}
            <div className="p-3.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Sample Preview</span>
              </div>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed italic bg-white dark:bg-[#11131a] p-2.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/80">
                "{getLivePreview()}"
              </p>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Save Template
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

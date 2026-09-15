import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { crmService } from '../../services/crmService';
import type { CrmTemplate } from '../../types/crm';

interface CrmTemplatesPanelProps {
  onClose: () => void;
}

export const CrmTemplatesPanel: React.FC<CrmTemplatesPanelProps> = ({ onClose }) => {
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState(
    'Hi {{first_name}}, this is Reamarc. Thanks for your interest{{service_clause}}.'
  );
  const [isDefault, setIsDefault] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await crmService.listTemplates());
    } catch (err: any) {
      setError(err?.message || 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await crmService.createTemplate({
        name: name.trim(),
        body: body.trim(),
        is_default: isDefault,
      });
      setName('');
      setIsDefault(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const PLACEHOLDERS = [
    'first_name',
    'name',
    'company',
    'service',
    'city',
    'source',
    'service_clause',
    'company_clause',
  ];

  const insertPlaceholder = (tag: string) => {
    setBody((prev) => `${prev} {{${tag}}}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl max-h-[86vh] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">WhatsApp templates</h2>
            <p className="text-xs text-zinc-500">Preset WhatsApp responses with dynamic lead interpolation.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Click tag to insert into template:</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertPlaceholder(p)}
                  className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 transition cursor-pointer"
                >
                  {`{{${p}}}`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-zinc-400">Loading templates…</p>
          ) : (
            <ul className="space-y-2.5">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3.5 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{tpl.name}</span>
                        {tpl.is_default && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-[#11131a] p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800">
                        {tpl.body}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 pt-0.5">
                      {!tpl.is_default && (
                        <button
                          type="button"
                          className="h-7 px-2.5 text-[11px] font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 cursor-pointer shadow-2xs transition"
                          onClick={() =>
                            void crmService.updateTemplate(tpl.id, { is_default: true }).then(load)
                          }
                        >
                          Set default
                        </button>
                      )}
                      <button
                        type="button"
                        className="p-1.5 text-zinc-400 hover:text-rose-600 cursor-pointer rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                        onClick={() => void crmService.deleteTemplate(tpl.id).then(load)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleCreate} className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Add new template</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="Template name (e.g. Inbound Website Lead Welcome)"
              required
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed font-sans"
              required
            />
            <label className="text-xs inline-flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300 font-medium">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded text-indigo-600"
              />
              Set as default template for new outreach
            </label>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <div>
              <button
                type="submit"
                disabled={saving}
                className="h-8.5 px-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 transition shadow-xs"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Save template
              </button>
            </div>
          </form>
        </div>
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

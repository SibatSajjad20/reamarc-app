import React, { useEffect, useState, useRef } from 'react';
import { Loader2, Plus, Trash2, MessageSquareText, Eye, Check, Copy } from 'lucide-react';
import { crmService } from '../../../services/crmService';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../ui/button';
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
      addToast('Failed to update', err?.message || 'Could not set default.', 'error');
    }
  };

  const handleDelete = async (tpl: CrmTemplate) => {
    setDeletingId(tpl.id);
    try {
      await crmService.deleteTemplate(tpl.id);
      addToast('Template deleted', `"${tpl.name}" removed.`, 'info');
      await load();
    } catch (err: any) {
      addToast('Failed to delete', err?.message || 'Could not delete template.', 'error');
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
      <div className="p-4 rounded-lg bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
            <MessageSquareText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-fg">Message templates</h2>
            <p className="text-small text-fg-muted mt-0.5">
              Create reusable templates with merge tags for instant customer outreach and automated follow-ups.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span className="px-2.5 py-0.5 text-micro font-medium rounded-full bg-subtle text-fg-muted border border-border font-numeric">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </span>
        </div>
      </div>

      {/* Main Grid: Configured Templates List + Create Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Configured Templates */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
              Active templates
            </h3>
            {loading && <span className="text-micro text-fg-muted flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>}
          </div>

          {loading && templates.length === 0 ? (
            <div className="p-8 rounded-lg bg-surface border border-border text-center space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />
              <p className="text-xs text-fg-muted">Fetching templates…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 rounded-lg bg-surface border border-dashed border-border text-center space-y-2">
              <MessageSquareText className="w-7 h-7 text-fg-faint mx-auto" />
              <p className="text-xs font-medium text-fg">No message templates created yet</p>
              <p className="text-micro text-fg-muted">Use the form to create your first outreach template.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {templates.map((tpl) => {
                const isDeleting = deletingId === tpl.id;
                const isCopied = copiedId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className="group p-3.5 rounded-lg bg-surface border border-border hover:border-border-strong transition-colors shadow-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-xs text-fg truncate">
                          {tpl.name}
                        </span>
                        {tpl.is_default && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-micro font-medium bg-success-bg text-success-fg border border-success/30">
                            <Check className="w-2.5 h-2.5" />
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyTemplateContent(tpl)}
                          className="p-1 rounded text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
                          title="Copy raw text"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-success-fg" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        {!tpl.is_default && (
                          <button
                            type="button"
                            onClick={() => void handleSetDefault(tpl)}
                            className="h-6 px-2 rounded text-micro font-medium text-fg-muted hover:text-fg bg-subtle border border-border hover:bg-hover transition-colors cursor-pointer"
                          >
                            Set default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(tpl)}
                          disabled={isDeleting}
                          className="p-1 rounded text-fg-muted hover:text-danger-fg hover:bg-danger-bg transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete template"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-md bg-subtle text-xs text-fg font-sans whitespace-pre-wrap leading-relaxed">
                      {tpl.body}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Create Template Form + Live Preview */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Create template
          </h3>

          <form
            onSubmit={handleCreate}
            className="p-4 rounded-lg bg-surface border border-border shadow-xs space-y-3.5"
          >
            <div>
              <label className="text-label text-fg block mb-1">
                Template name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Inbound Website Lead Welcome"
                className="w-full h-8 px-2.5 rounded-md border border-input bg-surface text-xs text-fg placeholder:text-fg-muted focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-label text-fg">
                  Message body
                </label>
                <span className="text-micro text-fg-muted font-numeric">{body.length} characters</span>
              </div>

              {/* Dynamic tag chips (Kbd-style) */}
              <div className="mb-2">
                <span className="text-micro text-fg-muted block mb-1">Insert merge tag:</span>
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDERS.map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleInsertTag(tag)}
                      className="px-1.5 py-0.5 rounded text-micro font-mono border border-border bg-subtle text-fg-muted hover:text-fg hover:border-accent transition-colors cursor-pointer"
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
                className="w-full p-2.5 rounded-md border border-input bg-surface text-xs text-fg placeholder:text-fg-muted focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors leading-relaxed font-sans"
                required
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-normal text-fg select-none">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-accent border-input focus:ring-accent"
              />
              <span>Set as default template for new outreach</span>
            </label>

            {/* Real-time Interactive Preview Box */}
            <div className="p-3 rounded-md bg-subtle border border-border space-y-1">
              <div className="flex items-center gap-1.5 text-micro font-medium text-fg-muted">
                <Eye className="w-3.5 h-3.5" />
                <span>Live sample preview</span>
              </div>
              <p className="text-xs text-fg leading-relaxed italic bg-surface p-2 rounded border border-border">
                "{getLivePreview()}"
              </p>
            </div>

            {error && (
              <div className="p-2.5 rounded-md bg-danger-bg border border-danger/30 text-xs text-danger-fg">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              className="w-full"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Save template
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

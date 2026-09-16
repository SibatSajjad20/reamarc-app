import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../../services/apiClient';
import { crmService } from '../../services/crmService';
import type { CrmIngestSource, CrmMetaPage, CrmQueueStats } from '../../types/crm';

interface CrmIngestPanelProps {
  onClose: () => void;
}

type TabKey = 'sources' | 'meta' | 'queue';

export const CrmIngestPanel: React.FC<CrmIngestPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('sources');
  const [sources, setSources] = useState<CrmIngestSource[]>([]);
  const [metaPages, setMetaPages] = useState<CrmMetaPage[]>([]);
  const [queueStats, setQueueStats] = useState<CrmQueueStats | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Ingest source form
  const [name, setName] = useState('WordPress Website Form');
  const [defaultSource, setDefaultSource] = useState('wordpress');
  const [defaultCampaign, setDefaultCampaign] = useState('');
  const [freshToken, setFreshToken] = useState<{ name: string; path: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Meta page connect form
  const [metaPageId, setMetaPageId] = useState('');
  const [metaPageName, setMetaPageName] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [savingPage, setSavingPage] = useState(false);

  const loadSources = async () => {
    try {
      setSources(await crmService.listIngestSources());
    } catch (err: any) {
      setError(err?.message || 'Could not load ingest sources.');
    }
  };

  const loadMetaPages = async () => {
    try {
      setMetaPages(await crmService.listMetaPages());
    } catch {
      // Non-critical
    }
  };

  const loadQueueStats = async () => {
    try {
      setQueueStats(await crmService.getQueueStats());
    } catch {
      // Non-critical
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSources(), loadMetaPages(), loadQueueStats()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await crmService.createIngestSource({
        name: name.trim(),
        default_source: defaultSource.trim() || 'website',
        default_campaign: defaultCampaign.trim() || null,
      });
      if (created.token && created.ingest_path) {
        setFreshToken({ name: created.name, path: created.ingest_path, token: created.token });
      }
      setName('WordPress Website Form');
      setDefaultCampaign('');
      await loadSources();
    } catch (err: any) {
      setError(err?.message || 'Could not create ingest token.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectPage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPage(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await crmService.connectMetaPage({
        page_id: metaPageId.trim(),
        page_name: metaPageName.trim() || 'Facebook Page',
        access_token: metaAccessToken.trim(),
        app_secret: metaAppSecret.trim() || undefined,
      });
      setMetaPageId('');
      setMetaPageName('');
      setMetaAccessToken('');
      setMetaAppSecret('');
      setSuccessMsg('Meta Page connected successfully.');
      await loadMetaPages();
    } catch (err: any) {
      setError(err?.message || 'Could not connect Meta page.');
    } finally {
      setSavingPage(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const absoluteUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    const base = API_BASE_URL.replace(/\/$/, '');
    let suffix = path.startsWith('/') ? path : `/${path}`;
    if (base.endsWith('/api/v1') && suffix.startsWith('/api/v1/')) {
      suffix = suffix.slice('/api/v1'.length);
    }
    return `${base}${suffix}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Social &amp; Ingestion Hub</h2>
            <p className="text-xs text-zinc-500">Connect lead forms, WordPress, Meta Lead Ads, and external webhooks.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sources'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Webhooks &amp; WordPress</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('meta')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'meta'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Meta Pages (FB/IG)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('queue');
              void loadQueueStats();
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'queue'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Reliability &amp; Queue</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: WEBHOOK SOURCES (WORDPRESS & FORMS) */}
          {activeTab === 'sources' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">WordPress &amp; Landing Page Ingest</p>
                <p>
                  Supports standard <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 font-mono text-[11px]">application/json</code>,{' '}
                  <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 font-mono text-[11px]">application/x-www-form-urlencoded</code>, and{' '}
                  <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 font-mono text-[11px]">multipart/form-data</code>.
                  Elementor Form Webhook actions, Contact Form 7, and WPForms can send submissions directly without custom PHP.
                </p>
              </div>

              {freshToken && (
                <div className="rounded-xl border border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/40 px-3.5 py-3 text-xs space-y-2">
                  <p className="font-bold text-amber-900 dark:text-amber-100">
                    Copy this token URL now — it will not be shown again ({freshToken.name}):
                  </p>
                  <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-2 rounded-lg border border-amber-200 dark:border-amber-900">
                    <code className="flex-1 break-all text-[11px] font-numeric text-zinc-800 dark:text-zinc-200">
                      {absoluteUrl(freshToken.path)}
                    </code>
                    <button
                      type="button"
                      className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-800 dark:text-amber-200 cursor-pointer flex items-center gap-1 transition"
                      onClick={() => void copyText(absoluteUrl(freshToken.path))}
                      title="Copy URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateSource} className="space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-zinc-50/50 dark:bg-zinc-900/30">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Create new ingest webhook</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                    Source Name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Website Contact Form"
                      className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </label>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                    Default Source Label
                    <input
                      value={defaultSource}
                      onChange={(e) => setDefaultSource(e.target.value)}
                      placeholder="e.g. wordpress or website"
                      className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </label>
                </div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                  Default Campaign (optional)
                  <input
                    value={defaultCampaign}
                    onChange={(e) => setDefaultCampaign(e.target.value)}
                    placeholder="e.g. organic_web or contact_page"
                    className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8.5 px-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition shadow-xs"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Create webhook token
                </button>
              </form>

              <div className="pt-2">
                <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-2">Active Webhook Sources</h3>
                {loading ? (
                  <p className="text-xs text-zinc-400">Loading…</p>
                ) : sources.length === 0 ? (
                  <p className="text-xs text-zinc-400">No ingest tokens yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {sources.map((src) => (
                      <li
                        key={src.id}
                        className="border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs flex items-start justify-between gap-2"
                      >
                        <div>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{src.name}</span>
                          {!src.enabled && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-400">Disabled</span>
                          )}
                          <p className="mt-0.5 text-zinc-500">
                            {src.default_source}
                            {src.default_campaign ? ` · ${src.default_campaign}` : ''} · {src.hit_count} hits · token{' '}
                            {src.token_prefix}…
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0 items-center">
                          <button
                            type="button"
                            className="text-[11px] font-semibold cursor-pointer text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                            onClick={() =>
                              void crmService
                                .updateIngestSource(src.id, { enabled: !src.enabled })
                                .then(loadSources)
                                .catch((err: any) => setError(err?.message || 'Update failed.'))
                            }
                          >
                            {src.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                            onClick={() =>
                              void crmService
                                .deleteIngestSource(src.id)
                                .then(loadSources)
                                .catch((err: any) => setError(err?.message || 'Delete failed.'))
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: META PAGES (FB & IG) */}
          {activeTab === 'meta' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Meta Lead Ads Webhook Setup</p>
                <p>
                  Meta Developer Callback URL:{' '}
                  <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 font-mono text-[11px]">
                    {absoluteUrl('/api/v1/crm/meta/webhook')}
                  </code>
                </p>
                <p>
                  Tokens are stored encrypted with Fernet at rest. Incoming leads are queued and verified with{' '}
                  <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 font-mono text-[11px]">X-Hub-Signature-256</code>.
                </p>
              </div>

              {/* Connect new page form */}
              <form onSubmit={handleConnectPage} className="space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-zinc-50/50 dark:bg-zinc-900/30">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Connect Facebook / Instagram Page</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                    Page Name
                    <input
                      value={metaPageName}
                      onChange={(e) => setMetaPageName(e.target.value)}
                      placeholder="e.g. Reamarc Official"
                      className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </label>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                    Facebook Page ID
                    <input
                      value={metaPageId}
                      onChange={(e) => setMetaPageId(e.target.value)}
                      placeholder="Numeric ID, e.g. 123456789"
                      className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </label>
                </div>

                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                  Page Access Token (encrypted at rest)
                  <input
                    type="password"
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    placeholder="EAA..."
                    className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                    required
                  />
                </label>

                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block">
                  App Secret Override (optional, defaults to CRM_META_APP_SECRET)
                  <input
                    type="password"
                    value={metaAppSecret}
                    onChange={(e) => setMetaAppSecret(e.target.value)}
                    placeholder="Leave blank to use system app secret"
                    className="mt-1 w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingPage}
                  className="h-8.5 px-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition shadow-xs"
                >
                  {savingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Connect Page
                </button>
              </form>

              {/* Connected pages list */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Connected Meta Pages</h3>
                  <button
                    type="button"
                    disabled={polling}
                    className="h-7 px-2.5 text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg cursor-pointer disabled:opacity-50 transition"
                    onClick={() => {
                      setPolling(true);
                      void crmService
                        .pollMetaForms()
                        .then((res) => {
                          const forms = res.forms || [];
                          const created = forms.reduce((n, f) => n + (f.created || 0), 0);
                          const duplicates = forms.reduce((n, f) => n + (f.duplicates || 0), 0);
                          setSuccessMsg(`Meta poll completed: ${created} created, ${duplicates} duplicates.`);
                        })
                        .catch((err: any) => setError(err?.message || 'Meta poll failed.'))
                        .finally(() => setPolling(false));
                    }}
                  >
                    {polling ? 'Polling…' : 'Manual Poll Backup'}
                  </button>
                </div>

                {metaPages.length === 0 ? (
                  <p className="text-xs text-zinc-400">No connected pages.</p>
                ) : (
                  <ul className="space-y-2">
                    {metaPages.map((pg) => (
                      <li
                        key={pg.id}
                        className="border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{pg.page_name}</span>
                            {pg.is_env && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
                                .env
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-500 text-[11px] mt-0.5">
                            Page ID: <span className="font-numeric font-medium">{pg.page_id}</span> · Token: {pg.token_preview}
                          </p>
                        </div>
                        {!pg.is_env && (
                          <button
                            type="button"
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                            onClick={() =>
                              void crmService
                                .disconnectMetaPage(pg.page_id)
                                .then(loadMetaPages)
                                .catch((err: any) => setError(err?.message || 'Delete failed.'))
                            }
                            title="Disconnect page"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: RELIABILITY & EVENT QUEUE */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Webhook Buffer &amp; Retry Queue</h3>
                  <p className="text-zinc-500 text-[11px]">
                    Social webhooks are acknowledged immediately and processed asynchronously with exponential backoff.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadQueueStats()}
                  className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>

              {queueStats ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Completed</span>
                    <span className="text-xl font-bold font-numeric text-emerald-600 dark:text-emerald-400">
                      {queueStats.completed}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">In Queue / Processing</span>
                    <span className="text-xl font-bold font-numeric text-blue-600 dark:text-blue-400">
                      {queueStats.pending + queueStats.processing}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Retries / Warnings</span>
                    <span className="text-xl font-bold font-numeric text-amber-600 dark:text-amber-400">
                      {queueStats.retry}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400">Loading queue status…</p>
              )}

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Guaranteed Delivery SLA</p>
                <p>
                  If Meta’s Graph API or downstream servers experience timeouts, events are retained in MongoDB and retried at
                  intervals: 30s, 2m, 10m, 30m, and 1h. Zero leads are lost during transient network blips.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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

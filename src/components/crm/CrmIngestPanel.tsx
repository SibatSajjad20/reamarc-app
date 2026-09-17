import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
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

type TabKey = 'sources' | 'meta' | 'scheduler' | 'queue';

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

  // Reamarc native scheduler WordPress embed state
  const [activeEmbedType, setActiveEmbedType] = useState<'iframe' | 'button' | 'link'>('iframe');

  // Scheduler Configuration Settings state
  const [schedulerConfig, setSchedulerConfig] = useState({
    title: 'Digital Services Consultancy Session',
    description: (
      "Hi! thanks for showing interest.\n" +
      "Our upcoming 30-minute meeting will provide an excellent opportunity for us to get better acquainted. " +
      "During our conversation, we'll explore the challenges you're currently encountering and brainstorm ways in which " +
      "we can collaborate effectively to address them and meet your specific requirements.\n" +
      "I'm eagerly looking forward to our discussion. Thanks once again!"
    ),
    host_name: 'Muhammad Faizan Khan',
    host_email: 'faizan@reamarc.com',
    duration_minutes: 30,
    buffer_minutes: 0,
    working_days: [1, 2, 3, 4, 5, 6],
    start_hour: '11:00',
    end_hour: '23:00',
    meeting_link: 'https://meet.google.com/lookup/reamarc-strategy',
    timezone: 'Asia/Karachi',
  });
  const [savingSchedulerConfig, setSavingSchedulerConfig] = useState(false);
  const [schedulerConfigSuccess, setSchedulerConfigSuccess] = useState(false);
  const [customProductionDomain, setCustomProductionDomain] = useState('');

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

  const loadSchedulerConfig = async () => {
    try {
      const data = await crmService.getSchedulerSettings();
      if (data) {
        setSchedulerConfig((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // Non-critical: company defaults persist
    }
  };

  const handleSaveSchedulerConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedulerConfig(true);
    setError(null);
    setSchedulerConfigSuccess(false);
    try {
      const updated = await crmService.updateSchedulerSettings(schedulerConfig);
      if (updated) {
        setSchedulerConfig((prev) => ({ ...prev, ...updated }));
      }
      setSchedulerConfigSuccess(true);
      setTimeout(() => setSchedulerConfigSuccess(false), 3500);
    } catch (err: any) {
      setError(err?.message || 'Could not save scheduler settings.');
    } finally {
      setSavingSchedulerConfig(false);
    }
  };

  const toggleWorkingDay = (dayNum: number) => {
    setSchedulerConfig((prev) => {
      const exists = prev.working_days.includes(dayNum);
      const updated = exists
        ? prev.working_days.filter((d) => d !== dayNum)
        : [...prev.working_days, dayNum].sort();
      return { ...prev, working_days: updated };
    });
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSources(), loadMetaPages(), loadQueueStats(), loadSchedulerConfig()]);
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
              setActiveTab('scheduler');
              void loadSchedulerConfig();
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'scheduler'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Meeting Scheduler &amp; WordPress</span>
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

          {/* TAB: REAMARC NATIVE MEETING SCHEDULER & WORDPRESS */}
          {activeTab === 'scheduler' && (() => {
            const effectiveBaseUrl = customProductionDomain.trim().replace(/\/$/, '') || window.location.origin;

            return (
              <div className="space-y-4">
                {/* Native Scheduler Info Card */}
                <div className="rounded-2xl border border-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 mb-1">
                        <Sparkles className="w-3 h-3" />
                        100% Native In-House Scheduler
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-xl">
                        Zero third-party fees, zero middlemen ($0/month). Automatically generates availability, prevents double-booking, creates leads in <strong className="text-blue-700 dark:text-blue-300">"Meeting Booked"</strong> stage, and generates Google Calendar &amp; Outlook .ics invites.
                      </p>
                    </div>
                    <a
                      href="/book"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      <span>Open Live Booking Page</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                      Your Public Booking Page Link:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all text-[11px] font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/80 p-2 rounded-lg">
                        {`${effectiveBaseUrl}/book`}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyText(`${effectiveBaseUrl}/book`)}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-100 dark:bg-blue-900/60 hover:bg-blue-200 text-blue-800 dark:text-blue-200 flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* WordPress Integration (Embed Snippet Generator) */}
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-blue-500" />
                      WordPress Embed Generator (Elementor &amp; Gutenberg Ready)
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      Copy &amp; paste into WordPress Custom HTML
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setActiveEmbedType('iframe')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                        activeEmbedType === 'iframe'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                      }`}
                    >
                      Inline iFrame Embed (Recommended)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveEmbedType('button')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                        activeEmbedType === 'button'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                      }`}
                    >
                      CTA Button Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveEmbedType('link')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                        activeEmbedType === 'link'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                      }`}
                    >
                      Tracking URL (UTM Ad Link)
                    </button>
                  </div>

                  {activeEmbedType === 'iframe' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-zinc-500">
                        In WordPress, edit your page in <strong>Elementor</strong> or <strong>Gutenberg</strong>, add a <strong>Custom HTML</strong> block, and paste this snippet:
                      </p>
                      <div className="relative">
                        <pre className="p-3 rounded-xl bg-zinc-900 text-zinc-200 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
{`<!-- Reamarc Native Scheduler Embed for WordPress -->
<div style="width: 100%; max-width: 920px; margin: 0 auto; overflow: hidden; border-radius: 16px;">
  <iframe 
    src="${effectiveBaseUrl}/book?embed=true" 
    style="width: 100%; height: 750px; border: none; overflow: hidden;"
    loading="lazy"
    title="Reamarc Strategy Session Scheduler">
  </iframe>
</div>`}
                        </pre>
                        <button
                          type="button"
                          onClick={() => void copyText(`<!-- Reamarc Native Scheduler Embed for WordPress -->\n<div style="width: 100%; max-width: 920px; margin: 0 auto; overflow: hidden; border-radius: 16px;">\n  <iframe src="${effectiveBaseUrl}/book?embed=true" style="width: 100%; height: 750px; border: none; overflow: hidden;" loading="lazy" title="Reamarc Strategy Session Scheduler"></iframe>\n</div>`)}
                          className="absolute top-2 right-2 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Code</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {activeEmbedType === 'button' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-zinc-500">
                        Add a styled booking CTA button to your WordPress header, footer, or navigation menu:
                      </p>
                      <div className="relative">
                        <pre className="p-3 rounded-xl bg-zinc-900 text-zinc-200 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
{`<!-- Reamarc Booking CTA Button for WordPress -->
<a href="${effectiveBaseUrl}/book" 
   target="_blank" 
   rel="noopener noreferrer"
   style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #2563eb; color: #ffffff; border-radius: 12px; font-weight: 700; text-decoration: none; font-size: 14px; box-shadow: 0 4px 14px rgba(37,99,235,0.25);">
  📅 Book a Strategy Session
</a>`}
                        </pre>
                        <button
                          type="button"
                          onClick={() => void copyText(`<!-- Reamarc Booking CTA Button for WordPress -->\n<a href="${effectiveBaseUrl}/book" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #2563eb; color: #ffffff; border-radius: 12px; font-weight: 700; text-decoration: none; font-size: 14px; box-shadow: 0 4px 14px rgba(37,99,235,0.25);">\n  📅 Book a Strategy Session\n</a>`)}
                          className="absolute top-2 right-2 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Code</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {activeEmbedType === 'link' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-zinc-500">
                        Direct booking link with pre-built UTM tracking parameters for Meta/Google Ads, WhatsApp, or Instagram bio:
                      </p>
                      <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <code className="flex-1 break-all text-[11px] font-mono text-zinc-800 dark:text-zinc-200">
                          {`${effectiveBaseUrl}/book?utm_source=wordpress_website&utm_medium=cta_button&utm_campaign=sales_pipeline`}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyText(`${effectiveBaseUrl}/book?utm_source=wordpress_website&utm_medium=cta_button&utm_campaign=sales_pipeline`)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy URL</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Configurable Operating Schedule & Timings Form */}
                <form onSubmit={handleSaveSchedulerConfig} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        Scheduler Timing &amp; Working Hours Configuration
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Adjust available booking days, start &amp; end hours, session durations, and host information.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={savingSchedulerConfig}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                    >
                      {savingSchedulerConfig ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Save Settings</span>
                        </>
                      )}
                    </button>
                  </div>

                  {schedulerConfigSuccess && (
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="font-semibold">Scheduler settings successfully updated! New slots and timings are live.</span>
                    </div>
                  )}

                  {/* Active Days of the Week */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                      Active Booking Days (Click to toggle):
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 1, label: 'Monday' },
                        { id: 2, label: 'Tuesday' },
                        { id: 3, label: 'Wednesday' },
                        { id: 4, label: 'Thursday' },
                        { id: 5, label: 'Friday' },
                        { id: 6, label: 'Saturday' },
                        { id: 7, label: 'Sunday' },
                      ].map((day) => {
                        const active = schedulerConfig.working_days.includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => toggleWorkingDay(day.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Default: Monday to Saturday active. Days not selected will appear closed on the public calendar.
                    </p>
                  </div>

                  {/* Timing & Duration Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        Start Time (Opening)
                      </label>
                      <input
                        type="time"
                        value={schedulerConfig.start_hour}
                        onChange={(e) => setSchedulerConfig({ ...schedulerConfig, start_hour: e.target.value })}
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        End Time (Closing)
                      </label>
                      <input
                        type="time"
                        value={schedulerConfig.end_hour}
                        onChange={(e) => setSchedulerConfig({ ...schedulerConfig, end_hour: e.target.value })}
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        Session Duration
                      </label>
                      <select
                        value={schedulerConfig.duration_minutes}
                        onChange={(e) => setSchedulerConfig({ ...schedulerConfig, duration_minutes: Number(e.target.value) })}
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option value={15}>15 Minutes</option>
                        <option value={30}>30 Minutes (Default)</option>
                        <option value={45}>45 Minutes</option>
                        <option value={60}>60 Minutes</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={schedulerConfig.timezone}
                        readOnly
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Host & Meeting Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        Host Name
                      </label>
                      <input
                        type="text"
                        value={schedulerConfig.host_name}
                        onChange={(e) => setSchedulerConfig({ ...schedulerConfig, host_name: e.target.value })}
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        Host Email
                      </label>
                      <input
                        type="email"
                        value={schedulerConfig.host_email}
                        onChange={(e) => setSchedulerConfig({ ...schedulerConfig, host_email: e.target.value })}
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                        Meeting / Google Meet Link
                      </label>
                      <input
                        type="url"
                        value={schedulerConfig.meeting_link}
                        onChange={(e) => setSchedulerConfig({ ...schedulerConfig, meeting_link: e.target.value })}
                        className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Public Greeting / Description */}
                  <div>
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                      Public Greeting &amp; Description (Displayed to leads on booking page)
                    </label>
                    <textarea
                      rows={4}
                      value={schedulerConfig.description}
                      onChange={(e) => setSchedulerConfig({ ...schedulerConfig, description: e.target.value })}
                      className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none font-sans leading-relaxed"
                    />
                  </div>

                  {/* Custom Production Domain Override (for Vercel & Render) */}
                  <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                        Custom Production Domain URL (optional for WordPress Embed)
                      </label>
                      <span className="text-[11px] text-zinc-400">
                        Current host: <code className="font-mono text-zinc-600 dark:text-zinc-300">{window.location.origin}</code>
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. https://crm.reamarc.com (leave empty to auto-detect current domain)"
                      value={customProductionDomain}
                      onChange={(e) => setCustomProductionDomain(e.target.value)}
                      className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <p className="text-[11px] text-zinc-400">
                      When deployed to Vercel/Render, the embed code will automatically use your live domain. You can also paste your production domain here to generate copy-paste code ahead of time.
                    </p>
                  </div>
                </form>
              </div>
            );
          })()}

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

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
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
  Check,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { API_BASE_URL } from '../../../services/apiClient';
import { crmService } from '../../../services/crmService';
import { useToast } from '../../../context/ToastContext';
import type { CrmIngestSource, CrmMetaPage, CrmQueueStats } from '../../../types/crm';

type IngestSubTab = 'sources' | 'meta' | 'scheduler' | 'queue';

export const CrmSettingsIngest: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<IngestSubTab>('sources');
  const [sources, setSources] = useState<CrmIngestSource[]>([]);
  const [metaPages, setMetaPages] = useState<CrmMetaPage[]>([]);
  const [queueStats, setQueueStats] = useState<CrmQueueStats | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Webhook source form
  const [name, setName] = useState('WordPress Website Form');
  const [defaultSource, setDefaultSource] = useState('wordpress');
  const [defaultCampaign, setDefaultCampaign] = useState('');
  const [freshToken, setFreshToken] = useState<{ name: string; path: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Meta page connect form
  const [metaPageId, setMetaPageId] = useState('');
  const [metaPageName, setMetaPageName] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [savingPage, setSavingPage] = useState(false);

  // Scheduler embed state
  const [activeEmbedType, setActiveEmbedType] = useState<'iframe' | 'button' | 'link'>('iframe');
  const [showGuide, setShowGuide] = useState(false);

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
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const effectiveBaseUrl =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : API_BASE_URL;

  const absoluteUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    const base = API_BASE_URL.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    let suffix = path.startsWith('/') ? path : `/${path}`;
    if (base.endsWith('/api/v1') && suffix.startsWith('/api/v1/')) {
      suffix = suffix.slice('/api/v1'.length);
    }
    return `${base}${suffix}`;
  };

  const copyText = async (text: string, type: 'token' | 'link' | 'embed') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'token') {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } else if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedEmbed(true);
        setTimeout(() => setCopiedEmbed(false), 2000);
      }
      addToast('Copied to clipboard', 'Snippet copied successfully.', 'info');
    } catch {
      // Fallback
    }
  };

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmService.listIngestSources();
      setSources(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load ingest sources.');
    } finally {
      setLoading(false);
    }
  };

  const loadMetaPages = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmService.listMetaPages();
      setMetaPages(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load Meta pages.');
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulerConfig = async () => {
    setLoadingConfig(true);
    try {
      const data = await crmService.getSchedulerSettings();
      if (data && data.title) {
        setSchedulerConfig({
          title: data.title || '',
          description: data.description || '',
          host_name: data.host_name || '',
          host_email: data.host_email || '',
          duration_minutes: data.duration_minutes || 30,
          buffer_minutes: data.buffer_minutes || 0,
          working_days: data.working_days || [1, 2, 3, 4, 5, 6],
          start_hour: data.start_hour || '11:00',
          end_hour: data.end_hour || '23:00',
          meeting_link: data.meeting_link || '',
        });
      }
    } catch {
      // Non-critical fallback to defaults
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSaveSchedulerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setError(null);
    try {
      await crmService.updateSchedulerSettings(schedulerConfig);
      addToast('Scheduler updated', 'New booking rules and host details are now live.', 'success');
      setSuccessMsg('Scheduler settings saved!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Could not save scheduler settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const loadQueueStats = async () => {
    setPolling(true);
    try {
      const data = await crmService.getQueueStats();
      setQueueStats(data);
    } catch {
      // Background poll
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    void loadSources();
    void loadMetaPages();
    void loadSchedulerConfig();
    void loadQueueStats();
  }, []);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await crmService.createIngestSource({
        name: name.trim(),
        default_source: defaultSource.trim() || 'wordpress',
        default_campaign: defaultCampaign.trim() || null,
      });
      setName('WordPress Website Form');
      setDefaultCampaign('');
      if (created.token && created.ingest_path) {
        setFreshToken({
          name: created.name,
          path: created.ingest_path,
          token: created.token,
        });
      }
      addToast('Webhook created', `Endpoint for ${created.name} is active.`, 'success');
      await loadSources();
    } catch (err: any) {
      setError(err?.message || 'Could not create webhook source.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSource = async (s: CrmIngestSource) => {
    try {
      await crmService.updateIngestSource(s.id, { enabled: !s.enabled });
      addToast('Status updated', `${s.name} is now ${!s.enabled ? 'active' : 'disabled'}.`, 'info');
      await loadSources();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not update source.', 'warning');
    }
  };

  const handleDeleteSource = async (s: CrmIngestSource) => {
    if (!window.confirm(`Delete webhook source "${s.name}"? Active form integrations will stop receiving leads.`)) {
      return;
    }
    try {
      await crmService.deleteIngestSource(s.id);
      addToast('Deleted', `Webhook source "${s.name}" deleted.`, 'info');
      await loadSources();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not delete source.', 'warning');
    }
  };

  const handleConnectMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaPageId.trim() || !metaPageName.trim() || !metaAccessToken.trim()) {
      setError('Page ID, Page Name, and Access Token are required.');
      return;
    }
    setSavingPage(true);
    setError(null);
    try {
      await crmService.connectMetaPage({
        page_id: metaPageId.trim(),
        page_name: metaPageName.trim(),
        access_token: metaAccessToken.trim(),
        app_secret: metaAppSecret.trim() || undefined,
      });
      setMetaPageId('');
      setMetaPageName('');
      setMetaAccessToken('');
      setMetaAppSecret('');
      addToast('Meta page connected', `Subscribed to leads for ${metaPageName}.`, 'success');
      await loadMetaPages();
    } catch (err: any) {
      setError(err?.message || 'Could not connect Meta page.');
    } finally {
      setSavingPage(false);
    }
  };

  const handleSyncMeta = async () => {
    setPolling(true);
    try {
      const res = await crmService.pollMetaForms();
      const forms = res.forms || [];
      const created = forms.reduce((n, f) => n + (f.created || 0), 0);
      const duplicates = forms.reduce((n, f) => n + (f.duplicates || 0), 0);
      addToast('Sync completed', `Meta poll: ${created} new leads, ${duplicates} duplicates.`, 'info');
      await loadMetaPages();
    } catch (err: any) {
      addToast('Sync error', err?.message || 'Could not sync Meta page.', 'warning');
    } finally {
      setPolling(false);
    }
  };

  const handleDisconnectMeta = async (page: CrmMetaPage) => {
    if (!window.confirm(`Disconnect "${page.page_name}"? Leads will no longer auto-import from this page.`)) {
      return;
    }
    try {
      await crmService.disconnectMetaPage(page.page_id);
      addToast('Disconnected', `Disconnected ${page.page_name}.`, 'info');
      await loadMetaPages();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not disconnect page.', 'warning');
    }
  };

  const toggleWorkingDay = (day: number) => {
    setSchedulerConfig((prev) => {
      const exists = prev.working_days.includes(day);
      const nextDays = exists
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day].sort();
      return { ...prev, working_days: nextDays };
    });
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Lead Ingestion &amp; Channels Hub</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Connect external lead capture sources: WordPress webhooks, Elementor forms, Meta Ads (FB &amp; IG), and Native Scheduling.
            </p>
          </div>
        </div>

        {/* Ingest Channel Tabs (Segmented Buttons) */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 self-start md:self-auto shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'sources'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Webhooks &amp; WordPress</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('meta')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'meta'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Meta Ads (FB/IG)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scheduler')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'scheduler'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Meeting Scheduler &amp; Embed</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'queue'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Queue Health</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: WEBHOOKS & WORDPRESS */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          {freshToken && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>New Webhook Endpoint Ready: {freshToken.name}</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400">
                Copy this endpoint URL and paste it into your WordPress form or automation webhook action:
              </p>
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-amber-300/60 dark:border-amber-900/60">
                <code className="flex-1 break-all text-xs font-mono text-zinc-900 dark:text-zinc-100">
                  {absoluteUrl(freshToken.path)}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(absoluteUrl(freshToken.path), 'token')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-100 cursor-pointer flex items-center gap-1.5 transition shrink-0"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken ? 'Copied!' : 'Copy URL'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Active Webhooks Table */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Active Webhook Endpoints
                </h3>
                <span className="text-xs text-zinc-400 font-numeric">{sources.length} total</span>
              </div>

              {loading ? (
                <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                  <p className="text-xs text-zinc-400">Loading webhook sources…</p>
                </div>
              ) : sources.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-dashed border-zinc-300 dark:border-zinc-800 text-center space-y-2">
                  <Globe className="w-8 h-8 text-zinc-400 mx-auto" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No webhook sources configured</p>
                  <p className="text-[11px] text-zinc-400">Create a webhook endpoint to start capturing leads from WordPress.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sources.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-zinc-950 dark:text-zinc-50">{s.name}</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                            {s.default_source || 'custom'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.enabled
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                          }`}>
                            {s.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleToggleSource(s)}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer transition"
                          >
                            {s.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSource(s)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
                        <code className="flex-1 truncate text-xs font-mono text-zinc-600 dark:text-zinc-400">
                          {s.ingest_path ? absoluteUrl(s.ingest_path) : `Token: ${s.token_prefix}…`}
                        </code>
                        {s.ingest_path && (
                          <button
                            type="button"
                            onClick={() => copyText(absoluteUrl(s.ingest_path!), 'token')}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-200/70 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-700 dark:text-zinc-300 cursor-pointer flex items-center gap-1 transition shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                        <span className="font-numeric">Received hits: {s.hit_count ?? 0}</span>
                        {s.default_campaign && <span>Default campaign: {s.default_campaign}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Integration Guide Accordion */}
              <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#11131a] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer transition"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-500" />
                    <span>How to connect WordPress (Elementor, WPForms, Contact Form 7)</span>
                  </div>
                  {showGuide ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </button>

                {showGuide && (
                  <div className="p-4 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-600 dark:text-zinc-400 space-y-2.5 leading-relaxed bg-zinc-50/50 dark:bg-zinc-900/30">
                    <p>
                      Reamarc AI accepts standard HTTP POST payloads in <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[11px]">application/json</code>, <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[11px]">multipart/form-data</code>, and <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[11px]">application/x-www-form-urlencoded</code>.
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Elementor Pro Forms:</strong> In Form Actions After Submit, add <em>Webhook</em> and paste the copied URL above.</li>
                      <li><strong>WPForms:</strong> Enable Webhooks addon and configure a POST request to this URL.</li>
                      <li><strong>Field Mapping:</strong> Fields like <code className="px-1 bg-zinc-200/60 dark:bg-zinc-800 rounded">name</code>, <code className="px-1 bg-zinc-200/60 dark:bg-zinc-800 rounded">phone</code>, <code className="px-1 bg-zinc-200/60 dark:bg-zinc-800 rounded">email</code>, and <code className="px-1 bg-zinc-200/60 dark:bg-zinc-800 rounded">company</code> are automatically mapped.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Create Webhook Form */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                New Webhook Source
              </h3>

              <form
                onSubmit={handleCreateSource}
                className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4"
              >
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Source Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Website Contact Us Form"
                    className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Default Source Tag
                  </label>
                  <input
                    type="text"
                    value={defaultSource}
                    onChange={(e) => setDefaultSource(e.target.value)}
                    placeholder="e.g. wordpress or landing_page"
                    className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Default Campaign (Optional)
                  </label>
                  <input
                    type="text"
                    value={defaultCampaign}
                    onChange={(e) => setDefaultCampaign(e.target.value)}
                    placeholder="e.g. organic_contact or q3_promo"
                    className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60 shadow-xs"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Create Webhook Endpoint
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: META PAGES (FB/IG LEAD ADS) */}
      {activeTab === 'meta' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Connected Pages */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Connected Meta Facebook &amp; Instagram Pages
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSyncMeta()}
                  disabled={polling}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${polling ? 'animate-spin' : ''}`} />
                  <span>Sync Meta Leads</span>
                </button>
                <span className="text-xs text-zinc-400 font-numeric">{metaPages.length} connected</span>
              </div>
            </div>

            {loading ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                <p className="text-xs text-zinc-400">Loading Meta pages…</p>
              </div>
            ) : metaPages.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-dashed border-zinc-300 dark:border-zinc-800 text-center space-y-2">
                <Webhook className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No Meta pages connected</p>
                <p className="text-[11px] text-zinc-400">Connect a Meta Page to auto-import Instant Forms from Facebook and Instagram.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {metaPages.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-xs text-zinc-950 dark:text-zinc-50">{p.page_name}</span>
                        <div className="text-[11px] text-zinc-400 font-mono">Page ID: {p.page_id}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDisconnectMeta(p)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition"
                          title="Disconnect"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Connect Page Form */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Connect New Meta Page
            </h3>

            <form
              onSubmit={handleConnectMeta}
              className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4"
            >
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Facebook Page Name
                </label>
                <input
                  type="text"
                  value={metaPageName}
                  onChange={(e) => setMetaPageName(e.target.value)}
                  placeholder="e.g. Reamarc Agency"
                  className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Facebook Page ID
                </label>
                <input
                  type="text"
                  value={metaPageId}
                  onChange={(e) => setMetaPageId(e.target.value)}
                  placeholder="e.g. 109847291823"
                  className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Page Access Token (Permanent / Long-Lived)
                </label>
                <input
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  App Secret (Optional, for Webhook signature verification)
                </label>
                <input
                  type="password"
                  value={metaAppSecret}
                  onChange={(e) => setMetaAppSecret(e.target.value)}
                  placeholder="App secret from Meta Developers"
                  className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={savingPage}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60 shadow-xs"
              >
                {savingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Connect Page
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: MEETING SCHEDULER & WORDPRESS EMBED */}
      {activeTab === 'scheduler' && (
        <div className="space-y-6">
          {/* Public Link Card */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>Direct Public Booking URL</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">Share this link directly with prospective leads.</p>
            </div>

            <div className="flex items-center gap-2">
              <code className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-mono text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                {`${effectiveBaseUrl}/book`}
              </code>
              <button
                type="button"
                onClick={() => copyText(`${effectiveBaseUrl}/book`, 'link')}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
              <a
                href={`${effectiveBaseUrl}/book`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition"
                title="Preview public booking page"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Scheduler Settings Form */}
            <form
              onSubmit={handleSaveSchedulerSettings}
              className="lg:col-span-7 p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4"
            >
              <div className="border-b border-zinc-100 dark:border-zinc-800/80 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Meeting Scheduler Configuration
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Set host identity, timings, and video conferencing link.</p>
                </div>
                {loadingConfig && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Host Name
                  </label>
                  <input
                    type="text"
                    value={schedulerConfig.host_name}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, host_name: e.target.value })}
                    className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Host Email
                  </label>
                  <input
                    type="email"
                    value={schedulerConfig.host_email}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, host_email: e.target.value })}
                    className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  value={schedulerConfig.title}
                  onChange={(e) => setSchedulerConfig({ ...schedulerConfig, title: e.target.value })}
                  className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Session Description
                </label>
                <textarea
                  rows={3}
                  value={schedulerConfig.description}
                  onChange={(e) => setSchedulerConfig({ ...schedulerConfig, description: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 outline-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Duration (Minutes)
                  </label>
                  <select
                    value={schedulerConfig.duration_minutes}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, duration_minutes: Number(e.target.value) })}
                    className="w-full h-8.5 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 outline-none cursor-pointer"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Start Hour
                  </label>
                  <input
                    type="time"
                    value={schedulerConfig.start_hour}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, start_hour: e.target.value })}
                    className="w-full h-8.5 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    End Hour
                  </label>
                  <input
                    type="time"
                    value={schedulerConfig.end_hour}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, end_hour: e.target.value })}
                    className="w-full h-8.5 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Available Working Days
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, idx) => {
                    const active = schedulerConfig.working_days.includes(idx);
                    return (
                      <button
                        type="button"
                        key={label}
                        onClick={() => toggleWorkingDay(idx)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Google Meet / Video Call Link
                </label>
                <input
                  type="url"
                  value={schedulerConfig.meeting_link}
                  onChange={(e) => setSchedulerConfig({ ...schedulerConfig, meeting_link: e.target.value })}
                  className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 outline-none font-mono"
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="h-9 px-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60 shadow-xs"
              >
                {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Scheduler Settings</span>
              </button>
            </form>

            {/* WordPress Embed Snippet Generator */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-indigo-500" />
                  <span>WordPress Embed Generator</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Compatible with Elementor, Gutenberg, &amp; Divi.</p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveEmbedType('iframe')}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                    activeEmbedType === 'iframe'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  iFrame Embed
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEmbedType('button')}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                    activeEmbedType === 'button'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  CTA Button
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEmbedType('link')}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                    activeEmbedType === 'link'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  UTM Tracking URL
                </button>
              </div>

              <div className="relative">
                <pre className="p-3 rounded-xl bg-zinc-900 text-zinc-200 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-56">
                  {activeEmbedType === 'iframe' &&
`<div style="width: 100%; max-width: 920px; margin: 0 auto; overflow: hidden; border-radius: 16px;">
  <iframe 
    src="${effectiveBaseUrl}/book?embed=true" 
    style="width: 100%; height: 750px; border: none; overflow: hidden;"
    loading="lazy"
    title="Reamarc Strategy Session Scheduler">
  </iframe>
</div>`}
                  {activeEmbedType === 'button' &&
`<a href="${effectiveBaseUrl}/book" 
   target="_blank" 
   style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 10px; font-weight: 600; text-decoration: none; font-family: sans-serif;">
   Book Strategy Session ↗
</a>`}
                  {activeEmbedType === 'link' &&
`${effectiveBaseUrl}/book?utm_source=wordpress&utm_medium=website&utm_campaign=strategy_session`}
                </pre>

                <button
                  type="button"
                  onClick={() => {
                    const snippet =
                      activeEmbedType === 'iframe'
                        ? `<div style="width: 100%; max-width: 920px; margin: 0 auto; overflow: hidden; border-radius: 16px;">\n  <iframe src="${effectiveBaseUrl}/book?embed=true" style="width: 100%; height: 750px; border: none; overflow: hidden;" loading="lazy" title="Reamarc Strategy Session Scheduler"></iframe>\n</div>`
                        : activeEmbedType === 'button'
                        ? `<a href="${effectiveBaseUrl}/book" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 10px; font-weight: 600; text-decoration: none; font-family: sans-serif;">Book Strategy Session ↗</a>`
                        : `${effectiveBaseUrl}/book?utm_source=wordpress&utm_medium=website&utm_campaign=strategy_session`;
                    void copyText(snippet, 'embed');
                  }}
                  className="mt-2 w-full h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedEmbed ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedEmbed ? 'Snippet Copied!' : 'Copy Code Snippet'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: QUEUE & RELIABILITY */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500">Pending Tasks</span>
              <div className="text-2xl font-black font-numeric text-zinc-950 dark:text-zinc-50 mt-1">
                {queueStats?.pending ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500">In Processing</span>
              <div className="text-2xl font-black font-numeric text-indigo-600 dark:text-indigo-400 mt-1">
                {queueStats?.processing ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500">Delivered / Completed</span>
              <div className="text-2xl font-black font-numeric text-emerald-600 dark:text-emerald-400 mt-1">
                {queueStats?.completed ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500">Retries / Warnings</span>
              <div className="text-2xl font-black font-numeric text-amber-600 dark:text-amber-400 mt-1">
                {queueStats?.retry ?? 0}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Guaranteed Delivery SLA</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Incoming leads and webhook events are persisted and automatically retried across 30s, 2m, 10m, 30m, and 1h windows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadQueueStats()}
                disabled={polling}
                className="h-8.5 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${polling ? 'animate-spin' : ''}`} />
                <span>Refresh Queue Status</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

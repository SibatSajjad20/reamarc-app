/**
 * Executive Command Center Dashboard Component.
 * Implements a high-impact Bento Box overview of marketing KPIs,
 * pending matrix approvals, system alerts, brand knowledge activity, and workspace health.
 */

import React from 'react';
import type { Workspace, ViewType } from '../../types';
import { useDashboard } from '../../hooks/useDashboard';
import {
  TrendingUp,
  DollarSign,
  Target,
  Calculator,
  Activity,
  AlertTriangle,
  FileText,
  Building2,
  Users,
  CalendarDays,
  RefreshCcw,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface Props {
  selectedWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace | null) => void;
  onNavigateView: (view: ViewType) => void;
}

export const DashboardView: React.FC<Props> = ({
  selectedWorkspace,
  workspaces,
  onSelectWorkspace,
  onNavigateView,
}) => {
  const {
    summary,
    isLoading,
    error,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    refetch,
  } = useDashboard(selectedWorkspace?.id);

  const kpis = summary?.performance_kpis || {
    ad_spend: 0,
    leads_conversions: 0,
    blended_cpa: 0,
    active_campaigns_count: 0,
  };

  const actionQueue = summary?.action_queue || {
    pending_approvals: [],
    system_alerts: [],
  };

  const health = summary?.workspace_health || {
    total_workspaces: workspaces.length || 0,
    total_users: 0,
    recent_rag_files: [],
  };

  const formatCurrency = (amount: number, currencyCode: string = 'USD', symbol: string = '$') => {
    try {
      if (currencyCode === 'PKR') {
        return `Rs ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode || 'USD',
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-y-auto bg-slate-50 dark:bg-[#0f1117] p-4 md:p-6 space-y-6">
      {/* ── Global Header ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900/80 p-4 md:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-orange-500 to-rose-600 text-white shadow-md shadow-orange-500/20">
              <Sparkles className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-zinc-100 tracking-tight">
              Executive Command Center
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Global Bento Box overview of performance marketing, approval queues, and RAG knowledge state.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Workspace Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-4 h-4 text-orange-500" />
            <select
              value={selectedWorkspace?.id || 'ALL'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'ALL') {
                  onSelectWorkspace(null);
                } else {
                  const ws = workspaces.find((w) => w.id === val);
                  if (ws) onSelectWorkspace(ws);
                }
              }}
              className="bg-transparent text-xs font-semibold text-slate-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900">
                All Workspaces ({workspaces.length})
              </option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id} className="bg-white dark:bg-slate-900">
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <CalendarDays className="w-4 h-4 text-orange-500" />
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Refetch Button */}
          <button
            onClick={refetch}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-orange-600 hover:border-orange-500/30 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Refresh Summary"
          >
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>{error}</span>
          </div>
          <button onClick={refetch} className="underline hover:text-rose-500">
            Retry
          </button>
        </div>
      )}

      {/* ── BENTO BOX GRID ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* ============================================================ */}
        {/* ROW 1: THE KPI ROLLUP (4 Cards, 1 col each)                  */}
        {/* ============================================================ */}
        
        {/* Card 1: Total Ad Spend */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-orange-500/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Ad Spend
            </span>
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-orange-500" /> : formatCurrency(kpis.ad_spend, kpis.currency, kpis.currency_symbol)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                {kpis.is_normalized
                  ? 'Normalized USD aggregate'
                  : `Workspace currency (${kpis.currency || 'USD'})`}
              </span>
            </p>
          </div>
        </div>

        {/* Card 2: Total Leads / Conversions */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Leads & Conversions
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-500" /> : kpis.leads_conversions.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-500" />
              <span>Verified lead actions</span>
            </p>
          </div>
        </div>

        {/* Card 3: Avg Blended CPA */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Blended CPA
            </span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Calculator className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> : formatCurrency(kpis.blended_cpa, kpis.currency, kpis.currency_symbol)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              <span>Spend per conversion</span>
            </p>
          </div>
        </div>

        {/* Card 4: Active Campaigns */}
        <div className="bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Campaigns
            </span>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-purple-500" /> : kpis.active_campaigns_count}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Live ad distribution</span>
            </p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* ROW 2: THE ACTION QUEUE (2 Cards, 2 cols each)               */}
        {/* ============================================================ */}

        {/* Card 5: Pending Matrix Approvals */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-orange-500/30 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                    Pending Matrix Approvals
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Campaigns and copy assets awaiting review
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigateView('matrix')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Review Now</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : actionQueue.pending_approvals.length > 0 ? (
              <div className="space-y-2.5">
                {actionQueue.pending_approvals.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        {item.status}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-zinc-200 truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.workspace_name} • {item.platform || 'Meta'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigateView('inbox')}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-orange-500 transition-colors cursor-pointer"
                      title="Open Inbox"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  No Pending Approvals
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  All campaign drafts and copy assets are fully approved!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Card 6: System Alerts */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-rose-500/30 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                    System Alerts
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Campaign authentication, billing, or API errors
                  </p>
                </div>
              </div>
              {actionQueue.system_alerts.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                  {actionQueue.system_alerts.length} Issues
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
              </div>
            ) : actionQueue.system_alerts.length > 0 ? (
              <div className="space-y-2.5">
                {actionQueue.system_alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-zinc-200 truncate">
                          {alert.title}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-600 dark:text-rose-300">
                          {alert.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                        {alert.workspace_name} • {alert.message}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateView('marketing')}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-colors cursor-pointer shrink-0"
                    >
                      Fix API
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  All Systems Operational
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  No campaign errors or API credential disruptions detected.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* ROW 3: KNOWLEDGE & HEALTH (2 Cards, 2 cols each)            */}
        {/* ============================================================ */}

        {/* Card 7: Brand Knowledge Activity */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-purple-500/30 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <FileText className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                    Brand Knowledge Activity
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recent RAG vector files synced to Obsidian
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigateView('knowledge')}
                className="flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                <span>View Vault</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : health.recent_rag_files.length > 0 ? (
              <div className="space-y-2.5">
                {health.recent_rag_files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase">
                        {file.type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-zinc-200 truncate">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {file.workspace_name}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                      {new Date(file.date_added).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  No RAG Knowledge Sources
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Upload PDF brand guidelines or scrape URLs to populate RAG memory.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Card 8: Workspace Overview */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-blue-500/30 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Layers className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                    Workspace Overview
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Infrastructure & access telemetry
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigateView('settings')}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <span>Manage</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 my-2">
              <div className="p-4 rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 text-center">
                <Building2 className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                <div className="text-2xl font-black text-slate-900 dark:text-zinc-100">
                  {health.total_workspaces}
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Active Workspaces
                </p>
              </div>

              <div className="p-4 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 text-center">
                <Users className="w-6 h-6 text-indigo-500 mx-auto mb-1" />
                <div className="text-2xl font-black text-slate-900 dark:text-zinc-100">
                  {health.total_users}
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Registered Users
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Multi-Tenant Scope Enabled
              </span>
              <span className="font-mono text-[11px]">v1.0.0 Enterprise</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

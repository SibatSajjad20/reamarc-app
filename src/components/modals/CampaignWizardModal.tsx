import React, { useState } from 'react';
import type { ToneType, PlatformType, Workspace } from '../../types';
import { Modal } from '../ui/Modal';
import { PlatformIcon } from '../../utils/platform';
import { useToast } from '../../context/ToastContext';
import { 
  Sparkles, 
  Target, 
  Users, 
  Gift, 
  Share2, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Clock,
  Loader2
} from 'lucide-react';
import { 
  CAMPAIGN_TYPE_OPTIONS, 
  OFFER_OPTIONS, 
  CTA_OPTIONS 
} from '../../data/staticMatrixData';

interface CampaignWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWorkspace: Workspace | null;
  workspaces?: Workspace[];
  onLaunchCampaign: (campaignData: any) => Promise<void>;
}

export const CampaignWizardModal: React.FC<CampaignWizardModalProps> = ({
  isOpen,
  onClose,
  selectedWorkspace,
  workspaces = [],
  onLaunchCampaign,
}) => {
  const { addToast } = useToast();

  // Wizard Step Control (1 to 4)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Target Workspace selection state when global "All Workspaces" is active
  const [targetWsId, setTargetWsId] = useState<string>(() =>
    selectedWorkspace ? selectedWorkspace.id : (workspaces[0]?.id || '')
  );

  // Form State
  const [title, setTitle] = useState('');
  const [campaignType, setCampaignType] = useState(CAMPAIGN_TYPE_OPTIONS[0]);
  const [duration, setDuration] = useState<'7' | '14' | '30' | '60' | 'custom'>('14');
  const [customAssetCount, setCustomAssetCount] = useState<number>(10);
  
  // Step 2: Persona & Tone
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState<ToneType>('Punchy');
  const [painPoints, setPainPoints] = useState('');

  // Step 3: Offer & CTA
  const [offer, setOffer] = useState(OFFER_OPTIONS[0]);
  const [cta, setCta] = useState(CTA_OPTIONS[0]);

  // Step 4: Channels & Prompts
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformType[]>(['Instagram', 'LinkedIn', 'Facebook']);
  const [customPrompt, setCustomPrompt] = useState('');

  // Loading State
  const [isGenerating, setIsGenerating] = useState(false);

  const steps = [
    { num: 1, label: 'Objective & Scale', icon: Target },
    { num: 2, label: 'Persona & Tone', icon: Users },
    { num: 3, label: 'Offer & CTA', icon: Gift },
    { num: 4, label: 'Channels & Prompt', icon: Share2 },
  ];

  const togglePlatform = (p: PlatformType) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!selectedWorkspace && (!targetWsId || targetWsId === '')) {
        addToast('Target Workspace Required', 'Please select a target workspace for this campaign.', 'warning');
        return;
      }
      if (!title.trim()) {
        addToast('Title Required', 'Please enter a title for this campaign.', 'warning');
        return;
      }
    }
    if (currentStep === 2) {
      if (!targetAudience.trim()) {
        addToast('Target Audience Required', 'Please specify your target audience persona.', 'warning');
        return;
      }
    }
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const isCancelledRef = React.useRef(false);

  const handleFinalSubmit = async () => {
    isCancelledRef.current = false;
    setIsGenerating(true);
    try {
      const finalWsId = selectedWorkspace ? selectedWorkspace.id : targetWsId;
      if (!finalWsId) {
        addToast('Workspace Error', 'Target workspace ID is missing.', 'error');
        return;
      }
      const assetCount = duration === 'custom' ? customAssetCount : parseInt(duration, 10);
      const campaignPayload = {
        title,
        campaignType,
        targetAudience,
        tone,
        offer,
        cta,
        painPoints,
        durationDays: assetCount,
        platforms: selectedPlatforms,
        customPrompt,
        workspaceId: finalWsId,
        status: 'Active',
      };

      await onLaunchCampaign(campaignPayload);
      
      if (isCancelledRef.current) {
        return;
      }
      
      onClose();
      resetForm();
    } catch (err: any) {
      if (!isCancelledRef.current) {
        addToast('Campaign Launch Failed', err.message || 'Could not deploy campaign.', 'error');
      }
    } finally {
      if (!isCancelledRef.current) {
        setIsGenerating(false);
      }
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setTitle('');
    setCampaignType(CAMPAIGN_TYPE_OPTIONS[0]);
    setDuration('14');
    setCustomAssetCount(10);
    setTargetAudience('');
    setTone('Punchy');
    setPainPoints('');
    setOffer(OFFER_OPTIONS[0]);
    setCta(CTA_OPTIONS[0]);
    setSelectedPlatforms(['Instagram', 'LinkedIn', 'Facebook']);
    setCustomPrompt('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              Strategic Campaign Questionnaire
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                Enterprise AI Engine
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Answer a few questions to generate tailored, multi-variant production matrix copy.
            </p>
          </div>
        </div>
      }
    >
      {isGenerating ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-xl bg-teal-500/30 animate-pulse"></div>
            <div className="relative w-16 h-16 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-xl rounded-2xl flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-teal-600 dark:text-teal-400 animate-spin" />
            </div>
          </div>
          
          <div className="text-center space-y-2 max-w-sm">
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Generating Master Matrix...</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Our AI Engine is analyzing your brand knowledge base, compiling directives, and drafting multi-variant production assets. Please hold tight.
            </p>
          </div>

          <button
            onClick={() => {
              isCancelledRef.current = true;
              setIsGenerating(false);
            }}
            className="mt-4 px-5 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel Generation
          </button>
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {/* Stepper Progress Bar */}
          <div className="flex items-center justify-between bg-slate-100 dark:bg-zinc-950 p-2 rounded-2xl border border-slate-200 dark:border-zinc-800">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.num;
            const isCompleted = currentStep > step.num;

            return (
              <div
                key={step.num}
                onClick={() => isCompleted && setCurrentStep(step.num)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-1 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : isCompleted
                    ? 'text-teal-600 dark:text-teal-400 hover:bg-slate-200 dark:hover:bg-zinc-900 cursor-pointer'
                    : 'text-slate-400 dark:text-zinc-600'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 text-teal-400 shrink-0" />
                ) : (
                  <Icon className="w-4 h-4 shrink-0" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Objective & Duration */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {!selectedWorkspace && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1.5">
                <label className="block text-xs font-extrabold text-amber-700 dark:text-amber-300 flex items-center justify-between">
                  <span>Target Workspace Required</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded font-bold">All Workspaces View</span>
                </label>
                {workspaces.length === 0 ? (
                  <p className="text-xs text-rose-500 font-bold">No workspaces available. Please create a workspace first.</p>
                ) : (
                  <select
                    value={targetWsId}
                    onChange={(e) => setTargetWsId(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 font-bold focus:outline-none focus:border-amber-500 shadow-xs cursor-pointer"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        🏢 {w.name} ({w.industry || 'General'})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                <span>1. Campaign Title & Core Focus</span>
                <span className="text-[10px] text-slate-400 font-normal">e.g. Q3 Apex Sample Pack Blitz</span>
              </label>
              <input
                type="text"
                placeholder="Enter campaign title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-indigo-600 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                2. Campaign Strategy & Funnel Goal
              </label>
              <select
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-600 shadow-sm cursor-pointer"
              >
                {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>3. Duration / Total Asset Count</span>
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(['7', '14', '30', '60', 'custom'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      duration === d
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-400'
                    }`}
                  >
                    {d === 'custom' ? 'Custom' : `${d} Days`}
                  </button>
                ))}
              </div>

              {duration === 'custom' && (
                <div className="mt-3 flex items-center gap-3 bg-slate-100 dark:bg-zinc-950 p-3 rounded-xl border border-slate-200 dark:border-zinc-800">
                  <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">Total Asset Count:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={customAssetCount}
                    onChange={(e) => setCustomAssetCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-600"
                  />
                  <span className="text-xs text-slate-400">creatives generated into matrix</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Persona & Tone */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                1. Target Audience Persona
              </label>
              <input
                type="text"
                placeholder="e.g. Commercial Screen Printers, Apparel Decorators, Print Shop Owners"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-indigo-600 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                2. Customer Pain Points & Objections
              </label>
              <textarea
                placeholder="e.g. Slow shipping times from current DTF vendors, peel failure on polyester, high artwork setup fees..."
                value={painPoints}
                onChange={(e) => setPainPoints(e.target.value)}
                rows={3}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-indigo-600 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                3. Brand Tone of Voice
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as ToneType)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-600 shadow-sm cursor-pointer"
              >
                <option value="Punchy">Punchy & Direct (High Conversion)</option>
                <option value="Professional">Professional & Corporate B2B</option>
                <option value="Witty">Witty & High Energy</option>
                <option value="Empathetic">Empathetic & Solution-Oriented</option>
                <option value="Bold & Visionary">Bold & Industry Authority</option>
              </select>
            </div>
          </div>
        )}

        {/* STEP 3: Offer & CTA */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                1. Campaign Lead Magnet / Offer
              </label>
              <select
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-600 shadow-sm cursor-pointer"
              >
                {OFFER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                2. Call-To-Action (CTA) Direction
              </label>
              <select
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-600 shadow-sm cursor-pointer"
              >
                {CTA_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-300 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-1">RAG Brand Knowledge Base Sync</span>
                All selected offers and CTAs will automatically pull technical specs and claim verification from your indexed Brand Guidelines (PDFs & Docs).
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Channels & Freeform Prompt */}
        {currentStep === 4 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                1. Target Social & Ad Channels
              </label>
              <div className="flex items-center gap-2 pt-1">
                {(['Instagram', 'LinkedIn', 'Facebook', 'Twitter'] as PlatformType[]).map((p) => {
                  const isSelected = selectedPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-400'
                      }`}
                    >
                      <PlatformIcon platform={p} className="w-4 h-4" />
                      <span>{p}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                <span>2. Custom AI Prompt Instructions (Optional)</span>
                <span className="text-[10px] text-slate-400 font-normal">Directly guide LLM creative generation</span>
              </label>
              <textarea
                placeholder="e.g. Focus heavily on fast shipping guarantees and wash-durability statistics. Include 1 Carousel concept comparing traditional screen printing to DTF transfers."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-indigo-600 shadow-sm font-mono"
              />
            </div>
          </div>
        )}

        {/* Wizard Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={currentStep === 1 ? onClose : handlePrevStep}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {currentStep === 1 ? 'Cancel' : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </>
            )}
          </button>

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>{isGenerating ? 'Generating Master Matrix...' : 'Generate & Deploy Matrix'}</span>
            </button>
          )}
        </div>
      </div>
      )}
    </Modal>
  );
};

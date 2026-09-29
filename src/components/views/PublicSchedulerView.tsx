import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Mail,
  Phone,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Video,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  ExternalLink,
  Loader2,
  ShieldCheck,
  MessageSquare,
  FileText,
  Check,
  Briefcase,
  Users,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import { API_BASE_URL } from '../../services/apiClient';
import { LEAD_HELP_WITH, LEAD_INDUSTRIES, LEAD_START_TIMELINES } from '../crm/qualificationOptions';
import {
  validateCompanyName,
  validateDescription,
  validateEmailAddress,
  validatePersonName,
  validatePhoneNumber,
  validateWebsiteUrl,
} from '../crm/leadFieldValidation';

const ReamarcLogo3D = React.lazy(() => import('../ui/ReamarcLogo3D'));

interface SchedulerConfig {
  title: string;
  description: string;
  host_name: string;
  duration_minutes: number;
  timezone: string;
  working_days: number[];
  services: string[];
  meeting_link?: string;
  office_address?: string;
  office_map_url?: string;
  hr_whatsapp?: string;
  careers_roles?: string[];
}

export type MeetingMode = 'google_meet' | 'zoom' | 'teams' | 'in_person';

export const MEETING_MODE_OPTIONS: { value: MeetingMode; label: string }[] = [
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'in_person', label: 'In-Person' },
];

interface TimeSlot {
  time: string;
  label: string;
  iso_start: string;
  iso_end: string;
  available: boolean;
  reason?: string;
}

const COUNTRY_CODES = [
  { code: '+92', flag: '🇵🇰', name: 'Pakistan' },
  { code: '+1', flag: '🇺🇸', name: 'United States' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
];

const getApiUrl = (endpoint: string) => {
  const base = (API_BASE_URL || '/api/v1').replace(/\/$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (cleanEndpoint.startsWith('/api/v1/')) {
    return `${base}${cleanEndpoint.slice('/api/v1'.length)}`;
  }
  return `${base}${cleanEndpoint}`;
};

function ymdInTimeZone(timeZone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function civilDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatCivilYmd(d: Date): string {
  const y = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${month}-${day}`;
}

function findFirstAvailableDate(
  baseDate: Date,
  workingDays: number[] = [1, 2, 3, 4, 5, 6],
  blockedDates: string[] = []
): Date {
  const curr = new Date(baseDate);
  const working = workingDays && workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 30; i += 1) {
    const isoDay = curr.getDay() === 0 ? 7 : curr.getDay();
    const ymd = formatCivilYmd(curr);
    if (working.includes(isoDay) && !blockedDates.includes(ymd)) {
      return curr;
    }
    curr.setDate(curr.getDate() + 1);
  }
  return baseDate;
}

type Step = 1 | 2 | 3;
export type MeetingTopic = 'branding_and_marketing' | 'jobs_and_career' | 'collaboration_and_partnership';

const TOPIC_LABELS: Record<MeetingTopic, string> = {
  branding_and_marketing: 'Branding and Marketing Services',
  jobs_and_career: 'Jobs and Careers',
  collaboration_and_partnership: 'Collaboration and Partnership',
};

export interface TopicOption {
  value: MeetingTopic;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const TOPIC_OPTIONS: TopicOption[] = [
  {
    value: 'branding_and_marketing',
    label: 'BRANDING AND MARKETING SERVICES',
    description: '(get you free audit/assessment)',
    icon: Briefcase,
  },
  {
    value: 'jobs_and_career',
    label: 'JOBS AND CAREERS',
    description: '(HR, Hiring, Open vacancies)',
    icon: GraduationCap,
  },
  {
    value: 'collaboration_and_partnership',
    label: 'COLLABORATION AND PARTNERSHIP',
    description: '(Agency Alliances, CEO Office)',
    icon: Users,
  },
];

const COLLABORATION_SERVICES = [
  'Agency & White-Label Partnership',
  'Referral & Affiliate Program',
  'Strategic Technology Integration',
  'Co-Marketing & Joint Venture',
  'Client Project Outsourcing',
  'General Strategic Collaboration',
];

const DEFAULT_CAREERS_ROLES = [
  'Full-Stack Developer',
  'UI/UX & Product Designer',
  'Performance Marketer (Meta / Google Ads)',
  'Video Editor & Motion Designer',
  'AI & Automation Engineer',
  'Technical Copywriter',
  'Other Position',
];

interface CountryCodeDropdownProps {
  value: string;
  onChange: (code: string) => void;
}

function CountryCodeDropdown({ value, onChange }: CountryCodeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCountry = useMemo(() => {
    return COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0];
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-10 px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-1.5 sm:gap-2 transition border cursor-pointer select-none min-w-[86px] sm:min-w-[100px] touch-manipulation ${
          isOpen
            ? 'bg-white dark:bg-zinc-900 border-blue-500 ring-2 ring-blue-500/20 text-zinc-900 dark:text-zinc-100 shadow-xs'
            : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40 text-zinc-900 dark:text-zinc-100'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-base shrink-0 leading-none">{selectedCountry.flag}</span>
          <span className="text-xs font-semibold">{selectedCountry.code}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-60 max-w-[calc(100vw-2.5rem)] p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-0.5 max-h-56 overflow-y-auto">
          {COUNTRY_CODES.map((c) => {
            const isSelected = c.code === value;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-left transition flex items-center justify-between gap-2 text-xs cursor-pointer touch-manipulation ${
                  isSelected
                    ? 'bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-transparent text-zinc-800 dark:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0 leading-none">{c.flag}</span>
                  <span className="font-bold shrink-0">{c.code}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{c.name}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormSelect({
  value,
  onChange,
  options,
  placeholder = 'Select',
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full h-10 px-3.5 rounded-xl flex items-center justify-between gap-2 text-sm sm:text-xs font-medium transition border cursor-pointer select-none touch-manipulation ${
          isOpen
            ? 'bg-white dark:bg-zinc-900 border-blue-500 ring-2 ring-blue-500/20 text-zinc-900 dark:text-zinc-100'
            : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40 text-zinc-900 dark:text-zinc-100'
        }`}
      >
        <span className={`truncate ${selected ? '' : 'text-zinc-400 dark:text-zinc-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-0.5 max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-xl text-left transition flex items-center justify-between gap-2 text-xs cursor-pointer touch-manipulation ${
                  isSelected
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-800 dark:text-zinc-200'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormOption({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left text-sm sm:text-xs font-medium transition cursor-pointer touch-manipulation ${
        checked
          ? 'bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
          : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 hover:border-blue-500/40'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
          checked
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600'
        }`}
      >
        {checked && <Check className="w-3 h-3" />}
      </span>
      <span>{label}</span>
    </button>
  );
}

interface RoleDropdownProps {
  value: string;
  onChange: (role: string) => void;
  options: string[];
}

function RoleDropdown({ value, onChange, options }: RoleDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full h-10 px-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold transition border cursor-pointer select-none touch-manipulation ${
          isOpen
            ? 'bg-white dark:bg-zinc-900 border-blue-500 ring-2 ring-blue-500/20 text-zinc-900 dark:text-zinc-100 shadow-xs'
            : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40 text-zinc-900 dark:text-zinc-100'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Briefcase className="w-3.5 h-3.5" />
          </div>
          <span className="truncate">{value || 'Select a position'}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-1 max-h-60 overflow-y-auto">
          {options.map((role) => {
            const isSelected = role === value;
            return (
              <button
                key={role}
                type="button"
                onClick={() => {
                  onChange(role);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-left transition flex items-center justify-between gap-2 text-xs cursor-pointer touch-manipulation ${
                  isSelected
                    ? 'bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-transparent text-zinc-800 dark:text-zinc-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <Briefcase className="w-3 h-3" />
                  </div>
                  <span className="truncate">{role}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PublicSchedulerView({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const isEmbed = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === 'true';
  }, []);

  const embedTheme = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('theme') || theme;
  }, [theme]);

  // Selected Inquiry Topic: 'branding_and_marketing' | 'jobs_and_career' | 'collaboration_and_partnership' | null
  const [topic, setTopic] = useState<MeetingTopic | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const q = (params.get('topic') || params.get('intent') || params.get('type') || params.get('tab') || '').toLowerCase();
    if (q.includes('job') || q.includes('career') || q.includes('interview') || q.includes('hiring') || q.includes('vacanc') || q.includes('hr')) {
      return 'jobs_and_career';
    }
    if (q.includes('collab') || q.includes('partner') || q.includes('alliance') || q.includes('ceo')) {
      return 'collaboration_and_partnership';
    }
    if (q.includes('brand') || q.includes('market') || q.includes('audit') || q.includes('assess')) {
      return 'branding_and_marketing';
    }
    return null;
  });

  // View steps for Client flow: 1 = date & slot, 2 = brief form, 3 = confirmation
  const [step, setStep] = useState<Step>(1);

  // Scheduler metadata
  const [config, setConfig] = useState<SchedulerConfig>({
    title: 'Digital Services Consultancy Session',
    description: (
      "Hi! thanks for showing interest.\n" +
      "Our upcoming 30-minute meeting will provide an excellent opportunity for us to get better acquainted. " +
      "During our conversation, we'll explore the challenges you're currently encountering and brainstorm ways in which " +
      "we can collaborate effectively to address them and meet your specific requirements.\n" +
      "I'm eagerly looking forward to our discussion. Thanks once again!"
    ),
    host_name: 'Muhammad Faizan Khan',
    duration_minutes: 30,
    timezone: 'Asia/Karachi',
    working_days: [1, 2, 3, 4, 5, 6],
    services: [
      'SEO Strategy & Organic Search',
      'Performance Marketing (Meta / Google Ads)',
      'Full-Stack Web Development',
      'UI/UX Design & Brand Transformation',
      'AI Workflows & Business Automation',
      'Comprehensive Digital Consultancy',
    ],
    hr_whatsapp: '+92 326 5550022',
    careers_roles: DEFAULT_CAREERS_ROLES,
  });

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(() => civilDateFromYmd(ymdInTimeZone('Asia/Karachi')));
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const tz = 'Asia/Karachi';
    const today = civilDateFromYmd(ymdInTimeZone(tz));
    return findFirstAvailableDate(today, [1, 2, 3, 4, 5, 6], []);
  });
  const [fullyBookedDates, setFullyBookedDates] = useState<string[]>([]);

  // Slots State
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);

  // Client Form State
  const [countryCode, setCountryCode] = useState('+92');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [noWebsite, setNoWebsite] = useState(false);
  const [industry, setIndustry] = useState('');
  const [startTimeline, setStartTimeline] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [helpOther, setHelpOther] = useState('');
  const [note, setNote] = useState('');
  const [meetingMode, setMeetingMode] = useState<MeetingMode>('google_meet');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Confirmed booking response
  const [bookingResult, setBookingResult] = useState<any | null>(null);

  // Careers / Candidate Form State
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidateCountryCode, setCandidateCountryCode] = useState('+92');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateRole, setCandidateRole] = useState('Full-Stack Developer');
  const [customRole, setCustomRole] = useState('');
  const [candidatePortfolio, setCandidatePortfolio] = useState('');
  const [candidateNote, setCandidateNote] = useState('');
  const [candidateSubmitting, setCandidateSubmitting] = useState(false);
  const [candidateSubmitted, setCandidateSubmitted] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [lastWhatsAppUrl, setLastWhatsAppUrl] = useState<string>('');

  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
  const topicDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(e.target as Node)) {
        setIsTopicDropdownOpen(false);
      }
    };
    if (isTopicDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isTopicDropdownOpen]);

  const selectedTopicOption = useMemo(() => {
    return TOPIC_OPTIONS.find((o) => o.value === topic) || null;
  }, [topic]);


  const handleTopicChange = (newTopic: MeetingTopic) => {
    setTopic(newTopic);
    setIsTopicDropdownOpen(false);
    setSelectedServices([]);
    setHelpOther('');
    setBookingError(null);
    setCandidateError(null);
    if (newTopic !== 'jobs_and_career') {
      const tz = config.timezone || 'Asia/Karachi';
      const today = civilDateFromYmd(ymdInTimeZone(tz));
      const working = config.working_days || [1, 2, 3, 4, 5, 6];
      if (!selectedDate || isDateDisabled(selectedDate)) {
        setSelectedDate(findFirstAvailableDate(today, working, fullyBookedDates));
      }
    }
    if (newTopic === 'jobs_and_career') {
      if (name && !candidateName) setCandidateName(name);
      if (email && !candidateEmail) setCandidateEmail(email);
      if (phone && !candidatePhone) setCandidatePhone(phone);
      if (countryCode && !candidateCountryCode) setCandidateCountryCode(countryCode);
    } else {
      if (candidateName && !name) setName(candidateName);
      if (candidateEmail && !email) setEmail(candidateEmail);
      if (candidatePhone && !phone) setPhone(candidatePhone);
      if (candidateCountryCode && !countryCode) setCountryCode(candidateCountryCode);
    }
  };

  // Fetch scheduler public config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        let res = await fetch(getApiUrl('/crm/public/scheduler/config'));
        if (!res.ok) {
          res = await fetch('/crm/public/scheduler/config');
        }
        if (res.ok) {
          const data = await res.json();
          setConfig((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Fallback to initial defaults
      }
    };
    void fetchConfig();
  }, []);

  // Fetch fully-booked dates for current visible month
  useEffect(() => {
    const monthStr = formatCivilYmd(currentMonth).slice(0, 7);
    let isMounted = true;

    const fetchMonthAvailability = async () => {
      try {
        let res = await fetch(getApiUrl(`/crm/public/scheduler/month-availability?month=${monthStr}`));
        if (!res.ok) {
          res = await fetch(`/crm/public/scheduler/month-availability?month=${monthStr}`);
        }
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.fully_booked_dates)) {
            setFullyBookedDates(data.fully_booked_dates);
          }
        }
      } catch {
        // Fallback: keep previous or empty
      }
    };

    void fetchMonthAvailability();
    return () => {
      isMounted = false;
    };
  }, [currentMonth, slotsRefreshKey]);

  useEffect(() => {
    const tz = config.timezone || 'Asia/Karachi';
    const today = civilDateFromYmd(ymdInTimeZone(tz));
    setCurrentMonth(today);
    setSelectedDate((prev) => {
      const working = config.working_days || [1, 2, 3, 4, 5, 6];
      const next = findFirstAvailableDate(today, working, fullyBookedDates);
      if (prev && !isDateDisabled(prev)) return prev;
      return next;
    });
  }, [config.timezone, config.working_days]);

  // Auto-advance selectedDate if it becomes fully booked
  useEffect(() => {
    if (selectedDate) {
      const dStr = formatCivilYmd(selectedDate);
      if (fullyBookedDates.includes(dStr)) {
        const tz = config.timezone || 'Asia/Karachi';
        const today = civilDateFromYmd(ymdInTimeZone(tz));
        const nextAvail = findFirstAvailableDate(today, config.working_days || [1, 2, 3, 4, 5, 6], fullyBookedDates);
        setSelectedDate(nextAvail);
      }
    }
  }, [fullyBookedDates]);

  // Fetch slots whenever selectedDate changes (only if meeting topic is selected)
  useEffect(() => {
    if (!selectedDate || !topic || topic === 'jobs_and_career') {
      setSlots([]);
      setLoadingSlots(false);
      return;
    }
    const dateStr = formatCivilYmd(selectedDate);

    setLoadingSlots(true);
    setSelectedSlot(null);
    setBookingError(null);

    const fetchSlots = async () => {
      try {
        let res = await fetch(getApiUrl(`/crm/public/scheduler/slots?date=${dateStr}`));
        if (!res.ok) {
          res = await fetch(`/crm/public/scheduler/slots?date=${dateStr}`);
        }
        if (!res.ok) {
          throw new Error('Could not load slots');
        }
        const data = await res.json();
        const returnedSlots: TimeSlot[] = data.slots || [];
        setSlots(returnedSlots);
        if (returnedSlots.length > 0 && !returnedSlots.some((s) => s.available)) {
          setFullyBookedDates((prev) => (prev.includes(dateStr) ? prev : [...prev, dateStr]));
        }
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    void fetchSlots();
  }, [selectedDate, topic, slotsRefreshKey]);

  // Calendar Helpers
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon...
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { firstDay, totalDays };
  }, [currentMonth]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isSameDay = (d1: Date, d2: Date | null) => {
    if (!d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDateDisabled = (d: Date) => {
    const tzToday = ymdInTimeZone(config.timezone || 'Asia/Karachi');
    const dStr = formatCivilYmd(d);
    if (dStr < tzToday) return true;
    const isoDay = d.getDay() === 0 ? 7 : d.getDay();
    const workingDays = config.working_days || [1, 2, 3, 4, 5, 6];
    if (!workingDays.includes(isoDay)) return true;
    if (fullyBookedDates.includes(dStr)) return true;
    return false;
  };

  const toggleService = (srv: string) => {
    setSelectedServices((prev) => {
      const next = prev.includes(srv) ? prev.filter((s) => s !== srv) : [...prev, srv];
      if (!next.includes('Other')) setHelpOther('');
      return next;
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.help;
      delete next.helpOther;
      return next;
    });
  };

  // Submit Booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot) return;

    setSubmitting(true);
    setBookingError(null);

    const dateStr = formatCivilYmd(selectedDate);

    // Read UTMs from parent / current window URL
    const urlParams = new URLSearchParams(window.location.search);
    const fullPhone = `${countryCode} ${phone.trim()}`;
    const helpOptions = topic === 'collaboration_and_partnership' ? COLLABORATION_SERVICES : LEAD_HELP_WITH;
    const helpWith = selectedServices.filter((item) => helpOptions.includes(item));
    const problems: Record<string, string> = {};
    const nameError = validatePersonName(name);
    const emailError = validateEmailAddress(email);
    const phoneError = validatePhoneNumber(fullPhone);
    const companyError = validateCompanyName(company);
    const websiteError = validateWebsiteUrl(website, noWebsite);
    const noteError = validateDescription(note, 'The description');
    if (nameError) problems.name = nameError;
    if (emailError) problems.email = emailError;
    if (phoneError) problems.phone = phoneError;
    if (companyError) problems.company = companyError;
    if (websiteError) problems.website = websiteError;
    if (!industry) problems.industry = 'Select what the business does.';
    if (helpWith.length === 0) problems.help = 'Select at least one thing you need help with.';
    if (helpWith.includes('Other')) {
      const otherError = validateDescription(helpOther, 'The specific need');
      if (otherError) problems.helpOther = otherError;
    }
    if (!startTimeline) problems.start = 'Select when you are looking to start.';
    if (!meetingMode) problems.meeting = 'Select a meeting method.';
    if (noteError) problems.note = noteError;
    const firstProblem = Object.values(problems)[0];
    if (firstProblem) {
      setFieldErrors(problems);
      setBookingError(firstProblem);
      setSubmitting(false);
      return;
    }
    setFieldErrors({});

    const topicLabel = (topic && TOPIC_LABELS[topic]) || 'Branding and Marketing';

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: fullPhone,
      date: dateStr,
      slot_time: selectedSlot.time,
      company: company.trim(),
      website: noWebsite ? undefined : website.trim(),
      no_website: noWebsite,
      industry,
      help_with: topic === 'collaboration_and_partnership' ? undefined : helpWith,
      help_other: helpWith.includes('Other') ? helpOther.trim() : undefined,
      service: helpWith.map((item) => (item === 'Other' && helpOther.trim() ? `Other: ${helpOther.trim()}` : item)).join(', '),
      start_timeline: startTimeline,
      note: note.trim(),
      topic: topicLabel,
      meeting_mode: meetingMode,
      utm_source: urlParams.get('utm_source') || 'website_scheduler',
      utm_medium: urlParams.get('utm_medium') || (isEmbed ? 'wordpress_embed' : 'direct'),
      utm_campaign: urlParams.get('utm_campaign') || undefined,
      utm_content: urlParams.get('utm_content') || undefined,
    };

    try {
      let res = await fetch(getApiUrl('/crm/public/scheduler/book'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.status === 404) {
        res = await fetch('/crm/public/scheduler/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Could not complete booking.');
      }

      setBookingResult(data);
      setStep(3);
    } catch (err: any) {
      setBookingError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookAnotherSession = () => {
    setStep(1);
    setSelectedSlot(null);
    setBookingResult(null);
    setName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setWebsite('');
    setSelectedServices([]);
    setHelpOther('');
    setMeetingMode('google_meet');
    setNote('');
    setBookingError(null);
    setFieldErrors({});
    setSlotsRefreshKey((prev) => prev + 1);
  };

  const isLikelyJobSeeker = useMemo(() => {
    if (topic === 'jobs_and_career') return false;
    const combined = `${company} ${note}`.toLowerCase();
    return /\b(interview|job|resume|cv|hiring|internship|vacancy|vacancies|applicant|apply)\b/.test(combined);
  }, [topic, company, note]);

  const handleCandidateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCandidateError(null);

    const cleanName = candidateName.trim();
    const cleanEmail = candidateEmail.trim();
    const cleanPhone = candidatePhone.trim();

    if (!cleanName) {
      setCandidateError('Please provide your full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setCandidateError('Please provide a valid email address.');
      return;
    }
    if (!cleanPhone) {
      setCandidateError('Please provide your contact number.');
      return;
    }

    if (candidateRole === 'Other Position' && !customRole.trim()) {
      setCandidateError('Please specify the position you are applying for.');
      return;
    }

    setCandidateSubmitting(true);
    const fullPhone = `${candidateCountryCode} ${cleanPhone}`;
    const targetRole = candidateRole === 'Other Position' && customRole.trim() ? customRole.trim() : candidateRole;

    const messageLines = [
      'Hi Reamarc HR Team,',
      '',
      `I am applying for the ${targetRole} role.`,
      '',
      `Name: ${cleanName}`,
      `Email: ${cleanEmail}`,
      `Phone: ${fullPhone}`,
    ];

    if (candidatePortfolio.trim()) {
      messageLines.push(`Portfolio/CV: ${candidatePortfolio.trim()}`);
    }

    if (candidateNote.trim()) {
      messageLines.push('', `Note: ${candidateNote.trim()}`);
    }

    const text = messageLines.join('\n');

    const rawHrPhone = config.hr_whatsapp || '+923265550022';
    const cleanHrPhone = rawHrPhone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanHrPhone}?text=${encodeURIComponent(text)}`;
    setLastWhatsAppUrl(waUrl);

    // Best-effort non-blocking backup log to backend
    try {
      void fetch(getApiUrl('/crm/public/careers/inquiry'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: fullPhone,
          role: targetRole,
          portfolio_url: candidatePortfolio.trim() || undefined,
          note: candidateNote.trim() || undefined,
        }),
      }).catch(() => {});
    } catch {
      // Ignore network errors on non-critical backup log
    }

    // Open WhatsApp (use direct navigation on mobile to avoid popup blockers)
    const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
    if (isMobile) {
      window.location.href = waUrl;
    } else {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
    setCandidateSubmitted(true);
    setCandidateSubmitting(false);
  };

  const handleResetCandidate = () => {
    setCandidateSubmitted(false);
    setCandidateName('');
    setCandidateEmail('');
    setCandidatePhone('');
    setCandidatePortfolio('');
    setCandidateNote('');
    setCustomRole('');
    setCandidateError(null);
  };

  const isDark = embedTheme === 'dark';

  useEffect(() => {
    if (isEmbed) {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(embedTheme);
      document.body.classList.remove('dark', 'light');
      document.body.classList.add(embedTheme);
    }
  }, [isEmbed, embedTheme]);

  return (
    <div
      className={`${isDark ? 'dark' : ''} min-h-screen flex items-center justify-center ${
        isEmbed
          ? 'bg-transparent p-0'
          : isDark
          ? 'bg-[#09090b] text-zinc-100 p-2.5 sm:p-4 md:p-6'
          : 'bg-slate-50 text-slate-900 p-2.5 sm:p-4 md:p-6'
      }`}
    >
      <div
        className={`w-full max-w-4xl rounded-2xl transition-all duration-300 ${
          isEmbed
            ? isDark
              ? 'bg-zinc-900/95 border border-zinc-800 shadow-2xl p-3.5 sm:p-6'
              : 'bg-white border border-zinc-200 shadow-lg p-3.5 sm:p-6'
            : isDark
            ? 'bg-zinc-900 border border-zinc-800/80 shadow-2xl p-4 sm:p-6 md:p-8'
            : 'bg-white border border-slate-200 shadow-xl p-4 sm:p-6 md:p-8'
        }`}
      >
        {/* Header Section */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4 sm:pb-5 mb-5 sm:mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 sm:gap-3.5">
                <React.Suspense
                  fallback={<div style={{ width: 40, height: 40 }} className="shrink-0" />}
                >
                  <ReamarcLogo3D size={40} className="shrink-0" />
                </React.Suspense>
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-snug">
                  {config.title || 'Digital Services Consultancy Session'}
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 sm:mt-2 max-w-2xl whitespace-pre-line leading-relaxed">
                {config.description}
              </p>
            </div>

            {/* Badges - Constant Always */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>{config.duration_minutes} Mins</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Video className="w-3.5 h-3.5 text-blue-500" />
                <span>Meet, Zoom or Office</span>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 1: PURPOSE / TOPIC SELECTION (Modern Custom Dropdown) */}
        {!(topic !== 'jobs_and_career' && step === 3 && bookingResult) &&
          !(topic === 'jobs_and_career' && candidateSubmitted) && (
            <div
              className={
                topic && topic !== 'jobs_and_career' && step === 1
                  ? 'mb-6 pb-6 border-b border-zinc-200 dark:border-zinc-800'
                  : topic
                    ? 'mb-6'
                    : ''
              }
              ref={topicDropdownRef}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold shadow-xs">
                  1
                </span>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Select Purpose / Topic <span className="text-rose-500">*</span>
                </label>
              </div>

              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setIsTopicDropdownOpen((prev) => !prev)}
                  className={`w-full h-12 px-4 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold transition border cursor-pointer select-none touch-manipulation ${
                    isTopicDropdownOpen
                      ? 'bg-white dark:bg-zinc-900 border-blue-500 ring-2 ring-blue-500/20 text-zinc-900 dark:text-zinc-100 shadow-md'
                      : selectedTopicOption
                      ? 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 text-zinc-900 dark:text-zinc-100'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {selectedTopicOption ? (
                      <>
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <selectedTopicOption.icon className="w-4 h-4" />
                        </div>
                        <div className="text-left min-w-0">
                          <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {selectedTopicOption.label}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-zinc-400 dark:text-zinc-500 flex items-center gap-2">
                        <span>Select what this is regarding...</span>
                      </div>
                    )}
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      isTopicDropdownOpen ? 'rotate-180 text-blue-500' : ''
                    }`}
                  />
                </button>

                {isTopicDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-50 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-1 max-h-80 overflow-y-auto">
                    {TOPIC_OPTIONS.map((opt) => {
                      const isSelected = topic === opt.value;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            handleTopicChange(opt.value);
                            setIsTopicDropdownOpen(false);
                          }}
                          className={`w-full p-3 rounded-xl text-left transition flex items-start justify-between gap-3 cursor-pointer touch-manipulation ${
                            isSelected
                              ? 'bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400'
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-transparent text-zinc-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                {opt.label}
                              </div>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal mt-0.5 leading-snug">
                                {opt.description}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-1">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* STEP 2: DATE & TIME SELECTION — only after a purpose is selected */}
        {topic && topic !== 'jobs_and_career' && step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Calendar Column */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                    2
                  </span>
                  <CalendarIcon className="w-4 h-4 text-blue-500" />
                  Select a Date
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer touch-manipulation"
                    title="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2 text-zinc-800 dark:text-zinc-200 min-w-[110px] text-center">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer touch-manipulation"
                    title="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 sm:p-3 bg-zinc-50/50 dark:bg-zinc-950/40">
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <span key={d} className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 py-1">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: daysInMonth.firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="p-2" />
                  ))}
                  {Array.from({ length: daysInMonth.totalDays }).map((_, i) => {
                    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
                    const dStr = formatCivilYmd(d);
                    const isBookedOut = fullyBookedDates.includes(dStr);
                    const disabled = isDateDisabled(d);
                    const selected = isSameDay(d, selectedDate);

                    return (
                      <button
                        key={`day-${i + 1}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedDate(d)}
                        title={isBookedOut ? 'Fully booked' : undefined}
                        className={`h-9 sm:h-10 rounded-lg text-xs font-medium transition flex items-center justify-center cursor-pointer touch-manipulation select-none active:scale-95 ${
                          selected
                            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
                            : disabled
                            ? isBookedOut
                              ? 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-40 line-through'
                              : 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-30'
                            : 'hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                <span>Working days: Monday – Saturday (Asia/Karachi PKT)</span>
              </div>
            </div>

            {/* Time Slots Column */}
            <div className="md:col-span-5 flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  Available Times
                </h2>
                {selectedDate && (
                  <span className="text-xs text-zinc-500 font-medium">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {loadingSlots ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                  <span className="text-xs">Checking real-time schedule…</span>
                </div>
              ) : slots.length === 0 || !slots.some((s) => s.available) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                  <CalendarIcon className="w-8 h-8 text-zinc-400 mb-2" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {slots.length > 0 && !slots.some((s) => s.available)
                      ? 'All slots booked for this date'
                      : 'No available slots'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">Please select another date on the calendar.</p>
                </div>
              ) : (
                <div className="flex-1 max-h-[280px] sm:max-h-[320px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.time === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setStep(2);
                        }}
                        className={`w-full py-2.5 sm:py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-between border transition cursor-pointer touch-manipulation active:scale-[0.99] ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/25'
                            : slot.available
                            ? 'bg-zinc-100/80 dark:bg-zinc-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-zinc-200 dark:border-zinc-700/60 hover:border-blue-500 text-zinc-800 dark:text-zinc-100'
                            : 'bg-zinc-50 dark:bg-zinc-900/40 border-transparent text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-40 line-through'
                        }`}
                      >
                        <span>{slot.label}</span>
                        {slot.available ? (
                          <span className="text-[11px] font-normal text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            Select <ArrowRight className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-zinc-400">Booked</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: PROJECT BRIEF & DETAILS */}
        {topic !== 'jobs_and_career' && step === 2 && selectedDate && selectedSlot && (
          <form onSubmit={handleConfirmBooking} noValidate className="space-y-5">
            {/* Selected Summary Pill */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 sm:p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-medium min-w-0">
                <CalendarIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="truncate sm:whitespace-normal">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  {' at '}
                  <strong>{selectedSlot.label}</strong> (PKT)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-auto sm:ml-0 shrink-0 touch-manipulation"
              >
                Change Time
              </button>
            </div>

            {bookingError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                {bookingError}
              </div>
            )}

            {isLikelyJobSeeker && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs gap-2.5">
                <span>Applying for a job? Please select JOBS AND CAREERS instead of booking a client meeting.</span>
                <button
                  type="button"
                  onClick={() => handleTopicChange('jobs_and_career')}
                  className="font-semibold underline text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 shrink-0 cursor-pointer touch-manipulation"
                >
                  Switch to Jobs &amp; Careers →
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  Your Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {fieldErrors.name && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.name}</p>}
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  Business Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. sarah@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {fieldErrors.email && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.email}</p>}
              </div>

              {/* Phone / WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  Phone / WhatsApp <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <CountryCodeDropdown value={countryCode} onChange={setCountryCode} />
                  <input
                    type="tel"
                    placeholder="300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                </div>
                {fieldErrors.phone && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.phone}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Company / business name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {fieldErrors.company && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.company}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  What does your business do? <span className="text-rose-500">*</span>
                </label>
                <FormSelect
                  value={industry}
                  onChange={setIndustry}
                  placeholder="Select"
                  options={LEAD_INDUSTRIES.map((item) => ({ value: item, label: item }))}
                />
                {fieldErrors.industry && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.industry}</p>}
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Website / business URL {!noWebsite && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="text"
                  disabled={noWebsite}
                  placeholder="https://acmecorp.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                {fieldErrors.website && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.website}</p>}
                <FormOption
                  checked={noWebsite}
                  label="No website"
                  onToggle={() => {
                    setNoWebsite((prev) => {
                      if (!prev) setWebsite('');
                      return !prev;
                    });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {topic === 'collaboration_and_partnership'
                  ? 'What type of collaboration are you interested in?'
                  : 'What do you need help with?'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {(topic === 'collaboration_and_partnership' ? COLLABORATION_SERVICES : LEAD_HELP_WITH).map((srv) => (
                  <FormOption
                    key={srv}
                    checked={selectedServices.includes(srv)}
                    label={srv}
                    onToggle={() => toggleService(srv)}
                  />
                ))}
              </div>
              {fieldErrors.help && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.help}</p>}
              {selectedServices.includes('Other') && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Describe the specific need <span className="text-rose-500">*</span>
                  </span>
                  <textarea
                    rows={2}
                    value={helpOther}
                    onChange={(e) => setHelpOther(e.target.value)}
                    placeholder="What else do you need help with?"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  {fieldErrors.helpOther && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.helpOther}</p>}
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                When are you looking to start? <span className="text-rose-500">*</span>
              </label>
              <FormSelect
                value={startTimeline}
                onChange={setStartTimeline}
                placeholder="Select"
                options={LEAD_START_TIMELINES.map((item) => ({ value: item, label: item }))}
              />
              {fieldErrors.start && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.start}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Preferred Meeting Method <span className="text-rose-500">*</span>
              </label>
              <FormSelect
                value={meetingMode}
                onChange={(value) => setMeetingMode(value as MeetingMode)}
                options={MEETING_MODE_OPTIONS}
              />
            </div>

            {/* Project Brief */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Briefly describe what you need <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="What are you trying to achieve, and what problem are you facing?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
              />
              {fieldErrors.note && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.note}</p>}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer touch-manipulation"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirming Session…</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Strategy Session</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: CONFIRMATION & CALENDAR LINKS */}
        {topic !== 'jobs_and_career' && step === 3 && bookingResult && (
          <div className="text-center py-6 sm:py-8 space-y-6">
            <div className="w-16 h-16 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center mx-auto ring-8 ring-blue-500/10 animate-bounce-short">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                You're Scheduled!
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
                Your session is booked. The meeting link will be sent to you on WhatsApp.
              </p>
            </div>

            {/* Booking Details Card */}
            <div className="max-w-md mx-auto p-3.5 sm:p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-left space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-zinc-400 shrink-0">Meeting:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-right">
                  {bookingResult.meeting?.title}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-zinc-400 shrink-0">Date &amp; Time:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400 text-right">
                  {bookingResult.meeting?.date} at {bookingResult.meeting?.time_label} ({bookingResult.meeting?.timezone || config.timezone})
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-zinc-400 shrink-0">Host:</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200 text-right">
                  {bookingResult.meeting?.host_name}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-zinc-400 shrink-0">Meeting Method:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-right">
                  {MEETING_MODE_OPTIONS.find((opt) => opt.value === bookingResult.meeting?.meeting_mode)?.label
                    || bookingResult.meeting?.location_label
                    || 'Google Meet'}
                </span>
              </div>
            </div>

            {bookingResult.meeting?.meeting_mode === 'in_person' ? (
              <div className="max-w-md mx-auto p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-left space-y-2 text-xs">
                <div className="font-bold text-amber-800 dark:text-amber-200">
                  Office visit
                </div>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {bookingResult.meeting?.office_address || 'Reamarc Office, Rawalpindi HQ, Pakistan'}
                </p>
                <a
                  href={bookingResult.meeting?.office_map_url || 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-700 dark:text-amber-300 underline inline-flex items-center gap-1"
                >
                  <span>View on Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="max-w-md mx-auto p-3.5 sm:p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-left text-xs">
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  The sales person in charge will send the meeting link on WhatsApp before the call.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 pt-2 max-w-sm sm:max-w-none mx-auto">
              {bookingResult.meeting?.meeting_mode === 'in_person' && (
                <a
                  href={bookingResult.meeting?.office_map_url || 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-amber-600/25 cursor-pointer touch-manipulation"
                >
                  <MapPin className="w-4 h-4" />
                  <span>View Office Map</span>
                </a>
              )}

              <a
                href={bookingResult.calendar_links?.google || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md cursor-pointer touch-manipulation"
              >
                <CalendarIcon className="w-4 h-4" />
                <span>Add to Google Calendar</span>
              </a>

              <a
                href={bookingResult.calendar_links?.ics_path ? getApiUrl(bookingResult.calendar_links.ics_path) : '#'}
                download
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer touch-manipulation"
              >
                <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <span>Outlook / iCal (.ics)</span>
              </a>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleBookAnotherSession}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-4 hover:underline transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Book another session</span>
              </button>
            </div>
          </div>
        )}

        {/* CAREERS & INTERVIEW APPLICATION SECTION */}
        {topic === 'jobs_and_career' && (
          <div>
            {candidateSubmitted ? (
              <div className="text-center py-6 sm:py-8 space-y-6">
                <div className="w-14 h-14 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    Application Ready
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
                    Click below to send your application message to our HR team on WhatsApp.
                  </p>
                </div>

                <div className="max-w-xs mx-auto pt-2">
                  <a
                    href={lastWhatsAppUrl || '#'}
                    target={typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/25 cursor-pointer touch-manipulation"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Open WhatsApp</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={handleResetCandidate}
                    className="font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition cursor-pointer touch-manipulation"
                  >
                    Submit another application
                  </button>
                  <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">·</span>
                  <button
                    type="button"
                    onClick={() => handleTopicChange('branding_and_marketing')}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer touch-manipulation"
                  >
                    Book a meeting instead
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCandidateSubmit} className="space-y-5">
                {candidateError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                    {candidateError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-zinc-400" />
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. john@example.com"
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Phone / WhatsApp */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" />
                      Phone / WhatsApp <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <CountryCodeDropdown
                        value={candidateCountryCode}
                        onChange={setCandidateCountryCode}
                      />
                      <input
                        type="tel"
                        required
                        placeholder="300 1234567"
                        value={candidatePhone}
                        onChange={(e) => setCandidatePhone(e.target.value)}
                        className="flex-1 h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 min-w-0"
                      />
                    </div>
                  </div>

                  {/* Role Applied For */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
                      Position Applying For <span className="text-rose-500">*</span>
                    </label>
                    <RoleDropdown
                      value={candidateRole}
                      onChange={setCandidateRole}
                      options={config.careers_roles || DEFAULT_CAREERS_ROLES}
                    />
                  </div>

                  {/* Custom Role Input if 'Other Position' is selected */}
                  {candidateRole === 'Other Position' && (
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Specify Position <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Media Buyer / Animator"
                        value={customRole}
                        onChange={(e) => setCustomRole(e.target.value)}
                        className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Portfolio / LinkedIn / Resume Link */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-zinc-400" />
                      Portfolio / CV Link (optional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://linkedin.com/in/... or Google Drive link"
                      value={candidatePortfolio}
                      onChange={(e) => setCandidatePortfolio(e.target.value)}
                      className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Cover Note / Background */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      Short Note (optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Brief note about your experience..."
                      value={candidateNote}
                      onChange={(e) => setCandidateNote(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleTopicChange('branding_and_marketing')}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition flex items-center justify-center cursor-pointer touch-manipulation"
                  >
                    Back to Meeting Scheduler
                  </button>
                  <button
                    type="submit"
                    disabled={candidateSubmitting}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-50 cursor-pointer touch-manipulation"
                  >
                    {candidateSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Opening WhatsApp…</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" />
                        <span>Continue to WhatsApp</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PublicSchedulerView;

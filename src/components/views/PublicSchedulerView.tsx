import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Mail,
  Phone,
  Globe,
  ChevronDown,
  CircleCheck,
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
import { BrandMark } from '../ui/BrandMark';
import { Calendar } from '../ui/calendar';
import { buttonVariants } from '../ui/button';
import { cn } from '../../lib/utils';
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
    label: 'Branding and Marketing',
    description: 'Free audit & growth strategy session',
    icon: Briefcase,
  },
  {
    value: 'collaboration_and_partnership',
    label: 'Partnership & Alliance',
    description: 'Agency alliances & executive office',
    icon: Users,
  },
  {
    value: 'jobs_and_career',
    label: 'Jobs and Careers',
    description: 'HR, hiring & open vacancies',
    icon: GraduationCap,
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
        className={cn(
          'h-10 px-2.5 sm:px-3 rounded-md text-xs font-medium flex items-center justify-between gap-1.5 transition-colors border select-none min-w-[86px] sm:min-w-[96px] cursor-pointer',
          isOpen
            ? 'bg-surface border-accent ring-1 ring-accent text-fg'
            : 'bg-surface border-border hover:border-border-strong text-fg'
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-sm shrink-0 leading-none">{selectedCountry.flag}</span>
          <span className="text-xs font-mono">{selectedCountry.code}</span>
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-fg-muted transition-transform duration-200 shrink-0', isOpen && 'rotate-180 text-fg')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-60 max-w-[calc(100vw-2.5rem)] p-1 rounded-lg bg-surface border border-border shadow-md space-y-0.5 max-h-56 overflow-y-auto">
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
                className={cn(
                  'w-full px-2.5 py-1.5 rounded-md text-left transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer',
                  isSelected
                    ? 'bg-accent-soft text-accent-text font-medium'
                    : 'hover:bg-hover text-fg'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0 leading-none">{c.flag}</span>
                  <span className="font-mono font-medium shrink-0">{c.code}</span>
                  <span className="text-xs text-fg-muted truncate">{c.name}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-accent-text" />}
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
        className={cn(
          'w-full h-10 px-3 rounded-md flex items-center justify-between gap-2 text-xs font-normal transition-colors border select-none cursor-pointer',
          isOpen
            ? 'bg-surface border-accent ring-1 ring-accent text-fg'
            : 'bg-surface border-border hover:border-border-strong text-fg'
        )}
      >
        <span className={cn('truncate', !selected && 'text-fg-faint')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-fg-muted transition-transform duration-200 shrink-0', isOpen && 'rotate-180 text-fg')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1 rounded-lg bg-surface border border-border shadow-md space-y-0.5 max-h-60 overflow-y-auto">
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
                className={cn(
                  'w-full px-3 py-1.5 rounded-md text-left transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer',
                  isSelected
                    ? 'bg-accent-soft text-accent-text font-medium'
                    : 'hover:bg-hover text-fg'
                )}
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
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left text-xs font-normal transition-colors cursor-pointer',
        checked
          ? 'bg-accent-soft/40 border-accent text-fg'
          : 'bg-surface border-border hover:border-border-strong text-fg'
      )}
    >
      <span
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
          checked
            ? 'bg-accent border-accent text-white'
            : 'bg-surface border-border-strong text-transparent'
        )}
      >
        <Check className="w-3 h-3" />
      </span>
      <span className="truncate">{label}</span>
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
        className={cn(
          'w-full h-10 px-3 rounded-md flex items-center justify-between gap-2.5 text-xs font-normal transition-colors border select-none cursor-pointer',
          isOpen
            ? 'bg-surface border-accent ring-1 ring-accent text-fg'
            : 'bg-surface border-border hover:border-border-strong text-fg'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Briefcase className="w-3.5 h-3.5 text-fg-muted shrink-0" />
          <span className="truncate">{value || 'Select a position'}</span>
        </div>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-fg-muted transition-transform duration-200 shrink-0', isOpen && 'rotate-180 text-fg')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1 rounded-lg bg-surface border border-border shadow-md space-y-0.5 max-h-60 overflow-y-auto">
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
                className={cn(
                  'w-full px-3 py-1.5 rounded-md text-left transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer',
                  isSelected
                    ? 'bg-accent-soft text-accent-text font-medium'
                    : 'hover:bg-hover text-fg'
                )}
              >
                <span className="truncate">{role}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PublicSchedulerView({ theme = 'light' }: { theme?: 'dark' | 'light' }) {
  const isEmbed = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === 'true';
  }, []);

  const embedTheme = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('theme') || theme;
  }, [theme]);

  // Selected Inquiry Topic: 'branding_and_marketing' | 'jobs_and_career' | 'collaboration_and_partnership'
  const [topic, setTopic] = useState<MeetingTopic>(() => {
    const params = new URLSearchParams(window.location.search);
    const q = (params.get('topic') || params.get('intent') || params.get('type') || params.get('tab') || '').toLowerCase();
    if (q.includes('job') || q.includes('career') || q.includes('interview') || q.includes('hiring') || q.includes('vacanc') || q.includes('hr')) {
      return 'jobs_and_career';
    }
    if (q.includes('collab') || q.includes('partner') || q.includes('alliance') || q.includes('ceo')) {
      return 'collaboration_and_partnership';
    }
    return 'branding_and_marketing';
  });

  // Steps: 1 = date & slot, 2 = brief form, 3 = confirmation
  const [step, setStep] = useState<Step>(1);

  // Scheduler metadata
  const [config, setConfig] = useState<SchedulerConfig>({
    title: 'Book a meeting',
    description: (
      "Hi! Thanks for your interest in Reamarc.\n" +
      "This 30-minute introductory meeting is an opportunity to discuss your goals, explore the challenges " +
      "you're encountering, and see how our team can help you build and scale."
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
  const [currentMonth, setCurrentMonth] = useState<Date>(() => civilDateFromYmd(ymdInTimeZone('Asia/Karachi')));
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
    return TOPIC_OPTIONS.find((o) => o.value === topic) || TOPIC_OPTIONS[0];
  }, [topic]);

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
          setConfig((prev) => ({
            ...prev,
            ...data,
            title: data.title && !data.title.includes('Digital Services Consultancy') ? data.title : prev.title,
          }));
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
        // Fallback
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

  // Fetch slots whenever selectedDate changes
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
      // Ignore backup log failure
    }

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
    const activeTheme = embedTheme || theme;
    const isDarkTheme = activeTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDarkTheme);
    document.documentElement.classList.toggle('light', !isDarkTheme);
    document.body.classList.toggle('dark', isDarkTheme);
    document.body.classList.toggle('light', !isDarkTheme);
  }, [embedTheme, theme]);

  const hostInitials = useMemo(() => {
    if (!config.host_name) return 'R';
    return config.host_name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }, [config.host_name]);

  const displayTitle = config.title || 'Book a meeting';

  return (
    <div
      className={cn(
        isDark ? 'dark' : '',
        'min-h-screen flex items-center justify-center font-sans antialiased',
        isEmbed ? 'bg-transparent p-0' : 'bg-canvas text-fg p-3 sm:p-6 md:p-8'
      )}
    >
      {/* 960px 2-column card (§ 13.19) */}
      <div
        className={cn(
          'w-full max-w-[960px] bg-surface rounded-xl border border-border shadow-xs overflow-hidden',
          isEmbed ? 'border border-border' : ''
        )}
      >
        <div className="flex flex-col md:flex-row">
          {/* LEFT COLUMN (320px on desktop): Meeting summary (§ 13.19) */}
          <div className="w-full md:w-80 md:min-w-[320px] md:max-w-[320px] shrink-0 border-b md:border-b-0 md:border-r border-border p-6 bg-surface flex flex-col justify-between">
            <div className="space-y-5">
              {/* Brand mark + Wordmark */}
              <div className="flex items-center gap-2.5">
                <BrandMark size={28} />
                <span className="font-semibold text-base text-fg tracking-tight">Reamarc</span>
              </div>

              {/* Host Avatar & Name */}
              <div className="flex items-center gap-3 pt-1">
                <div className="w-10 h-10 rounded-full bg-accent-soft text-accent-text flex items-center justify-center text-xs font-semibold shrink-0">
                  {hostInitials}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-fg-muted uppercase tracking-wider font-medium">Host</div>
                  <div className="text-sm font-semibold text-fg truncate">{config.host_name}</div>
                </div>
              </div>

              {/* Meeting Title & Meta */}
              <div className="space-y-2 pt-1">
                <h1 className="text-lg font-semibold text-fg tracking-tight leading-snug">
                  {topic === 'jobs_and_career' ? 'Careers & Applications' : displayTitle}
                </h1>

                <div className="flex flex-col gap-1.5 text-xs text-fg-muted">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                    <span>{config.duration_minutes} min duration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Video className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                    <span>Google Meet, Zoom, Teams or Office</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="text-xs text-fg-muted leading-relaxed whitespace-pre-line border-t border-border pt-3">
                {topic === 'jobs_and_career'
                  ? 'Join the Reamarc team. Submit your details and direct application note to connect with our talent team.'
                  : config.description}
              </div>

              {/* Topic / Purpose Selector */}
              <div className="border-t border-border pt-3 space-y-1.5" ref={topicDropdownRef}>
                <label className="text-xs font-semibold uppercase tracking-wider text-fg-muted block">
                  Purpose / Topic
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTopicDropdownOpen((prev) => !prev)}
                    className={cn(
                      'w-full h-9 px-2.5 rounded-md border text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer select-none',
                      isTopicDropdownOpen
                        ? 'border-accent ring-1 ring-accent bg-surface text-fg'
                        : 'border-border hover:border-border-strong bg-surface text-fg'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <selectedTopicOption.icon className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                      <span className="truncate">{selectedTopicOption.label}</span>
                    </div>
                    <ChevronDown
                      className={cn('w-3.5 h-3.5 text-fg-muted transition-transform shrink-0', isTopicDropdownOpen && 'rotate-180 text-fg')}
                    />
                  </button>

                  {isTopicDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1 rounded-lg bg-surface border border-border shadow-md space-y-0.5">
                      {TOPIC_OPTIONS.map((opt) => {
                        const isSelected = topic === opt.value;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleTopicChange(opt.value)}
                            className={cn(
                              'w-full px-2.5 py-2 rounded-md text-left transition-colors flex items-start gap-2.5 cursor-pointer',
                              isSelected ? 'bg-accent-soft text-accent-text font-medium' : 'hover:bg-hover text-fg'
                            )}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="text-xs leading-tight font-medium">{opt.label}</div>
                              <div className="text-[10px] text-fg-muted mt-0.5 leading-tight">{opt.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Left Column Footer note */}
            <div className="pt-6 border-t border-border mt-6 flex items-center gap-2 text-xs text-fg-faint">
              <ShieldCheck className="w-3.5 h-3.5 text-fg-muted shrink-0" />
              <span>Mon – Sat (Asia/Karachi PKT)</span>
            </div>
          </div>

          {/* RIGHT COLUMN: Calendar / Form / Confirmation (§ 13.19) */}
          <div className="flex-1 p-5 sm:p-6 bg-surface overflow-y-auto">
            {/* STEP 1: Date & Time Picker */}
            {topic !== 'jobs_and_career' && step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-fg">Select date and time</h2>
                  <p className="text-xs text-fg-muted mt-0.5">Choose an available date and time slot for your session.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* Calendar Widget */}
                  <div className="border border-border rounded-lg p-2.5 bg-surface">
                    <Calendar
                      mode="single"
                      selected={selectedDate || undefined}
                      onSelect={(date) => {
                        if (date) setSelectedDate(date);
                      }}
                      month={currentMonth}
                      onMonthChange={setCurrentMonth}
                      disabled={(date) => isDateDisabled(date)}
                      className="p-0 bg-transparent text-fg"
                      classNames={{
                        month_caption: 'flex justify-center pt-0 relative items-center mb-2',
                        caption_label: 'text-xs font-semibold text-fg',
                        day: 'h-8 w-8 text-center text-xs p-0 relative',
                        day_button: cn(
                          buttonVariants({ variant: 'ghost' }),
                          'h-8 w-8 p-0 font-medium text-fg aria-selected:opacity-100 hover:bg-hover rounded-md select-none font-numeric'
                        ),
                        selected: 'bg-accent text-white hover:bg-accent hover:text-white focus:bg-accent focus:text-white rounded-md font-semibold',
                        disabled: 'text-fg-faint opacity-35 cursor-not-allowed no-underline',
                      }}
                    />
                  </div>

                  {/* Time Slots Column */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <div className="text-xs font-semibold text-fg flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-fg-muted" />
                        <span>Available times</span>
                      </div>
                      {selectedDate && (
                        <span className="text-xs text-fg-muted font-mono font-medium">
                          {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {loadingSlots ? (
                      <div className="flex flex-col items-center justify-center p-8 text-fg-muted">
                        <Loader2 className="w-5 h-5 animate-spin text-accent mb-2" />
                        <span className="text-xs">Checking availability…</span>
                      </div>
                    ) : slots.length === 0 || !slots.some((s) => s.available) ? (
                      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-lg text-center">
                        <CalendarIcon className="w-6 h-6 text-fg-faint mb-2" />
                        <p className="text-xs font-medium text-fg">No available slots for this date</p>
                        <p className="text-xs text-fg-muted mt-0.5">Please choose another day on the calendar.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
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
                              className={cn(
                                'h-10 px-3 rounded-md border text-xs font-medium transition-colors flex items-center justify-between cursor-pointer select-none font-numeric',
                                isSelected
                                  ? 'bg-accent text-white border-accent'
                                  : slot.available
                                  ? 'border-border text-fg hover:border-border-strong hover:bg-hover'
                                  : 'border-border/30 text-fg-faint bg-subtle cursor-not-allowed opacity-40'
                              )}
                            >
                              <span>{slot.label}</span>
                              {slot.available && <ArrowRight className="w-3 h-3 text-fg-muted" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Booking Details Form */}
            {topic !== 'jobs_and_career' && step === 2 && selectedDate && selectedSlot && (
              <form onSubmit={handleConfirmBooking} noValidate className="space-y-5">
                {/* Header with Back button */}
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-fg">Enter your details</h2>
                    <p className="text-xs text-fg-muted mt-0.5">Please provide your contact information and meeting details.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg font-medium transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                </div>

                {/* Selected Time Pill */}
                <div className="flex items-center justify-between p-3 rounded-md bg-subtle border border-border text-xs">
                  <div className="flex items-center gap-2 text-fg">
                    <CalendarIcon className="w-4 h-4 text-accent shrink-0" />
                    <span className="font-mono">
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      {' at '}
                      <strong>{selectedSlot.label}</strong> (PKT)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs font-medium text-accent hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {bookingError && (
                  <div role="alert" className="p-3 rounded-md bg-danger-soft border border-danger-border text-danger-fg text-xs font-medium">
                    {bookingError}
                  </div>
                )}

                {isLikelyJobSeeker && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-md bg-warning-soft border border-warning-border text-warning-fg text-xs gap-2">
                    <span>Applying for a job? Please select Jobs &amp; Careers instead of booking a client meeting.</span>
                    <button
                      type="button"
                      onClick={() => handleTopicChange('jobs_and_career')}
                      className="font-medium underline hover:opacity-80 shrink-0 cursor-pointer"
                    >
                      Switch to Jobs &amp; Careers →
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Full Name</span>
                      <span className="text-danger-fg">*</span>
                    </label>
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Sarah Jenkins"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                    />
                    {fieldErrors.name && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.name}</p>}
                  </div>

                  {/* Business Email */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Work Email</span>
                      <span className="text-danger-fg">*</span>
                    </label>
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="e.g. sarah@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                    />
                    {fieldErrors.email && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.email}</p>}
                  </div>

                  {/* Phone / WhatsApp */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Phone / WhatsApp</span>
                      <span className="text-danger-fg">*</span>
                    </label>
                    <div className="flex gap-2">
                      <CountryCodeDropdown value={countryCode} onChange={setCountryCode} />
                      <input
                        type="tel"
                        autoComplete="tel"
                        placeholder="300 1234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent min-w-0 font-mono"
                      />
                    </div>
                    {fieldErrors.phone && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.phone}</p>}
                  </div>

                  {/* Company */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg">
                      <span>Company Name</span> <span className="text-danger-fg">*</span>
                    </label>
                    <input
                      type="text"
                      autoComplete="organization"
                      placeholder="e.g. Acme Corp"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                    />
                    {fieldErrors.company && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.company}</p>}
                  </div>

                  {/* Industry */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg">
                      <span>Business Industry</span> <span className="text-danger-fg">*</span>
                    </label>
                    <FormSelect
                      value={industry}
                      onChange={setIndustry}
                      placeholder="Select industry"
                      options={LEAD_INDUSTRIES.map((item) => ({ value: item, label: item }))}
                    />
                    {fieldErrors.industry && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.industry}</p>}
                  </div>

                  {/* Website */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg">
                      <span>Website / URL</span> {!noWebsite && <span className="text-danger-fg">*</span>}
                    </label>
                    <input
                      type="url"
                      disabled={noWebsite}
                      placeholder="https://example.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent disabled:opacity-50"
                    />
                    {fieldErrors.website && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.website}</p>}
                    <div className="pt-1">
                      <FormOption
                        checked={noWebsite}
                        label="No website yet"
                        onToggle={() => {
                          setNoWebsite((prev) => {
                            if (!prev) setWebsite('');
                            return !prev;
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Services Needed */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-fg">
                    {topic === 'collaboration_and_partnership'
                      ? 'What type of collaboration are you interested in?'
                      : 'What do you need help with?'}{' '}
                    <span className="text-danger-fg">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(topic === 'collaboration_and_partnership' ? COLLABORATION_SERVICES : LEAD_HELP_WITH).map((srv) => (
                      <FormOption
                        key={srv}
                        checked={selectedServices.includes(srv)}
                        label={srv}
                        onToggle={() => toggleService(srv)}
                      />
                    ))}
                  </div>
                  {fieldErrors.help && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.help}</p>}
                  {selectedServices.includes('Other') && (
                    <div className="space-y-1 pt-1">
                      <label className="text-xs font-medium text-fg">
                        <span>Describe specific need</span> <span className="text-danger-fg">*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={helpOther}
                        onChange={(e) => setHelpOther(e.target.value)}
                        placeholder="What else do you need assistance with?"
                        className="w-full p-2.5 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent resize-none"
                      />
                      {fieldErrors.helpOther && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.helpOther}</p>}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start Timeline */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg">
                      <span>Target Start Timeline</span> <span className="text-danger-fg">*</span>
                    </label>
                    <FormSelect
                      value={startTimeline}
                      onChange={setStartTimeline}
                      placeholder="Select timeline"
                      options={LEAD_START_TIMELINES.map((item) => ({ value: item, label: item }))}
                    />
                    {fieldErrors.start && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.start}</p>}
                  </div>

                  {/* Meeting Mode */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-fg">
                      <span>Preferred Meeting Method</span> <span className="text-danger-fg">*</span>
                    </label>
                    <FormSelect
                      value={meetingMode}
                      onChange={(value) => setMeetingMode(value as MeetingMode)}
                      options={MEETING_MODE_OPTIONS}
                    />
                  </div>
                </div>

                {/* Brief description / notes */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-fg">
                    <span>Brief project notes</span> <span className="text-danger-fg">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Briefly describe what you are looking to achieve..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full p-2.5 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent resize-none leading-relaxed"
                  />
                  {fieldErrors.note && <p role="alert" className="text-xs font-medium text-danger-fg">{fieldErrors.note}</p>}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="h-10 px-4 rounded-md border border-border hover:bg-hover text-xs font-medium text-fg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-10 px-6 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Confirming booking…</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm booking</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Confirmation Screen (§ 13.19) */}
            {topic !== 'jobs_and_career' && step === 3 && bookingResult && (
              <div className="text-center py-6 space-y-5">
                {/* Success Tile */}
                <div className="w-10 h-10 rounded-full bg-success-soft text-success-fg flex items-center justify-center mx-auto">
                  <CircleCheck className="w-5 h-5" />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-fg">You're booked</h2>
                  <p className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">
                    Your session is confirmed. A meeting link and invitation will be sent to your WhatsApp.
                  </p>
                </div>

                {/* Details Summary Card */}
                <div className="max-w-md mx-auto p-4 rounded-lg bg-subtle border border-border text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-fg-muted">Meeting</span>
                    <span className="font-medium text-fg text-right">{bookingResult.meeting?.title}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-fg-muted">Date &amp; Time</span>
                    <span className="font-mono font-medium text-accent text-right">
                      {bookingResult.meeting?.date} at {bookingResult.meeting?.time_label} ({bookingResult.meeting?.timezone || config.timezone})
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-fg-muted">Host</span>
                    <span className="font-medium text-fg text-right">{bookingResult.meeting?.host_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-fg-muted">Method</span>
                    <span className="font-medium text-fg text-right">
                      {MEETING_MODE_OPTIONS.find((opt) => opt.value === bookingResult.meeting?.meeting_mode)?.label ||
                        bookingResult.meeting?.location_label ||
                        'Google Meet'}
                    </span>
                  </div>
                </div>

                {/* In-Person vs Virtual Location Info */}
                {bookingResult.meeting?.meeting_mode === 'in_person' ? (
                  <div className="max-w-md mx-auto p-3.5 rounded-lg bg-warning-soft border border-warning-border text-left space-y-1.5 text-xs">
                    <div className="font-medium text-warning-fg">Office visit</div>
                    <p className="text-fg-muted leading-relaxed">
                      {bookingResult.meeting?.office_address || 'Reamarc Office, Rawalpindi HQ, Pakistan'}
                    </p>
                    <a
                      href={bookingResult.meeting?.office_map_url || 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent underline inline-flex items-center gap-1"
                    >
                      <span>View on Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto p-3 rounded-lg bg-subtle border border-border text-left text-xs text-fg-muted">
                    The meeting link will be shared via WhatsApp and email prior to the call.
                  </div>
                )}

                {/* Calendar & Map Actions */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  {bookingResult.meeting?.meeting_mode === 'in_person' && (
                    <a
                      href={bookingResult.meeting?.office_map_url || 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3.5 rounded-md border border-border hover:bg-hover text-fg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-fg-muted" />
                      <span>View Office Map</span>
                    </a>
                  )}

                  <a
                    href={bookingResult.calendar_links?.google || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span>Add to Google Calendar</span>
                  </a>

                  <a
                    href={bookingResult.calendar_links?.ics_path ? getApiUrl(bookingResult.calendar_links.ics_path) : '#'}
                    download
                    className="h-9 px-3.5 rounded-md border border-border hover:bg-hover text-fg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5 text-fg-muted" />
                    <span>Outlook / iCal (.ics)</span>
                  </a>
                </div>

                {/* Ghost action: Book another time */}
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleBookAnotherSession}
                    className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg font-medium transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Book another time</span>
                  </button>
                </div>
              </div>
            )}

            {/* CAREERS & INTERVIEW APPLICATION SECTION */}
            {topic === 'jobs_and_career' && (
              <div>
                {candidateSubmitted ? (
                  <div className="text-center py-6 space-y-5">
                    <div className="w-10 h-10 rounded-full bg-success-soft text-success-fg flex items-center justify-center mx-auto">
                      <CircleCheck className="w-5 h-5" />
                    </div>

                    <div>
                      <h2 className="text-lg font-semibold text-fg">Application ready</h2>
                      <p className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">
                        Click below to send your application message to our HR team on WhatsApp.
                      </p>
                    </div>

                    <div className="max-w-xs mx-auto pt-1">
                      <a
                        href={lastWhatsAppUrl || '#'}
                        target={typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '') ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        className="h-10 px-5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors w-full"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open WhatsApp</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="pt-2 flex items-center justify-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={handleResetCandidate}
                        className="text-fg-muted hover:text-fg font-medium transition-colors cursor-pointer"
                      >
                        Submit another application
                      </button>
                      <span className="text-border">•</span>
                      <button
                        type="button"
                        onClick={() => handleTopicChange('branding_and_marketing')}
                        className="text-accent hover:underline font-medium transition-colors cursor-pointer"
                      >
                        Book a meeting instead
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCandidateSubmit} className="space-y-4">
                    <div className="border-b border-border pb-3">
                      <h2 className="text-sm font-semibold text-fg">Career Application</h2>
                      <p className="text-xs text-fg-muted mt-0.5">Submit your details to apply for an open position at Reamarc.</p>
                    </div>

                    {candidateError && (
                      <div role="alert" className="p-3 rounded-md bg-danger-soft border border-danger-border text-danger-fg text-xs font-medium">
                        {candidateError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Full Name */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-fg-muted" />
                          <span>Full Name</span>
                          <span className="text-danger-fg">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. John Doe"
                          value={candidateName}
                          onChange={(e) => setCandidateName(e.target.value)}
                          className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                        />
                      </div>

                      {/* Email */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-fg-muted" />
                          <span>Email Address</span>
                          <span className="text-danger-fg">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. john@example.com"
                          value={candidateEmail}
                          onChange={(e) => setCandidateEmail(e.target.value)}
                          className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                        />
                      </div>

                      {/* Phone / WhatsApp */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-fg-muted" />
                          <span>Phone / WhatsApp</span>
                          <span className="text-danger-fg">*</span>
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
                            className="flex-1 h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent min-w-0 font-mono"
                          />
                        </div>
                      </div>

                      {/* Position */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-fg-muted" />
                          <span>Position Applying For</span>
                          <span className="text-danger-fg">*</span>
                        </label>
                        <RoleDropdown
                          value={candidateRole}
                          onChange={setCandidateRole}
                          options={config.careers_roles || DEFAULT_CAREERS_ROLES}
                        />
                      </div>

                      {/* Custom Role */}
                      {candidateRole === 'Other Position' && (
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-xs font-medium text-fg">
                            <span>Specify Position</span> <span className="text-danger-fg">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Media Buyer / Animator"
                            value={customRole}
                            onChange={(e) => setCustomRole(e.target.value)}
                            className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                          />
                        </div>
                      )}

                      {/* Portfolio / Link */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-fg-muted" />
                          <span>Portfolio / CV Link (optional)</span>
                        </label>
                        <input
                          type="url"
                          placeholder="https://linkedin.com/in/... or Google Drive link"
                          value={candidatePortfolio}
                          onChange={(e) => setCandidatePortfolio(e.target.value)}
                          className="w-full h-10 px-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent"
                        />
                      </div>

                      {/* Note */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-xs font-medium text-fg flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-fg-muted" />
                          <span>Short Note (optional)</span>
                        </label>
                        <textarea
                          rows={3}
                          placeholder="Brief note about your experience..."
                          value={candidateNote}
                          onChange={(e) => setCandidateNote(e.target.value)}
                          className="w-full p-2.5 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent resize-none leading-relaxed"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => handleTopicChange('branding_and_marketing')}
                        className="h-10 px-4 rounded-md border border-border hover:bg-hover text-xs font-medium text-fg transition-colors cursor-pointer"
                      >
                        Back to Meeting Scheduler
                      </button>
                      <button
                        type="submit"
                        disabled={candidateSubmitting}
                        className="h-10 px-6 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {candidateSubmitting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Opening WhatsApp…</span>
                          </>
                        ) : (
                          <>
                            <MessageSquare className="w-3.5 h-3.5" />
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
      </div>
    </div>
  );
}

export default PublicSchedulerView;

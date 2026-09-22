import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Mail,
  Phone,
  Building2,
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

export interface MeetingModeOption {
  value: MeetingMode;
  label: string;
  badge: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const MEETING_MODE_OPTIONS: MeetingModeOption[] = [
  {
    value: 'google_meet',
    label: 'Google Meet',
    badge: 'Instant Link',
    note: 'Direct Google Meet video link provided immediately',
    icon: Video,
  },
  {
    value: 'zoom',
    label: 'Zoom',
    badge: 'Link via WhatsApp',
    note: 'Host sends custom Zoom link via WhatsApp & Email',
    icon: Video,
  },
  {
    value: 'teams',
    label: 'Microsoft Teams',
    badge: 'Link via WhatsApp',
    note: 'Host sends Teams link via WhatsApp & Email',
    icon: Users,
  },
  {
    value: 'in_person',
    label: 'In-Person / Office',
    badge: 'Rawalpindi HQ',
    note: 'Face-to-face meeting at Reamarc Office',
    icon: Building2,
  },
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
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [meetingMode, setMeetingMode] = useState<MeetingMode>('google_meet');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

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

  const [isMeetingModeDropdownOpen, setIsMeetingModeDropdownOpen] = useState(false);
  const meetingModeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(e.target as Node)) {
        setIsTopicDropdownOpen(false);
      }
      if (meetingModeDropdownRef.current && !meetingModeDropdownRef.current.contains(e.target as Node)) {
        setIsMeetingModeDropdownOpen(false);
      }
    };
    if (isTopicDropdownOpen || isMeetingModeDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isTopicDropdownOpen, isMeetingModeDropdownOpen]);

  const selectedTopicOption = useMemo(() => {
    return TOPIC_OPTIONS.find((o) => o.value === topic) || null;
  }, [topic]);

  const selectedMeetingModeOption = useMemo(() => {
    return MEETING_MODE_OPTIONS.find((o) => o.value === meetingMode) || MEETING_MODE_OPTIONS[0];
  }, [meetingMode]);

  const handleTopicChange = (newTopic: MeetingTopic) => {
    setTopic(newTopic);
    setIsTopicDropdownOpen(false);
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
    setSelectedServices((prev) =>
      prev.includes(srv) ? prev.filter((s) => s !== srv) : [...prev, srv]
    );
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

    const topicLabel = (topic && TOPIC_LABELS[topic]) || 'Branding and Marketing';
    const activeServices = selectedServices.length > 0 ? selectedServices.join(', ') : topicLabel;

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: fullPhone,
      date: dateStr,
      slot_time: selectedSlot.time,
      company: company.trim() || undefined,
      website: website.trim() || undefined,
      service: activeServices,
      note: note.trim() || undefined,
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
    setMeetingMode('google_meet');
    setNote('');
    setBookingError(null);
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
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {config.title || 'Digital Services Consultancy Session'}
              </h1>
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
            <div className="mb-6 pb-6 border-b border-zinc-200 dark:border-zinc-800" ref={topicDropdownRef}>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold shadow-xs">
                  1
                </span>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Select Purpose / Topic <span className="text-rose-500">*</span>
                </label>
              </div>

              <div className="relative max-w-md">
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

        {/* STEP 1: DATE & TIME SELECTION */}
        {topic !== 'jobs_and_career' && step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Calendar Column */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                      topic ? 'bg-blue-600 text-white shadow-xs' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    2
                  </span>
                  <CalendarIcon className="w-4 h-4 text-blue-500" />
                  Select a Date
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!topic}
                    onClick={handlePrevMonth}
                    className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
                    title="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2 text-zinc-800 dark:text-zinc-200 min-w-[110px] text-center">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </span>
                  <button
                    type="button"
                    disabled={!topic}
                    onClick={handleNextMonth}
                    className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
                    title="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!topic && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>Please select an option in Step 1 above to view available dates.</span>
                </div>
              )}

              {/* Calendar Grid */}
              <div className={`border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 sm:p-3 bg-zinc-50/50 dark:bg-zinc-950/40 transition-opacity ${!topic ? 'opacity-50' : ''}`}>
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
                    const disabled = !topic || isDateDisabled(d);
                    const selected = topic ? isSameDay(d, selectedDate) : false;

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
                {topic && selectedDate && (
                  <span className="text-xs text-zinc-500 font-medium">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {!topic ? (
                <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center p-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center space-y-2">
                  <Clock className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Available times will appear once an option in Step 1 is selected.
                  </p>
                </div>
              ) : loadingSlots ? (
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
          <form onSubmit={handleConfirmBooking} className="space-y-5">
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
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  Business Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. sarah@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  <CountryCodeDropdown value={countryCode} onChange={setCountryCode} />
                  <input
                    type="tel"
                    required
                    placeholder="300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 min-w-0"
                  />
                </div>
              </div>

              {/* Company Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                  Company / Organization
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Website URL */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  Website / Store URL (if any)
                </label>
                <input
                  type="url"
                  placeholder="https://acmecorp.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full h-10 px-3.5 py-2 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Services Multi-Select */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {topic === 'collaboration_and_partnership'
                  ? 'What type of collaboration or partnership are you interested in?'
                  : 'What services are you looking to explore?'}
              </label>
              <div className="flex flex-wrap gap-2">
                {(topic === 'collaboration_and_partnership' ? COLLABORATION_SERVICES : config.services).map((srv) => {
                  const active = selectedServices.includes(srv);
                  return (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => toggleService(srv)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer touch-manipulation ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-blue-500'
                      }`}
                    >
                      {srv}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preferred Meeting Method Selector */}
            <div className="space-y-1.5" ref={meetingModeDropdownRef}>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-blue-500" />
                  Preferred Meeting Method <span className="text-rose-500">*</span>
                </span>
                <span className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500">
                  Google Meet provided as backup
                </span>
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMeetingModeDropdownOpen((prev) => !prev)}
                  className={`w-full h-11 px-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold transition border cursor-pointer select-none touch-manipulation ${
                    isMeetingModeDropdownOpen
                      ? 'bg-white dark:bg-zinc-900 border-blue-500 ring-2 ring-blue-500/20 text-zinc-900 dark:text-zinc-100 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <selectedMeetingModeOption.icon className="w-4 h-4" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <span>{selectedMeetingModeOption.label}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {selectedMeetingModeOption.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      isMeetingModeDropdownOpen ? 'rotate-180 text-blue-500' : ''
                    }`}
                  />
                </button>

                {isMeetingModeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-50 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-1">
                    {MEETING_MODE_OPTIONS.map((opt) => {
                      const isSelected = meetingMode === opt.value;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setMeetingMode(opt.value);
                            setIsMeetingModeDropdownOpen(false);
                          }}
                          className={`w-full p-2.5 rounded-xl text-left transition flex items-center justify-between gap-3 cursor-pointer touch-manipulation ${
                            isSelected
                              ? 'bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold flex items-center gap-2">
                                <span>{opt.label}</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                                  {opt.badge}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                {opt.note}
                              </p>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Project Brief */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Please share a brief of your current goals, challenges, or requirements:
              </label>
              <textarea
                rows={3}
                placeholder="Tell us about your current marketing goals, timeline, or challenges..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm sm:text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
              />
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
                A calendar invitation with video conference details has been reserved for your session.
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
                {bookingResult.meeting?.meeting_mode === 'in_person' ? (
                  <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 text-right">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>In-Person (Reamarc Office)</span>
                  </span>
                ) : bookingResult.meeting?.meeting_mode === 'zoom' ? (
                  <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 text-right">
                    <Video className="w-3.5 h-3.5" />
                    <span>Zoom (Link on WhatsApp)</span>
                  </span>
                ) : bookingResult.meeting?.meeting_mode === 'teams' ? (
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 text-right">
                    <Users className="w-3.5 h-3.5" />
                    <span>Microsoft Teams (via WhatsApp)</span>
                  </span>
                ) : bookingResult.meeting?.join_url && /^https:\/\//i.test(bookingResult.meeting.join_url) ? (
                  <a
                    href={bookingResult.meeting.join_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Join Google Meet</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Google Meet</span>
                )}
              </div>
            </div>

            {/* Context Note for Selected Meeting Mode */}
            {bookingResult.meeting?.meeting_mode === 'in_person' ? (
              <div className="max-w-md mx-auto p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-left space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-200">
                  <MapPin className="w-4 h-4 text-amber-600" />
                  <span>Office Visit &amp; Directions</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {bookingResult.meeting?.office_address || 'Reamarc Office, Rawalpindi HQ, Pakistan'}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <a
                    href={bookingResult.meeting?.office_map_url || 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-amber-700 dark:text-amber-300 underline flex items-center gap-1"
                  >
                    <span>View on Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {bookingResult.meeting?.join_url && (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      &bull; Online backup:{' '}
                      <a href={bookingResult.meeting.join_url} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">
                        Google Meet
                      </a>
                    </span>
                  )}
                </div>
              </div>
            ) : (bookingResult.meeting?.meeting_mode === 'zoom' || bookingResult.meeting?.meeting_mode === 'teams') ? (
              <div className="max-w-md mx-auto p-3.5 sm:p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-left space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <span>Direct {bookingResult.meeting?.location_label || 'Meeting'} Link via WhatsApp</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Your host will send your custom {bookingResult.meeting?.location_label || 'room'} link directly to your WhatsApp and email prior to the call.
                </p>
                {bookingResult.meeting?.join_url && (
                  <div className="pt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Alternative backup room:{' '}
                    <a
                      href={bookingResult.meeting.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-0.5"
                    >
                      <span>Join Google Meet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ) : null}

            {/* Calendar Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 pt-2 max-w-sm sm:max-w-none mx-auto">
              {bookingResult.meeting?.meeting_mode === 'in_person' ? (
                <a
                  href={bookingResult.meeting?.office_map_url || 'https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-amber-600/25 cursor-pointer touch-manipulation"
                >
                  <MapPin className="w-4 h-4" />
                  <span>View Office Map</span>
                </a>
              ) : (
                <a
                  href={bookingResult.meeting?.join_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/25 cursor-pointer touch-manipulation"
                >
                  <Video className="w-4 h-4" />
                  <span>
                    {bookingResult.meeting?.meeting_mode === 'google_meet'
                      ? 'Join Google Meet'
                      : 'Join Google Meet (Backup)'}
                  </span>
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

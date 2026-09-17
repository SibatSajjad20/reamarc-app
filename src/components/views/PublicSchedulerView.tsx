import React, { useState, useEffect, useMemo } from 'react';
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
  CheckCircle2,
  Video,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  ExternalLink,
  Loader2,
  ShieldCheck,
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
}

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

type Step = 1 | 2 | 3;

export function PublicSchedulerView({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const isEmbed = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === 'true';
  }, []);

  const embedTheme = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('theme') || theme;
  }, [theme]);

  // View steps: 1 = date & slot, 2 = brief form, 3 = confirmation
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
  });

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(() => civilDateFromYmd(ymdInTimeZone('Asia/Karachi')));
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const tz = 'Asia/Karachi';
    const today = civilDateFromYmd(ymdInTimeZone(tz));
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  });

  // Slots State
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Form State
  const [countryCode, setCountryCode] = useState('+92');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Confirmed booking response
  const [bookingResult, setBookingResult] = useState<any | null>(null);

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

  useEffect(() => {
    const tz = config.timezone || 'Asia/Karachi';
    const today = civilDateFromYmd(ymdInTimeZone(tz));
    setCurrentMonth(today);
    setSelectedDate((prev) => {
      const next = new Date(today);
      next.setDate(next.getDate() + 1);
      const working = config.working_days || [1, 2, 3, 4, 5, 6];
      for (let i = 0; i < 14; i += 1) {
        const isoDay = next.getDay() === 0 ? 7 : next.getDay();
        if (working.includes(isoDay)) break;
        next.setDate(next.getDate() + 1);
      }
      if (prev && formatCivilYmd(prev) === formatCivilYmd(next)) return prev;
      return next;
    });
  }, [config.timezone, config.working_days]);

  // State to force refresh slots (e.g. after booking or resetting)
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);

  // Fetch slots whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;
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
        setSlots(data.slots || []);
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    void fetchSlots();
  }, [selectedDate, slotsRefreshKey]);

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
    if (formatCivilYmd(d) < tzToday) return true;
    const isoDay = d.getDay() === 0 ? 7 : d.getDay();
    const workingDays = config.working_days || [1, 2, 3, 4, 5, 6];
    return !workingDays.includes(isoDay);
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

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: fullPhone,
      date: dateStr,
      slot_time: selectedSlot.time,
      company: company.trim() || undefined,
      website: website.trim() || undefined,
      service: selectedServices.join(', ') || undefined,
      note: note.trim() || undefined,
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
    setNote('');
    setBookingError(null);
    setSlotsRefreshKey((prev) => prev + 1);
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
          ? 'bg-[#09090b] text-zinc-100 p-4 sm:p-6'
          : 'bg-slate-50 text-slate-900 p-4 sm:p-6'
      }`}
    >
      <div
        className={`w-full max-w-4xl rounded-2xl transition-all duration-300 ${
          isEmbed
            ? isDark
              ? 'bg-zinc-900/95 border border-zinc-800 shadow-2xl p-4 sm:p-6'
              : 'bg-white border border-zinc-200 shadow-lg p-4 sm:p-6'
            : isDark
            ? 'bg-zinc-900 border border-zinc-800/80 shadow-2xl p-6 sm:p-8'
            : 'bg-white border border-slate-200 shadow-xl p-6 sm:p-8'
        }`}
      >
        {/* Header Section */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {config.title}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl whitespace-pre-line leading-relaxed">
                {config.description}
              </p>
            </div>

            {/* Session Metadata Badges */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>{config.duration_minutes} Mins</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Video className="w-3.5 h-3.5 text-blue-500" />
                <span>Google Meet</span>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 1: DATE & TIME SELECTION */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Calendar Column */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-blue-500" />
                  Select a Date
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                    title="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2 text-zinc-800 dark:text-zinc-200">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                    title="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 bg-zinc-50/50 dark:bg-zinc-950/40">
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
                    const disabled = isDateDisabled(d);
                    const selected = isSameDay(d, selectedDate);

                    return (
                      <button
                        key={`day-${i + 1}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedDate(d)}
                        className={`h-9 rounded-lg text-xs font-medium transition flex items-center justify-center cursor-pointer ${
                          selected
                            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
                            : disabled
                            ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-40'
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
              ) : slots.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                  <CalendarIcon className="w-8 h-8 text-zinc-400 mb-2" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No available slots</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Please select another date on the calendar.</p>
                </div>
              ) : (
                <div className="flex-1 max-h-[320px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
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
                        className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-between border transition cursor-pointer ${
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
        {step === 2 && selectedDate && selectedSlot && (
          <form onSubmit={handleConfirmBooking} className="space-y-5">
            {/* Selected Summary Pill */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-medium">
                <CalendarIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  {' at '}
                  <strong>{selectedSlot.label}</strong> (PKT)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Change Time
              </button>
            </div>

            {bookingError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                {bookingError}
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
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Phone / WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  Phone / WhatsApp <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-28 px-2 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    placeholder="300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Services Multi-Select */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                What services are you looking to explore?
              </label>
              <div className="flex flex-wrap gap-2">
                {config.services.map((srv) => {
                  const active = selectedServices.includes(srv);
                  return (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => toggleService(srv)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
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
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-50 cursor-pointer"
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
        {step === 3 && bookingResult && (
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
            <div className="max-w-md mx-auto p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-left space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Meeting:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {bookingResult.meeting?.title}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Date &amp; Time:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {bookingResult.meeting?.date} at {bookingResult.meeting?.time_label} ({bookingResult.meeting?.timezone || config.timezone})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Host:</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {bookingResult.meeting?.host_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Location:</span>
                {bookingResult.meeting?.join_url && /^https:\/\//i.test(bookingResult.meeting.join_url) ? (
                <a
                  href={bookingResult.meeting.join_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Video className="w-3.5 h-3.5" />
                  Join Google Meet
                  <ExternalLink className="w-3 h-3" />
                </a>
                ) : (
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Google Meet</span>
                )}
              </div>
            </div>

            {/* Calendar Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <a
                href={bookingResult.calendar_links?.google || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-blue-600/25 cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4" />
                <span>Add to Google Calendar</span>
              </a>

              <a
                href={bookingResult.calendar_links?.ics_path ? getApiUrl(bookingResult.calendar_links.ics_path) : '#'}
                download
                className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition flex items-center gap-2 shadow-xs cursor-pointer"
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
      </div>
    </div>
  );
}

export default PublicSchedulerView;

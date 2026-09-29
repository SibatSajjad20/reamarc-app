export const LEAD_ROLES = [
  'Owner / Founder',
  'CEO / Director',
  'Partner',
  'Marketing Head / Manager',
  'Sales Head / Manager',
  'Business Development',
  'Operations / Project Manager',
  'Other Management',
  'Employee / Team Member',
  'Consultant',
  'Other',
];

export const LEAD_INDUSTRIES = [
  'Real Estate',
  'Architecture / Construction',
  'Hospitality',
  'Education',
  'Healthcare',
  'Apparel / Fashion',
  'E-commerce',
  'Manufacturing',
  'SaaS / Technology',
  'Professional Services',
  'Other',
];

export const LEAD_BUSINESS_STAGES = [
  'Idea / Pre-launch',
  'New / Recently launched',
  'Growing',
  'Established',
  'Expanding / Scaling',
];

export const LEAD_EMPLOYEE_COUNTS = ['Just me', '2-5', '6-10', '11-25', '26-50', '51-100', '100+'];

export const LEAD_SALES_TEAMS = [
  'Yes, dedicated sales team',
  'Yes, 1-2 salespeople',
  'Sales handled by management / owners',
  'No sales team',
  'Building a sales team',
];

export const LEAD_HELP_WITH = [
  'Strategy / Consultancy',
  'Branding',
  'Website Design & Development',
  'Social Media Management',
  'Performance Marketing / Lead Generation',
  'SEO',
  'Video Production',
  'Software Development',
  'App Development',
  'AI Application Development',
  'Other',
];

export const LEAD_OBJECTIVES = [
  'Launch a new project / business',
  'Improve branding / rebrand',
  'Improve our website / digital presence',
  'Generate qualified leads',
  'Increase sales',
  'Build a complete marketing system',
  'Other',
];

export const LEAD_START_TIMELINES = [
  'Immediately',
  'Within 30 days',
  '1-3 months',
  '3-6 months',
  'Just researching',
];

export const LEAD_BUDGETS = [
  'Under PKR 100K / month',
  'PKR 100K-250K / month',
  'PKR 250K-500K / month',
  'PKR 500K-1M / month',
  'PKR 1M-2.5M / month',
  'PKR 2.5M-5M / month',
  'PKR 5M+ / month',
  'Not decided yet',
  'Prefer to discuss with our sales team',
];

export function asOptions(values: string[], blankLabel?: string) {
  const opts = values.map((value) => ({ value, label: value }));
  return blankLabel ? [{ value: '', label: blankLabel }, ...opts] : opts;
}

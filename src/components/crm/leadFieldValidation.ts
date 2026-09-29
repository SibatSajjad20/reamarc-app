const NAME_RE = /^[\p{L}][\p{L}'’.\-]{1,}(?:\s+[\p{L}][\p{L}'’.\-]{1,})+$/u;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const WEBSITE_RE = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}([/?#][^\s]*)?$/i;
const CITY_RE = /^[\p{L}][\p{L}\s.'’-]{1,60}$/u;

export function letterCount(value: string): number {
  return (value.match(/\p{L}/gu) || []).length;
}

export function validatePersonName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) return 'Full name is required.';
  if (!NAME_RE.test(name)) {
    return 'Enter a full name using letters only, such as Sara Ahmed.';
  }
  return null;
}

export function validateCompanyName(value: string): string | null {
  const company = value.trim();
  if (!company) return 'Company is required.';
  if (company.length < 2) return 'Company name is too short.';
  if (company.length > 160) return 'Company name is too long.';
  if (letterCount(company) < 2) return 'Company name must include letters.';
  if (/[<>{}|\\^~`]/.test(company)) return 'Company name contains characters that are not allowed.';
  return null;
}

export function validateEmailAddress(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Work email is required.';
  if (email.length > 160 || email.includes('..') || !EMAIL_RE.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePhoneNumber(value: string): string | null {
  const phone = value.trim();
  if (!phone) return 'WhatsApp / phone is required.';
  if (/[a-z]/i.test(phone)) return 'Phone number cannot contain letters.';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return 'Enter a valid phone number, including the country code.';
  }
  return null;
}

export function validateWebsiteUrl(value: string, noWebsite: boolean): string | null {
  if (noWebsite) return null;
  const site = value.trim();
  if (!site) return 'Website is required, or mark that there is no website.';
  if (/\s/.test(site) || site.includes('..') || !WEBSITE_RE.test(site)) {
    return 'Enter a valid website, such as company.com.';
  }
  return null;
}

export function validateCityName(value: string): string | null {
  const city = value.trim();
  if (!city) return null;
  if (!CITY_RE.test(city) || letterCount(city) < 2) return 'City can only contain letters.';
  return null;
}

export function validateDescription(value: string, label: string): string | null {
  const text = value.trim();
  if (!text) return `${label} is required.`;
  if (letterCount(text) <= 6) return `${label} needs more than 6 letters.`;
  if (text.length > 4000) return `${label} is too long.`;
  return null;
}

export function validateHelpSelection(selected: string[], otherDetail: string): string | null {
  if (selected.length === 0) return 'Select at least one option.';
  if (selected.includes('Other')) {
    return validateDescription(otherDetail, 'The specific need');
  }
  return null;
}

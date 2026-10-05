import {
  formatPhoneDisplay,
  looksLikeEmail,
  normalizePhoneForSave,
  phoneForInput,
  pickPhoneValue,
} from './phone';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(looksLikeEmail('poc@client.com'), 'email should be detected');
assert(!looksLikeEmail('+92 300 1234567'), 'phone should not look like email');

assert(pickPhoneValue('poc@client.com', '03001234567') === '03001234567', 'skip email-like phone sources');
assert(pickPhoneValue('a@b.com', '') === '', 'all-email candidates should be empty');

assert(formatPhoneDisplay('03001234567') === '+92 300 1234567', 'local PK mobile should format');
assert(formatPhoneDisplay('923001234567') === '+92 300 1234567', '92-prefixed PK mobile should format');
assert(formatPhoneDisplay('+923001234567') === '+92 300 1234567', 'plus-prefixed PK mobile should format');
assert(formatPhoneDisplay('3001234567') === '+92 300 1234567', '10-digit PK mobile should format');
assert(formatPhoneDisplay('poc@client.com') === '—', 'email must not display as phone');
assert(formatPhoneDisplay('') === '—', 'empty phone should be a dash');

assert(phoneForInput('a@b.com') === '', 'email should not populate phone input');
assert(normalizePhoneForSave('03001234567') === '+92 300 1234567', 'save path should normalize');

console.log('All phone tests passed successfully!');

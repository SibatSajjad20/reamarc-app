import fs from 'fs';
import path from 'path';

const BAD_TOKENS = [
  'accent-contrast',
  'success-solid',
  'status-danger-fg',
  'status-danger-border',
  'danger-border',
  'status-danger-soft',
  'danger-subtle',
  'danger-soft',
  'status-success-fg',
  'status-success-border',
  'success-border',
  'status-success-soft',
  'success-subtle',
  'success-soft',
  'status-warning-fg',
  'status-warning-border',
  'warning-border',
  'status-warning-soft',
  'warning-subtle',
  'warning-soft',
  'accent-subtle',
  'accent-border',
  'fg-subtle',
  'outline-accent-ring',
  'bg-bg',
];

const tokenRegex = new RegExp(
  `\\b(${BAD_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`
);

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (/\.(tsx?|jsx?|css)$/.test(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk('src');
let violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const match = line.match(tokenRegex);
    if (match) {
      violations.push({
        file,
        line: index + 1,
        token: match[1],
        preview: line.trim(),
      });
    }
  });
}

if (violations.length > 0) {
  console.error(`Found ${violations.length} forbidden token usages:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.token}] -> ${v.preview}`);
  }
  process.exit(1);
} else {
  console.log('✓ Token check passed: 0 forbidden token usages found.');
  process.exit(0);
}

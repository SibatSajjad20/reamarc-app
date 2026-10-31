import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = join(process.cwd(), 'dist', 'assets');
const mainFiles = readdirSync(assetsDir).filter((name) => /^index-[\w-]+\.js$/.test(name));
if (mainFiles.length !== 1) {
  throw new Error(`Expected exactly one main index chunk, found: ${mainFiles.join(', ') || 'none'}`);
}

const file = mainFiles[0];
const gzipBytes = gzipSync(readFileSync(join(assetsDir, file))).byteLength;
const limit = 500 * 1024;
console.log(`Main chunk ${file}: ${(gzipBytes / 1024).toFixed(1)} KiB gzip (limit 500.0 KiB)`);
if (gzipBytes > limit) {
  throw new Error(`Main chunk exceeds 500 KiB gzip by ${((gzipBytes - limit) / 1024).toFixed(1)} KiB`);
}

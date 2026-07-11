#!/usr/bin/env node
/*
 * Lightweight secret scanner — catches committed credentials before they leave the repo.
 *
 * Usage:
 *   node scripts/scan-secrets.js            # scan staged files (pre-commit / pre-push hook)
 *   node scripts/scan-secrets.js --staged   # same as default, explicit
 *   node scripts/scan-secrets.js --all      # scan every tracked file (CI check step)
 *   node scripts/scan-secrets.js --history  # scan EVERY blob in ALL commits (one-time sweep)
 *
 * Bypass:
 *   - Per line: add a `pragma: allowlist secret` comment on the same line.
 *   - Whole run: set SKIP_SECRET_SCAN=1, or `git commit --no-verify`.
 *
 * Exit code 0 = clean, 1 = credential(s) found, 2 = internal error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

if (process.env.SKIP_SECRET_SCAN === '1') {
  console.log('secret-scan: skipped (SKIP_SECRET_SCAN=1)');
  process.exit(0);
}

const mode = process.argv.includes('--history')
  ? 'history'
  : process.argv.includes('--all')
    ? 'all'
    : 'staged';

// Files that legitimately contain credential-shaped strings (placeholders or
// the detection patterns themselves). These are never treated as leaks.
const EXCLUDED_EXACT = new Set([
  '.env.example',
  'scripts/scan-secrets.js',
  'package-lock.json',
]);
const EXCLUDED_PREFIXES = [
  '.config/.semgrep/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
];
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|pdf|zip|gz|tar|woff2?|ttf|eot|mp3|mp4|wav|mov|avi)$/i;

// Known-dead historical blobs (history sweep only). These are immutable git
// objects that can't carry an inline `pragma` comment, so we allowlist them by
// their content-addressed blob SHA. Only add a blob here once its credential is
// confirmed ROTATED and DEAD — this suppresses the finding without rewriting
// history. Purging the blob for real still requires git filter-repo / BFG.
const ALLOWLISTED_HISTORY_BLOBS = new Map([
  [
    '162ac34d1d33bc7b7b6be46afe0eb8107ca41b9b',
    'Rotated/dead GitHub PAT in .replit (historical commits 376fb7a/61f1a3f); HEAD is clean.',
  ],
]);

// Real-credential patterns. Each has a name and a regex with the secret body
// captured so we can filter obvious placeholders.
const PATTERNS = [
  { name: 'GitHub fine-grained PAT', re: /github_pat_[0-9A-Za-z_]{22,}/g },
  { name: 'GitHub token (ghp/gho/ghu/ghs/ghr)', re: /gh[porsu]_[0-9A-Za-z]{36,}/g },
  { name: 'OpenAI API key', re: /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}/g },
  { name: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'PEM private key', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g, always: true },
  { name: 'JSON Web Token (JWT)', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
];

// A match is treated as a placeholder (not a real leak) when its body is
// clearly fake: 4+ repeated chars (xxxx / 0000) or obvious filler words.
function isPlaceholder(match) {
  if (/(.)\1{3,}/.test(match)) return true;
  return /example|change[_-]?me|your[_-]|placeholder|redacted|dummy|sample|<[^>]+>/i.test(match);
}

function listFiles() {
  try {
    if (mode === 'all') {
      const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
      return out.split('\0').filter(Boolean);
    }
    const out = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'],
      { encoding: 'utf8' },
    );
    return out.split('\0').filter(Boolean);
  } catch (err) {
    console.error(`secret-scan: unable to list files from git (${err.message})`);
    process.exit(2);
  }
}

function readContent(file) {
  try {
    if (mode === 'staged') {
      // Read the staged blob so we scan exactly what is about to be committed.
      return execFileSync('git', ['show', `:${file}`], { encoding: 'buffer' });
    }
    return readFileSync(file);
  } catch {
    return null; // deleted, unreadable, or not staged
  }
}

function isExcluded(file) {
  if (EXCLUDED_EXACT.has(file)) return true;
  if (BINARY_EXT.test(file)) return true;
  return EXCLUDED_PREFIXES.some((p) => file.startsWith(p));
}

function scanBuffer(buf, onHit) {
  if (!buf || buf.includes(0)) return; // missing or binary
  if (buf.length > 2 * 1024 * 1024) return; // skip files > 2 MB
  const lines = buf.toString('utf8').split('\n');
  lines.forEach((line, i) => {
    if (/pragma:\s*allowlist secret/i.test(line)) return; // inline suppression
    for (const { name, re, always } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const token = m[0];
        if (!always && isPlaceholder(token)) continue;
        const preview = token.length > 12 ? `${token.slice(0, 8)}…(${token.length} chars)` : token;
        onHit({ line: i + 1, name, preview });
      }
    }
  });
}

// One-time historical sweep: walk EVERY blob reachable from ALL refs (deduped
// by blob SHA), scan it, and attribute any hit back to the commit(s)/path(s)
// that contain it. Read-only — touches no refs and makes no commits.
function runHistoryScan() {
  let objs;
  try {
    objs = execFileSync('git', ['rev-list', '--all', '--objects'], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (err) {
    console.error(`secret-scan: unable to enumerate history (${err.message})`);
    process.exit(2);
  }

  // blob SHA -> set of paths it ever appeared under
  const blobPaths = new Map();
  for (const line of objs.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp === -1) continue; // commit/tree with no path
    const sha = line.slice(0, sp);
    const path = line.slice(sp + 1);
    if (!blobPaths.has(sha)) blobPaths.set(sha, new Set());
    blobPaths.get(sha).add(path);
  }

  // Restrict to actual blobs.
  const checkOut = execFileSync('git', ['cat-file', '--batch-all-objects', '--batch-check'], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const blobShas = [];
  for (const line of checkOut.split('\n')) {
    const [sha, type] = line.split(' ');
    if (type === 'blob' && blobPaths.has(sha)) blobShas.push(sha);
  }

  const hits = [];
  let scanned = 0;
  let suppressed = 0;
  for (const sha of blobShas) {
    if (ALLOWLISTED_HISTORY_BLOBS.has(sha)) {
      suppressed++;
      continue; // known-dead, rotated credential — allowlisted by blob SHA
    }
    const paths = [...blobPaths.get(sha)];
    if (paths.every(isExcluded)) continue; // every path this blob used is excluded
    let buf;
    try {
      buf = execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 64 * 1024 * 1024 });
    } catch {
      continue;
    }
    if (buf.includes(0) || buf.length > 2 * 1024 * 1024) continue;
    scanned++;
    scanBuffer(buf, ({ line, name, preview }) => {
      hits.push({ sha, paths: paths.filter((p) => !isExcluded(p)), line, name, preview });
    });
  }

  console.log(`secret-scan: swept ${scanned} unique text blob(s) across all commits`);
  if (suppressed > 0) {
    console.log(
      `secret-scan: ${suppressed} known-dead blob(s) allowlisted by SHA (rotated credentials, not rewritten):`,
    );
    for (const [sha, note] of ALLOWLISTED_HISTORY_BLOBS) {
      console.log(`  - ${sha}  ${note}`);
    }
  }
  if (hits.length === 0) {
    console.log('secret-scan: history CLEAN — no live-shaped credentials in any commit.');
    process.exit(0);
  }

  console.error('\n\x1b[31m✖ secret-scan: credential-shaped string(s) found in history\x1b[0m\n');
  for (const h of hits) {
    let commits = '';
    try {
      commits = execFileSync(
        'git',
        ['log', '--all', '--format=%h %ad', '--date=short', '--find-object', h.sha],
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
        .slice(0, 5)
        .join('; ');
    } catch {
      /* ignore */
    }
    console.error(`  [${h.name}] ${h.preview}`);
    console.error(`    blob ${h.sha}  path(s): ${h.paths.join(', ')}  line ${h.line}`);
    console.error(`    commit(s): ${commits || 'unknown'}\n`);
  }
  console.error('Rotate each secret above, then optionally purge it from history (git filter-repo / BFG).');
  process.exit(1);
}

if (mode === 'history') {
  runHistoryScan();
}

const files = listFiles().filter((f) => !isExcluded(f));
const findings = [];

for (const file of files) {
  const buf = readContent(file);
  scanBuffer(buf, ({ line, name, preview }) => findings.push({ file, line, name, preview }));
}

if (findings.length === 0) {
  console.log(`secret-scan: clean (${files.length} ${mode} file(s) checked)`);
  process.exit(0);
}

console.error('\n\x1b[31m✖ secret-scan: potential credential(s) detected\x1b[0m\n');
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.name}]  ${f.preview}`);
}
console.error('\nRemove the secret and use an environment variable / Replit Secret instead.');
console.error('If this is a false positive, add a `pragma: allowlist secret` comment on that line,');
console.error('or bypass this one commit with SKIP_SECRET_SCAN=1 / git commit --no-verify.\n');
process.exit(1);

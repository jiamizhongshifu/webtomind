// Release boundary: report rule IDs and relative paths, never matched values.
// This is a heuristic scan. Pixels, speech, rights and customer context still
// require review of the final rendered assets.
import { Buffer } from 'node:buffer';

const RULES = [
  ['personal-path', /(?:\/Users\/|\/home\/|[A-Za-z]:[\\/]+Users[\\/]+)[^\s"'<>\\/]+[\\/]/i],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['provider-token', /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[A-Z0-9]{16})\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/],
  ['credential-literal', /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|service[_-]?role[_-]?key|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{16,}["']/i],
  ['authorization', /\b(?:Bearer\s+[A-Za-z0-9._-]{20,}|Authorization["']?\s*[:=]\s*["']Basic\s+[A-Za-z0-9+/=]{16,})/i],
  ['signed-url', /[?&](?:X-Amz-(?:Signature|Credential)|X-Goog-(?:Signature|Credential)|access_token|refresh_token|token|signature|sig)=[^&#\s"']{8,}/i],
  ['private-url', /https?:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[::1\])(?=[:/\s"'<>]|$)/i],
  ['voice-identity', /\bS_[A-Za-z0-9]{8,}\b/],
  ['possible-mobile', /(?<!\d)1[3-9]\d{9}(?!\d)/],
  ['possible-national-id', /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?!\d)/]
];
const PRIVATE_FILE = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.netrc|\.git-credentials|id_rsa|id_ed25519|credentials(?:\.[^/]*)?|cookies?(?:\.[^/]*)?|session(?:\.[^/]*)?|auth(?:\.[^/]*)?)$/i;

export function inspectSkillPrivacy(file, bytes) {
  const issues = [];
  if (PRIVATE_FILE.test(file)) issues.push({ file, rule: 'private-file' });
  // Also inspect embedded printable metadata in media containers. This does
  // not decode image pixels, compressed PDF text or audio.
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  for (const [rule, pattern] of RULES) {
    if (pattern.test(text)) issues.push({ file, rule });
  }
  const emails = text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi);
  for (const [, domain] of emails) {
    if (!/^(?:webtomind\.com|(?:[^.]+\.)*example\.(?:com|org|net))$/i.test(domain) &&
        !/\.(?:test|invalid)$/i.test(domain)) {
      issues.push({ file, rule: 'possible-personal-email' });
      break;
    }
  }
  return issues;
}

export function assertSkillPrivacy(file, bytes) {
  const issues = inspectSkillPrivacy(file, bytes);
  if (issues.length) {
    throw new Error(`Skill privacy check failed: ${file} [${issues.map((issue) => issue.rule).join(', ')}]; redact the source and regenerate affected media`);
  }
}

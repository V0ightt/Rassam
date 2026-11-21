const SENSITIVE_DIRECTORY = /(^|\/)(?:\.ssh|\.aws|\.gnupg|secrets?|credentials?)(\/|$)/i;
const SENSITIVE_BASENAME = /(^|\/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|.*\.(?:pem|key|p8|p12|pfx|jks|keystore|crt|cer))$/i;

const HIGH_CONFIDENCE_SECRET_CONTENT = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9/+_.-]{12,}["']?/i,
];

/** True when a repository-relative path is credential-like and must not enter AI context. */
export function isSensitiveSourcePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').trim();
  return !normalized || SENSITIVE_DIRECTORY.test(normalized) || SENSITIVE_BASENAME.test(normalized);
}

/** High-confidence content guard; environment-variable references alone are intentionally allowed. */
export function containsLikelySecret(content: string): boolean {
  return HIGH_CONFIDENCE_SECRET_CONTENT.some((pattern) => pattern.test(content));
}

export function filterAiSourceContext(
  files: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!files) return undefined;
  const safeEntries = Object.entries(files).filter(([path, content]) => (
    !isSensitiveSourcePath(path) && !containsLikelySecret(content)
  ));
  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
}


import { describe, expect, it } from 'vitest';

import { containsLikelySecret, filterAiSourceContext, isSensitiveSourcePath } from './source-policy';

describe('AI source secret policy', () => {
  it.each([
    '.env', '.env.local', 'config/.env.production', '.ssh/id_rsa',
    'secrets/service.json', 'certs/server.pem', 'client.p12', 'credentials.yml',
  ])('excludes credential-like path %s', (path) => {
    expect(isSensitiveSourcePath(path)).toBe(true);
  });

  it.each(['src/environment.ts', 'docs/secrets-management.md', 'src/tokenizer.ts'])('does not overmatch ordinary source %s', (path) => {
    expect(isSensitiveSourcePath(path)).toBe(false);
  });

  it('excludes environment templates because deployments often include real values in them', () => {
    expect(isSensitiveSourcePath('.env.example')).toBe(true);
  });

  it('detects high-confidence secret material without rejecting env references', () => {
    expect(containsLikelySecret('const key = process.env.OPENAI_API_KEY')).toBe(false);
    expect(containsLikelySecret('api_key = "abcdefghijklmnop123456"')).toBe(true);
    expect(containsLikelySecret('-----BEGIN PRIVATE KEY-----\nabc')).toBe(true);
    expect(containsLikelySecret('tokenizer = createTokenizer()')).toBe(false);
  });

  it('filters paths and contents without mutating the caller record', () => {
    const source = {
      'src/safe.ts': 'export const safe = true',
      '.env': 'TOKEN=abc',
      'src/leaked.ts': 'password = "abcdefghijklmnop"',
    };
    expect(filterAiSourceContext(source)).toEqual({ 'src/safe.ts': 'export const safe = true' });
    expect(Object.keys(source)).toHaveLength(3);
    expect(filterAiSourceContext({ '.env': 'x' })).toBeUndefined();
    expect(filterAiSourceContext(undefined)).toBeUndefined();
  });
});

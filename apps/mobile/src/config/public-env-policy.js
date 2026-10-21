// Central policy for public (bundled) configuration, shared by app.config.js (config
// check / export / native builds), metro.config.js (every bundle) and the Supabase
// client at runtime. CommonJS so Node config files and the app use the same rule.
// Messages name variables, never values: a rejected key must not reach any log.

// Avoid introducing the marker ourselves. The Supabase SDK can contain the bare
// prefix for key classification; bundle checks must distinguish it from a key payload.
const SECRET_MARKER = ['sb', 'secret', ''].join('_');
const PUBLISHABLE_PREFIX = 'sb_publishable_';
const SUPABASE_KEY_VARIABLE = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

class PublicEnvPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublicEnvPolicyError';
  }
}

/**
 * Why a Mobile Supabase key cannot be bundled, or null when it can. Only publishable
 * keys are accepted (secret keys and legacy JWT keys, incl. service_role, are not).
 * A missing key returns null: the client keeps reporting it as missing configuration.
 * @param {unknown} value
 * @returns {string | null}
 */
function supabaseKeyProblem(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return null;
  if (key.startsWith(SECRET_MARKER)) return 'Mobile Supabase key must be publishable; secret keys cannot be bundled.';
  if (!key.startsWith(PUBLISHABLE_PREFIX)) return 'Mobile Supabase key must be a publishable key (sb_publishable_...).';
  return null;
}

/**
 * Throws before anything is bundled when the public environment is unsafe.
 * @param {Record<string, string | undefined>} env
 */
function assertPublicEnv(env) {
  const problems = [];
  const keyProblem = supabaseKeyProblem(env[SUPABASE_KEY_VARIABLE]);
  if (keyProblem) problems.push(`${SUPABASE_KEY_VARIABLE}: ${keyProblem}`);
  for (const [name, value] of Object.entries(env)) {
    if (name !== SUPABASE_KEY_VARIABLE && name.startsWith('EXPO_PUBLIC_') && typeof value === 'string' && value.includes(SECRET_MARKER)) {
      problems.push(`${name}: public variables cannot contain Supabase secret keys.`);
    }
  }
  if (problems.length) throw new PublicEnvPolicyError(`Unsafe Mobile public configuration. ${problems.join(' ')}`);
}

module.exports = { assertPublicEnv, PublicEnvPolicyError, supabaseKeyProblem };

/**
 * Centralized environment-variable access.
 *
 * Public variables (NEXT_PUBLIC_*) are safe to expose to the browser.
 * Secret variables are server-only and must NEVER be referenced from a
 * client component.
 *
 * Every accessor returns a clear configuration error when the variable
 * is missing, so the app fails loudly instead of pretending to work.
 */

export interface AppConfig {
  // Public
  nextPublicSiteUrl: string;
  nextPublicSupabaseUrl: string;
  nextPublicSupabaseAnonKey: string;
  // Secret (server only)
  supabaseServiceRoleKey: string;
  payrexSecretApiKey: string;
  payrexWebhookSecretKey: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function getEnv(name: string): string | undefined {
  // process.env is available on both server and client (for NEXT_PUBLIC_ vars).
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

/** Read all required config. Throws ConfigError listing every missing var. */
export function getConfig(): AppConfig {
  const missing: string[] = [];

  const nextPublicSiteUrl = getEnv('NEXT_PUBLIC_SITE_URL');
  const nextPublicSupabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const nextPublicSupabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const payrexSecretApiKey = getEnv('PAYREX_SECRET_API_KEY');
  const payrexWebhookSecretKey = getEnv('PAYREX_WEBHOOK_SECRET_KEY');

  if (!nextPublicSiteUrl) missing.push('NEXT_PUBLIC_SITE_URL');
  if (!nextPublicSupabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!nextPublicSupabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY (server-only)');
  if (!payrexSecretApiKey) missing.push('PAYREX_SECRET_API_KEY (server-only)');
  if (!payrexWebhookSecretKey) missing.push('PAYREX_WEBHOOK_SECRET_KEY (server-only)');

  if (missing.length > 0) {
    throw new ConfigError(
      'Missing required configuration. Please set the following environment variables: ' +
        missing.join(', ') +
        '. See .env.example for details.',
    );
  }

  return {
    nextPublicSiteUrl: nextPublicSiteUrl!.replace(/\/$/, ''),
    nextPublicSupabaseUrl: nextPublicSupabaseUrl!,
    nextPublicSupabaseAnonKey: nextPublicSupabaseAnonKey!,
    supabaseServiceRoleKey: supabaseServiceRoleKey!,
    payrexSecretApiKey: payrexSecretApiKey!,
    payrexWebhookSecretKey: payrexWebhookSecretKey!,
  };
}

/** Whether Supabase is configured (without throwing). */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    getEnv('NEXT_PUBLIC_SUPABASE_URL') &&
      getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') &&
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

/** Whether PayRex is configured (without throwing). */
export function isPayrexConfigured(): boolean {
  return Boolean(
    getEnv('PAYREX_SECRET_API_KEY') && getEnv('PAYREX_WEBHOOK_SECRET_KEY'),
  );
}

/** Whether ALL config is present (full app functionality). */
export function isFullyConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

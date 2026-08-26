// =====================================================
// ENVIRONMENT VALIDATOR — Startup Security Gate
// Validates all required environment variables on boot.
// In production: crashes immediately on missing/insecure config.
// In development: warns but allows process to continue.
// =====================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'GEMINI_API_KEY',
];

const PRODUCTION_REQUIRED_VARS = [
  'BROKER_ENCRYPTION_KEY',
  'FRONTEND_URL',
];

const INSECURE_JWT_DEFAULTS = [
  'ghost-brain-dev-secret-CHANGE-IN-PROD-0xDEV',
  'ghost-brain-institutional-0x7f3a9b2e1d4c',
  'change-me',
  'secret',
  'dev-secret',
];

/**
 * Validates environment variables on startup.
 * Called once in server.js before any routes are registered.
 */
export function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // 1. Check required vars exist
  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || process.env[key].trim() === '') {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // 2. Check production-only vars
  if (IS_PRODUCTION) {
    for (const key of PRODUCTION_REQUIRED_VARS) {
      if (!process.env[key] || process.env[key].trim() === '') {
        errors.push(`[PRODUCTION] Missing required environment variable: ${key}`);
      }
    }
  }

  // 3. Validate JWT_SECRET is not an insecure default
  const jwtSecret = process.env.JWT_SECRET || '';
  if (INSECURE_JWT_DEFAULTS.includes(jwtSecret)) {
    if (IS_PRODUCTION) {
      errors.push('[PRODUCTION] JWT_SECRET is set to an insecure default value. Generate a strong secret: openssl rand -hex 32');
    } else {
      warnings.push('JWT_SECRET is using a development default. Set a strong secret for production: openssl rand -hex 32');
    }
  }
  if (jwtSecret && jwtSecret.length < 32) {
    warnings.push('JWT_SECRET is shorter than 32 characters. Use a longer secret for better security.');
  }

  // 4. Validate BROKER_ENCRYPTION_KEY format (must be 64 hex chars = 32 bytes)
  const brokerKey = process.env.BROKER_ENCRYPTION_KEY;
  if (brokerKey) {
    if (brokerKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(brokerKey)) {
      if (IS_PRODUCTION) {
        errors.push('[PRODUCTION] BROKER_ENCRYPTION_KEY must be exactly 64 hex characters. Generate: openssl rand -hex 32');
      } else {
        warnings.push('BROKER_ENCRYPTION_KEY is not a valid 64-char hex string. Ephemeral key will be used (keys lost on restart).');
      }
    }
  } else if (IS_PRODUCTION) {
    errors.push('[PRODUCTION] BROKER_ENCRYPTION_KEY is required. Broker API keys cannot be encrypted without it.');
  }

  // 5. Validate MONGODB_URI includes TLS for Atlas in production
  const mongoUri = process.env.MONGODB_URI || '';
  if (IS_PRODUCTION && mongoUri && !mongoUri.includes('localhost') && !mongoUri.includes('127.0.0.1')) {
    if (!mongoUri.includes('tls=true') && !mongoUri.includes('ssl=true') && !mongoUri.includes('+srv')) {
      warnings.push('MONGODB_URI does not appear to use TLS. Add ?tls=true for encrypted connections in production.');
    }
  }

  // 6. Check FRONTEND_URL format
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    if (IS_PRODUCTION && frontendUrl.includes('localhost')) {
      warnings.push('FRONTEND_URL points to localhost in production. Set it to your production domain.');
    }
  }

  // Report warnings
  for (const warn of warnings) {
    console.warn(`[ENV VALIDATOR] ⚠️  ${warn}`);
  }

  // Report errors and crash in production
  if (errors.length > 0) {
    console.error('\n[ENV VALIDATOR] ❌ CRITICAL CONFIGURATION ERRORS:');
    for (const err of errors) {
      console.error(`  → ${err}`);
    }

    if (IS_PRODUCTION) {
      console.error('\n[ENV VALIDATOR] Server cannot start in production with insecure configuration.');
      console.error('[ENV VALIDATOR] Fix the above errors and restart.');
      process.exit(1);
    } else {
      console.warn('\n[ENV VALIDATOR] Running in DEVELOPMENT mode — proceeding despite errors.');
      console.warn('[ENV VALIDATOR] These errors WILL crash the server in production (NODE_ENV=production).\n');
    }
  } else {
    console.log(`[ENV VALIDATOR] ✅ All environment variables validated (mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'})`);
  }
}

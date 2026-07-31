/**
 * Typed environment accessor (BUILD_PLAN.md §9.1)
 *
 * Zod-validated process.env. Import `env` anywhere instead of reading
 * process.env directly so misconfiguration fails loudly at boot, not
 * mid-request. All upstream base URLs have live defaults (verified in §4.1).
 */
import { z } from 'zod';

/** Parses 'true'/'false'/'1'/'0'/'yes'/'on' style env strings into booleans. */
const boolFromString = (defaultValue: boolean) =>
  z.preprocess((v) => {
    if (typeof v === 'string') {
      return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase());
    }
    return v;
  }, z.boolean().default(defaultValue));

const envSchema = z.object({
  // Runtime / transport (framework reads these too; defaults mirror MCP_BEST_PRACTICES §5.2)
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MCP_TRANSPORT_TYPE: z.enum(['stdio', 'http', 'dual']).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('localhost'),
  NITRO_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_CORS: boolFromString(true),

  // Auth (§5.1) — optional at schema level; guards enforce presence per deployment
  API_KEY_CLINICIAN: z.string().min(8).optional(),
  API_KEY_READONLY: z.string().min(8).optional(),
  API_KEY_ADMIN: z.string().min(8).optional(),
  VITALIS_ALLOW_ANONYMOUS_DEMO: boolFromString(false),
  JWT_SECRET: z.string().min(16).optional(),

  // Upstream APIs (§4.1 — all verified live)
  RXNORM_BASE_URL: z.string().url().default('https://rxnav.nlm.nih.gov/REST'),
  RXCLASS_BASE_URL: z.string().url().default('https://rxnav.nlm.nih.gov/REST/rxclass'),
  CLINTABLES_BASE_URL: z.string().url().default('https://clinicaltables.nlm.nih.gov/api'),
  OPENFDA_BASE_URL: z.string().url().default('https://api.fda.gov'),
  OPENFDA_API_KEY: z.string().optional(),
  NCBI_BASE_URL: z.string().url().default('https://eutils.ncbi.nlm.nih.gov/entrez/eutils'),
  NCBI_API_KEY: z.string().optional(),
  NCBI_EMAIL: z.string().email().optional(),
  TRIALS_BASE_URL: z.string().url().default('https://clinicaltrials.gov/api/v2'),
  FHIR_BASE_URL: z.string().url().default('https://hapi.fhir.org/baseR4'),
  FHIR_BASE_URL_FALLBACK: z.string().url().default('https://r4.smarthealthit.org'),

  // Optional WHO ICD-11 upgrade (§13-S3)
  ICD_CLIENT_ID: z.string().optional(),
  ICD_CLIENT_SECRET: z.string().optional(),
  ICD_BASE_URL: z.string().url().default('https://id.who.int/icd'),

  // Safety + ops
  VITALIS_SAFETY_LAYER: z.enum(['on', 'off']).default('on'),
  AUDIT_LOG_PATH: z.string().min(1).default('logs/audit.jsonl'),
  CONTACT_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // stderr only — stdout would corrupt the MCP stdio transport
    console.error(
      '❌ Invalid environment configuration:',
      JSON.stringify(result.error.flatten().fieldErrors, null, 2)
    );
    process.exit(1);
  }
  return result.data;
}

export const env: Env = loadEnv();

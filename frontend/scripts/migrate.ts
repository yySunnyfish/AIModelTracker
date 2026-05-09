/**
 * One-shot migration: create model_capability_scores + model_rich_profiles tables.
 * Run with: npx tsx scripts/migrate.ts
 */
import postgres from 'postgres'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL not set')

// Switch to direct connection (session mode) — needed for DDL
const directUrl = DATABASE_URL
  .replace('?pgbouncer=true', '')
  .replace(/\.pooler\.supabase\.com:6543/, (m) => m.replace('.pooler.supabase.com:6543', '').replace(/^postgres\.\w+/, 'db.$&'.replace('db.postgres.', 'db.')) + ':5432')

// Simpler: just try the URL as-is first (transaction mode supports CREATE TABLE)
const sql = postgres(DATABASE_URL.replace('?pgbouncer=true', ''), { max: 1, ssl: 'require' })

async function migrate() {
  console.log('Running migration...')

  await sql`
    CREATE TABLE IF NOT EXISTS model_capability_scores (
      model_id      UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
      coding        SMALLINT CHECK (coding BETWEEN 0 AND 100),
      agentic       SMALLINT CHECK (agentic BETWEEN 0 AND 100),
      multimodal    SMALLINT CHECK (multimodal BETWEEN 0 AND 100),
      reasoning     SMALLINT CHECK (reasoning BETWEEN 0 AND 100),
      math          SMALLINT CHECK (math BETWEEN 0 AND 100),
      hallucination SMALLINT CHECK (hallucination BETWEEN 0 AND 100),
      source        TEXT NOT NULL DEFAULT 'manual',
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('✓ model_capability_scores created')

  await sql`
    CREATE TABLE IF NOT EXISTS model_rich_profiles (
      model_id       UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
      capabilities   TEXT[] NOT NULL DEFAULT '{}',
      applications   TEXT[] NOT NULL DEFAULT '{}',
      impact_tags    TEXT[] NOT NULL DEFAULT '{}',
      impact_summary TEXT,
      source         TEXT NOT NULL DEFAULT 'manual',
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('✓ model_rich_profiles created')

  await sql.end()
  console.log('Migration complete.')
}

migrate().catch(e => { console.error(e.message); process.exit(1) })

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env manually
function loadEnv(file) {
  try {
    const lines = readFileSync(resolve(__dirname, '..', file), 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}
loadEnv('.env.local')
loadEnv('.env')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL not set')

const sql = postgres(DATABASE_URL.replace('?pgbouncer=true', ''), { max: 1, ssl: 'require' })

async function migrate() {
  console.log('Connecting to database...')

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
  console.log('✓ model_capability_scores')

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
  console.log('✓ model_rich_profiles')

  await sql.end()
  console.log('Migration complete.')
}

migrate().catch(e => { console.error('Error:', e.message); process.exit(1) })

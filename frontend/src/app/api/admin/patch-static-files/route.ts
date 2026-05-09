/**
 * POST /api/admin/patch-static-files
 *
 * Appends new model entries to the static TypeScript data files:
 *   - src/data/model_specs.ts  (MODEL_SPECS record)
 *   - src/data/model_scores.ts (MODEL_SCORES record)
 *
 * Idempotent: skips models that already have entries.
 * Only adds entries — never overwrites existing ones.
 *
 * Body: { entries: ModelPatchEntry[] }
 * Response: { added: string[], skipped: string[] }
 */

import { NextResponse } from 'next/server'
import { requireAdminAccess, isUnsafeFilePatchEnabled } from '@/lib/route_auth'
import * as fs   from 'fs'
import * as path from 'path'

export interface ModelPatchEntry {
  name:   string
  spec?:  {
    context_window?: string
    params?:         string
    license?:        'open' | 'closed' | 'partial'
  }
  scores?: {
    coding?:        number
    agentic?:       number
    multimodal?:    number
    reasoning?:     number
    math?:          number
    hallucination?: number
  }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function formatSpecLine(name: string, spec: NonNullable<ModelPatchEntry['spec']>): string {
  const parts: string[] = []
  if (spec.context_window) parts.push(`context_window: '${spec.context_window}'`)
  if (spec.license)        parts.push(`license: '${spec.license}'`)
  if (spec.params)         parts.push(`params: '${spec.params}'`)
  if (parts.length === 0) return ''
  const nameKey = name.includes("'") ? `"${name}"` : `'${name}'`
  return `  ${nameKey}: { ${parts.join(', ')} },`
}

function formatScoreLine(name: string, scores: NonNullable<ModelPatchEntry['scores']>): string {
  const DIMS = ['coding', 'agentic', 'multimodal', 'reasoning', 'math', 'hallucination'] as const
  const parts = DIMS
    .filter(d => scores[d] != null)
    .map(d => `${d}:${scores[d]}`)
  if (parts.length === 0) return ''
  const nameKey = name.includes("'") ? `"${name}"` : `'${name}'`
  return `  ${nameKey}: { ${parts.join(', ')} },`
}

// ─── File patching ─────────────────────────────────────────────────────────────

/** Append a single-line entry into a named Record object in a TS file.
 *
 * `recordName` must match the exact `export const <NAME>` declaration.
 * All entries in the target Record must be single-line `{ ... },` objects —
 * so the FIRST `\n}` after the record opener is always the record's own closing
 * brace, even if the file contains additional declarations after it.
 */
function appendToRecord(
  content:    string,
  recordName: string,   // e.g. 'MODEL_SPECS' or 'MODEL_SCORES'
  name:       string,
  newLine:    string,
): { result: string; changed: boolean } {
  // Check for existing entry (handles both ' and " keys)
  if (content.includes(`'${name}':`) || content.includes(`"${name}":`)) {
    return { result: content, changed: false }
  }

  // Locate the specific Record's opening brace
  const marker = `export const ${recordName}`
  const declIdx = content.indexOf(marker)
  if (declIdx === -1) return { result: content, changed: false }

  // Find the `= {` that opens the record
  const openBrace = content.indexOf('= {', declIdx)
  if (openBrace === -1) return { result: content, changed: false }
  const searchFrom = openBrace + 3  // skip past `= {`

  // First `\n}` after the opener is the record's closing brace.
  // (All entries are single-line, so no `\n}` appears inside them.)
  const closeIdx = content.indexOf('\n}', searchFrom)
  if (closeIdx === -1) return { result: content, changed: false }

  const result =
    content.slice(0, closeIdx) +
    '\n' + newLine +
    '\n}' +
    content.slice(closeIdx + 2)

  return { result, changed: true }
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const authError = requireAdminAccess(request)
  if (authError) return authError
  if (!isUnsafeFilePatchEnabled()) {
    return NextResponse.json({ error: 'Static file patching is disabled by default' }, { status: 403 })
  }

  let body: { entries: ModelPatchEntry[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { entries = [] } = body
  if (entries.length === 0) {
    return NextResponse.json({ added: [], skipped: [] })
  }

  const root       = process.cwd()
  const specsPath  = path.join(root, 'src', 'data', 'model_specs.ts')
  const scoresPath = path.join(root, 'src', 'data', 'model_scores.ts')

  if (!fs.existsSync(specsPath) || !fs.existsSync(scoresPath)) {
    return NextResponse.json(
      { error: 'Static data files not found. Run from project root.' },
      { status: 500 },
    )
  }

  let specsContent  = fs.readFileSync(specsPath,  'utf-8')
  let scoresContent = fs.readFileSync(scoresPath, 'utf-8')

  const added:   string[] = []
  const skipped: string[] = []

  for (const entry of entries) {
    const { name, spec, scores } = entry
    let changed = false

    // ── model_specs.ts ───────────────────────────────────────────────
    if (spec && (spec.context_window || spec.license || spec.params)) {
      const line = formatSpecLine(name, spec)
      if (line) {
        const { result, changed: c } = appendToRecord(specsContent, 'MODEL_SPECS', name, line)
        specsContent = result
        if (c) changed = true
      }
    }

    // ── model_scores.ts ──────────────────────────────────────────────
    if (scores && Object.values(scores).some(v => v != null)) {
      const line = formatScoreLine(name, scores)
      if (line) {
        const { result, changed: c } = appendToRecord(scoresContent, 'MODEL_SCORES', name, line)
        scoresContent = result
        if (c) changed = true
      }
    }

    if (changed) added.push(name)
    else         skipped.push(name)
  }

  if (added.length > 0) {
    fs.writeFileSync(specsPath,  specsContent,  'utf-8')
    fs.writeFileSync(scoresPath, scoresContent, 'utf-8')
  }

  return NextResponse.json({ added, skipped })
}

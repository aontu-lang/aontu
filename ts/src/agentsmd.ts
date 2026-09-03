/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'

// THE AGENTS.md STANZA (G7 phase 6,
// docs/capability-review/g7-machine-access.md): generated FROM the
// definition, so the prose entrypoint cannot drift from the formal
// source it points at.
//
// A hand-written "here is where the config lives" paragraph is stale
// the first time a key is renamed. This one is derived: the root keys
// come from the document, the pin comes from G6's canon-hash, and the
// commands are spelled with paths that exist. Re-running the verb
// after an edit produces the stanza that edit implies.

import { Aontu } from './aontu'
import type { TrustOptions } from './type'
import { canonHash } from './hcanon'
import { get } from './query'
import { evalFailure } from './query'
import type { VetFinding } from './vet'
import { cmpCodePoint } from './keyorder'


// The markers an update rewrites between. A stanza outside them is
// prose someone wrote, and is left alone.
export const AGENTSMD_BEGIN = '<!-- aontu:begin -->'
export const AGENTSMD_END = '<!-- aontu:end -->'


export type AgentsMdReport = {
  findings: VetFinding[]
  ok: boolean
  stanza: string
}

export type AgentsMdOptions = {
  // The name the stanza should call the document. The engine never
  // reads a file; the CLI passes what the author typed.
  name?: string
  path?: string
  // The include capability this document evaluates under
  // (G5, docs/trust.md); vet's precedent.
  trust?: TrustOptions

  // Extensions additionally read as text (the CLI's `--text-ext`).
  // Rides beside `trust` because it is the other half of what an
  // include may read.
  textExt?: string[]
}


// The stanza for one document.
export function agentsMd(
  src: string, opts?: AgentsMdOptions): AgentsMdReport {
  const options = opts ?? {}
  const name = options.name ?? 'the definition'

  const aontu = new Aontu(includeOpts(options))
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == options.path ? undefined : { path: options.path }
  const v: any = aontu.unify(src, parseOpts, ctx)
  if (0 < ctx.err.length) {
    return { findings: [evalFailure(ctx)], ok: false, stanza: '' }
  }

  const keys = true === v.isMap ? Object.keys(v.peg).sort(cmpCodePoint) : []
  const shape = get(src, '$', { view: 'types', depth: 2, path: options.path })

  // A REAL path, so the example command works as written: the first
  // root key when there is one, the root itself when there is not.
  const example = 0 < keys.length ? '$.' + keys[0] : '$'

  const lines = [
    AGENTSMD_BEGIN,
    '## Ground truth: `' + name + '`',
    '',
    'The values below are DERIVED from `' + name + '`, an Aontu',
    'definition. Do not restate them here — read them from the source,',
    'which is the only copy that cannot go stale.',
    '',
    '- Pin: `' + canonHash(v) + '`',
    '  (the canon-hash: it survives reformatting and moves on any',
    '  change of meaning — `aontu hash ' + name + '` re-derives it)',
    '- Top-level keys: ' +
    (0 === keys.length ? '_none_' : keys.map((k) => '`' + k + '`').join(', ')),
    '- Shape: `' + shape.out + '`',
    '',
    'How to work with it:',
    '',
    '```',
    '# what does it say at a path?',
    'aontu get ' + example + ' ' + name,
    '',
    '# why does that value hold?',
    'aontu why ' + example + ' ' + name,
    '',
    '# does my document satisfy it?',
    'aontu vet ' + name + ' mine.aon',
    '',
    '# change it without editing it',
    'aontu set ' + example + '=<value> --entry ' + name +
    ' --overlay overlay.aon',
    '```',
    '',
    'Regenerate this section with `aontu agentsmd ' + name + '`.',
    AGENTSMD_END,
  ]

  return { findings: [], ok: true, stanza: lines.join('\n') + '\n' }
}


// Splice the stanza into an existing document: replace what stands
// between the markers, or append when there is nothing to replace. A
// document is otherwise LEFT ALONE — the rest of an AGENTS.md is
// someone's prose, and a generator that rewrote it would be a
// generator nobody dared run twice.
export function agentsMdSplice(existing: string, stanza: string): string {
  const from = existing.indexOf(AGENTSMD_BEGIN)
  const to = existing.indexOf(AGENTSMD_END)
  if (from < 0 || to < from) {
    const head = '' === existing || existing.endsWith('\n')
      ? existing : existing + '\n'
    return head + ('' === existing ? '' : '\n') + stanza
  }
  // Skip the end marker's line terminator, whatever it is, and only if
  // it is there. The full note is on the Go twin (go/agentsmd.go): `+1`
  // assumed one byte and got the CR of a CRLF document, leaving the LF
  // to become a blank line on every regeneration -- and past the end of
  // a document whose marker is its last content, where Go panicked and
  // this side quietly did not.
  let end = to + AGENTSMD_END.length
  if ('\r' === existing[end]) {
    end++
  }
  if ('\n' === existing[end]) {
    end++
  }
  return existing.slice(0, from) + stanza + existing.slice(end)
}

/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


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
  depth?: number
  // The name the stanza should call the document. The engine never
  // reads a file; the CLI passes what the author typed.
  name?: string
  path?: string
  // The include capability this document evaluates under
  // (G5, docs/trust.md); vet's precedent.
  trust?: TrustOptions

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
  const shape = get(src, '$', {
    view: 'types', depth: options.depth ?? 2,
    path: options.path, ...includeOpts(options),
  })

  // A REAL path, so the example command works as written: the first
  // root key when there is one, the root itself when there is not.
  const example = 0 < keys.length ? '$.' + keys[0] : '$'

  const lines = [
    AGENTSMD_BEGIN,
    '## Ground truth: `' + name + '`',
    '',
    'The values below are DERIVED from `' + name + '`, an aontu',
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
    'aontu model get ' + example + ' ' + name,
    '',
    '# why does that value hold?',
    'aontu model why ' + example + ' ' + name,
    '',
    '# does my document satisfy it?',
    'aontu vet ' + name + ' mine.aontu',
    '',
    '# change it without editing it',
    'aontu model set ' + example + '=<value> --entry ' + name +
    ' --overlay overlay.aontu',
    '',
    '# the language itself, offline: the whole grammar on one page',
    'aontu help language',
    '```',
    '',
    'Regenerate this section with `aontu agentsmd ' + name + '`.',
    AGENTSMD_END,
  ]

  return { findings: [], ok: true, stanza: lines.join('\n') + '\n' }
}


export function agentsMdSplice(existing: string, stanza: string): string {
  const from = existing.indexOf(AGENTSMD_BEGIN)
  const to = existing.indexOf(AGENTSMD_END)
  if (from < 0 || to < from) {
    const head = '' === existing || existing.endsWith('\n')
      ? existing : existing + '\n'
    return head + ('' === existing ? '' : '\n') + stanza
  }
  let end = to + AGENTSMD_END.length
  if ('\r' === existing[end]) {
    end++
  }
  if ('\n' === existing[end]) {
    end++
  }
  return existing.slice(0, from) + stanza + existing.slice(end)
}

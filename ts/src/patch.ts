/* Copyright (c) 2025 Richard Rodger, MIT License */


import { vet } from './vet'
import type { HostVars, TrustOptions } from './type'
import type { VetFinding, VetReport, VetVerdict } from './vet'
import { pathParts, why } from './query'
import type { WhyConjunct } from './provenance'
import { Aontu } from './aontu'


export type PatchOptions = {
  // Where each document CAME FROM, so relative `@"file"` loads inside
  // them resolve from their own directories (vet's precedent).
  entryPath?: string
  overlayPath?: string
  inPlace?: boolean
  // The include capability this document evaluates under
  // (G5, docs/trust.md); vet's precedent.
  trust?: TrustOptions
  textExt?: string[]
  hostVars?: HostVars
}


// One literal rewritten where it was written. `from` and `to` are
// SOURCE TEXT, not values: replacing `0x1F` with `31` is a different
// edit from replacing it with `0x1F`, and only the spelling says which.
export type PatchReplacement = {
  col: number
  file: string
  from: string
  path: string
  row: number
  to: string
}

export type PatchReport = {
  overlay: string
  appended: string[]
  // The in-place replacements made, in the order the assignments were
  // given (NOT the order they were applied to the text, which is
  // back-to-front so that earlier offsets stay valid). Empty unless
  // `inPlace` was asked for.
  replaced: PatchReplacement[]
  verdict: VetVerdict
  findings: VetFinding[]
}


// An assignment is `<path>=<value>`, split at the FIRST `=`: a path
// segment is a name, and the value is arbitrary Aontu source, which
// may itself contain `=` (`a: min(1)` does not, but a string can).
export function parseAssignment(
  text: string): { path: string, value: string } | undefined {
  const eq = text.indexOf('=')
  if (eq < 1) {
    return undefined
  }
  const path = text.slice(0, eq).trim()
  const value = text.slice(eq + 1).trim()
  if ('' === value || 0 === pathParts(path).length) {
    return undefined
  }
  return { path, value }
}


export function overlayLine(path: string, value: string): string {
  return pathParts(path).map((p) => JSON.stringify(p)).join(': ') +
    ': ' + value
}


export function offsetAt(src: string, row: number, col: number): number {
  if (row < 1 || col < 1) {
    return -1
  }
  let off = 0
  for (let r = 1; r < row; r++) {
    const nl = src.indexOf('\n', off)
    if (nl < 0) {
      return -1
    }
    off = nl + 1
  }
  const at = off + (col - 1)
  return at <= src.length ? at : -1
}


// The text a site covers, or undefined when the site does not describe
// a position in this text at all.
export function spanAt(
  src: string, site: { row: number, col: number, len: number }
): string | undefined {
  const off = offsetAt(src, site.row, site.col)
  return off < 0 ? undefined : src.slice(off, off + site.len)
}


export function spanHolds(
  src: string, site: { row: number, col: number, len: number }, expect: string
): boolean {
  if ('' === expect || site.len !== expect.length) {
    return false
  }
  return spanAt(src, site) === expect
}


function editableLiteral(
  overlaySrc: string,
  path: string,
  overlayPath: string | undefined,
): { site: PatchReplacement | undefined, finding: VetFinding | undefined } {
  const alone = why(overlaySrc, path, {
    trust: { include: 'none' },
    ...(null == overlayPath ? {} : { path: overlayPath }),
  })

  if (true !== alone.ok || null == alone.record) {
    const withLoads = why(overlaySrc, path,
      null == overlayPath ? undefined : { path: overlayPath })
    if (true !== withLoads.ok || null == withLoads.record) {
      return { site: undefined, finding: undefined }
    }
    return {
      site: undefined,
      finding: notEditable('patch_not_editable', path,
        'this path resolves only once the overlay loads another ' +
        'document, so no literal here can be shown to be the one to ' +
        'edit; run set with the document that writes it as the overlay',
        withLoads.record.conjuncts),
    }
  }

  const record = alone.record

  // No `?? []`: WhyRecord.conjuncts is a non-optional array and the
  // record's own presence was just established, so a fallback here
  // would claim a possibility the type does not have — and the
  // coverage gate says so, an arm nothing can take.
  const conjuncts: WhyConjunct[] = record.conjuncts

  const refs = conjuncts.filter((c) => 'ref' === c.role)
  if (0 < refs.length) {
    return {
      site: undefined,
      finding: notEditable('patch_not_editable', path,
        'the value here is reached through a reference (ref), so the ' +
        'literal below belongs to the path it points at; edit where it ' +
        'comes from',
        refs),
    }
  }

  const literals = conjuncts.filter((c) => 'literal' === c.role)

  if (1 < literals.length) {
    return {
      site: undefined,
      finding: notEditable('patch_ambiguous', path,
        'two or more statements pin this path, so there is no single ' +
        'place to edit; the sites below are all of them',
        literals),
    }
  }

  // Only indirect contributions. A pref is the benign case — append
  // overrides a default — so it earns no finding; the others do.
  if (0 === literals.length) {
    const indirect = conjuncts.filter((c) => 'pref' !== c.role)
    if (0 === indirect.length) {
      return { site: undefined, finding: undefined }
    }
    return {
      site: undefined,
      finding: notEditable('patch_not_editable', path,
        'the value here is not written as a literal (' +
        indirect.map((c) => c.role).join(', ') +
        '), so there is no literal to rewrite; edit where it comes from',
        indirect),
    }
  }

  return verifiedSite(overlaySrc, path, literals[0])
}


export function verifiedSite(
  overlaySrc: string,
  path: string,
  one: WhyConjunct,
): { site: PatchReplacement | undefined, finding: VetFinding | undefined } {
  if (!spanHolds(overlaySrc, one.site, one.src)) {
    const finding = notEditable('patch_span_mismatch', path,
      'the overlay does not hold ' + JSON.stringify(one.src) + ' at ' +
      one.site.row + ':' + one.site.col + ' (len ' + one.site.len +
      '), so the span cannot be verified before writing',
      [one])
    // The one internal-class refusal: a recorded span failing to check
    // out is the engine's fault, never the document's.
    finding.class = 'internal'
    return { site: undefined, finding }
  }

  const span = spanValue(one.src)
  if (null == span || span.canon !== one.canon) {
    return {
      site: undefined,
      finding: notEditable('patch_not_editable', path,
        'the site names ' + JSON.stringify(one.src) + ', which is the ' +
        'opening token of ' + one.canon + ' rather than the whole of ' +
        'it; rewriting that span would edit the expression, not the ' +
        'value',
        [one]),
    }
  }

  if (true !== span.concrete) {
    return {
      site: undefined,
      finding: notEditable('patch_not_editable', path,
        one.canon + ' is a constraint here, not a pinned value; ' +
        'appending narrows it without discarding what it says',
        [one]),
    }
  }

  return {
    site: {
      col: one.site.col,
      file: one.site.file,
      from: one.src,
      path,
      row: one.site.row,
      to: '',
    },
    finding: undefined,
  }
}


export function spanValue(
  src: string): { canon: string, concrete: boolean } | undefined {
  let canon: string
  try {
    const root: any = new Aontu().unify('v: ' + src)
    const node: any = root?.peg?.['v']
    if (null == node || true === node.isNil) {
      return undefined
    }
    canon = node.canon
  }
  catch (e) {
    return undefined
  }

  // Generability is the concreteness test, and it is the engine's own:
  // a kind, a constraint and an unresolved disjunction all refuse to
  // generate, which is precisely the line this needs drawn.
  try {
    new Aontu().generate('v: ' + src)
  }
  catch (e) {
    return { canon, concrete: false }
  }
  return { canon, concrete: true }
}


function notEditable(
  code: string, path: string, why: string, from: WhyConjunct[]
): VetFinding {
  return {
    code,
    // Always `reference`; the one internal-class refusal
    // (patch_span_mismatch) overrides at its call site.
    class: 'reference',
    severity: 'warning',
    path,
    // No separate `note`: the renderer prints both, and a note that
    // restates its own message is noise wearing a second label.
    message: 'cannot rewrite ' + path + ' in place: ' + why,
    sites: from.map((c) => ({
      file: c.site.file,
      row: c.site.row,
      col: c.site.col,
      len: c.site.len,
      src: c.src,
      role: 'data',
      value: c.canon,
    })) as any,
  }
}


export function patch(
  entrySrc: string,
  overlaySrc: string,
  assignments: string[],
  opts?: PatchOptions,
): PatchReport {
  const options = opts ?? {}

  const appended: string[] = []
  const replaced: PatchReplacement[] = []
  const notes: VetFinding[] = []
  // Each pending edit as (offset, length, text). Collected first and
  // applied last, back to front: a splice shifts every offset after it,
  // and recomputing them per edit is a way to be subtly wrong for free.
  const edits: { at: number, len: number, to: string }[] = []

  for (const text of assignments) {
    const a = parseAssignment(text)
    if (null == a) {
      return {
        overlay: overlaySrc,
        appended: [],
        replaced: [],
        verdict: 'error',
        findings: [{
          code: 'patch_assignment',
          class: 'parse',
          severity: 'error',
          path: '$',
          message: `Not a <path>=<value> assignment: ${text}`,
          sites: [],
        }],
      }
    }

    if (true === options.inPlace) {
      const found = editableLiteral(overlaySrc, a.path, options.overlayPath)
      if (null != found.finding) {
        notes.push(found.finding)
      }
      if (null != found.site) {
        const at = offsetAt(overlaySrc, found.site.row, found.site.col)
        const dup = edits.findIndex((e) => e.at === at)
        const edit = { at, len: found.site.from.length, to: a.value }
        if (dup < 0) {
          edits.push(edit)
          replaced.push({ ...found.site, to: a.value })
        }
        else {
          edits[dup] = edit
          replaced[dup] = { ...found.site, to: a.value }
        }
        continue
      }
    }

    appended.push(overlayLine(a.path, a.value))
  }

  const overlay = joinOverlay(applyEdits(overlaySrc, edits), appended)

  const report: VetReport = vet(entrySrc, overlay, {
    trust: options.trust,
    textExt: options.textExt,
    hostVars: options.hostVars,
    schemaPath: options.entryPath,
    dataPath: options.overlayPath,
    schemaUrl: options.entryPath,
    dataUrl: options.overlayPath,
  } as any)

  return {
    overlay,
    appended,
    replaced,
    verdict: report.verdict,
    // The refusals come FIRST: they explain why the run took the shape
    // it did, and a reader who stops after the first finding should
    // read that rather than a conflict it predicted.
    findings: notes.concat(report.findings),
  }
}


function applyEdits(
  src: string, edits: { at: number, len: number, to: string }[]
): string {
  if (0 === edits.length) {
    return src
  }
  let out = src
  for (const e of [...edits].sort((x, y) => y.at - x.at)) {
    out = out.slice(0, e.at) + e.to + out.slice(e.at + e.len)
  }
  return out
}


function joinOverlay(overlaySrc: string, appended: string[]): string {
  if (0 === appended.length) {
    return overlaySrc
  }
  const head = '' === overlaySrc || overlaySrc.endsWith('\n')
    ? overlaySrc
    : overlaySrc + '\n'
  return head + appended.join('\n') + '\n'
}

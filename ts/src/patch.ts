/* Copyright (c) 2025 Richard Rodger, MIT License */

// OVERLAY PATCH (G7 phase 5,
// docs/capability-review/g7-machine-access.md): change a document by
// APPENDING to an overlay, not by rewriting the file.
//
// This is the stage that needs no rewriter. An overlay entry is just
// another conjunct, and unification is order-independent, so appending
// `services: auth: owner: "identity-2"` to a second file and
// evaluating both is exactly the same value as writing it into the
// first — with no parsing of the target, no comment or layout damage,
// and nothing to preserve. The spec pins that equivalence rather than
// asserting it.
//
// What an overlay CANNOT do is change a PINNED value: the lattice
// refuses 5 against 3, and the report says so with the pinning site,
// which `why` then locates. That left the loop "set → conflict → why →
// edit the pinning site" with its last step manual — and since the
// commonest vet failure of all is "the data pins the wrong value",
// `set` was unable to repair the very case it existed for.
//
// IN-PLACE REPLACE (`--in-place`) closes that. The G7 design deferred
// it behind two prerequisites: an evaluated-path → contributing-span
// map, and a comment-and-layout-preserving CST. The first now exists —
// `why` is that map, and sites carry `len` and `src` since a site was
// given an extent. The second turns out NOT to be needed for the case
// that matters, and the reason is worth stating: a CST is what you need
// to RE-SERIALISE a document, and a targeted span splice serialises
// nothing. It replaces `len` code units at one offset and leaves every
// other byte — every comment, every blank line, every alignment space —
// exactly as the author left it, because it never looks at them.
//
// What makes the splice safe rather than merely plausible is that the
// site carries `src`, the text it claims to cover. The span is VERIFIED
// against it before a byte is written, so the corrupting arithmetic
// this repository has already shipped once — `port: 0x1F` reporting
// canon `"31"` at column 7, and `(col, canon.length)` writing
// `port: 5x1F` — cannot be reached: `0x1F` is four code units and says
// so, and if the text at the span is anything else the edit is refused
// rather than guessed.
//
// Replace is never WORSE than append. Where the value is not a single
// editable literal in this overlay — a spread template governing other
// keys, a reference whose site is the `$` and not the target, two
// statements pinning the same path, a literal in an included file — the
// splice is refused and the assignment is APPENDED exactly as it would
// have been without the flag, plus one `warning` finding naming the
// case and the site it came from. Warnings never move a verdict, so
// `--in-place` cannot turn a run that would have succeeded into one
// that fails; it can only rewrite where rewriting is safe, and explain
// itself where it is not.
//
// The verdict is G2's, unchanged: `vet(entry, overlay)` already asks
// exactly the right question — does this document hold against that
// truth, and if not, where — so `set` adds a writer, not a report.

import { vet } from './vet'
import type { VetFinding, VetReport, VetVerdict } from './vet'
import { pathParts, why } from './query'
import type { WhyConjunct } from './provenance'
import { Aontu } from './aontu'


export type PatchOptions = {
  // Where each document CAME FROM, so relative `@"file"` loads inside
  // them resolve from their own directories (vet's precedent).
  entryPath?: string
  overlayPath?: string
  // Rewrite a pinned literal where the author wrote it, instead of
  // appending a line that contradicts it. Opt-in: appending is
  // non-destructive and in-place editing is not, so the caller says
  // which one they meant.
  inPlace?: boolean
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
  // The overlay text as it would stand after the assignments: the
  // existing text, with any in-place replacements applied, plus one
  // appended line for each assignment that was not replaced. The caller
  // writes it — an engine that touched the filesystem could not be used
  // by a server, and the CLI is the one place that knows about files.
  overlay: string
  // The appended lines alone, in order.
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


// The path-flattened conjunct one assignment becomes:
// `$.a.b = 1` is `"a": "b": 1`. Keys are QUOTED — a segment may be a
// word the grammar spells otherwise (`if`), a number, or a name with
// a space in it, and quoting one key is the same value as writing it
// bare.
export function overlayLine(path: string, value: string): string {
  return pathParts(path).map((p) => JSON.stringify(p)).join(': ') +
    ': ' + value
}


// The character offset of a 1-based (row, col) in `src`, or -1 when the
// text has no such position. Columns are UTF-16 code units, which is
// what a site carries and what a JavaScript string index already is —
// so this is the inverse of the site arithmetic, not a reinterpretation
// of it (go/patch.go converts to a byte offset, because Go strings are
// bytes; both address the same character).
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


// DOES THE TEXT AT THIS SITE SAY WHAT THE SITE CLAIMS IT SAYS?
//
// The last check before a splice, and the one that makes the write
// PROVABLE rather than argued. Exported so it can be exercised with a
// site the engine would never produce — an out-of-range position, a
// span over different text — which is the only way to test a guard whose
// whole purpose is to catch a state the rest of the code says cannot
// happen. (go/patch.go has the twin, tested the same way.)
export function spanHolds(
  src: string, site: { row: number, col: number, len: number }, expect: string
): boolean {
  // THE SITE'S OWN LENGTH IS PART OF ITS CLAIM, and is checked before
  // the text is. A site whose `len` disagrees with the text it says it
  // covers CONTRADICTS ITSELF, which is exactly the state this guard
  // exists to catch — and a zero-length span would otherwise compare
  // equal against nothing and then splice nothing, INSERTING the new
  // value rather than replacing anything.
  //
  // Both ports compare in UTF-16 code units, which is what a site's
  // `len` counts. That is free here and is not in Go, where a string is
  // bytes (go/patch.go converts).
  if ('' === expect || site.len !== expect.length) {
    return false
  }
  return spanAt(src, site) === expect
}


// WHY IS THE VALUE AT THIS PATH WHAT IT IS, and is exactly one of the
// answers a literal this overlay can edit in place?
//
// The four refusals below are not defensive padding; each is a real
// document shape that the probe corpus produced, and each would corrupt
// something different if the splice ran anyway:
//
//   - a SPREAD contribution's site is inside the template, which
//     governs every other key too, so rewriting it there changes keys
//     the author did not name;
//   - a REFERENCE's site is the `$` that starts the path and has length
//     1, so splicing over it writes the new value INTO the path
//     expression (`$.base` becomes `5.base`) — and the value the author
//     wants changed lives at the target anyway;
//   - TWO literals at one path (a duplicate key, two files merged) give
//     no single place to edit, and picking either silently is picking
//     for the author;
//   - a literal in an INCLUDED file is editable, but not by
//     `--overlay <this file>`: the write would land in a document the
//     caller did not name.
//
// A PREFERENCE is not refused here for the same reason it is not
// replaced: appending already overrides a default correctly, so the
// caller loses nothing by falling through to it.
function editableLiteral(
  overlaySrc: string,
  path: string,
  overlayPath: string | undefined,
): { site: PatchReplacement | undefined, finding: VetFinding | undefined } {
  // THE AUTHORITY IS THE OVERLAY TEXT ALONE, WITH INCLUDES DENIED.
  //
  // The splice happens in the text this function was handed, so what it
  // has to establish is that the contribution is IN that text — and the
  // site's `file` cannot establish it. Two ways it fails: a caller of
  // the library API need not pass `overlayPath`, leaving nothing to
  // compare against; and the Go port names the ENTRY document for an
  // included value anyway (issue #66), so the comparison is the overlay
  // against itself. Either way an included literal's (row, col, len,
  // src) can COINCIDE with different text at the same coordinates here
  // — an include holding `a: 42` at 1:4 and an overlay holding `x: 42`
  // at 1:4 — and the span verification cannot tell them apart, because
  // the text really does match. The splice then rewrites `x` while
  // reporting a replacement of `$.a`, in both ports.
  //
  // Denying includes removes the ambiguity at its source rather than
  // detecting it: what resolves is what this text says by itself. An
  // overlay that loads other documents therefore cannot be edited in
  // place at all — the conservative answer, and the assignment still
  // appends. It costs nothing in the shape `set` is for, an overlay it
  // owns and appends to, and it does not depend on file attribution, so
  // both ports agree without waiting on #66.
  const alone = why(overlaySrc, path, {
    trust: { include: 'none' },
    ...(null == overlayPath ? {} : { path: overlayPath }),
  })

  if (true !== alone.ok || null == alone.record) {
    // Nothing here BY ITSELF. Two very different reasons, and they earn
    // different answers: the path may simply not be in this overlay, in
    // which case appending is the whole of the answer and nothing has
    // gone wrong — or it may be here only because something was loaded,
    // which is the case above and has to say so.
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

  const one = literals[0]

  // THE SPAN MUST CHECK OUT, and this is one condition rather than two.
  //
  // A first draft tested "no extent" separately from "the text
  // disagrees", which read as two guards and was really one question
  // asked twice — with the second half unreachable, since denying
  // includes means the site comes from evaluating THIS TEXT with
  // nothing loaded, so its coordinates describe this text by
  // construction. Merged, the question is reachable through the case
  // that has no extent at all (`x: hello |> upper` synthesises a call
  // the parser never sited), so the check is exercised rather than
  // argued for — and `spanHolds` is exported and tested against sites
  // the engine would never produce, which is the only way to reach the
  // half that remains theoretical.
  //
  // It is load-bearing either way: a contribution with no `src` would
  // otherwise splice ZERO characters, INSERTING the new value into the
  // middle of a line instead of replacing anything.
  if (!spanHolds(overlaySrc, one.site, one.src)) {
    return {
      site: undefined,
      finding: notEditable('patch_span_mismatch', path,
        'the overlay does not hold ' + JSON.stringify(one.src) + ' at ' +
        one.site.row + ':' + one.site.col + ' (len ' + one.site.len +
        '), so the span cannot be verified before writing',
        [one]),
    }
  }

  // DOES THE SPAN MEAN THE WHOLE CONTRIBUTION?
  //
  // This is the check that `role === 'literal'` looks like it makes and
  // does not. A site names the TOKEN it points at, so a COMPOUND value
  // reports its OPENING token while its canon is the whole thing:
  // `min(1)` is a literal-role contribution whose src is `min`, `1+2`
  // reports `1`, `$.k+1` reports `$`, `{b:1}` reports `{` and `[1,2]`
  // reports `[`. Splicing over any of those writes the new value INTO
  // the expression — `a: 5(1)`, `a: 5+2`, `a: 5.k+1` — which is the
  // same class of corruption as the canon-length arithmetic, reached by
  // a different route.
  //
  // Rather than enumerate the shapes (a list is a thing to be
  // incomplete about), ASK THE ENGINE: parse `src` on its own and
  // require the value it means to be the value the contribution
  // contributed. That is exactly the property a splice needs — this
  // text, alone, is this value — and it is decided by the same unifier
  // that produced the contribution, so it cannot drift from it.
  //
  // It also gets the interesting case right without special-casing it:
  // `0x1F` canons to `31`, which is not its own spelling, but IS the
  // contribution's canon, so a hex literal is editable while `min` is
  // not.
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

  // AN ABSTRACT CONTRIBUTION IS NOT A PIN. `a: integer` and
  // `a: above(0)` state a constraint, and appending already narrows
  // them — that is the one case the status report notes `set` could
  // always repair. Replacing them would silently DISCARD a constraint
  // the author wrote, to no benefit, so this falls through to append.
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


// What does this source text mean ON ITS OWN, and is it a value rather
// than a constraint? Undefined when it does not stand alone at all
// (`$` from a path, an unbalanced `{`).
//
// The wrapper key is arbitrary and the document it makes is thrown
// away; what is wanted is the unifier's own reading of the fragment.
export function spanValue(
  src: string): { canon: string, concrete: boolean } | undefined {
  // NO COLLECTING CONTEXT: `unify` THROWS on a source it cannot read,
  // so a ctx.err check here is a branch nothing can reach — the catch
  // below is the only path a bad fragment takes. (A first draft had
  // both, and the coverage gate called the pair what it was.) What the
  // nil test still earns is the fragment that PARSES and means nothing:
  // `$` is a path with no target, and answers a nil rather than
  // throwing.
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


// A refusal to replace, as a WARNING: the assignment still appends, so
// nothing about the run got worse and the verdict must not move
// (ts/src/vet.ts, "warnings never touch the verdict"). What the finding
// adds is the reason, which is the whole value of asking for --in-place
// over plain set.
function notEditable(
  code: string, path: string, why: string, from: WhyConjunct[]
): VetFinding {
  return {
    code,
    class: 'patch_span_mismatch' === code ? 'internal' : 'reference',
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


// Append the assignments to the overlay and answer what the result
// holds. The report's verdict is the vet verdict of the ENTRY against
// the new overlay: `valid` when it holds and is concrete, `incomplete`
// when nothing contradicts but the truth is not yet satisfied,
// `invalid` when the overlay contradicts a pinned value, `error` when
// the entry itself does not stand up.
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
        // Two assignments naming the same path would splice the same
        // span twice. The second is the one the author wrote last, so
        // it wins — and the first is dropped rather than layered.
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

  // The file names ride as URLs as well as base paths, so a finding
  // names the entry and the overlay rather than vet's generic
  // `schema`/`data` labels — with two documents that both belong to
  // the caller, "which file" is the whole question.
  const report: VetReport = vet(entrySrc, overlay, {
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


// Apply the collected splices back to front, so an earlier edit's
// offset is never invalidated by a later one having already run.
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


// One line per assignment, after whatever the overlay already said. A
// trailing newline is kept when the file had one and added when it
// did not: a file that does not end in a newline is still a file, and
// appending to it must not join two entries into one line.
function joinOverlay(overlaySrc: string, appended: string[]): string {
  if (0 === appended.length) {
    return overlaySrc
  }
  const head = '' === overlaySrc || overlaySrc.endsWith('\n')
    ? overlaySrc
    : overlaySrc + '\n'
  return head + appended.join('\n') + '\n'
}

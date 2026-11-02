/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import type { TrustOptions } from './type'
import { Aontu } from './aontu'
import { anchorAt } from './vet'
import { hcanon } from './hcanon'
import type { VetFinding, VetSite } from './vet'
import {
  constraintSubsumesConstraint,
  constraintSubsumesKind,
  constraintAdmitsScalar,
  constraintAdmitsSize,
} from './val/ConstraintVal'
import { Path, kindSubsumes } from './val/ScalarKindVal'
import { PathVal, prefixMeet } from './val/PathVal'
import { StringVal } from './val/StringVal'
import { IntegerVal } from './val/IntegerVal'
import { NumberVal } from './val/NumberVal'
import { BigIntegerVal } from './val/BigIntegerVal'
import { BigDecimalVal } from './val/BigDecimalVal'
import { BooleanVal } from './val/BooleanVal'
import { NullVal } from './val/NullVal'
import { prefInnerPeg } from './val/PrefVal'
import { walkTarget } from './val/RecurseVal'


export type SubsumeVerdict =
  | 'subsumes' | 'does_not_subsume' | 'undecided' | 'error'

export type SubsumeProfile = 'values' | 'defaults' | 'gen'

export type SubsumeOptions = {
  profile?: SubsumeProfile
  at?: string
  generalUrl?: string
  specificUrl?: string  // provenance label for specific sites
  // Where each document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory — vet's schemaPath/dataPath
  // precedent, one per document because they need not live together.
  generalPath?: string
  specificPath?: string
  // The include capability both documents evaluate under (G5,
  // docs/trust.md). vet's precedent: the verb passes the profile the
  // caller asked for, and an absent option means today's default.
  trust?: TrustOptions

  // Extensions additionally read as text (the CLI's `--text-ext`).
  // Rides beside `trust` because it is the other half of what an
  // include may read.
  textExt?: string[]
}

export type SubsumeReport = {
  verdict: SubsumeVerdict
  findings: VetFinding[]
}


const DEFAULT_GENERAL_URL = 'general'
const DEFAULT_SPECIFIC_URL = 'specific'


type SubState = {
  profile: SubsumeProfile
  // Set inside a distribution trial: see trialSubsume.
  distributing?: boolean
  findings: VetFinding[]
  generalUrl: string
  specificUrl: string
  // The documents each side's recursions unfold against.
  groot?: any
  sroot?: any
  pairs: Pairs
  // The recursion a side's definition is unfolded in place of: its marks
  // are the side's, as an expansion clears the definition's own.
  gRec?: any
  sRec?: any
}

// The per-node answer. Aggregation: any `no` makes the verdict
// does_not_subsume; otherwise any `undecided` makes it undecided.
type Tri = 'yes' | 'no' | 'undecided'

// The pairs of bags the walk has met: those it is comparing, the answers
// it has settled, and the yes-answers waiting on a pair still compared;
// and the recursions it has unfolded since it last entered a bag.
type Frame = { depth: number, low: number, held: string[] }
export type Pairs = {
  frames: Frame[]
  running: Map<string, number>
  settled: Map<string, Tri>
  pending: Map<string, number>
  unfolding: Set<string>
}

export function newPairs(): Pairs {
  return {
    frames: [], running: new Map(), settled: new Map(), pending: new Map(),
    unfolding: new Set(),
  }
}


function opaqueNote(g: any): string {
  return 0 < g.musts.length ?
    'an evaluate-only check (must) makes the admitted set opaque' :
    0 < g.nofs.length ?
      'a count of trial schemas (nof) makes the admitted set opaque' :
      0 < g.whens.length ?
        'a conditional over trial schemas (when) makes the admitted set opaque' :
        0 < g.contains.length ?
          'a count of the members a trial schema admits (contains) makes the ' +
          'admitted set opaque' :
          'a check of the members no cover evaluates (rest) makes the admitted set opaque'
}


export function pathText(path: string[]): string {
  return '$' + (0 < path.length ? '.' + path.join('.') : '')
}


export function siteOf(v: any, role: string, url: string): VetSite {
  return {
    file: url,
    row: v.site.row,
    col: v.site.col,
    len: v.site.len,
    role: role as any,
    src: v.site.src,
    value: v.canon,
  }
}


// One finding: general and specific sites (general first — it is the
// contract being weakened or broken), canons as expected/actual.
function record(
  state: SubState, code: string, path: string[],
  g: any, s: any, message: string,
): void {
  state.findings.push({
    code,
    class: 'compat',
    severity: 'error',
    path: pathText(path),
    message,
    sites: [
      siteOf(g, 'general', state.generalUrl),
      siteOf(s, 'specific', state.specificUrl),
    ],
    expected: g.canon,
    actual: s.canon,
  })
}


function admission(v: any): any {
  return true === v?.isPref ? v.superpeg : v
}


function memberAdmission(v: any): any {
  return true === v?.isPref ? prefInnerPeg(v) : v
}


export function effectiveDefault(v: any): any {
  if (true === v?.isPref) {
    return prefInnerPeg(v)
  }
  if (true === v?.isDisjunct && Array.isArray(v.peg)) {
    const prefs = v.peg.filter((m: any) => true === m?.isPref)
    if (0 === prefs.length) {
      return undefined
    }
    // Generation picks the LOWEST rank (`a:**1|*2` generates 2 —
    // test/spec/edge.tsv), so the effective default does too.
    const minRank = Math.min(...prefs.map((p: any) => p.rank))
    const top = prefs.filter((p: any) => p.rank === minRank)
    const first: any = prefInnerPeg(top[0])
    for (const p of top.slice(1)) {
      if (!first.same?.(prefInnerPeg(p))) {
        return 'indeterminate'
      }
    }
    return first
  }
  return undefined
}


// Is this evaluated value concrete enough to serve as a witness — a
// value that certainly IS an instance of the specific side?
function isConcrete(v: any): boolean {
  if (true === v?.isScalar) {
    return true
  }
  if ((true === v?.isMap || true === v?.isList) && null != v.peg) {
    const children = Array.isArray(v.peg) ? v.peg : Object.values(v.peg)
    return children.every((c: any) => isConcrete(c))
  }
  return false
}


// Unresolved residue makes the relation undecidable at this node:
// references, variables, unreduced conjuncts and functions have no
// admitted set to compare.
function unresolved(v: any): boolean {
  return true === v?.isRef || true === v?.isVar ||
    true === v?.isConjunct || true === v?.isExpect ||
    (true === v?.isFunc && true !== v?.isConstraint)
}


const NO_WITNESS = 'no failing case is found, and no rule decides the pair'

const PROBE_TEXT = ['', 'a', '0', ' ', '~', '\u0000', 'A', 'z', 'abc',
  'a@b.co', '2020-01-01', '00:00:00Z', '2020-01-01T00:00:00Z', 'P1D', 'a.b',
  '1.2.3.4', '::1', 'http://a.b', '00000000-0000-0000-0000-000000000000', '/a']
const PROBE_PATHS = ['.x', '$.x', '..x', '.a', '.z']
const PROBE_NUMBERS = [0, 1, -1, 2, 0.5, -0.5, 1.5]


// A no names a value the specific side admits and the general side
// refuses (sketch/DEFINITION.0.md, §7), and without one is undecided.
function refute(
  state: SubState, path: string[], g: any, s: any, message: string): Tri {
  if (listWitness(g, s) ||
    probes(g, s).some((c: any) => 'yes' === trialSubsume(state, path, s, c) &&
      'no' === trialSubsume(state, path, g, c))) {
    record(state, 'compat_narrowed', path, g, s, message)
    return 'no'
  }
  record(state, 'sub_no_witness', path, g, s, NO_WITNESS)
  return 'undecided'
}


// The empty list, or a pair only the general side's uniqueness refuses.
function listWitness(g: any, s: any): boolean {
  if (!sizesOnly(s)) {
    return false
  }
  if (constraintAdmitsSize(s, 0) && refusesEmptyList(g)) {
    return true
  }
  return true === g?.isConstraint && constraintAdmitsSize(s, 2) &&
    ((true === g.uniq && true !== s.uniq && 0 === s.uniqBy.length) ||
      g.uniqBy.some((k: string) => !s.uniqBy.includes(k)))
}


function sizesOnly(v: any): boolean {
  return true === v?.isConstraint && null == v.domain && true !== v.pathKind &&
    0 === v.musts.length + v.nofs.length + v.whens.length + v.contains.length +
    v.rests.length
}


// Kinds, formats, and either residual's ends, divisors and patterns.
function probes(g: any, s: any): any[] {
  const text = [...PROBE_TEXT]
  const nums = [...PROBE_NUMBERS]
  const ends: number[] = []
  const rs = [g, s].filter((v: any) => true === v?.isConstraint)
  for (const r of rs) {
    for (const v of [r.lo?.v, r.hi?.v, ...r.neqs].filter((v: any) => null != v)) {
      if ('string' === typeof v.peg) {
        text.push(v.peg, v.peg + 'a')
      }
      else {
        ends.push(Number(String(v.peg)))
      }
    }
    for (const re of r.res) {
      text.push(sampleOf(re.src))
    }
  }
  for (const n of ends) {
    nums.push(n, n - 1, n + 1, n - 0.5, n + 0.5)
  }
  for (const m of rs.flatMap((r: any) => r.mults.map((d: any) => Number(String(d.peg))))) {
    nums.push(m, -m, 3 * m, ...ends.flatMap((e) => [Math.ceil(e / m) * m, Math.ceil(e / m) * m + m]))
  }
  const out: any[] = [...new Set(text)].map((t) => new StringVal({ peg: t }))
  out.push(...PROBE_PATHS.map((p) => new PathVal({ peg: p })))
  for (const n of new Set(nums.filter((n) => Number.isFinite(n)))) {
    if (Number.isSafeInteger(n)) {
      out.push(new IntegerVal({ peg: n }), new BigIntegerVal({ peg: BigInt(n) }))
    }
    out.push(new NumberVal({ peg: n }))
    if (!/e/.test(String(n))) {
      out.push(new BigDecimalVal({ peg: String(n) }))
    }
  }
  out.push(new BooleanVal({ peg: true }), new BooleanVal({ peg: false }),
    new NullVal({ peg: null }))
  return out
}


// A string a simple pattern matches: its first alternative, a class as
// its first member, no quantifier, group or anchor.
function sampleOf(src: string): string {
  return src.replace(/^\^|\$$/g, '').split('|')[0].replace(
    /\[\^[^\]]*\]|\[\\?(.)[^\]]*\]|\\([dws])|\\(.)|\{[^}]*\}|\(\?:|[()*+?]|(\.)/g,
    (_m: string, first?: string, named?: string, lit?: string, dot?: string) =>
      first ?? (null != named ? ({ d: '0', w: 'a', s: ' ' } as any)[named] :
        lit ?? (null != dot ? 'a' : '')))
}


function refusesEmptyList(g: any): boolean {
  return true !== g?.isConstraint || null != g.domain || true === g.pathKind ||
    (sizesOnly(g) && !constraintAdmitsSize(g, 0))
}


// Below `string` where it refuses "" and every path, each spelled from
// `$` or `.`: a lower end starting after `.` refuses them all.
function insideString(s: any): boolean {
  const lo = s.lo?.v?.peg
  return (true === s.nonEmpty && true !== s.emptyOk) ||
    (false === constraintAdmitsScalar(s, new StringVal({ peg: '' })) &&
      'string' === typeof lo && 0x2e < (lo.codePointAt(0) ?? 0))
}


// No path passes: it met `string`, or its ends exclude spellings from `$` or `.`.
function refusesPaths(s: any): boolean {
  const lo = s.lo?.v?.peg
  const hi = s.hi?.v?.peg
  return true === s.nonEmpty ||
    ('string' === typeof lo && 0x2e < (lo.codePointAt(0) ?? 0)) ||
    ('string' === typeof hi && (true === s.hi.open ? hi <= '$' : hi < '$'))
}


// Above `string` where nothing refuses a string it admits: no end but a
// lower one at "", and no pattern, format, size, leaf or check.
function aboveString(g: any, strict: boolean): boolean {
  const lo = g.lo
  return (null == g.domain || 'string' === g.domain) && null == g.kind &&
    true !== g.pathKind && null == g.hi && null == g.count && true !== g.uniq &&
    0 === g.uniqBy.length + g.res.length + g.fmts.length + g.musts.length +
    g.nofs.length + g.whens.length + g.contains.length + g.rests.length &&
    (null == lo || ('' === lo.v.peg && (strict || true !== lo.open))) &&
    (strict || !(true === g.nonEmpty && true !== g.emptyOk)) &&
    g.neqs.every((n: any) => true !== n.isString || (strict && '' === n.peg))
}


export function subsumeNode(
  state: SubState, path: string[], g0: any, s0: any): Tri {

  const g = admission(g0)
  const s = admission(s0)

  // Marks change the OUTPUT shape, not the admitted set: only the `gen`
  // profile reports them, and only when they differ on corresponding
  // nodes.
  const gMark = (state.gRec ?? g)?.mark
  const sMark = (state.sRec ?? s)?.mark
  if ('gen' === state.profile && true !== state.distributing &&
    (!!gMark?.type !== !!sMark?.type || !!gMark?.hide !== !!sMark?.hide)) {
    record(state, 'compat_marks_changed', path, g, s,
      'marks differ: general ' + JSON.stringify(gMark) +
      ', specific ' + JSON.stringify(sMark))
    return 'no'
  }

  if (true === g?.isTop) {
    return 'yes'
  }

  // A nil admits nothing (ADR-052's forbidden key and closed spread), so
  // every value subsumes one, and one subsumes no other value.
  if (true === s?.isNil) {
    return 'yes'
  }
  if (true === g?.isNil) {
    record(state, 'compat_narrowed', path, g, s, 'the general value admits nothing')
    return 'no'
  }

  if (true === g?.isRecurse || true === s?.isRecurse) {
    const out = subsumeRecursion(state, path, g0, s0, g, s)
    if (undefined !== out) {
      return out
    }
  }

  if (unresolved(g) || unresolved(s)) {
    if (hcanon(g) === hcanon(s)) {
      return 'yes'
    }
    record(state, 'sub_unresolved', path, g, s,
      'unresolved residue: the admitted set is not comparable')
    return 'undecided'
  }

  if (true === s?.isDisjunct) {
    if (identical(g, s)) {
      return 'yes'
    }
    let out: Tri = 'yes'
    for (const raw of s.peg as any[]) {
      const member = memberAdmission(raw)
      const trial = trialSubsume(state, path, g, member)
      if ('yes' !== trial) {
        if (isConcrete(admission(member))) {
          record(state, 'compat_narrowed', path, g, member,
            'a specific alternative is not admitted by the general value')
          return 'no'
        }
        record(state, 'sub_disjunct_distribution', path, g, member,
          'a specific alternative is not admitted member-wise, and no' +
          ' concrete counterexample settles the distribution case')
        out = 'undecided'
      }
    }
    return out
  }
  if (true === g?.isDisjunct) {
    for (const raw of g.peg as any[]) {
      if ('yes' === trialSubsume(state, path, memberAdmission(raw), s)) {
        return 'yes'
      }
    }
    if (isConcrete(s)) {
      record(state, 'compat_narrowed', path, g, s,
        'no general alternative admits the specific value')
      return 'no'
    }
    record(state, 'sub_disjunct_distribution', path, g, s,
      'no general alternative admits the specific value member-wise,' +
      ' and no concrete counterexample settles the distribution case')
    return 'undecided'
  }

  // Scalar kinds: a kind subsumes its scalars, narrower kinds, and the
  // constraint residuals of its domain.
  if (true === g?.isScalarKind) {
    // A `string` without the waiver refuses the "" a waived one admits.
    const strict = String === g.peg && true !== (g as any).emptyOk
    if (true === s?.isScalarKind) {
      if ((g.peg === s.peg || kindSubsumes(g.peg, s.peg)) &&
        !(strict && true === (s as any).emptyOk)) {
        return 'yes'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general kind does not admit the specific kind')
      return 'no'
    }
    if (true === s?.isScalar) {
      const leaf = s.superior?.()
      if (true === leaf?.isScalarKind &&
        (g.peg === leaf.peg || kindSubsumes(g.peg, leaf.peg)) &&
        !(strict && true === leaf.emptyOk)) {
        return 'yes'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general kind does not admit the specific scalar')
      return 'no'
    }
    if (true === s?.isConstraint) {
      const dom = (s as any).domain
      const skind = (s as any).kind
      if ('number' === dom &&
        (Number === g.peg ||
          (null != skind && kindSubsumes(g.peg, skind)))) {
        return 'yes'
      }
      if ('string' === dom && String === g.peg && true !== (s as any).pathKind &&
        (strict ? insideString(s) : refusesPaths(s))) {
        return 'yes'
      }
      if (Path === g.peg && true === (s as any).pathKind) {
        return 'yes'
      }
      return refute(state, path, g, s,
        'the general kind does not cover the specific residual')
    }
    record(state, 'compat_narrowed', path, g, s,
      'the general kind admits no such value')
    return 'no'
  }

  // Container kinds (sketch/PATHS.0.md): `map` subsumes every
  // map and itself, `list` every list. The unit literals (`{}`,
  // `[]`) already subsume through the container rules; only the kind
  // former needs an arm.
  if (true === (g as any)?.isContainerKind) {
    const ga: any = g
    const sa: any = s
    if ((true === ga.isMapKind && (true === sa?.isMap || true === sa?.isMapKind))
      || (true === ga.isListKind && (true === sa?.isList || true === sa?.isListKind))) {
      return 'yes'
    }
    record(state, 'compat_narrowed', path, g, s,
      'the general container kind admits no such value')
    return 'no'
  }

  if (true === g?.isConstraint) {
    if (true === s?.isConstraint) {
      const r = constraintSubsumesConstraint(g, s)
      if (true === r) {
        return 'yes'
      }
      if ('undecided' === r) {
        if (identical(g, s)) {
          return 'yes'
        }
        record(state, 'sub_evaluate_only', path, g, s, opaqueNote(g))
        return 'undecided'
      }
      return refute(state, path, g, s,
        'the general residual does not contain the specific residual')
    }
    if (true === s?.isScalar) {
      const r = constraintAdmitsScalar(g, s)
      if (true === r) {
        return 'yes'
      }
      if ('undecided' === r) {
        record(state, 'sub_evaluate_only', path, g, s, opaqueNote(g))
        return 'undecided'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general residual does not admit the specific scalar')
      return 'no'
    }
    const why = 'the general residual constrains a domain the specific value is not in'
    if (true === s?.isScalarKind) {
      if (constraintSubsumesKind(g, s.peg) ||
        (String === s.peg && aboveString(g, true !== (s as any).emptyOk))) {
        return 'yes'
      }
      return refute(state, path, g, s, why)
    }
    // A domain holds no container, so any instance fails the residual.
    if (null != (g as any).domain || true === (g as any).pathKind) {
      record(state, 'compat_narrowed', path, g, s, why)
      return 'no'
    }
    record(state, 'sub_no_witness', path, g, s, NO_WITNESS)
    return 'undecided'
  }

  // Concrete scalars subsume only themselves (identity compares kind
  // as well as value) -- except paths, whose meet is the prefix rule
  // (ADR-016): a prefix admits every extension of itself, so it
  // subsumes one, exactly as the meet answers the longer.
  if (true === g?.isScalar) {
    if (true === g.isPath && true === (s as any)?.isPath &&
      prefixMeet(g.peg, (s as any).peg) === (s as any).peg) {
      return 'yes'
    }
    if (true === s?.isScalar && true === g.same?.(s)) {
      return 'yes'
    }
    record(state, 'compat_narrowed', path, g, s,
      'a concrete value subsumes only itself')
    return 'no'
  }

  // Maps.
  if (true === g?.isMap) {
    if (true === (s as any)?.isMapKind) {
      const keys = fieldKeys(g)
      return overKind(state, path, g, s,
        true === g.closed || keys.some((k: string) => !g.optionalKeys.includes(k)),
        keys.map((k: string) => [k, g.peg[k]]),
        'the general map refuses a map the specific kind admits')
    }
    if (true !== s?.isMap) {
      record(state, 'compat_narrowed', path, g, s,
        'the general value is a map and the specific value is not')
      return 'no'
    }
    // A DECLARATION IS NOT A FIELD: an alias key is erased before the
    // document exists, so neither side compares one.
    return assume(state, g0, s0, () => subsumeBag(state, path, g, s,
      fieldKeys(g), fieldKeys(s), (v: any, k: string) => v.peg[k]))
  }

  // Lists: element-wise by position; the same required/optional shape
  // as maps, with positions as keys.
  if (true === g?.isList) {
    if (true === (s as any)?.isListKind) {
      return overKind(state, path, g, s,
        0 < g.peg.length || (true === g.closed && null == g.spread?.cj), [],
        'the general list refuses a list the specific kind admits')
    }
    if (true !== s?.isList) {
      record(state, 'compat_narrowed', path, g, s,
        'the general value is a list and the specific value is not')
      return 'no'
    }
    const gk = (g.peg as any[]).map((_: any, i: number) => '' + i)
    const sk = (s.peg as any[]).map((_: any, i: number) => '' + i)
    return assume(state, g0, s0, () => subsumeBag(state, path, g, s, gk, sk,
      (v: any, k: string) => v.peg[Number(k)]))
  }

  if (true !== g?.isNil && true !== s?.isNil && hcanon(g) === hcanon(s)) {
    return 'yes'
  }
  record(state, 'sub_unresolved', path, g, s,
    'no subsumption rule covers this pair of value formers')
  return 'undecided'
}


// Each outright refusal has a failing case the kind admits: `{}`, `[]`,
// a fresh key past a map's seal, even under a spread, and `[1]` past a
// list's seal with no spread. Members and the spread are held to `any`.
function overKind(
  state: SubState, path: string[], g: any, s: any,
  refused: boolean, members: [string, any][], message: string): Tri {
  if (refused) {
    record(state, 'compat_narrowed', path, g, s, message)
    return 'no'
  }
  let out: Tri = 'yes'
  for (const [k, v] of [...members, ['&', g.spread?.cj]]) {
    const r: Tri = null == v ? 'yes' : subsumeNode(state, [...path, k], v, topLike())
    if ('no' === r || ('undecided' === r && 'no' !== out)) {
      out = r
    }
  }
  return out
}


// A recursion is the definition it names, unfolded against its own
// document (sketch/RECURSION.0.md, P3). One met again before the
// walk enters a bag unfolds to no structure, and is compared as residue.
function subsumeRecursion(
  state: SubState, path: string[], g0: any, s0: any, g: any, s: any): Tri | undefined {
  const key = g0?.id + ' ' + s0?.id
  const unfolding = state.pairs.unfolding
  if (unfolding.has(key)) {
    return undefined
  }
  const gr = true === g?.isRecurse ? g : undefined
  const sr = true === s?.isRecurse ? s : undefined
  const gb = undefined === gr ? g0 : walkTarget(state.groot, gr.target)
  const sb = undefined === sr ? s0 : walkTarget(state.sroot, sr.target)
  if (undefined === gb || undefined === sb) {
    record(state, 'sub_unresolved', path, g, s,
      'a recursion whose definition its document does not hold')
    return 'undecided'
  }
  unfolding.add(key)
  const out = subsumeNode({ ...state, gRec: state.gRec ?? gr, sRec: state.sRec ?? sr },
    path, gb, sb)
  unfolding.delete(key)
  return out
}


// Values of one hash form are one value (use-cases/BUGS.md 64), unless a
// recursion inside names a definition its own document holds.
function identical(g: any, s: any): boolean {
  const h = hcanon(g)
  return h === hcanon(s) && !/\$\.|%/.test(h)
}


// A recursion's definition in its own document, or the value itself.
function unfold(root: any, v: any): any {
  return true === v?.isRecurse ? walkTarget(root, v.target) : v
}


// A pair of bags already under comparison is assumed to subsume, so a
// recursion ends on the first pair it meets again (Amadio and Cardelli),
// and each pair is compared once (Tarjan's lowlink keeps a yes that
// assumed a pair still running from settling before that pair does).
function assume(state: SubState, g0: any, s0: any, compare: () => Tri): Tri {
  const p = state.pairs
  const key = g0.id + ' ' + s0.id + ' ' +
    ('gen' === state.profile ? JSON.stringify([state.gRec?.mark, state.sRec?.mark]) : '')
  const settled = p.settled.get(key)
  if (undefined !== settled) {
    return settled
  }
  const low = p.running.get(key) ?? p.pending.get(key)
  if (undefined !== low) {
    const top = p.frames[p.frames.length - 1]
    top.low = Math.min(top.low, low)
    return 'yes'
  }
  const frame: Frame = { depth: p.frames.length, low: p.frames.length, held: [] }
  const unfolding = p.unfolding
  p.frames.push(frame)
  p.running.set(key, frame.depth)
  p.unfolding = new Set()
  const out = compare()
  p.unfolding = unfolding
  p.frames.pop()
  p.running.delete(key)
  settle(state, key, frame, out)
  return out
}


function settle(state: SubState, key: string, frame: Frame, out: Tri): void {
  const p = state.pairs
  const parent = p.frames[p.frames.length - 1]
  const main = true !== state.distributing
  if (main && 'yes' === out && frame.low < frame.depth) {
    p.pending.set(key, frame.low)
    parent.held.push(key, ...frame.held)
  }
  else {
    for (const k of frame.held) {
      p.pending.delete(k)
      if (main && 'yes' === out) {
        p.settled.set(k, out)
      }
    }
    if (main) {
      p.settled.set(key, out)
    }
  }
  if (undefined !== parent) {
    parent.low = Math.min(parent.low, frame.low)
  }
}


// Maps and lists share one shape: required keys of the general side
// must be required in the specific side and subsume; optional keys
// compare when present; closedness bounds the specific key set; spread
// templates govern the specific side's surplus.
function fieldKeys(v: any): string[] {
  return Object.keys(v.peg).filter((k: string) => !v.aliasKeys.includes(k))
}


function subsumeBag(
  state: SubState, path: string[], g: any, s: any,
  gKeys: string[], sKeys: string[],
  child: (v: any, k: string) => any,
): Tri {
  let out: Tri = 'yes'
  const worse = (r: Tri) => {
    if ('no' === r || ('undecided' === r && 'no' !== out)) {
      out = 'no' === r ? 'no' : 'undecided'
    }
  }

  // Always arrays on an evaluated bag (BagVal initialises them).
  const gOptional: string[] = g.optionalKeys
  const sOptional: string[] = s.optionalKeys

  for (const k of gKeys) {
    const gChild = child(g, k)
    const has = sKeys.includes(k)
    const optional = gOptional.includes(k)
    if (!has) {
      if (optional) {
        continue
      }
      record(state, 'compat_required_added', [...path, k], gChild, s,
        'the general value requires this key; the specific value admits' +
        ' instances without it')
      worse('no')
      continue
    }
    if (!optional && sOptional.includes(k)) {
      record(state, 'compat_required_added', [...path, k], gChild,
        child(s, k),
        'the general value requires this key; the specific value makes' +
        ' it optional, so instances without it are admitted')
      worse('no')
      continue
    }
    worse(subsumeNode(state, [...path, k], gChild, child(s, k)))
  }

  // Closedness: a closed general bag admits only key sets it declares,
  // so the specific side must be closed and inside it.
  if (true === g.closed) {
    if (true !== s.closed) {
      record(state, 'compat_narrowed', path, g, s,
        'the general value is closed; the open specific value admits' +
        ' surplus keys')
      worse('no')
    }
    else {
      for (const k of sKeys) {
        if (!gKeys.includes(k)) {
          record(state, 'compat_narrowed', [...path, k], g, child(s, k),
            'the closed general value does not declare this key')
          worse('no')
        }
      }
    }
  }

  const gcj = g.spread?.cj
  const scj = s.spread?.cj
  if (null != gcj || null != scj) {
    const sameTemplate = null != gcj && null != scj && hcanon(gcj) === hcanon(scj)
    if (!sameTemplate &&
      (true === gcj?.isPathDependent || true === scj?.isPathDependent)) {
      record(state, 'sub_path_dependent_spread', path, gcj ?? g, scj ?? s,
        'a path-dependent spread template cannot be compared structurally')
      worse('undecided')
    }
    else if (null != gcj) {
      // The general template governs the specific side's surplus keys
      // and its template.
      for (const k of sKeys) {
        if (!gKeys.includes(k)) {
          worse(subsumeNode(state, [...path, k], gcj, child(s, k)))
        }
      }
      // A sealed specific side with no template has no member beyond the
      // ones the loop above holds to the general template.
      if (true !== s.closed || null != scj) {
        worse(subsumeNode(state, [...path, '&'], gcj, scj ?? topLike()))
      }
    }
    // A specific-only template narrows the specific side; nothing for
    // the (unconstrained) general side to refuse.
  }

  return out
}


// A stand-in TOP for "the specific side leaves this unconstrained".
let topVal: any
function topLike(): any {
  if (null == topVal) {
    topVal = {
      isTop: true, canon: 'any',
      site: { row: -1, col: -1, len: -1, src: '' },
    }
  }
  return topVal
}


function trialSubsume(
  state: SubState, path: string[], g: any, s: any): Tri {
  const trial: SubState = { ...state, findings: [], distributing: true }
  return subsumeNode(trial, path, g, s)
}


function subsumeDefaults(
  state: SubState, path: string[], g: any, s: any): Tri {
  const sd = effectiveDefault(s)
  if (undefined === sd) {
    return 'yes'
  }
  const gd = effectiveDefault(g)
  if ('indeterminate' === sd || 'indeterminate' === gd) {
    record(state, 'sub_default_indeterminate', path, g, s,
      'equal-rank preferences disagree, so the effective default is' +
      ' not a single value')
    return 'undecided'
  }
  if (undefined === gd || true !== gd.same?.(sd)) {
    record(state, 'compat_default_changed', path, g, s,
      'the effective default changed: previously generable documents' +
      ' materialise differently or become incomplete')
    return 'no'
  }
  return 'yes'
}


// Walk both trees for default agreement wherever the specific side has
// one: at the node itself and inside every corresponding bag child, a
// recursion unfolded and each pair of maps walked once.
function subsumeDefaultsWalk(
  state: SubState, path: string[], g0: any, s0: any, seen: Set<string>): Tri {
  const g = unfold(state.groot, g0)
  const s = unfold(state.sroot, s0)
  let out: Tri = subsumeDefaults(state, path, g, s)

  const gm = true === g?.isMap ? g.peg : undefined
  const sm = true === s?.isMap ? s.peg : undefined
  const pair = g?.id + ' ' + s?.id
  if (null != gm && null != sm && !seen.has(pair)) {
    seen.add(pair)
    for (const k of Object.keys(sm)) {
      if (null != gm[k]) {
        const r = subsumeDefaultsWalk(state, [...path, k], gm[k], sm[k], seen)
        if ('no' === r || ('undecided' === r && 'no' !== out)) {
          out = 'no' === r ? 'no' : 'undecided'
        }
      }
    }
  }
  return out
}


export function subsume(
  generalSrc: string, specificSrc: string, opts?: SubsumeOptions,
): SubsumeReport {
  const options = opts ?? {}
  const profile: SubsumeProfile = options.profile ?? 'defaults'
  const state: SubState = {
    profile,
    findings: [],
    generalUrl: options.generalUrl ?? DEFAULT_GENERAL_URL,
    specificUrl: options.specificUrl ?? DEFAULT_SPECIFIC_URL,
    pairs: newPairs(),
  }

  const load = (src: string, path?: string): any => {
    const aontu = new Aontu(includeOpts(options))
    const ctx = aontu.ctx({ collect: true })
    const v: any = aontu.unify(
      src, null == path ? undefined : { path }, ctx)
    if (0 < ctx.err.length || true === v?.isNil) {
      return undefined
    }
    return v
  }

  let g = load(generalSrc, options.generalPath)
  let s = load(specificSrc, options.specificPath)
  if (null == g || null == s) {
    return { verdict: 'error', findings: [] }
  }
  state.groot = g
  state.sroot = s

  if (null != options.at) {
    g = anchorAt(g, options.at)
    s = anchorAt(s, options.at)
    if (null == g || null == s) {
      return { verdict: 'error', findings: [] }
    }
  }

  let out: Tri = subsumeNode(state, [], g, s)
  if ('values' !== profile) {
    const d = subsumeDefaultsWalk(state, [], g, s, new Set())
    if ('no' === d || ('undecided' === d && 'no' !== out)) {
      out = 'no' === d ? 'no' : 'undecided'
    }
  }

  const verdict: SubsumeVerdict =
    'no' === out ? 'does_not_subsume' :
      'undecided' === out ? 'undecided' : 'subsumes'
  return { verdict, findings: state.findings }
}

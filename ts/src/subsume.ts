/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import type { TrustOptions } from './type'
import { Aontu } from './aontu'
import { anchorAt } from './vet'
import { hcanon } from './hcanon'
import type { VetFinding, VetSite } from './vet'
import {
  constraintSubsumesConstraint,
  constraintAdmitsScalar,
} from './val/ConstraintVal'
import { kindSubsumes } from './val/ScalarKindVal'
import { prefixMeet } from './val/PathVal'
import { prefInnerPeg } from './val/PrefVal'


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
}

// The per-node answer. Aggregation: any `no` makes the verdict
// does_not_subsume; otherwise any `undecided` makes it undecided.
type Tri = 'yes' | 'no' | 'undecided'


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


export function subsumeNode(
  state: SubState, path: string[], g0: any, s0: any): Tri {

  const g = admission(g0)
  const s = admission(s0)

  // Marks change the OUTPUT shape, not the admitted set: only the `gen`
  // profile reports them, and only when they differ on corresponding
  // nodes.
  if ('gen' === state.profile && true !== state.distributing &&
    (!!g?.mark?.type !== !!s?.mark?.type ||
      !!g?.mark?.hide !== !!s?.mark?.hide)) {
    record(state, 'compat_marks_changed', path, g, s,
      'marks differ: general ' + JSON.stringify(g?.mark) +
      ', specific ' + JSON.stringify(s?.mark))
    return 'no'
  }

  if (true === g?.isTop) {
    return 'yes'
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
    if (true === s?.isScalarKind) {
      if (g.peg === s.peg || kindSubsumes(g.peg, s.peg)) {
        return 'yes'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general kind does not admit the specific kind')
      return 'no'
    }
    if (true === s?.isScalar) {
      const leaf = s.superior?.()
      if (true === leaf?.isScalarKind &&
        (g.peg === leaf.peg || kindSubsumes(g.peg, leaf.peg))) {
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
      if ('string' === dom && String === g.peg) {
        return 'yes'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general kind does not cover the specific residual')
      return 'no'
    }
    record(state, 'compat_narrowed', path, g, s,
      'the general kind admits no such value')
    return 'no'
  }

  // Container kinds (docs/design/PATHS.0.md): `map()` subsumes every
  // map and itself, `list()` every list. The unit literals (`{}`,
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
        record(state, 'sub_evaluate_only', path, g, s,
          'an evaluate-only check (must) makes the admitted set opaque')
        return 'undecided'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general residual does not contain the specific residual')
      return 'no'
    }
    if (true === s?.isScalar) {
      const r = constraintAdmitsScalar(g, s)
      if (true === r) {
        return 'yes'
      }
      if ('undecided' === r) {
        record(state, 'sub_evaluate_only', path, g, s,
          'an evaluate-only check (must) makes the admitted set opaque')
        return 'undecided'
      }
      record(state, 'compat_narrowed', path, g, s,
        'the general residual does not admit the specific scalar')
      return 'no'
    }
    record(state, 'compat_narrowed', path, g, s,
      'the general residual constrains a domain the specific value is not in')
    return 'no'
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
    if (true !== s?.isMap) {
      record(state, 'compat_narrowed', path, g, s,
        'the general value is a map and the specific value is not')
      return 'no'
    }
    return subsumeBag(state, path, g, s, Object.keys(g.peg),
      Object.keys(s.peg), (v: any, k: string) => v.peg[k])
  }

  // Lists: element-wise by position; the same required/optional shape
  // as maps, with positions as keys.
  if (true === g?.isList) {
    if (true !== s?.isList) {
      record(state, 'compat_narrowed', path, g, s,
        'the general value is a list and the specific value is not')
      return 'no'
    }
    const gk = (g.peg as any[]).map((_: any, i: number) => '' + i)
    const sk = (s.peg as any[]).map((_: any, i: number) => '' + i)
    return subsumeBag(state, path, g, s, gk, sk,
      (v: any, k: string) => v.peg[Number(k)])
  }

  if (true !== g?.isNil && true !== s?.isNil && hcanon(g) === hcanon(s)) {
    return 'yes'
  }
  record(state, 'sub_unresolved', path, g, s,
    'no subsumption rule covers this pair of value formers')
  return 'undecided'
}


// Maps and lists share one shape: required keys of the general side
// must be required in the specific side and subsume; optional keys
// compare when present; closedness bounds the specific key set; spread
// templates govern the specific side's surplus.
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
      worse(subsumeNode(state, [...path, '&'], gcj, scj ?? topLike()))
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
      isTop: true, canon: 'top',
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
// one: at the node itself and inside every corresponding bag child.
function subsumeDefaultsWalk(
  state: SubState, path: string[], g: any, s: any): Tri {
  let out: Tri = subsumeDefaults(state, path, g, s)

  const gm = true === g?.isMap ? g.peg : undefined
  const sm = true === s?.isMap ? s.peg : undefined
  if (null != gm && null != sm) {
    for (const k of Object.keys(sm)) {
      if (null != gm[k]) {
        const r = subsumeDefaultsWalk(state, [...path, k], gm[k], sm[k])
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

  if (null != options.at) {
    g = anchorAt(g, options.at)
    s = anchorAt(s, options.at)
    if (null == g || null == s) {
      return { verdict: 'error', findings: [] }
    }
  }

  let out: Tri = subsumeNode(state, [], g, s)
  if ('values' !== profile) {
    const d = subsumeDefaultsWalk(state, [], g, s)
    if ('no' === d || ('undecided' === d && 'no' !== out)) {
      out = 'no' === d ? 'no' : 'undecided'
    }
  }

  const verdict: SubsumeVerdict =
    'no' === out ? 'does_not_subsume' :
      'undecided' === out ? 'undecided' : 'subsumes'
  return { verdict, findings: state.findings }
}

/* Copyright (c) 2025 Richard Rodger, MIT License */

// Subsumption as a first-class query (G3 phases 1-2,
// docs/capability-review/g3-subsumption-evolution.md): does the GENERAL
// value admit every instance the SPECIFIC value admits?
//
// The recursion is a dedicated structural walk over EVALUATED values —
// design option B. It never mutates its inputs (it runs after
// evaluation, on finished trees), carries no fixpoint, and returns a
// THREE-VALUED verdict: `subsumes`, `does_not_subsume` (with the
// failing path and both sides' canons as the witness), or `undecided`
// (with a reason code, never silently). Where a rule cannot decide the
// answer folds toward "not subsumed" or "undecided" — the safe
// directions: a compatibility gate that wrongly reports "breaking"
// costs a second look, one that wrongly reports "compatible" ships the
// break (docs/reference-language.md, "Subsumption").
//
// Findings reuse G2's report vocabulary (the vet finding object), with
// the G3 codes appended to the shared registry: `compat_narrowed`,
// `compat_required_added`, `compat_default_changed`,
// `compat_marks_changed`, and the `sub_*` undecided reasons — all
// class `compat`.


import { Aontu } from './aontu'
import { anchorAt } from './vet'
import type { VetFinding, VetSite } from './vet'
import {
  constraintSubsumesConstraint,
  constraintAdmitsScalar,
} from './val/ConstraintVal'
import { kindSubsumes } from './val/ScalarKindVal'


export type SubsumeVerdict =
  | 'subsumes' | 'does_not_subsume' | 'undecided' | 'error'

export type SubsumeProfile = 'values' | 'defaults' | 'gen'

export type SubsumeOptions = {
  profile?: SubsumeProfile
  at?: string
  generalUrl?: string   // provenance label for general sites
  specificUrl?: string  // provenance label for specific sites
  // Where each document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory — vet's schemaPath/dataPath
  // precedent, one per document because they need not live together.
  generalPath?: string
  specificPath?: string
}

export type SubsumeReport = {
  verdict: SubsumeVerdict
  findings: VetFinding[]
}


const DEFAULT_GENERAL_URL = 'general'
const DEFAULT_SPECIFIC_URL = 'specific'


// One comparison's running state: the finding list, the two provenance
// labels, and the profile.
type SubState = {
  profile: SubsumeProfile
  findings: VetFinding[]
  generalUrl: string
  specificUrl: string
}

// The per-node answer. Aggregation: any `no` makes the verdict
// does_not_subsume; otherwise any `undecided` makes it undecided.
type Tri = 'yes' | 'no' | 'undecided'


function pathText(path: string[]): string {
  return '$' + (0 < path.length ? '.' + path.join('.') : '')
}


// Every recorded operand is a real evaluated Val or the sited topLike
// stand-in, so no null guards: a Val's site is always an object, and a
// value parsed without a usable frame (a disjunct, say) already carries
// the -1 coordinates in it.
function siteOf(v: any, role: string, url: string): VetSite {
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


// The admission view of a value under a profile: under every profile a
// PREFERENCE admits what its superior admits (the engine's own
// PrefVal.superpeg semantics); the default itself is compared
// separately, by the `defaults` and `gen` profiles.
function admission(v: any): any {
  return true === v?.isPref ? v.superpeg : v
}


// The effective default of a value, or undefined when it has none, or
// 'indeterminate' when equal-rank preferences disagree (which the
// engine itself refuses only at generation).
// Exported (with subsumeNode) for the default-validity lint in
// ts/src/vet.ts (G3 phase 5): the lint asks exactly this walk's two
// questions — what is the effective default, and does a member admit
// it.
export function effectiveDefault(v: any): any {
  if (true === v?.isPref) {
    return v.peg
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
    const first = top[0].peg
    for (const p of top.slice(1)) {
      if (!first.same?.(p.peg)) {
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


// Exported for the defensive-arm unit test (ADR-002,
// ts/test/coverage3.test.ts): the no-rule fold at the walk's tail is
// unreachable through subsume() today — the ladder is total for every
// evaluated former — and the walk is otherwise private.
export function subsumeNode(
  state: SubState, path: string[], g0: any, s0: any): Tri {

  const g = admission(g0)
  const s = admission(s0)

  // Marks change the OUTPUT shape, not the admitted set: only the `gen`
  // profile reports them, and only when they differ on corresponding
  // nodes.
  if ('gen' === state.profile &&
    (!!g?.mark?.type !== !!s?.mark?.type ||
      !!g?.mark?.hide !== !!s?.mark?.hide)) {
    record(state, 'compat_marks_changed', path, g, s,
      'marks differ: general ' + JSON.stringify(g?.mark) +
      ', specific ' + JSON.stringify(s?.mark))
    return 'no'
  }

  // TOP admits everything. There is no nil rule: an error-free
  // evaluated document carries no nil (failing disjunct members are
  // discarded, every other nil collects an error, and subsume() answers
  // `error` for a source that does not stand alone), so a nil handed to
  // the walk by a future caller falls to the no-rule fold below —
  // `undecided`, the safe direction.
  if (true === g?.isTop) {
    return 'yes'
  }

  if (unresolved(g) || unresolved(s)) {
    record(state, 'sub_unresolved', path, g, s,
      'unresolved residue: the admitted set is not comparable')
    return 'undecided'
  }

  // Disjunctions. General side first: a specific member must be
  // subsumed by SOME general member; member-wise failure is not proof
  // (the distribution case), so a concrete failing member becomes the
  // witness and anything else is honestly undecided.
  if (true === s?.isDisjunct) {
    let out: Tri = 'yes'
    for (const member of s.peg as any[]) {
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
    for (const member of g.peg as any[]) {
      if ('yes' === trialSubsume(state, path, member, s)) {
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
      // A kind covers a residual of its own domain: `number` admits any
      // numeric residual (the supertype admits every leaf a bound can
      // pin), a numeric LEAF kind admits only a residual pinned to that
      // leaf, and `string` admits any pattern residual. A residual with
      // no domain (sizing-only) admits containers no kind covers.
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

  // Constraint residuals.
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
  // as well as value).
  if (true === g?.isScalar) {
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

  // The ladder above is total in practice: every evaluated former is a
  // scalar, kind, constraint, map, list, disjunct, or top, or is caught
  // by admission (pref) or unresolved (ref, var, conjunct, expect,
  // func). The arm is kept because "in practice" is evaluation's
  // property, not this walk's, and a future value class (or a nil, see
  // the top rule) must land on an honest `undecided`, not fall out of
  // the walk with no answer.
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

  // Spread templates: a path-dependent template's meaning depends on
  // where it lands, which no structural comparison can decide.
  const gcj = g.spread?.cj
  const scj = s.spread?.cj
  if (null != gcj || null != scj) {
    if (true === gcj?.isPathDependent || true === scj?.isPathDependent) {
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
    // A full site, not a partial one: `len` and `src` are as much part
    // of the shape as row and col, and leaving them undefined dropped
    // both keys from the emitted report — so this stand-in was the one
    // site in either port with no `len` at all, and the Go twin (which
    // has no undefined) disagreed. It occupies no source, so the values
    // are the "unknown" ones.
    topVal = {
      isTop: true, canon: 'top',
      site: { row: -1, col: -1, len: -1, src: '' },
    }
  }
  return topVal
}


// A trial comparison whose findings are DISCARDED: disjunct
// member-matching asks many "would this member do?" questions, and only
// the aggregated outcome is a finding.
function trialSubsume(
  state: SubState, path: string[], g: any, s: any): Tri {
  const trial: SubState = { ...state, findings: [] }
  return subsumeNode(trial, path, g, s)
}


// The defaults comparison (the `defaults` and `gen` profiles): the
// specific side's effective default must survive into the general side
// unchanged. Adding a default where none existed is compatible;
// changing or removing one is not (removal turns previously generable
// documents incomplete).
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


/**
 * Does `generalSrc` subsume `specificSrc` — is every instance the
 * specific admits admitted by the general too?
 *
 * Both sources are evaluated fresh (single-use trees make this
 * mandatory), and the recursion runs on the finished values. The
 * verdict is three-valued plus `error` (a source that does not stand up
 * on its own, mirroring vet's schema-error verdict); findings reuse
 * G2's object with class `compat`.
 */
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
    const aontu = new Aontu()
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

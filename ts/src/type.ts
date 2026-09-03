/* Copyright (c) 2022-2025 Richard Rodger, MIT License */

import * as Fs from 'node:fs'

// TODO: refactor these out

import { Resolver } from '@tabnas/multisource'

import { Val, DONE, SPREAD } from './val/Val'
import type { ValMark, ValSpec } from './val/Val'


type FST = typeof Fs



// The trust profile (G5, docs/trust.md): what an evaluation may read,
// and how much work it may do. Trust is a property of the EVALUATION,
// not the document -- a .aon file cannot request more capability -- and
// the profile adds zero language syntax.
//
// The include capability:
//   'none'            @"..." is always denied
//   { mem: {...} }    a virtual file set only; nothing else resolves
//   { root: '/dir' }  real files, realpath-confined below root;
//                     no package resolution
//   'system'          the full memory -> file -> package chain
//                     (today's default, and the unconfined posture)
//
// Budgets are integer counts of engine events -- never wall-clock, which
// would make identical inputs fail differently across machines (the
// exact nondeterminism docs/trust.md forbids). The defaults are the
// shared spec-visible constants pinned by test/spec/budget.tsv.
type TrustInclude =
  | 'none'
  | 'system'
  | { mem: Record<string, string> }
  | { root: string }

// Only the budgets BOTH ports can honour are profile surface: passes
// and depth. The per-pair revisit bound (999) stays a TS-internal
// constant — the Go dispatcher has no revisit counter (it is
// depth-guarded), and a knob one port cannot implement would break the
// parity contract (ADR-001) by construction.
type TrustBudget = {
  passes?: number    // fixpoint passes (default 9)
  depth?: number     // structural recursion depth (default 1000)
}

type TrustOptions = {
  include?: TrustInclude
  budget?: TrustBudget
}

type AontuOptions = {
  src?: string    // Source text.
  print?: number  // Print debug verbosity
  resolver?: Resolver // Source resolver
  base?: string // Base path for resolver
  path?: string // Path of entry file
  debug?: boolean
  trace?: boolean
  fs?: FST
  deps?: any
  log?: any
  idcount?: number
  collect?: boolean // Collect errors into an errs property, rather than throw them.
  err?: any[]
  explain?: any[]
  trust?: TrustOptions // Trust profile (G5, docs/trust.md)

  // EXTENSIONS ADDITIONALLY READ AS TEXT, without their dots. `.txt`
  // is read as text with no option at all; this widens that set for a
  // host that keeps its prose in `.md`, its queries in `.sql`, or its
  // templates under some name only it knows. The file's bytes become
  // one string scalar -- no parser is chosen for it, which is what
  // makes widening the set safe to offer.
  textExt?: string[]

  // The staged-flip warning window (G5 phase 6, CLI only): under the
  // default 'system' capability the CLI supplies these, and the
  // resolver calls trustWarn for every resolution that escapes
  // trustWarnRoot or goes through package resolution — naming the flag
  // a future default will require. Not a stable embedding API.
  trustWarn?: (kind: 'escape' | 'pkg', path: string) => void
  trustWarnRoot?: string
}


const DEFAULT_OPTS: () => AontuOptions = () => {
  return {
    print: -1,
    debug: false,
    trace: false,
  }
}


type ValMap = { [key: string]: Val }
type ValList = Val[]



type ErrContext = {
  src?: string,
  fs?: FST
} /* node:coverage ignore next 24 */

export type {
  Val,
  ValMark,
  ValSpec,
  ValMap,
  ValList,
  AontuOptions,
  ErrContext,
  FST,
  TrustInclude,
  TrustBudget,
  TrustOptions,
}

export {
  DONE,
  SPREAD,
  DEFAULT_OPTS,
  Resolver,
}


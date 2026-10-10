/* Copyright (c) 2022-2025 Richard Rodger, MIT License */

import * as Fs from 'node:fs'


import { Resolver } from '@tabnas/multisource'

import { Val, DONE, SPREAD } from './val/Val'
import type { ValMark, ValSpec } from './val/Val'


type FST = typeof Fs


type TrustInclude =
  | 'none'
  | 'system'
  | { mem: Record<string, string> }
  | { root: string }

type TrustBudget = {
  passes?: number    // fixpoint passes (default 9)
  depth?: number     // structural recursion depth (default 1000)
  trials?: number    // admission trials (default 100000)
}

type TrustOptions = {
  include?: TrustInclude
  budget?: TrustBudget
}

type AontuOptions = {
  src?: string
  print?: number  // Print debug verbosity
  resolver?: Resolver
  base?: string // Base path for resolver
  path?: string // Path of entry file
  debug?: boolean
  trace?: boolean
  fs?: FST
  errfs?: FST
  deps?: any
  log?: any
  idcount?: number
  collect?: boolean // Collect errors into an errs property, rather than throw them.
  err?: any[]
  explain?: any[]
  trust?: TrustOptions // Trust profile (G5, docs/trust.md)

  textExt?: string[]

  exactNumbers?: boolean

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
  fs?: FST,
  errfs?: FST
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


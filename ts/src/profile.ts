/* Copyright (c) 2026 Richard Rodger, MIT License */


import { Aontu } from './aontu'
import { vet, failureFinding } from './vet'
import { hcanon } from './hcanon'
import { includeOpts } from './utility'

import type { IncludeOptions } from './utility'
import type { VetFinding } from './vet'


export type ProfileOptions = IncludeOptions & {
  // Where the document CAME FROM, so a relative `@"file"` load inside
  // it resolves from its own directory.
  path?: string
}


const PROFILE_VOCABULARY = '@"aontu:profile"'


// A language declared as data, vetted, or the findings that refuse it.
export function loadProfile(src: string, options?: ProfileOptions):
  { profile?: any, errors?: VetFinding[] } {
  const opts = options ?? {}
  const aontu = new Aontu(includeOpts(opts))
  const actx = aontu.ctx({ collect: true })
  const root: any = aontu.unify(src, { path: opts.path, collect: true }, actx)
  if (0 < actx.err.length || true === root?.isNil) {
    return { errors: [failureFinding(actx, opts.path, root)] }
  }
  const report = vet(PROFILE_VOCABULARY, hcanon(root))
  if ('valid' !== report.verdict) {
    return { errors: report.findings }
  }
  // The meet: the vocabulary requires `lang`, so a value the vet
  // admitted has a `Lang`.
  const instance = new Aontu().generate(
    PROFILE_VOCABULARY + '\naontu: Lang: ' + hcanon(root.peg.aontu.peg.Lang))
  return { profile: instance.aontu.Lang }
}

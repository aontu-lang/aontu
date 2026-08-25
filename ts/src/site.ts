/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
} from './type'


type SiteSpec = {
  row?: number, col?: number, url?: string, len?: number, src?: string,
}

// Site locates a value in the text that produced it: where it starts
// (row, col), HOW FAR IT RUNS (len), and the source text itself (src).
//
// THE EXTENT IS NOT OPTIONAL DETAIL — it is what makes a site safe to
// edit. Without it the only length available is the CANON, and canon is
// not source text: `port: 0x1F` has canon `31`, so replacing
// `(col, canon.length)` writes `port: 5x1F` and corrupts the document.
// The parser knew the extent all along — the token carries `len` and
// `src` beside the `rI`/`cI` this already read — and dropping it was
// the whole defect (status report 2026-08-21, §5).
//
// WHAT THE EXTENT COVERS is the TOKEN THE SITE POINTS AT, which is the
// same thing row and col have always pointed at:
//
//   0x1F         a scalar literal   len 4   the whole literal
//   "hi there"   a string           len 10  quotes included
//   {x:1}        a map              len 1   the opening brace
//   min(3)       a constraint       len 3   the name, not the call
//
// So for a SCALAR — which is what a repair edits, and what `set` and
// the manual fallback rewrite — `(col, len)` is exactly the span to
// replace. For a container it under-reaches to the opening delimiter,
// which is safe in the direction that matters: a highlight that is too
// short is a cosmetic flaw, while canon.length on a map over-reaches
// across lines into text the value never occupied.
//
// -1 and '' mean UNKNOWN, the same convention row and col already use:
// a value minted by unification rather than written by a document has
// no site, and must not be edited as though it had one.
class Site {
  row: number
  col: number
  url: string
  len: number
  src: string

  constructor(val?: Val | SiteSpec) {
    const site = ((val as any)?.site ?? val) as SiteSpec

    this.row = site?.row ?? -1
    this.col = site?.col ?? -1
    this.url = site?.url ?? ''
    this.len = site?.len ?? -1
    this.src = site?.src ?? ''
  }
} /* node:coverage ignore next 6 */


export {
  Site,
}

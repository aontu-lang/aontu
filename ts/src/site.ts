/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
} from './type'


type SiteSpec = {
  row?: number, col?: number, url?: string, len?: number, src?: string,
}

// WHERE A NAME WAS USED, when the value arrived through one. A finding
// names where a value is written; this names where it entered the path
// the finding is about (ALIASES.0.md A-1).
type ViaSite = {
  row: number, col: number, url: string, src: string, name: string,
}

// WHERE AN INCLUDE LOADED a value another file wrote: the key it stands
// under is written there, though the value keeps its own file's site.
type LoadSite = {
  row: number, col: number, url?: string,
}

// row, col and len -1, url and src empty, mean UNKNOWN: a value the
// engine minted rather than read has no site, and must not be edited
// as though it had one.
class Site {
  row: number
  col: number
  url: string
  len: number
  src: string
  via?: ViaSite
  load?: LoadSite

  constructor(val?: Val | SiteSpec) {
    const site = ((val as any)?.site ?? val) as SiteSpec

    this.row = site?.row ?? -1
    this.col = site?.col ?? -1
    this.url = site?.url ?? ''
    this.len = site?.len ?? -1
    this.src = site?.src ?? ''
    this.via = (site as any)?.via
    this.load = (site as any)?.load
  }
} /* node:coverage ignore next 11 */


export {
  Site,
}


export type {
  LoadSite,
  ViaSite,
}

/* Copyright (c) 2025 Richard Rodger, MIT License */


export function walkVals(
  v: any,
  visit: (v: any) => boolean,
  seen: Set<any>
) {
  if (null == v || 'object' !== typeof v || true !== v.isVal) {
    return
  }
  if (seen.has(v)) {
    return
  }
  seen.add(v)

  if (!visit(v)) {
    return
  }

  const peg = v.peg
  if (Array.isArray(peg)) {
    for (const c of peg) {
      walkVals(c, visit, seen)
    }
  }
  else if (null != peg && 'object' === typeof peg) {
    for (const k in peg) {
      walkVals(peg[k], visit, seen)
    }
  }

  const spread = v.spread?.cj
  if (spread) {
    walkVals(spread, visit, seen)
  }

  walkVals(v.superpeg, visit, seen)
  for (const must of (v.musts ?? [])) {
    walkVals(must?.v, visit, seen)
  }
  for (const nof of (v.nofs ?? [])) {
    for (const c of nof.cs) {
      walkVals(c, visit, seen)
    }
  }

  walkVals(v.primary, visit, seen)
  walkVals(v.secondary, visit, seen)
}


function trialSchemas(v: any): any[] {
  return 'nof' === v.pending?.atom ? v.pending.args.slice(1) :
    (v.nofs ?? []).flatMap((n: any) => n.cs)
}


export function collectNils(root: any, seen: Set<any>): any[] {
  const out: any[] = []
  const walked = new Set<any>()
  walkVals(root, (v: any) => {
    if (true === v.isNil) {
      out.push(v)
      seen.add(v)
      return false
    }
    // A spread template is not an instance value: generation never emits
    // it, and each child it applies to carries its own copy.
    if (null != v.spread?.cj) {
      walked.add(v.spread.cj)
    }
    // A trial schema is no instance value, and a nil one admits nothing.
    for (const c of trialSchemas(v)) {
      walked.add(c)
    }
    // A written `nil` under an optional key nobody supplied is no
    // finding (ADR-045).
    if (true === v.isMap) {
      for (const k of v.optionalKeys) {
        if (true === v.peg[k]?.isNil && 'literal_nil' === v.peg[k].why) {
          walked.add(v.peg[k])
        }
      }
    }
    return true
  }, walked)
  return out
}

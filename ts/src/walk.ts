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
    for (const branch of nof.branches) {
      walkVals(branch, visit, seen)
    }
  }

  walkVals(v.primary, visit, seen)
  walkVals(v.secondary, visit, seen)
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
    // A key still optional is absent, whatever its value holds.
    for (const k of v.optionalKeys ?? []) {
      if (undefined !== v.peg[k]) {
        walked.add(v.peg[k])
      }
    }
    // A count's alternatives are trial schemas, where nil admits nothing.
    for (const nof of v.nofs ?? []) {
      nof.branches.forEach((b: any) => walked.add(b))
    }
    return true
  }, walked)
  return out
}

#!/usr/bin/env python3
"""repair.py --- the mechanical half of an agent's emit->validate->repair
loop over `aontu vet --format json` findings.

Reads a candidate JSON document and a vet report, applies the repair
each finding implies, and writes the repaired candidate:

  constraint  expected `integer&min(A)&max(B)` -> clamp the actual
              number into [A, B]. The `expected` field alone carries
              enough to do this; this is the report at its best.
  |:empty     the finding has NO `expected` field; the admissible
              alternatives must be dug out of the schema-role site's
              `value` ("a"|"b"|"c"), then nearest-matched HERE --
              the report names alternatives but ranks nothing.
  closed      the finding names only the refused key. No alternatives,
              no nearest-key note (contrast: `--at` typos DO get
              "did you mean"). The caller must supply the declared key
              list (aontu get --keys <anchor>) via --keys, and the
              nearest-key search happens HERE, client-side.

Path handling: conflict findings under `--at` sometimes carry the
anchor prefix ($.msg.X.field) and sometimes not ($.field, for closed
findings) -- see README, gap 4 -- so both spellings are accepted.
"""
import argparse
import difflib
import json
import re
import sys


def rel_segments(path: str, anchor: str) -> list[str]:
    if anchor and path.startswith(anchor + "."):
        path = path[len(anchor) + 1 :]
    elif path.startswith("$."):
        path = path[2:]
    return path.split(".") if path else []


def locate(doc, segs):
    node = doc
    for s in segs[:-1]:
        node = node[int(s)] if isinstance(node, list) else node[s]
    return node, segs[-1]


def clamp(finding):
    lo = re.search(r"min\((-?\d+)\)", finding["expected"])
    hi = re.search(r"max\((-?\d+)\)", finding["expected"])
    try:
        actual = json.loads(finding["actual"])
    except (ValueError, KeyError):
        return None
    if not isinstance(actual, (int, float)) or isinstance(actual, bool):
        return None
    if lo and actual < int(lo.group(1)):
        return int(lo.group(1))
    if hi and actual > int(hi.group(1)):
        return int(hi.group(1))
    return None


def alternatives(finding):
    for site in finding.get("sites", []):
        if site.get("role") == "schema" and "|" in site.get("value", ""):
            return [a.strip().strip('"') for a in site["value"].split("|")]
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--findings", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--anchor", default="")
    ap.add_argument("--keys", help="file listing declared keys, one per line")
    args = ap.parse_args()

    with open(args.candidate) as f:
        doc = json.load(f)
    with open(args.findings) as f:
        report = json.load(f)
    declared = []
    if args.keys:
        with open(args.keys) as f:
            declared = [k.strip() for k in f if k.strip()]

    for finding in report.get("findings", []):
        segs = rel_segments(finding["path"], args.anchor)
        if not segs:
            continue
        parent, last = locate(doc, segs)
        code = finding.get("code")

        if code == "constraint" and "expected" in finding:
            fixed = clamp(finding)
            if fixed is not None:
                parent[last] = fixed
                print(f"repair: {finding['path']}: clamped to {fixed}")
                continue
            print(f"repair: {finding['path']}: not mechanical "
                  f"(expected {finding['expected']}); left for the model",
                  file=sys.stderr)

        elif code == "|:empty":
            alts = alternatives(finding)
            actual = str(parent.get(last, "")).strip('"')
            near = difflib.get_close_matches(actual, alts, n=1, cutoff=0.4)
            if near:
                parent[last] = near[0]
                print(f"repair: {finding['path']}: '{actual}' -> "
                      f"'{near[0]}' (from {alts})")

        elif code == "closed":
            near = difflib.get_close_matches(last, declared, n=1, cutoff=0.6)
            if near and near[0] not in parent:
                parent[near[0]] = parent.pop(last)
                print(f"repair: {finding['path']}: key renamed to "
                      f"'{near[0]}' (client-side nearest-key search)")
            else:
                parent.pop(last, None)
                print(f"repair: {finding['path']}: surplus key dropped")

    with open(args.out, "w") as f:
        json.dump(doc, f, indent=2, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()

"""Write the documents of test/spec/subsume.tsv that the definition reads
as Lean terms, for the oracle's `subsumerows` cases.

Reads the subset of the language the definition's terms spell without a
path or a call the order doesn't decide: maps, lists, spreads, `close`,
scalars, kinds, `|`, `&`, `*`, the bounds, `mulof`, `neq`, `len`,
`type`, `hide` and alias declarations. A row with anything else is left
out, with the reason on stderr. The oracle prints each term back as
text, and the rows it writes are run by both ports, so a term read
wrongly here shows as a row the ports answer against the contract.

Usage: python3 -I subsume_rows.py <subsume.tsv> <out.lean>
"""
import json
import re
import sys

KINDS = {
    "integer": ".integer", "float": ".float", "biginteger": ".biginteger",
    "bigdecimal": ".bigdecimal", "number": ".number", "string": ".string",
    "boolean": ".boolean", "any": ".any", "map": ".mapKind", "list": ".listKind",
}
BOUNDS = {"min": ".min", "max": ".max", "above": ".above", "below": ".beneath"}


class Skip(Exception):
    pass


TOKEN = re.compile(r'\s*(?:(?P<num>-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|(?P<str>"(?:[^"\\]|\\.)*")'
                   r'|(?P<name>[A-Za-z_][A-Za-z0-9_]*)|(?P<alias>%[A-Za-z_][A-Za-z0-9_]*)'
                   r'|(?P<op>[{}\[\](),:?&|*=]))')


def tokens(src):
    out, i = [], 0
    while i < len(src):
        if src[i] in " \t\n":
            if src[i] == "\n":
                out.append(("nl", "\n"))
            i += 1
            continue
        m = TOKEN.match(src, i)
        if not m or m.end() == i:
            raise Skip("token at " + repr(src[i:i + 12]))
        kind = m.lastgroup
        out.append((kind, m.group(kind)))
        i = m.end()
    return out


class Reader:
    def __init__(self, src):
        self.t = tokens(src)
        self.i = 0

    def peek(self, skip_nl=True):
        j = self.i
        while skip_nl and j < len(self.t) and self.t[j][0] == "nl":
            j += 1
        return self.t[j] if j < len(self.t) else (None, None)

    def take(self, skip_nl=True):
        while skip_nl and self.i < len(self.t) and self.t[self.i][0] == "nl":
            self.i += 1
        if self.i >= len(self.t):
            raise Skip("end of text")
        tok = self.t[self.i]
        self.i += 1
        return tok

    def expect(self, v):
        k, t = self.take()
        if t != v:
            raise Skip(f"expected {v}, got {t}")

    def doc(self):
        decls, fields = [], []
        while self.peek()[0] is not None:
            k, t = self.peek()
            if k == "alias":
                self.take()
                self.expect("=")
                decls.append((t[1:], self.expr(False)))
            else:
                self.pair(fields)
            if self.peek()[1] == ",":
                self.take()
        return decls, ("map", fields, None, False)

    def key(self):
        k, t = self.take()
        if k == "name":
            return t
        if k == "str":
            return json.loads(t)
        raise Skip("key " + str(t))

    def pair(self, fields):
        if self.peek()[1] == "&":
            raise Skip("spread outside a map")
        key = self.key()
        opt = False
        if self.peek()[1] == "?":
            self.take()
            opt = True
        self.expect(":")
        k, t = self.peek()
        if k in ("name", "str") and self.chained():
            sub = []
            self.pair(sub)
            val = ("map", sub, None, False)
        else:
            val = self.expr(False)
        for f in fields:
            if f[0] == key:
                raise Skip("a key written twice")
        fields.append((key, opt, val))

    def chained(self):
        j = self.i
        while self.t[j][0] == "nl":
            j += 1
        nxt = self.t[j + 1][1] if j + 1 < len(self.t) else None
        return nxt in (":", "?")

    def expr(self, under):
        start = self.i
        arms = [self.conj(under)]
        if not under and self.peek()[1] == "|":
            self.i = start
            arms = [self.conj(True)]
        while self.peek()[1] == "|":
            self.take()
            arms.append(self.conj(True))
        if len(arms) == 1:
            return arms[0]
        return ("or", [arm(a) for a in arms])

    def conj(self, under):
        terms = [self.unary(under)]
        while self.peek()[1] == "&" and not self.spread_next():
            self.take()
            terms.append(self.unary(under))
        if ("kind", ".string") in terms and ("empty",) in terms:
            terms = [t for t in terms if t not in (("kind", ".string"), ("empty",))] + [("anystring",)]
        if ("empty",) in terms:
            raise Skip("empty() without string")
        out = terms[0]
        for t in terms[1:]:
            out = ("meet", out, t)
        return out

    def spread_next(self):
        j = self.i
        while self.t[j][0] == "nl":
            j += 1
        return j + 1 < len(self.t) and self.t[j + 1][1] == ":"

    def unary(self, under):
        if self.peek()[1] == "*":
            r = 0
            while self.peek()[1] == "*":
                self.take()
                r += 1
            return ("pref", r, self.atom(True))
        return self.atom(under)

    def atom(self, under):
        k, t = self.take()
        if k == "num":
            if re.fullmatch(r"-?\d+", t):
                n = int(t)
                if abs(n) >= 2 ** 53:
                    raise Skip("a big integer")
                return ("int", n)
            raise Skip("a non-integer number")
        if k == "str":
            return ("str", json.loads(t))
        if k == "alias":
            return ("alias", t[1:])
        if k == "op" and t == "{":
            return self.map_body(under)
        if k == "op" and t == "[":
            return self.list_body(under)
        if k == "op" and t == "(":
            v = self.expr(under)
            self.expect(")")
            return v
        if k == "name":
            if t in ("true", "false"):
                return ("bool", t == "true")
            if t == "null":
                return ("null",)
            if t == "nil":
                return ("void",)
            if t in KINDS and self.peek(False)[1] != "(":
                return ("kind", KINDS[t])
            if self.peek(False)[1] == "(":
                self.take()
                return self.call(t, under)
            if t not in KINDS:
                return ("str", t)
        raise Skip("term " + str(t))

    def call(self, f, under):
        args = []
        while self.peek()[1] != ")":
            args.append(self.expr(under))
            if self.peek()[1] == ",":
                self.take()
        self.take()
        if f in BOUNDS and len(args) == 1 and args[0][0] in ("int", "str"):
            return ("bound", BOUNDS[f], args[0])
        if f == "empty" and not args:
            return ("empty",)
        if f == "unique" and len(args) <= 1 and all(a[0] == "str" for a in args):
            return ("unique", args[0][1] if args else None)
        if f == "mulof" and len(args) == 1 and args[0][0] == "int" and args[0][1] > 0:
            return ("mulof", args[0][1])
        if f == "neq" and args and len({a[0] for a in args}) == 1 and args[0][0] in ("int", "str"):
            return ("neq", args)
        if f == "len" and len(args) == 1:
            return ("len", args[0])
        if f in ("type", "hide") and len(args) == 1:
            return ("ride", f, args[0])
        if f == "close" and len(args) == 1 and args[0][0] in ("map", "list"):
            v = args[0]
            return (v[0], v[1], v[2], True)
        raise Skip("call " + f)

    def map_body(self, under):
        fields, spread = [], None
        while self.peek()[1] != "}":
            if self.peek()[1] == "&":
                self.take()
                self.expect(":")
                if spread is not None:
                    raise Skip("two spreads")
                spread = self.expr(False)
            else:
                self.pair(fields)
            if self.peek()[1] == ",":
                self.take()
        self.take()
        return ("map", fields, spread, False)

    def list_body(self, under):
        items, spread = [], None
        while self.peek()[1] != "]":
            if self.peek()[1] == "&":
                self.take()
                self.expect(":")
                spread = self.expr(False)
            else:
                items.append(self.expr(False))
            if self.peek()[1] == ",":
                self.take()
        self.take()
        # A list literal under `|` or `*` reads as its own length: sealed.
        return ("list", items, spread, under and spread is None)


def arm(v):
    if v[0] == "pref":
        return (v[1], v[2])
    return (0, v)


def lean(v):
    tag = v[0]
    if tag == "int":
        return f"(int ({v[1]}))"
    if tag == "str":
        return f"(str {json.dumps(v[1])})"
    if tag == "bool":
        return f"(.lit (.bool {'true' if v[1] else 'false'}))"
    if tag == "null":
        return "(.lit .null)"
    if tag == "kind":
        return v[1]
    if tag == "alias":
        return f'(.alias {json.dumps(v[1])})'
    if tag == "void":
        return "Val.void"
    if tag == "anystring":
        return ".anyString"
    if tag == "unique":
        return "(.unique none)" if v[1] is None else f"(.unique (some {json.dumps(v[1])}))"
    if tag == "bound":
        return f"({v[1]} {bound(v[2])})"
    if tag == "mulof":
        return f"(.mulof (.integer (.of {v[1]})))"
    if tag == "neq":
        return "(.neq [" + ", ".join(bound(b) for b in v[1]) + "])"
    if tag == "len":
        return f"(.len {lean(v[1])})"
    if tag == "ride":
        return f"(.ride .{v[1]} {lean(v[2])} [])"
    if tag == "map":
        fs = ", ".join(f"({json.dumps(k)}, {'true' if o else 'false'}, {lean(x)})" for k, o, x in v[1])
        sp = "none" if v[2] is None else f"(some {lean(v[2])})"
        return f"(.map [{fs}] {sp} {'true' if v[3] else 'false'})"
    if tag == "list":
        items = ", ".join(lean(x) for x in v[1])
        sp = "none" if v[2] is None else f"(some {lean(v[2])})"
        return f"(.list [{items}] {sp} {'true' if v[3] else 'false'})"
    if tag == "or":
        return "(.or [" + ", ".join(f"({r}, {lean(a)})" for r, a in v[1]) + "])"
    if tag == "pref":
        return f"(.pref {v[1]} {lean(v[2])})"
    if tag == "meet":
        return f"(.meet {lean(v[1])} {lean(v[2])})"
    raise Skip("no term for " + tag)


def bound(b):
    if b[0] == "int":
        return f"(.num (.integer (.of ({b[1]}))))"
    return f"(.str {json.dumps(b[1])})"


def unesc(t):
    return re.sub(r"\\(.)", lambda m: "\n" if m.group(1) == "n" else "\t" if m.group(1) == "t" else m.group(1), t)


def doc_term(src):
    decls, body = Reader(src).doc()
    ds = "[" + ", ".join(f"({json.dumps(n)}, {lean(v)})" for n, v in decls) + "]"
    return f"({ds}, {lean(body)})"


def main():
    rows_path, out_path = sys.argv[1:3]
    cases, skipped = [], 0
    with open(rows_path) as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 5 or cols[1] != "subsume":
                continue
            name, g, s, expect = cols[0], unesc(cols[2]), unesc(cols[3]), json.loads(unesc(cols[4]))
            opts = expect.get("opts", {})
            if set(opts) - {"profile"}:
                print(f"{name}: options {sorted(opts)}", file=sys.stderr)
                skipped += 1
                continue
            profile = opts.get("profile", "defaults")
            try:
                gt, st = doc_term(g), doc_term(s)
            except Skip as e:
                print(f"{name}: {e}", file=sys.stderr)
                skipped += 1
                continue
            cases.append(f"  ({json.dumps(name)}, .{profile},\n    {gt},\n    {st})")
    with open(out_path, "w") as f:
        f.write("import Oracle.Base\n\n")
        f.write("/-! Generated by `spec/tools/subsume_rows.py` from `test/spec/subsume.tsv`:\n")
        f.write("each row's two documents, as the definition's terms, where it reads them. -/\n\n")
        f.write("open Aontu\nopen Case\n\n")
        f.write("def subsumeRowCases : List (String × Profile × (Decls × Val) × (Decls × Val)) := [\n")
        f.write(",\n".join(cases))
        f.write("]\n")
    print(f"{len(cases)} rows read, {skipped} left out", file=sys.stderr)


main()

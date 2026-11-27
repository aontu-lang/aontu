import Oracle.Base
-- For order only: the four largest modules each need several gigabytes, so they build one at a time.
import Oracle.PathsLinks

/-! The oracle's cases: PathsSources, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

namespace Case

abbrev l := lst

end Case

/-- Spreads whose templates read their member's place, each read at each
member there is: a relative path in a map's template, beside data that
supplies its target, refuses it, fills it and supplies none; the
template at a member the schema writes, with and without its target,
which the data can't supply; a list's spread; paths that climb past the
instance; `key()` and `key(2)` in a map's template and `key()` in a
list's; a spread that is a relative path, read where it's written, and
one that only holds one; an absolute path in a template, beside no
member, a member the data supplies and one the schema writes; a
template a path reference copies, read at the copy's members; a spread
inside a template, at a member the template writes and at one the data
supplies; and a spread met with a map. -/
def spreadCases : List (Decls × Val × Data) :=
  let ls (xs : List Val) (s : Val) : Val := .list xs (some s) false
  let host := m [("host", rel 1 ["name"])]
  let h1 := m [("h", rel 1 ["name"])]
  let nested := m [("w", ms [] (m [("h", rel 3 ["name"])]))]
  let nestedF := m [("w", ms [("f", m [])] (m [("h", rel 3 ["name"])]))]
  let bare := ms [] (rel 2 ["x"])
  let copied := m [("x", int 1), ("T", bare), ("outer", m [("x", int 2), ("t", p ["T"])])]
  let copiedNo := m [("x", int 1), ("T", bare), ("outer", m [("t", p ["T"])])]
  let built := m [("global", str "x"), ("T", ms [] (m [("h", p ["global"])])), ("Source", m [("a", m [])]),
    ("s", ms [("m", m [])] (m [("copy", .meet (p ["T"]) (p ["Source"]))]))]
  let linked (spread : Val) (t : Val) (rest : List (String × Val)) : Val :=
    m (rest ++ [("s", ms [] spread), ("r", .meet (.call .relate [t]) (.addr ⟨0, ["s"]⟩))])
  let named := m [("a", m [("name", str "n")])]
  let inCopy := m [("T", ms [] h1), ("s", ms [("m", m [])] (m [("copy", p ["T"])]))]
  [([], m [("s", ms [] host)], dm [("s", dm [("a", dm [("name", .str "x"), ("host", .str "x")])])]),
    ([], m [("s", ms [] host)], dm [("s", dm [("a", dm [("name", .str "x"), ("host", .str "y")])])]),
    ([], m [("s", ms [] host)], dm [("s", dm [("a", dm [("name", .str "x")])])]),
    ([], m [("s", ms [] host)], dm [("s", dm [("a", dm [])])]),
    ([], m [("s", ms [("a", m [("name", str "x")])] host)], dm []),
    ([], m [("s", ms [("a", m [("name", str "x")])] host)], dm [("s", dm [("a", dm [("host", .str "y")])])]),
    ([], m [("s", ms [("a", m [("name", str "x")])] host)], dm [("s", dm [("b", dm [("name", .str "y")])])]),
    ([], m [("s", ms [("a", m [("name", str "x")])] host)],
      dm [("s", dm [("b", dm [("name", .str "y"), ("host", .str "z")])])]),
    ([], m [("s", ms [("a", m [])] host)], dm []),
    ([], m [("s", ms [("a", m [])] host)], dm [("s", dm [("a", dm [("name", .str "z")])])]),
    ([], m [("s", ms [("a", m [("name", .string)])] host)], dm []),
    ([], m [("l", ls [] host)], dm [("l", .list [dm [("name", .str "x")]])]),
    ([], m [("l", ls [m [("n", int 1)]] (m [("h", rel 1 ["n"])]))], dm [("l", .list [dm [("h", j 2)]])]),
    ([], m [("s", ms [("a", m [])] (m [("up", rel 3 ["top"])])), ("top", int 1)], dm []),
    ([], m [("s", ms [] (m [("v", rel 2 ["x"])]))], dm [("s", dm [("a", dm [])])]),
    ([], m [("s", ms [] (m [("v", rel 2 ["x"])]))], dm []),
    ([], m [("s", ms [("b", m [])] (m [("v", rel 3 ["x"])]))], dm []),
    ([], m [("s", ms [] (m [("k", .keyUp 1)]))], dm [("s", dm [("a", dm [])])]),
    ([], m [("s", ms [] (m [("k", .keyUp 1)]))], dm [("s", dm [("a", dm [("k", .str "b")])])]),
    ([], m [("s", ms [("a", m [])] (m [("k", .keyUp 1)]))], dm []),
    ([], m [("s", ms [] (m [("k", .keyUp 2)]))], dm [("s", dm [("a", dm [("k", .str "s")])])]),
    ([], m [("s", ms [] (m [("w", m [("k", .keyUp 2)])]))], dm [("s", dm [("a", dm [("w", dm [("k", .str "b")])])])]),
    ([], m [("l", ls [] (m [("i", .keyUp 1)]))], dm [("l", .list [dm [], dm []])]),
    ([], m [("s", ms [] (rel 1 ["x"]))], dm [("s", dm [("a", j 1)])]),
    ([], m [("s", ms [] (rel 2 ["x"])), ("x", int 1)], dm [("s", dm [("a", j 2)])]),
    ([], m [("s", ms [] (rel 2 ["x"]))], dm []),
    ([], m [("s", ms [] (.meet (int 1) (rel 1 ["x"]))), ("x", int 1)], dm []),
    ([], m [("s", ms [] (m [("z", p ["nosuch"])]))], dm []),
    ([], m [("s", ms [] (m [("z", p ["nosuch"])]))], dm [("s", dm [("a", dm [])])]),
    ([], m [("s", ms [("a", m [])] (m [("z", p ["nosuch"])]))], dm []),
    ([], m [("T", ms [] h1), ("x", p ["T"])], dm [("x", dm [("a", dm [("name", .str "n"), ("h", .str "m")])])]),
    ([], m [("T", ms [] h1), ("x", p ["T"])], dm [("x", dm [("a", dm [("name", .str "n")])])]),
    ([], m [("T", ms [] (m [("z", p ["y"])])), ("y", int 1), ("x", p ["T"])], dm [("x", dm [("a", dm [("z", j 2)])])]),
    ([], m [("T", ms [("a", m [("name", str "t")])] h1), ("x", p ["T"])], dm [("x", dm [("a", dm [("h", .str "u")])])]),
    ([], m [("T", ms [("a", m [])] h1), ("x", p ["T"])], dm []),
    ([], m [("s", ms [("a", m [("name", str "n")])] nestedF)],
      dm [("s", dm [("a", dm [("w", dm [("f", dm [("h", .str "m")])])])])]),
    ([], m [("s", ms [("a", m [("name", str "n")])] nestedF)], dm []),
    ([], m [("s", ms [] nested)], dm [("s", dm [("a", dm [("name", .str "x"), ("w", dm [("b", dm [])])])])]),
    ([], m [("s", ms [("a", m [("w", m [("b", m [])])])] nested)], dm []),
    ([], m [("s", .meet (ms [] host) (m [("a", m [("name", str "x")])]))], dm [("s", dm [("a", dm [("host", .str "y")])])]),
    ([], copied, dm [("outer", dm [("t", dm [("a", j 2)])])]),
    ([], copied, dm [("outer", dm [("t", dm [("a", j 1)])])]),
    ([], m [("T", bare), ("outer", m [("x", int 2), ("t", p ["T"])])], dm []),
    ([], m [("x", int 1), ("T", ls [] (rel 2 ["x"])), ("outer", m [("x", int 2), ("t", p ["T"])])],
      dm [("outer", dm [("t", .list [j 2])])]),
    ([], copiedNo, dm []),
    ([], copiedNo, dm [("outer", dm [("t", dm [("a", j 2)])])]),
    ([], built, dm [("s", dm [("m", dm [("copy", dm [("a", dm [("h", .str "y")])])])])]),
    ([], built, dm [("s", dm [("m", dm [("copy", dm [("a", dm [("h", .str "x")])])])])]),
    ([], linked (m [("host", p ["global"])]) named [("global", str "x")], dm [("s", dm [("a", dm [("host", .str "y")])])]),
    ([], linked (m [("host", p ["global"])]) named [("global", str "x")], dm [("s", dm [("a", dm [("host", .str "x")])])]),
    ([], linked (m [("host", rel 3 ["g"])]) named [("g", str "x")], dm [("s", dm [("a", dm [("host", .str "y")])])]),
    ([], linked host (m [("a", m [])]) [], dm []),
    ([], inCopy, dm [("s", dm [("m", dm [("copy", dm [("a", dm [("name", .str "n"), ("h", .str "z")])])])])]),
    ([("T", bare)], m [("x", int 1), ("a", .alias "T")], dm [("a", dm [("m", j 2)])]),
    ([("T", bare)], m [("a", .alias "T")], dm [])]

theorem spreadCases_checkable : ∀ c ∈ spreadCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem spread_verdict_exact : ∀ c ∈ spreadCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (spreadCases_checkable c hc).1 (spreadCases_checkable c hc).2 v

/-- Sources loaded in place, each a file of `test/spec/files` the case
declares as a term: an aontu source at the root, alone and met with a
map, and under a key, beside data that agrees and data that doesn't; a
source met with a map that refuses it; a source that names nothing; a
JSON map and text under a key; a cycle of sources; an extension no
source may be loaded with; a chain of sources, each read from the one
before it; a path in a source loaded at the root and in one loaded
under a key; a spread in a source met with a map; a JSON list met with
a map at the root; and the extension supplied. -/
def loadCases : List (Decls × Val × Data) :=
  let files : Decls :=
    [("@" ++ fx "foo.aontu", m [("f", int 11)]),
      ("@" ++ fx "car.aontu", m [("color", str "silver"), ("doors", int 4)]),
      ("@" ++ fx "refs.aontu", m [("a", m [("x", int 1)]), ("b", p ["a", "x"])]),
      ("@" ++ fx "spread.aontu", ms [("one", m []), ("two", m [])] (m [("active", .lit (.bool true))])),
      ("@" ++ fx "nest_parent.aontu", m [("a", int 1), ("child", ld "./nest_child.aontu")]),
      ("@" ++ fx "nest_child.aontu", m [("b", int 2), ("grand", ld "./nest_grand.aontu")]),
      ("@" ++ fx "nest_grand.aontu", m [("c", int 3)]),
      ("@" ++ fx "cycle_a.aontu", m [("x", ld "./cycle_b.aontu")]),
      ("@" ++ fx "cycle_b.aontu", m [("y", ld "./cycle_b.aontu"), ("z", ld "./cycle_a.aontu")]),
      ("@" ++ fx "vocab.json", (Data.map [("a", j 1), ("b", .map [("c", j 2)])]).term),
      ("@" ++ fx "list.json", (Data.list [.str "a", j 1, .bool true]).term),
      ("@" ++ fx "notes.txt", str "These are notes, not a document.\n"),
      ("@" ++ fx "defload/up.aontu", m [("x", ld "../foo.aontu")]),
      ("@" ++ fx "defload/bare.aontu", m [("x", ld "deep/leaf")]),
      ("@" ++ fx "defload/deep/leaf.aontu", m [("l", int 1)])]
  [(files, ld (fx "foo.aontu"), dm []),
    (files, ld (fx "foo.aontu"), dm [("f", j 12)]),
    (files, .meet (ld (fx "foo.aontu")) (m [("c", int 3)]), dm []),
    (files, m [("a", ld (fx "foo.aontu"))], dm [("a", dm [("f", j 11)])]),
    (files, m [("a", ld (fx "foo.aontu"))], dm [("a", dm [("f", j 12)])]),
    (files, m [("car", .meet (ld (fx "car.aontu")) (m [("wheels", int 4)]))], dm []),
    (files, m [("car", .meet (ld (fx "car.aontu")) (m [("doors", int 5)]))], dm []),
    (files, m [("a", ld "nope-no-such-file")], dm []),
    (files, m [("x", ld (fx "vocab.json"))], dm [("x", dm [("a", j 2)])]),
    (files, m [("x", ld (fx "vocab.json"))], dm []),
    (files, m [("x", ld (fx "notes.txt"))], dm [("x", .str "other")]),
    (files, m [("x", ld (fx "notes.txt"))], dm []),
    (files, ld (fx "cycle_a.aontu"), dm []),
    (files, m [("x", ld (fx "conf.csv"))], dm []),
    (files, ld (fx "nest_parent.aontu"), dm [("child", dm [("b", j 3)])]),
    (files, ld (fx "nest_parent.aontu"), dm []),
    (files, ld (fx "refs.aontu"), dm [("b", j 2)]),
    (files, m [("r", ld (fx "refs.aontu"))], dm []),
    (files, .meet (ld (fx "spread.aontu")) (m [("three", m [])]), dm [("three", dm [("active", .bool false)])]),
    (files, .meet (ld (fx "list.json")) (m [("x", int 1)]), dm []),
    (files, m [("x", ld (fx "foo"))], dm []),
    (files, ld (fx "defload/up.aontu"), dm []),
    (files, ld (fx "defload/up.aontu"), dm [("x", dm [("f", j 12)])]),
    (files, ld (fx "defload/bare.aontu"), dm []),
    (files, ld (fx "defload/bare.aontu"), dm [("x", dm [("l", j 2)])]),
    (files, m [("x", .select (int 1) [(int 1, int 7)] (some (ld "./missing.aontu")))], dm []),
    (files, m [("x", ld "foo.aontu")], dm [])]

theorem loadCases_checkable : ∀ c ∈ loadCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem load_verdict_exact : ∀ c ∈ loadCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (loadCases_checkable c hc).1 (loadCases_checkable c hc).2 v

/-- Sources that declare names of their own, each source read in its own
scope (`Decls.ofSource`): a source whose name its own body uses, loaded
alone and beside a document that names it, which can't read it; a
source that names a name only the document declares, which it can't
read; two sources that declare one name, which stay two names; a
source whose name loads a source from its own directory; a source
whose name names nothing, which only a document that loads it is an
error for; and a document that declares the name a source it loads at
the root declares, which stays the document's and never meets the
source's. -/
def scopeCases : List (Decls × Val × Data) :=
  let files : Decls :=
    Decls.ofSource (fx "alias_declares_u.aontu") [("u", int 7)] (m [("y", int 1)]) ++
    Decls.ofSource (fx "alias_uses_t.aontu") [] (m [("x", .alias "t")]) ++
    Decls.ofSource (fx "alias_row_a.aontu") [("row", m [("kind", .string)])]
      (m [("a", .meet (.alias "row") (m [("kind", str "x")]))]) ++
    Decls.ofSource (fx "alias_row_b.aontu") [("row", m [("extra", .pref 1 (int 9))])]
      (m [("b", .meet (.alias "row") (m [("kind", str "y")]))]) ++
    Decls.ofSource (fx "alias_sigil.aontu") [("b", .meet .integer (.min (.num (.integer ⟨1, by decide⟩))))]
      (m [("q", .meet (.alias "b") (int 7))]) ++
    Decls.ofSource (fx "defload/alias_loads.aontu") [("t", ld "./deep/leaf.aontu")] (m [("y", .alias "t")]) ++
    [("@" ++ fx "defload/deep/leaf.aontu", m [("l", int 1)])] ++
    Decls.ofSource (fx "alias_stray.aontu") [("s", .alias "nowhere")] (m [("y", int 1)])
  [(files, ld (fx "alias_declares_u.aontu"), dm []),
    (files, .meet (ld (fx "alias_declares_u.aontu")) (m [("z", .alias "u")]), dm []),
    (("t", int 42) :: files, m [("inner", ld (fx "alias_uses_t.aontu"))], dm []),
    (files, .meet (ld (fx "alias_row_a.aontu")) (ld (fx "alias_row_b.aontu")), dm []),
    (files, .meet (ld (fx "alias_row_a.aontu")) (ld (fx "alias_row_b.aontu")), dm [("a", dm [("extra", .str "s")])]),
    (files, .meet (ld (fx "alias_sigil.aontu")) (m [("x", int 1)]), dm []),
    (files, .meet (ld (fx "alias_sigil.aontu")) (m [("x", int 1)]), dm [("q", j 0)]),
    (files, ld (fx "defload/alias_loads.aontu"), dm []),
    (files, ld (fx "defload/alias_loads.aontu"), dm [("y", dm [("l", j 2)])]),
    (files, ld (fx "alias_stray.aontu"), dm []),
    (("b", int 5) :: files, ld (fx "alias_sigil.aontu"), dm []),
    (("b", .string) :: files, ld (fx "alias_sigil.aontu"), dm []),
    (("b", .string) :: files, ld (fx "alias_sigil.aontu"), dm [("q", j 0)])]

theorem scopeCases_checkable : ∀ c ∈ scopeCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem scope_verdict_exact : ∀ c ∈ scopeCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (scopeCases_checkable c hc).1 (scopeCases_checkable c hc).2 v

/-- Names a source publishes, `export({ %a })`, and the destructures
that take them, `{ %a } = @"p"`: a name taken by its own name, all of a
source's names at once, and under another name; at the top and under a
key, where the source's values land while its names are the document's;
beside a declaration of the same name, which it meets; beside data that
refuses it; a name the source declares but doesn't publish, used and
not, one it publishes but declares only through a load, and one it
never declares, each an error; a destructure under a rider, in a spread
and under a preference, which binds its names as at a key, and an
unexported name under a rider at the top, an error; and every name of a source
that publishes one it doesn't declare, an error, beside the source
loaded alone. -/
def takeCases : List (Decls × Val × Data) :=
  let take (s : String) (names : List String) : Val := .call .load (.lit (.str (fx s)) :: names.map str)
  let files : Decls :=
    Decls.ofSource (fx "alias_exports.aontu") [("uint8", int 255), ("secret", str "shh")]
      (m [("defaults", m [("retries", int 3)])]) ["uint8"] ++
    Decls.ofSource (fx "alias_exports_used.aontu")
      [("port", .meet (.meet .integer (.min (.num (.integer ⟨1, by decide⟩))))
        (.max (.num (.integer ⟨65535, by decide⟩))))]
      (m [("listen", .meet (.alias "port") (int 8080))]) ["port"] ++
    Decls.ofSource (fx "alias_reexport.aontu") [] (ld "./alias_declares_u.aontu") ["u"] ++
    Decls.ofSource (fx "alias_declares_u.aontu") [("u", int 7)] (m [("y", int 1)])
  [(files, .meet (take "alias_exports.aontu" ["uint8", "uint8"]) (m [("a", .alias "uint8")]), dm []),
    (files, .meet (take "alias_exports.aontu" ["uint8", "uint8"]) (m [("a", .alias "uint8")]), dm [("a", j 254)]),
    (files, .meet (take "alias_exports.aontu" ["%"]) (m [("a", .alias "uint8")]), dm []),
    (files, .meet (take "alias_exports.aontu" ["u8", "uint8"]) (m [("a", .alias "u8")]), dm []),
    (files, m [("svc", take "alias_exports.aontu" ["uint8", "uint8"]), ("a", .alias "uint8")],
      dm [("svc", dm [("defaults", dm [("retries", j 3)])])]),
    (files, m [("svc", take "alias_exports_used.aontu" ["port", "port"]), ("a", .meet (.alias "port") (int 443))], dm []),
    (files, m [("svc", take "alias_exports_used.aontu" ["port", "port"]), ("a", .alias "port")], dm [("a", j 0)]),
    (("uint8", .integer) :: files,
      .meet (take "alias_exports.aontu" ["uint8", "uint8"]) (m [("a", .alias "uint8")]), dm []),
    (("uint8", .integer) :: files,
      .meet (take "alias_exports.aontu" ["uint8", "uint8"]) (m [("a", .alias "uint8")]), dm [("a", j 7)]),
    (files, .meet (take "alias_exports.aontu" ["secret", "secret"]) (m [("a", .alias "secret")]), dm []),
    (files, take "alias_exports.aontu" ["secret", "secret"], dm []),
    (files, .meet (take "alias_reexport.aontu" ["u", "u"]) (m [("a", .alias "u")]), dm []),
    (files, .meet (take "alias_exports.aontu" ["nosuch", "nosuch"]) (m [("a", .alias "nosuch")]), dm []),
    (files, m [("a", .ride .type (take "alias_exports.aontu" ["uint8", "uint8"]) []), ("b", .alias "uint8")], dm []),
    (files, .ride .type (take "alias_exports.aontu" ["secret", "secret"]) [], dm []),
    (files, m [("a", .map [] (some (take "alias_exports.aontu" ["uint8", "uint8"])) false), ("b", .alias "uint8")],
      dm []),
    (files, m [("a", .pref 1 (take "alias_exports.aontu" ["uint8", "uint8"])), ("b", .alias "uint8")], dm []),
    (files, take "alias_reexport.aontu" ["%"], dm []),
    (files, ld (fx "alias_reexport.aontu"), dm [])]

theorem takeCases_checkable : ∀ c ∈ takeCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem take_verdict_exact : ∀ c ∈ takeCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (takeCases_checkable c hc).1 (takeCases_checkable c hc).2 v

/-- A destructure a declaration's body writes, `%B = {inner: { %a } =
@"p"}`, which binds its names for the document as one at the top does,
whether or not anything uses the body: used, with the data it admits
and refuses, and none; unused; a name taken under another; and a name
the source doesn't publish, an error whether or not the body is used,
as every declaration is read. Then a destructure a source writes, in
the source's own scope: the source loaded alone, with the data it
admits and refuses, beside a member, and beside a second source that
takes the same name. -/
def bodyTakeCases : List (Decls × Val × Data) :=
  let take (s : String) (names : List String) : Val := .call .load (.lit (.str (fx s)) :: names.map str)
  let taking (k : String) : Val :=
    .meet (.call .load (.lit (.str "./alias_exports.aontu") :: ["uint8", "uint8"].map str))
      (m [(k, .alias "uint8")])
  let files : Decls :=
    Decls.ofSource (fx "alias_exports.aontu") [("uint8", int 255), ("secret", str "shh")]
      (m [("defaults", m [("retries", int 3)])]) ["uint8"] ++
    Decls.ofSource (fx "alias_takes.aontu") [] (taking "y") ++
    Decls.ofSource (fx "alias_takes_b.aontu") [] (taking "v")
  let body (names : List String) : Decls := ("B", m [("inner", take "alias_exports.aontu" names)]) :: files
  [(body ["uint8", "uint8"], m [("v", .alias "B"), ("y", .alias "uint8")], dm [("y", j 255)]),
    (body ["uint8", "uint8"], m [("v", .alias "B"), ("y", .alias "uint8")], dm [("y", j 1)]),
    (body ["uint8", "uint8"], m [("v", .alias "B"), ("y", .alias "uint8")], dm []),
    (body ["uint8", "uint8"], m [("y", .alias "uint8")], dm [("y", j 255)]),
    (body ["p", "uint8"], m [("v", .alias "B"), ("y", .alias "p")], dm [("y", j 255)]),
    (body ["p", "uint8"], m [("v", .alias "B"), ("y", .alias "p")], dm [("y", j 1)]),
    (body ["secret", "secret"], m [("v", .alias "B")], dm []),
    (body ["secret", "secret"], m [("z", int 1)], dm []),
    (files, ld (fx "alias_takes.aontu"), dm [("y", j 255)]),
    (files, ld (fx "alias_takes.aontu"), dm [("y", j 1)]),
    (files, .meet (ld (fx "alias_takes.aontu")) (m [("w", int 4)]), dm []),
    (files, .meet (ld (fx "alias_takes.aontu")) (ld (fx "alias_takes_b.aontu")), dm [])]

theorem bodyTakeCases_checkable : ∀ c ∈ bodyTakeCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem body_take_verdict_exact : ∀ c ∈ bodyTakeCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (bodyTakeCases_checkable c hc).1 (bodyTakeCases_checkable c hc).2 v

/-- Module imports, each the source the calling program supplies for
the import as written (ruling 47), over the projects of
`test/spec/files` whose `main.aontu` imports one: a package path, its
lock and its default entry among them, beside data that agrees and data
that doesn't; a pinned import; two versions of one package, the second
under an alias; a path with an uppercase step; and a module that
declares names of its own, publishes one, and loads a file from its own
directory, whose names the project can't read. Where the tools resolve
nothing, a module never fetched, a pin or a lock that disagrees, a
package that moved, the program supplies no source, so the document is
an error, as it is for a module that imports itself. -/
def moduleCases : List (Decls × Val × Data) :=
  let pref (v : Val) : Val := .or [(1, v), (0, .integer)]
  let svc (port : Val) : Val := m [("name", .string), ("port", pref port)]
  let sv := "corp.example/schemas/service"
  let pin := sv ++ "#aon1-oQs6Ng6XxP2FHQGTYescREGDrDPfLLW1Liq4OS8Gs2E"
  let named (imp : String) : Val := .meet (ld imp) (m [("name", str "auth")])
  let file (f : String) (t : Val) : Decls := [("@" ++ fx f, t)]
  let mdl (q : String) (t : Val) : Decls := [("@" ++ q ++ "/", t)]
  let proj (d : String) : Decls := file (d ++ "/main.aontu") (m [("svc", named sv)]) ++ mdl sv (svc (int 8080))
  let alias : Decls :=
    file "modalias/main.aontu" (m [("svc", named sv), ("legacy", named "alias:legacy")]) ++
      mdl sv (svc (int 9090)) ++ mdl "alias:legacy" (svc (int 8080))
  let wide : Decls :=
    file "modcase/main.aontu" (m [("w", .meet (ld "corp.example/Widgets") (m [("count", int 3)]))]) ++
      mdl "corp.example/Widgets" (m [("kind", str "widget"), ("count", pref (int 1))])
  let defs : Decls :=
    Decls.ofSource "corp.example/defs/"
      [("port", .meet .integer (.min (.num (.integer ⟨1, by decide⟩)))), ("hidden", int 7)]
      (m [("listen", .alias "port"), ("part", ld "./part.aontu")]) ["port"] ++
    [("@corp.example/defs/part.aontu", m [("retries", pref (int 3))])] ++
    file "moddefs/main.aontu" (.meet (ld "corp.example/defs") (m [("listen", int 8080)])) ++
    Decls.ofSource (fx "moddefs/scope.aontu") [] (.meet (ld "corp.example/defs") (m [("z", .alias "hidden")]))
  [(proj "modproj", ld (fx "modproj/main.aontu"), dm []),
    (proj "modproj", ld (fx "modproj/main.aontu"), dm [("svc", dm [("port", j 9090)])]),
    (proj "modproj", ld (fx "modproj/main.aontu"), dm [("svc", dm [("port", .str "x")])]),
    (proj "modproj", ld (fx "modproj/main.aontu"), dm [("svc", dm [("name", .str "other")])]),
    (proj "modlock", ld (fx "modlock/main.aontu"), dm []),
    (proj "modnomain", ld (fx "modnomain/main.aontu"), dm [("svc", dm [("port", j 1)])]),
    (file "modfree/main.aontu" (m [("svc", named pin)]) ++ mdl pin (svc (int 8080)),
      ld (fx "modfree/main.aontu"), dm [("svc", dm [("port", j 1)])]),
    (alias, ld (fx "modalias/main.aontu"), dm []),
    (alias, ld (fx "modalias/main.aontu"), dm [("legacy", dm [("port", j 9090)])]),
    (alias, ld (fx "modalias/main.aontu"), dm [("legacy", dm [("port", .str "x")])]),
    (wide, ld (fx "modcase/main.aontu"), dm [("w", dm [("count", j 3)])]),
    (wide, ld (fx "modcase/main.aontu"), dm [("w", dm [("count", j 4)])]),
    (defs, ld (fx "moddefs/main.aontu"), dm []),
    (defs, ld (fx "moddefs/main.aontu"), dm [("listen", j 0)]),
    (defs, ld (fx "moddefs/main.aontu"), dm [("part", dm [("retries", j 5)])]),
    (defs, ld (fx "moddefs/main.aontu"), dm [("part", dm [("retries", .str "x")])]),
    (defs, ld (fx "moddefs/scope.aontu"), dm []),
    (file "modmiss/main.aontu" (m [("svc", ld "corp.example/schemas/absent")]), ld (fx "modmiss/main.aontu"), dm []),
    (file "modpin/main.aontu" (m [("svc", ld (sv ++ "#aon1-wrongwrongwrongwrongwrongwrongwrongwrong"))]),
      ld (fx "modpin/main.aontu"), dm []),
    (file "modbad/main.aontu" (m [("svc", named sv)]), ld (fx "modbad/main.aontu"), dm []),
    (file "modmoved/main.aontu" (m [("svc", ld sv)]), ld (fx "modmoved/main.aontu"), dm []),
    (file "modself/main.aontu" (m [("svc", ld "corp.example/loop/self")]) ++
      mdl "corp.example/loop/self" (m [("x", ld "corp.example/loop/self")]), ld (fx "modself/main.aontu"), dm [])]

theorem moduleCases_checkable : ∀ c ∈ moduleCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem module_verdict_exact : ∀ c ∈ moduleCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (moduleCases_checkable c hc).1 (moduleCases_checkable c hc).2 v

/-- The transformer `emit` in a document with paths: a selection a path
names, and a body that reads the node and the root, beside data that
agrees and data that refuses. -/
def emitPathCases : List (Decls × Val × Data) :=
  let rule (mt : Val) (b : List Val) : Val := m [("match", mt), ("body", l b)]
  let sel := l [m [("k", str "sqs"), ("p", str "x")], m [("k", str "http"), ("u", str "/y")]]
  let table := l [rule (m [("k", str "sqs")]) [.call .plus [str "L:", nd ["p"]]],
    rule (m [("k", str "http")]) [.call .plus [str "S:", nd ["u"]]]]
  [([], m [("s", sel), ("o", .call .emit [p ["s"], table])], dm []),
    ([], m [("s", sel), ("o", .call .emit [p ["s"], table])], dm [("o", .list [.str "L:x", .str "S:/y"])]),
    ([], m [("s", sel), ("o", .call .emit [p ["s"], table])], dm [("o", .list [.str "x"])]),
    ([], m [("z", str "Z"), ("s", sel), ("o", .call .emit [p ["s"], rule (m [("k", .string)]) [p ["z"], nd ["k"]]])],
      dm [])]

theorem emitPathCases_checkable : ∀ c ∈ emitPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem emitPath_verdict_exact : ∀ c ∈ emitPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (emitPathCases_checkable c hc).1 (emitPathCases_checkable c hc).2 v

/-- The transformer `emit` over the members a `filter` keeps, beside
data that agrees and data that refuses. -/
def emitFilterCases : List (Decls × Val × Data) :=
  let sel := l [m [("k", str "sqs"), ("p", str "x")], m [("k", str "http"), ("u", str "/y")]]
  let o := .call .emit [.filter (p ["s"]) (m [("k", str "sqs")]),
    m [("match", m [("k", .string)]), ("body", l [nd ["p"]])]]
  [([], m [("s", sel), ("o", o)], dm [("o", .list [.str "x"])]),
    ([], m [("s", sel), ("o", o)], dm [("o", .list [.str "y"])])]

/-- The checker can't read a `filter` before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem emitFilterCases_reads : ∀ c ∈ emitFilterCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem emitFilter_verdict_exact : ∀ c ∈ emitFilterCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (emitFilterCases_reads c hc) v

/-- Generators whose templates read their member's place through a
relative path, each read at each member of the generator's output:
`each` and `pack` over a list a path names, beside data that refuses
what the path reads, a path that names nothing, an empty source, a path
that climbs out of the instance, `key(1)` beside a path, a path inside
a call, a spread inside the template, and a generator inside another. -/
def genTemplateCases : List (Decls × Val × Data) :=
  let ms (fs : List (String × Val)) (sp : Val) : Val := .map (fs.map fun f => (f.1, false, f.2)) (some sp) false
  let each (d t : Val) : Val := .call .each [d, t]
  let pack (d t : Val) : Val := .call .pack [d, t]
  let named := m [("n", .hole), ("u", rel 1 ["n"])]
  let url := m [("n", .hole), ("u", .call .plus [str "https://", rel 1 ["n"]])]
  let keyed := m [("k", .keyUp 1), ("u", rel 1 ["k"])]
  let spread := m [("n", .hole), ("s", ms [("x", m [])] (m [("h", rel 3 ["n"])]))]
  let nested (u : Val) := m [("n", .hole), ("f", each (l [str "p"]) (m [("m", .hole), ("u", u)]))]
  [([], m [("l", l [str "a", str "b"]), ("e", each (p ["l"]) named)], dm []),
    ([], m [("l", l [str "a", str "b"]), ("e", each (p ["l"]) named)], dm [("e", .list [dm [("n", .str "a"), ("u", .str "z")]])]),
    ([], m [("l", l [str "a", str "b"]), ("e", each (p ["l"]) (m [("n", .hole), ("u", rel 1 ["m"])]))], dm []),
    ([], m [("l", l []), ("e", each (p ["l"]) (m [("n", .hole), ("u", rel 1 ["m"])]))], dm []),
    ([], m [("l", l [str "a", str "b"]), ("x", int 9), ("e", each (p ["l"]) (m [("n", .hole), ("v", rel 3 ["x"])]))],
      dm [("e", .list [dm [("v", j 8)]])]),
    ([], m [("s", m [("x", int 5), ("e", each (l [str "a"]) (m [("v", rel 3 ["x"])]))])], dm [("s", dm [("e", .list [dm [("v", j 6)]])])]),
    ([], m [("l", l [str "a"]), ("e", pack (p ["l"]) keyed)], dm []),
    ([], m [("l", l [str "a"]), ("e", pack (p ["l"]) keyed)], dm [("e", dm [("a", dm [("u", .str "b")])])]),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) (m [("n", .hole), ("w", m [("k", rel 2 ["n"])])]))],
      dm [("e", .list [dm [("w", dm [("k", .str "b")])]])]),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) url)], dm [("e", .list [dm [("u", .str "https://a")]])]),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) url)], dm [("e", .list [dm [("u", .str "http://a")]])]),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) spread)], dm []),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) spread)], dm [("e", .list [dm [("s", dm [("x", dm [("h", .str "z")])])]])]),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) (nested (rel 3 ["n"])))], dm [("e", .list [dm [("f", .list [dm [("u", .str "z")]])]])]),
    ([], m [("l", l [str "a"]), ("e", each (p ["l"]) (nested (rel 1 ["m"])))], dm [("e", .list [dm [("f", .list [dm [("u", .str "z")]])]])])]

theorem genTemplateCases_checkable : ∀ c ∈ genTemplateCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem genTemplate_verdict_exact : ∀ c ∈ genTemplateCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (genTemplateCases_checkable c hc).1 (genTemplateCases_checkable c hc).2 v

/-- A spread whose template reads its member's place, inside a
generator's template, read at each member of each instance: a member's
own sibling, `key(1)`, a path that climbs out of the member to the
instance, a list's spread met with a list, and `pack` with `key(3)`,
each over no data, over data the template takes, over data whose
written member it refuses, and over a member the data adds, which the
spread reads as it reads a written one. -/
def spreadGenCases : List (Decls × Val × Data) :=
  let ms (fs : List (String × Val)) (sp : Val) : Val := .map (fs.map fun f => (f.1, false, f.2)) (some sp) false
  let rel (n : ℕ) (k : String) : Val := .path [.up n, .key k]
  let doc (g : Val) : Val := m [("d", l [int 1, int 2]), ("x", g)]
  let each (t : Val) : Val := .call .each [.path [.key "d"], t]
  let named := each (m [("h", ms [("p", m [("name", str "x")])] (m [("name", .string), ("url", rel 1 "name")]))])
  let keyed := each (m [("v", .hole), ("h", ms [("p", m []), ("q", m [])] (m [("k", .keyUp 1)]))])
  let climb := each (m [("v", .hole), ("h", ms [("p", m [])] (m [("w", rel 3 "v")]))])
  let listed := each (m [("v", .hole),
    ("h", .meet (l [m [("n", str "x")], m []]) (.list [] (some (m [("m", rel 3 "v")])) false))])
  let packed := m [("d", m [("a", int 1), ("b", int 2)]),
    ("x", .call .pack [.path [.key "d"], m [("v", .hole), ("h", ms [("p", m [])] (m [("w", rel 3 "v"), ("k", .keyUp 3)]))]])]
  let hp (u : String) : Data := dm [("p", dm [("name", ds "x"), ("url", ds u)])]
  let hr (u : String) : Data := dm [("p", dm [("name", ds "x"), ("url", ds "x")]), ("r", dm [("name", ds "z"), ("url", ds u)])]
  let cv (w : Data) : Data := dm [("x", dl [dm [("v", j 1), ("h", dm [("p", dm [("w", w)])])], dm [("v", j 2), ("h", dm [("p", dm [("w", j 2)])])]])]
  [([], doc named, dm []),
    ([], doc named, dm [("x", dl [dm [("h", hp "x")], dm [("h", hp "x")]])]),
    ([], doc named, dm [("x", dl [dm [("h", hp "x")], dm [("h", hp "y")]])]),
    ([], doc named, dm [("x", dl [dm [("h", hr "w")], dm [("h", hp "x")]])]),
    ([], doc named, dm [("x", dl [dm [("h", hr "z")], dm [("h", hp "x")]])]),
    ([], doc keyed, dm []),
    ([], doc keyed, dm [("x", dl [dm [("v", j 1), ("h", dm [("p", dm [("k", ds "q")])])]])]),
    ([], doc climb, dm []),
    ([], doc climb, cv (j 1)),
    ([], doc climb, cv (j 2)),
    ([], doc climb, dm [("x", dl [dm [("v", j 1), ("h", dm [("p", dm [("w", j 1)]), ("r", dm [("w", j 2)])])]])]),
    ([], doc listed, dm []),
    ([], doc listed, dm [("x", dl [dm [("v", j 1), ("h", dl [dm [("n", ds "x"), ("m", j 2)], dm [("m", j 1)]])]])]),
    ([], packed, dm []),
    ([], packed, dm [("x", dm [("a", dm [("v", j 1), ("h", dm [("p", dm [("w", j 1), ("k", ds "b")])])])])])]

theorem spreadGenCases_checkable : ∀ c ∈ spreadGenCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem spread_gen_verdict_exact : ∀ c ∈ spreadGenCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (spreadGenCases_checkable c hc).1 (spreadGenCases_checkable c hc).2 v

/-- `nil` as a document writes it (`Val.void`, ruling 54): an optional
member holding it, which must be absent, and a required one, which
can't be met; the same met with a value in one member and through two
maps met, with a kind, a list's element, a spread's template, an arm of
a disjunction, a container met with it, a conflict it takes in, a
reference to a member holding it, an atom over an argument outside its
domain it takes in, and the same under `type()`; a conflict alone,
still an error; and a preference over it, `*nil`, which reads as
`nil | super(nil)` and holds no value, as `nil | nil` holds none, both
required and optional, met with a value, and the preferred arm of a
disjunction, which drops. A bound over it beside a choice is still an
error, as a choice is no bound's argument, written alone or in a list;
a trial over it refuses what it meets, beside a choice, and under a
bound or a size in its argument. A bound over it alone admits nothing,
as one over an argument outside its domain does: each bound, `neq`
beside a number and over a list, met with a value, and met with a kind,
where the meet is dead; and a bound over a conflict, still an error. A
disjunction a written `nil` leaves with one arm is that arm under a
bound, as a size reads it (ruling 55): either way round, met with a
value, in `neq` and in its list, through a path, at an optional key and
preferred; and `nil | nil`, which leaves none, is still an error.
Last, a bound, a size or a trial over it that no data meets: absent at
an optional key, and waiting at a required one; and an arm that holds
one, which refuses, so the disjunction admits what its other arm
admits, in a map either way round and in a list, which both ports read
otherwise (#907). -/
def writtenNilCases : List (Decls × Val × Data) :=
  let nl := Val.void
  let ch := Val.or [(0, int 1), (0, int 2)]
  [([], mo [("x", true, nl)], dm []),
    ([], mo [("x", true, nl)], dm [("x", j 1)]),
    ([], mo [("x", true, nl)], dm [("x", .null)]),
    ([], mo [("x", false, nl)], dm []),
    ([], mo [("x", false, nl)], dm [("x", j 1)]),
    ([], mo [("x", true, .meet nl (int 1))], dm []),
    ([], m [("y", .meet (mo [("x", true, nl)]) (mo [("x", true, int 1)]))], dm [("y", dm [])]),
    ([], m [("y", .meet (mo [("x", true, nl)]) (mo [("x", true, int 1)]))], dm [("y", dm [("x", j 1)])]),
    ([], m [("y", .meet (mo [("x", true, nl)]) (mo [("x", false, int 1)]))], dm [("y", dm [])]),
    ([], m [("y", .meet (mo [("x", true, nl)]) (mo [("x", true, .number)]))], dm [("y", dm [])]),
    ([], m [("x", .list [nl] none false)], dm []),
    ([], m [("x", .list [int 1, nl] none false)], dm []),
    ([], m [("x", .map [] (some nl) false)], dm []),
    ([], m [("x", .map [] (some nl) false)], dm [("x", dm [("a", j 1)])]),
    ([], m [("x", .or [(0, nl), (0, int 1)])], dm []),
    ([], mo [("x", true, .or [(0, nl), (0, int 1)])], dm [("x", j 1)]),
    ([], m [("x", .meet (m [("a", int 1)]) nl)], dm []),
    ([], mo [("x", true, .meet (m [("a", int 1)]) nl)], dm []),
    ([], mo [("x", true, .meet nl .number)], dm [("x", j 1)]),
    ([], mo [("x", true, .meet nl (.meet (int 1) (int 2)))], dm []),
    ([], mo [("x", true, .meet (int 1) (int 2))], dm []),
    ([], m [("y", mo [("x", true, nl)]), ("z", .path [.key "y"])], dm []),
    ([], m [("y", mo [("x", true, nl)]), ("z", .path [.key "y"])], dm [("z", dm [("x", j 1)])]),
    ([], mo [("x", true, .meet nl (.len .any))], dm []),
    ([], mo [("x", true, .meet nl (.len .any))], dm [("x", j 1)]),
    ([], mo [("x", true, .meet (.len .any) nl)], dm []),
    ([], mo [("x", false, .meet nl (.len .any))], dm []),
    ([], mo [("x", true, .meet (.ride .type nl []) (.len .any))], dm []),
    ([], mo [("x", true, .meet (.ride .type nl []) (.meet (int 1) (int 2)))], dm []),
    ([], mo [("x", true, .ride .type nl [])], dm [("x", j 1)]),
    ([], m [("x", .pref 1 nl)], dm []),
    ([], mo [("x", true, .pref 1 nl)], dm []),
    ([], m [("x", .or [(0, nl), (0, nl)])], dm []),
    ([], mo [("x", true, .or [(0, nl), (0, nl)])], dm []),
    ([], m [("x", .meet (.pref 1 nl) (int 1))], dm [("x", j 1)]),
    ([], m [("x", .or [(1, nl), (0, int 1)])], dm [("x", j 1)]),
    ([], m [("x", .or [(1, nl), (0, int 1)])], dm []),
    ([], m [("v", bnd .neq [nl, ch])], dm [("v", j 1)]),
    ([], m [("v", bnd .neq [.list [.meet nl (int 1), ch] none false])], dm [("v", j 1)]),
    ([], m [("v", .contains ch (.meet nl (int 1)))], dm [("v", .list [j 1])]),
    ([], m [("v", .contains .any (bnd .min [.meet nl (int 1)]))], dm [("v", .list [j 1])]),
    ([], m [("v", .contains .any (.len (.meet nl (int 1))))], dm [("v", .list [j 1])]),
    ([], m [("v", .must (bnd .min [.meet nl (int 1)]) "m")], dm [("v", j 1)]),
    ([], m [("v", .must (.len (.meet nl (int 1))) "m")], dm [("v", j 1)]),
    ([], m [("v", bnd .min [nl])], dm [("v", j 1)]),
    ([], m [("v", bnd .neq [nl])], dm [("v", j 1)]),
    ([], m [("v", bnd .neq [nl, int 2])], dm [("v", j 1)]),
    ([], m [("v", bnd .neq [.list [nl, int 2] none false])], dm [("v", j 1)]),
    ([], m [("v", bnd .min [.meet nl (int 1)])], dm [("v", j 1)]),
    ([], m [("v", bnd .above [nl])], dm [("v", j 1)]),
    ([], m [("v", bnd .mulof [nl])], dm [("v", j 1)]),
    ([], m [("v", .meet .integer (bnd .below [nl]))], dm [("v", j 1)]),
    ([], m [("v", bnd .min [.meet (int 1) (int 2)])], dm [("v", j 1)]),
    ([], m [("v", bnd .min [.or [(0, nl), (0, int 1)]])], dm [("v", j 1)]),
    ([], m [("v", bnd .min [.or [(0, int 1), (0, nl)]])], dm [("v", j 1)]),
    ([], m [("v", bnd .min [.or [(0, .meet nl (int 1)), (0, int 1)]])], dm [("v", j 1)]),
    ([], m [("v", bnd .neq [.or [(0, nl), (0, int 1)]])], dm [("v", j 2)]),
    ([], m [("v", bnd .neq [.list [.or [(0, nl), (0, int 1)], int 2] none false])], dm [("v", j 3)]),
    ([], m [("a", .or [(0, nl), (0, int 1)]), ("v", bnd .min [.path [.key "a"]])], dm [("v", j 1)]),
    ([], mo [("v", true, bnd .min [.or [(0, nl), (0, int 1)]])], dm []),
    ([], m [("v", bnd .min [.or [(1, nl), (0, int 1)]])], dm [("v", j 1)]),
    ([], m [("v", bnd .min [.or [(0, nl), (0, nl)]])], dm [("v", j 1)]),
    ([], mo [("v", true, bnd .max [nl])], dm []),
    ([], mo [("v", true, .len nl)], dm []),
    ([], mo [("v", true, .must nl "m")], dm []),
    ([], m [("v", .len nl)], dm []),
    ([], mo [("v", true, bnd .neq [.list [nl, int 2] none false])], dm []),
    ([], mo [("v", true, .must (bnd .min [nl]) "m")], dm []),
    ([], m [("v", .or [(0, m [("x", int 1)]), (0, m [("x", nl)])])], dm [("v", dm [("x", j 1)])]),
    ([], m [("v", .or [(0, m [("x", nl)]), (0, m [("x", int 1)])])], dm [("v", dm [("x", j 1)])]),
    ([], m [("v", .or [(0, lst [int 1]), (0, lst [nl])])], dm [("v", .list [j 1])])]

theorem writtenNilCases_checkable : ∀ c ∈ writtenNilCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem written_nil_verdict_exact : ∀ c ∈ writtenNilCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (writtenNilCases_checkable c hc).1 (writtenNilCases_checkable c hc).2 v

/-- The `_ & …` idiom: a generator's template that meets its own hole,
so that each member is kept and met with the rest of the template, a
bound rather than a construction: a map, a kind, a preference that the
member overrides, a list and a call, on either side of the meet, in
`each` over a list and a map and in `pack`, nested, with a relative
path in the template, over an empty source, and a member the bound
refuses, an error. -/
def holeMeetCases : List (Decls × Val × Data) :=
  let each (d t : Val) : Val := .call .each [d, t]
  let pack (d t : Val) : Val := .call .pack [d, t]
  let bnd (t : Val) : Val := .meet .hole t
  let v (x : Val) : Val := m [("v", x)]
  let dv (x : Data) : Data := dm [("v", x)]
  let ports := each (l [m [("p", int 80)], m [("p", int 443)]]) (bnd (m [("protocol", str "TCP")]))
  let kinded := each (l [int 8080, int 443]) (bnd .integer)
  let dflt := each (l [m [("a", int 1)], m []]) (bnd (m [("a", .pref 1 (int 0))]))
  let vals := each (m [("y", int 2), ("x", int 1)]) (bnd .number)
  let packed := pack (m [("x", m [("n", int 1)])]) (bnd (m [("m", int 2)]))
  let relp := each (l [m [("a", int 1)]]) (bnd (m [("b", rel 1 ["a"])]))
  let lone := each (l [int 1, int 2]) (bnd (.pref 1 (int 5)))
  let none' := each (l []) (bnd .integer)
  let lists := each (l [l [int 1], l [int 2]]) (bnd (l [.integer]))
  let nested := each (l [l [int 1, int 2]]) (each .hole (bnd .integer))
  let right := each (l [m [("a", int 1)]]) (.meet (m [("b", int 2)]) .hole)
  let called := each (l [str "a", str "b"]) (.meet (.call .upper [.hole]) .string)
  [([], v ports, dv (dl [dm [("p", j 80), ("protocol", ds "TCP")], dm [("p", j 443), ("protocol", ds "TCP")]])),
    ([], v ports, dv (dl [dm [("p", j 80), ("protocol", ds "TCP")], dm [("p", j 443), ("protocol", ds "UDP")]])),
    ([], v kinded, dv (dl [j 8080, j 443])), ([], v kinded, dv (dl [j 8080, j 444])),
    ([], v (each (l [int 1, str "a"]) (bnd .integer)), dv (dl [j 1])),
    ([], v dflt, dv (dl [dm [("a", j 1)], dm [("a", j 0)]])),
    ([], v dflt, dv (dl [dm [("a", j 2)], dm [("a", j 0)]])),
    ([], v vals, dv (dl [j 1, j 2])), ([], v vals, dv (dl [j 2, j 1])),
    ([], v packed, dv (dm [("x", dm [("n", j 1), ("m", j 2)])])),
    ([], v packed, dv (dm [("x", dm [("n", j 1), ("m", j 3)])])),
    ([], v (each (l [m [("a", int 1)]]) (bnd (m [("a", int 2)]))), dv (dl [])),
    ([], v (each (l [int 1, int 3]) (bnd (.min (.num (.integer ⟨2, by decide⟩))))), dv (dl [])),
    ([], v relp, dv (dl [dm [("a", j 1), ("b", j 1)]])), ([], v relp, dv (dl [dm [("a", j 1), ("b", j 2)]])),
    ([], v lone, dv (dl [j 1, j 2])), ([], v lone, dv (dl [j 1, j 5])),
    ([], v none', dv (dl [])),
    ([], v lists, dv (dl [dl [j 1], dl [j 2]])), ([], v lists, dv (dl [dl [j 1], dl [j 3]])),
    ([], v nested, dv (dl [dl [j 1, j 2]])), ([], v nested, dv (dl [dl [j 1, j 3]])),
    ([], v right, dv (dl [dm [("a", j 1), ("b", j 2)]])), ([], v right, dv (dl [dm [("a", j 1), ("b", j 3)]])),
    ([], v called, dv (dl [ds "A", ds "B"])), ([], v called, dv (dl [ds "a", ds "b"]))]

theorem holeMeetCases_checkable : ∀ c ∈ holeMeetCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem holeMeet_verdict_exact : ∀ c ∈ holeMeetCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (holeMeetCases_checkable c hc).1 (holeMeetCases_checkable c hc).2 v

/-- Generators an `emit`'s body holds: `each`, `pack` and `apply` over a
node's field (`Seg.node`), the instances spliced in the output with the
pieces around them and across two nodes, and a template whose relative
paths read where each instance lands: a member of the instance, the
piece before it in the output, the top, from inside a map and a member
deeper, inside a call, a member the data writes, and a member the
instance lacks, an error. -/
def emitGenCases : List (Decls × Val × Data) :=
  let each (d t : Val) : Val := .call .each [d, t]
  let em (s : Val) (b : List Val) : Val := .call .emit [s, m [("match", .any), ("body", l b)]]
  let x (v : Val) : Val := m [("x", v)]
  let dx (d : Data) : Data := dm [("x", d)]
  let n12 := l [m [("a", l [int 1, int 2])]]
  let held := em n12 [each (nd ["a"]) .hole]
  let lead := em n12 [str "s", each (nd ["a"]) .hole]
  let two := em (l [m [("a", l [int 1, int 2])], m [("a", l [int 3])]]) [str "s", each (nd ["a"]) .hole]
  let keyed := em (l [m [("a", m [("k", int 1), ("j", int 2)])]]) [each (nd ["a"]) .hole]
  let packed := em (l [m [("a", l [str "k1", str "k2"])]]) [.call .pack [nd ["a"], int 1]]
  let applied := em (l [m [("a", int 5)]]) [.call .apply [nd ["a"], .call .plus [.hole, int 1]]]
  let sib := em n12 [each (nd ["a"]) (m [("v", .hole), ("w", rel 1 ["v"])])]
  let spliced := em (l [m [("a", l [str "p", str "q"])]])
    [str "s", each (nd ["a"]) (m [("v", .hole), ("w", rel 2 ["0"])])]
  let top := em (l [m [("a", l [str "p"])]]) [str "s", each (nd ["a"]) (m [("v", .hole), ("w", rel 3 ["y"])])]
  let inMap := em (l [m [("a", l [int 1])]]) [m [("f", each (nd ["a"]) (m [("v", .hole), ("w", rel 1 ["v"])]))]]
  let deep := em (l [m [("a", l [int 1])]]) [each (nd ["a"]) (m [("v", .hole), ("w", m [("z", rel 2 ["v"])])])]
  let url := em (l [m [("a", l [str "a"])]])
    [each (nd ["a"]) (m [("n", .hole), ("u", .call .plus [str "https://", rel 1 ["n"]])])]
  let fed := em (l [m [("a", l [int 1])]]) [each (nd ["a"]) (m [("v", .string), ("w", rel 1 ["v"])])]
  let lost := em n12 [each (nd ["a"]) (m [("v", .hole), ("q", rel 1 ["p"])])]
  [([], x held, dx (dl [j 1, j 2])), ([], x held, dx (dl [j 1, j 3])),
    ([], x lead, dx (dl [ds "s", j 1, j 2])), ([], x lead, dx (dl [j 1, j 2])),
    ([], x two, dx (dl [ds "s", j 1, j 2, ds "s", j 3])),
    ([], x keyed, dx (dl [j 2, j 1])), ([], x keyed, dx (dl [j 1, j 2])),
    ([], x packed, dx (dl [dm [("k1", j 1), ("k2", j 1)]])), ([], x packed, dx (dl [dm [("k1", j 2)]])),
    ([], x applied, dx (dl [j 6])), ([], x applied, dx (dl [j 5])),
    ([], x sib, dx (dl [dm [("v", j 1), ("w", j 1)], dm [("v", j 2), ("w", j 2)]])),
    ([], x sib, dx (dl [dm [("v", j 1), ("w", j 2)]])), ([], x sib, dm []),
    ([], x spliced, dx (dl [ds "s", dm [("v", ds "p"), ("w", ds "s")], dm [("v", ds "q"), ("w", ds "s")]])),
    ([], x spliced, dx (dl [ds "s", dm [("v", ds "p"), ("w", ds "p")]])),
    ([], m [("y", int 3), ("x", top)], dm [("x", dl [ds "s", dm [("v", ds "p"), ("w", j 3)]])]),
    ([], m [("y", int 3), ("x", top)], dm [("x", dl [ds "s", dm [("v", ds "p"), ("w", j 4)]])]),
    ([], x inMap, dx (dl [dm [("f", dl [dm [("v", j 1), ("w", j 1)]])]])),
    ([], x deep, dx (dl [dm [("v", j 1), ("w", dm [("z", j 1)])]])),
    ([], x deep, dx (dl [dm [("v", j 1), ("w", dm [("z", j 2)])]])),
    ([], x url, dx (dl [dm [("n", ds "a"), ("u", ds "https://a")]])),
    ([], x url, dx (dl [dm [("n", ds "a"), ("u", ds "http://a")]])),
    ([], x fed, dx (dl [dm [("v", ds "q"), ("w", ds "q")]])),
    ([], x fed, dx (dl [dm [("v", ds "q"), ("w", ds "r")]])), ([], x fed, dm []),
    ([], x lost, dm [])]

/-- A `filter` an `emit`'s body holds, over a node's field: a condition
that keeps some members, and one whose relative path stays inside the
member it tries and names nothing, refusing each. -/
def emitGenFilterCases : List (Decls × Val × Data) :=
  let em (s : Val) (b : List Val) : Val := .call .emit [s, m [("match", .any), ("body", l b)]]
  let x (v : Val) : Val := m [("x", v)]
  let dx (d : Data) : Data := dm [("x", d)]
  let kept := em (l [m [("a", l [int 1, int 2, int 3])]]) [.filter (nd ["a"]) (.above (.num (.integer ⟨1, by decide⟩)))]
  let none' := em (l [m [("a", l [m [("n", int 1), ("m", int 1)], m [("n", int 2), ("m", int 3)]])]])
    [.filter (nd ["a"]) (m [("n", .integer), ("m", rel 1 ["n"])])]
  [([], x kept, dx (dl [j 2, j 3])), ([], x kept, dx (dl [j 1, j 2, j 3])),
    ([], x none', dx (dl [])), ([], x none', dx (dl [dm [("n", j 1), ("m", j 1)]]))]

theorem emitGenCases_checkable : ∀ c ∈ emitGenCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem emitGen_verdict_exact : ∀ c ∈ emitGenCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (emitGenCases_checkable c hc).1 (emitGenCases_checkable c hc).2 v

/-- The checker can't read a `filter` before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem emitGenFilterCases_reads : ∀ c ∈ emitGenFilterCases, c.1.readsPD c.2.1 c.2.2 = true := by
  decide +kernel

theorem emitGenFilter_verdict_exact : ∀ c ∈ emitGenFilterCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (emitGenFilterCases_reads c hc) v

/-- A named table, `%W = emit(_, t)`, whose body holds a generator whose
template reads its member's place through a relative path: the path read
where each instance lands, as an unnamed table's is, over one node and
two, in two places, through `pack`, after a piece of the body's own, and
the data each refuses, and none. -/
def namedGenCases : List (Decls × Val × Data) :=
  let rel (n : ℕ) (k : String) : Val := .path [.up n, .key k]
  let rule (b : List Val) : Val := mp [("match", .number), ("body", lst b)]
  let named (b : List Val) : Decls := [("W", c .emit [.hole, rule b])]
  let use (s : List Val) : Val := c .emit [lst s, .alias "W"]
  let gen := c .each [lst [int 1, int 2], mp [("a", int 1), ("b", rel 1 "a")]]
  let pk := c .pack [mp [("p", int 1), ("q", int 2)], mp [("a", int 3), ("b", rel 1 "a")]]
  let ab (b : ℤ) (h : IntegerLeaf b := by decide) : Data := jm [("a", j 1), ("b", j b h)]
  let pq (b : ℤ) (h : IntegerLeaf b := by decide) : Data :=
    jl [jm [("p", jm [("a", j 3), ("b", j 3)]), ("q", jm [("a", j 3), ("b", j b h)])]]
  [(named [gen], mp [("v", use [int 5])], jm [("v", jl [ab 1, ab 1])]),
    (named [gen], mp [("v", use [int 5])], jm [("v", jl [ab 2, ab 1])]),
    (named [gen], mp [("v", use [int 5])], jm []),
    (named [gen], mp [("v", use [int 5, int 6])], jm [("v", jl [ab 1, ab 1, ab 1, ab 1])]),
    (named [gen], mp [("x", use [int 5]), ("y", use [int 6])], jm [("x", jl [ab 1, ab 1]), ("y", jl [ab 1, ab 1])]),
    (named [gen], mp [("x", use [int 5]), ("y", use [int 6])], jm [("x", jl [ab 1, ab 1]), ("y", jl [ab 1, ab 2])]),
    (named [pk], mp [("v", use [int 5])], jm [("v", pq 3)]),
    (named [pk], mp [("v", use [int 5])], jm [("v", pq 4)]),
    (named [str "s", gen], mp [("v", use [int 5])], jm [("v", jl [js "s", ab 1, ab 1])]),
    (named [str "s", gen], mp [("v", use [int 5])], jm [("v", jl [js "s", ab 1, ab 2])])]

theorem namedGenCases_checkable : ∀ c ∈ namedGenCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem namedGen_verdict_exact : ∀ c ∈ namedGenCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (namedGenCases_checkable c hc).1 (namedGenCases_checkable c hc).2 v

/-- A relative path in the template of a generator an `emit`'s body
holds, beside a `key(n)` in the same template: the `emit` made where no
place is yet, its keys as written, so that each instance reads the path
where it lands, as one with no key does: `key(0)` and `key(1)`, `each`
and `pack`, a table written in place and a named one, two nodes, a path
from outside into the output, the data each refuses, and none. -/
def keyRelCases : List (Decls × Val × Data) :=
  let rel (n : ℕ) (k : String) : Val := .path [.up n, .key k]
  let rule (b : List Val) : Val := mp [("match", .number), ("body", lst b)]
  let genk := c .each [lst [int 1, int 2], mp [("k", .keyUp 0), ("a", int 1), ("b", rel 1 "a")]]
  let gk1 := c .each [lst [int 1, int 2], mp [("k", .keyUp 1), ("b", rel 1 "k")]]
  let pk1 := c .pack [mp [("p", int 1), ("q", int 2)], mp [("n", .keyUp 1), ("b", rel 1 "n")]]
  let ok := jm [("a", j 1), ("b", j 1), ("k", js "k")]
  let bad := jm [("a", j 1), ("b", j 2), ("k", js "k")]
  let k1 (b0 : String) := jl [jm [("b", js b0), ("k", js "0")], jm [("b", js "1"), ("k", js "1")]]
  let p1 (bq : String) := jl [jm [("p", jm [("b", js "p"), ("n", js "p")]), ("q", jm [("b", js bq), ("n", js "q")])]]
  let w (g : Val) (s : List Val) : Val := c .emit [lst s, rule [g]]
  let named : Decls := [("W", c .emit [.hole, rule [genk]])]
  let y : Val := .path [.key "v", .idx 1, .key "a"]
  [([], mp [("v", w genk [int 5])], jm [("v", jl [ok, ok])]),
    ([], mp [("v", w genk [int 5])], jm [("v", jl [bad, ok])]),
    ([], mp [("v", w genk [int 5])], jm []),
    (named, mp [("v", c .emit [lst [int 5], .alias "W"])], jm [("v", jl [ok, ok])]),
    (named, mp [("v", c .emit [lst [int 5], .alias "W"])], jm [("v", jl [ok, bad])]),
    ([], mp [("v", w genk [int 5, int 6])], jm [("v", jl [ok, ok, ok, ok])]),
    ([], mp [("v", w genk [int 5, int 6])], jm [("v", jl [ok, ok, ok, bad])]),
    ([], mp [("v", w gk1 [int 5])], jm [("v", k1 "0")]),
    ([], mp [("v", w gk1 [int 5])], jm [("v", k1 "1")]),
    ([], mp [("v", w pk1 [int 5])], jm [("v", p1 "q")]),
    ([], mp [("v", w pk1 [int 5])], jm [("v", p1 "p")]),
    ([], mp [("v", w genk [int 5]), ("y", y)], jm [("v", jl [ok, ok]), ("y", j 1)]),
    ([], mp [("v", w genk [int 5]), ("y", y)], jm [("v", jl [ok, ok]), ("y", j 2)])]

theorem keyRelCases_checkable : ∀ c ∈ keyRelCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem keyRel_verdict_exact : ∀ c ∈ keyRelCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (keyRelCases_checkable c hc).1 (keyRelCases_checkable c hc).2 v

/-- A `filter`'s condition, standing where the member it tries lands: a
relative path that climbs out of the member, to the filter's map, past
it to the top and into a sibling list, over a list and a map, inside a
map and a call; one that stays inside the member, and one that names
the filter's own output, each naming nothing; and a path, a relative
one past the top and a name that name nothing, each of which refuses
every member rather than making the document an error, as both ports
read them, and a path the data supplies. -/
def filterCondCases : List (Decls × Val × Data) :=
  let f (c : Val) := m [("a", m [("lim", int 2), ("l", l [int 1, int 2, int 3]), ("f", .filter (rel 1 ["l"]) c)])]
  let out (xs : List Data) : Data := dm [("a", dm [("f", .list xs)])]
  let ns := l [m [("n", int 1), ("m", int 1)], m [("n", int 2), ("m", int 3)]]
  let fn (c : Val) := m [("a", m [("lim", int 2), ("l", ns), ("f", .filter (rel 1 ["l"]) c)])]
  [([], f (rel 2 ["lim"]), out [j 2]),
    ([], f (rel 2 ["lim"]), out [j 1]),
    ([], m [("lim", int 3), ("a", m [("lim", int 2), ("l", l [int 1, int 2, int 3]), ("f", .filter (rel 1 ["l"]) (rel 3 ["lim"]))])],
      out [j 3]),
    ([], f (.path [.up 2, .key "l", .idx 0]), out [j 1]),
    ([], m [("a", m [("lim", int 2), ("l", m [("p", int 1), ("q", int 2)]), ("f", .filter (rel 1 ["l"]) (rel 2 ["lim"]))])],
      dm [("a", dm [("f", dm [("q", j 2)])])]),
    ([], fn (m [("n", rel 3 ["lim"])]), out [dm [("n", j 2), ("m", j 3)]]),
    ([], f (.call .add [rel 2 ["lim"], int 0]), out [j 2]),
    ([], fn (m [("n", rel 1 ["m"])]), out []),
    ([], fn (m [("n", .path [.up 2, .idx 0, .key "n"])]), out []),
    ([], f (rel 1 ["lim"]), out []),
    ([], f (p ["nope"]), out []),
    ([], f (rel 4 ["lim"]), out []),
    ([], f (.alias "Nope"), out []),
    ([], m [("a", m [("l", l [int 1, int 2]), ("f", .filter (rel 1 ["l"]) (p ["lim"]))])],
      dm [("lim", j 2), ("a", dm [("f", .list [j 2])])]),
    ([], m [("a", m [("l", l [int 1, int 2]), ("f", .filter (rel 1 ["l"]) (p ["lim"]))])],
      dm [("lim", j 2), ("a", dm [("f", .list [j 1])])])]

set_option maxRecDepth 16384 in
/-- The checker can't read a `filter` before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem filterCondCases_reads : ∀ c ∈ filterCondCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem filterCond_verdict_exact : ∀ c ∈ filterCondCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (filterCondCases_reads c hc) v

/-- What a made `filter` holds: each child its condition admits as the
child itself, so a preference it keeps admits the arm a later meet or
the data picks, and a link it keeps sends its template, where a child
the condition refuses sends none, beside data that agrees and data that
refuses. -/
def filterKeepCases : List (Decls × Val × Data) :=
  let rf (t : Val) : Val := .meet (.call .relate [t]) (.addr ⟨0, ["a"]⟩)
  let pr : Val := .or [(1, int 1), (0, int 2)]
  let k1 : Val := m [("k", int 1)]
  [([], m [("b", .meet (.filter (m [("x", pr)]) .any) (m [("x", int 2)]))], .map [("b", .map [("x", j 2)])]),
    ([], m [("b", .filter (m [("x", pr)]) .any)], .map [("b", .map [("x", j 2)])]),
    ([], m [("b", .filter (m [("x", pr)]) .any)], .map [("b", .map [("x", j 3)])]),
    ([], m [("a", m []), ("b", .filter (m [("x", rf k1)]) .any)], .map [("a", .map [("k", j 1)])]),
    ([], m [("a", m []), ("b", .filter (m [("x", rf k1)]) .any)], .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("b", .filter (m [("x", rf k1)]) .integer)], .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("b", .filter (.list [rf k1] none false) .any)], .map [("a", .map [("k", j 2)])])]

set_option maxRecDepth 16384 in
/-- The checker can't read a `filter` before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem filterKeepCases_reads : ∀ c ∈ filterKeepCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem filterKeep_verdict_exact : ∀ c ∈ filterKeepCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (filterKeepCases_reads c hc) v

/-- Ruling 51: a `filter` tries each child as the term it is, so a child
that generates nothing, a kind, a bound or a disjunction, is kept where
the condition takes it: where every value it admits is one the
condition admits, and, for a disjunction with no preference among its
arms, where the condition takes an arm; the data then meets the kept
child's own term. A preference is kept where every arm is taken, a
nested map where its members are, and a condition's optional member the
child leaves out asks for nothing. -/
def filterTermCases : List (Decls × Val × Data) :=
  let b (f : Val) : Val := m [("b", f)]
  let xi : Val := m [("x", .integer)]
  let ki : Val := m [("k", .integer)]
  [([], b (.filter xi .any), .map [("b", .map [("x", j 3)])]),
    ([], b (.filter xi .any), .map []),
    ([], b (.filter xi (int 1)), .map [("b", .map [("x", j 1)])]),
    ([], b (.filter xi (int 1)), .map [("b", .map [])]),
    ([], b (.filter (m [("x", .or [(0, int 1), (0, int 2)])]) (int 1)), .map [("b", .map [("x", j 2)])]),
    ([], b (.filter (m [("x", .integer), ("y", int 1)]) .integer), .map [("b", .map [("x", j 3), ("y", j 1)])]),
    ([], b (.filter (m [("x", .integer), ("y", str "s")]) .integer), .map [("b", .map [("x", j 3)])]),
    ([], b (.filter (l [.integer, int 1]) .integer), .map [("b", .list [j 5, j 1])]),
    ([], b (.filter (m [("x", .or [(1, int 1), (0, int 2)])]) (int 1)), .map [("b", .map [("x", j 2)])]),
    ([], b (.filter (m [("x", .meet (.min (.num (.integer ⟨1, by decide⟩))) .integer)]) .integer),
      .map [("b", .map [("x", j 0)])]),
    ([], b (.filter (m [("x", ki)]) ki), .map [("b", .map [("x", .map [("k", .str "s")])])]),
    ([], b (.filter (m [("x", .or [(0, .integer), (0, .string)])]) (int 1)), .map [("b", .map [("x", .str "s")])]),
    ([], b (.filter (m [("x", ki)]) (.map [("k", false, .integer), ("n", true, .string)] none false)),
      .map [("b", .map [("x", .map [("k", j 1)])])]),
    ([], b (.filter (l [.integer, .string]) .string), .map [("b", .list [j 1])]),
    ([], b (.filter (l [.integer, .string]) .string), .map [("b", .list [.str "s"])])]

set_option maxRecDepth 16384 in
/-- The checker can't read a `filter` before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem filterTermCases_reads : ∀ c ∈ filterTermCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem filterTerm_verdict_exact : ∀ c ∈ filterTermCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (filterTermCases_reads c hc) v

/-- Ruling 38: a meet carries the marks of both its sides, `any`'s
included, so `hide(any)` or `type(any)` met with a value marks it,
beside a map's member on either side, a scalar, a kind, a map and a
path reference, and #419's and #420's meets of a value with a marked
one, whose answer is the unmarked side; a spread's `hide(any)` template,
which gives no mark to the members it meets (ruling 39); and a list's
element marked through a meet
holds no position, where a marked element of a list that meets another
holds none to meet (ruling 18). -/
def markMeetCases : List (Decls × Val × Data) :=
  let xy : Val := m [("x", int 1), ("y", int 2)]
  let da (x : Data) : Data := .map [("a", x)]
  [([], m [("a", .meet xy (m [("x", hide .any)]))], da (.map [("y", j 2)])),
    ([], m [("a", .meet xy (m [("x", hide .any)]))], da (.map [("x", j 1), ("y", j 2)])),
    ([], m [("a", .meet xy (m [("x", hide .any)]))], da (.map [("x", j 2), ("y", j 2)])),
    ([], m [("a", .meet (m [("x", hide .any)]) xy)], da (.map [("y", j 2)])),
    ([], m [("a", .meet (int 1) (hide .any))], .map []),
    ([], m [("a", .meet (int 1) (hide .any))], da (j 2)),
    ([], m [("a", .meet .any (hide .any))], .map []),
    ([], m [("v", m [("a", .meet .integer (hide .integer))])], .map [("v", .map [])]),
    ([], m [("v", .meet (m [("a", int 1)]) (m [("a", hide (int 1))]))], .map [("v", .map [])]),
    ([], m [("a", .meet (m [("x", int 1)]) (m [("x", type .any)]))], da (.map [])),
    ([], m [("a", .meet (m [("x", .integer)]) (m [("x", hide .any)]))], da (.map [])),
    ([], m [("a", .meet (m [("x", m [("n", int 1)])]) (m [("x", hide .any)]))], da (.map [])),
    ([], m [("a", .meet (m [("x", int 1)]) (m [("x", hide .integer)]))], da (.map [])),
    ([], m [("a", int 1), ("b", .meet (.path [.key "a"]) (hide .any))], .map [("a", j 1)]),
    ([], m [("x", .meet (.map [] (some (hide .any)) false) (m [("a", int 1), ("b", int 2)]))],
      .map [("x", .map [])]),
    ([], m [("a", l [.meet (int 1) (hide .any)])], da (.list [])),
    ([], m [("a", .meet (l [int 1, int 2]) (l [hide .any]))], da (.list [j 1, j 2])),
    ([], m [("a", .meet (l [int 1, int 2]) (l [hide .any]))], da (.list [j 2]))]

set_option maxRecDepth 16384 in
theorem markMeetCases_reads : ∀ c ∈ markMeetCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem markMeet_verdict_exact : ∀ c ∈ markMeetCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (markMeetCases_reads c hc) v

/-- A spread's template copied to each member without the marks written
around it (ruling 39): `hide()` and `type()` around a scalar, a kind, a
mark, a map, a disjunction and a hole, under a meet of two spreads and of
two templates, under another rider, and on a list's spread; a mark on a
field of the template and one on an arm of a disjunction belong to that
field and that arm, and stay. Each member is left out of the data, so
that `--no-fill` tells a member the data must give from a marked one. -/
def spreadMarkCases : List (Decls × Val × Data) :=
  let sp (t : Val) : Val := .map [] (some t) false
  let lsp (t : Val) : Val := .list [] (some t) false
  let x (v : Val) : Val := m [("x", v)]
  let dx (d : Data) : Data := .map [("x", d)]
  let a1 : Val := m [("a", int 1)]
  let ae : Val := m [("a", m [])]
  let b1 : Val := m [("b", int 1)]
  let dc : Data := dx (.map [("a", .map [("c", j 2)])])
  [([], x (.meet (sp (hide (int 1))) a1), dx (.map [])),
    ([], x (.meet (sp (type (int 1))) a1), dx (.map [])),
    ([], x (.meet (sp (hide .integer)) a1), dx (.map [])),
    ([], x (.meet (sp (hide (type (int 1)))) a1), dx (.map [])),
    ([], x (.meet (sp (hide b1)) ae), dx (.map [("a", .map [])])),
    ([], x (.meet (sp (type b1)) ae), dx (.map [("a", .map [])])),
    ([], x (.meet (sp (hide (m [("b", hide (int 1)), ("c", int 2)]))) ae), dc),
    ([], x (.meet (sp (m [("n", hide (int 1))])) ae), dx (.map [("a", .map [])])),
    ([], x (.meet (.meet (sp (hide b1)) (sp (m [("c", int 2)]))) ae), dc),
    ([], x (.meet (sp (.meet (hide b1) (m [("c", int 2)]))) ae), dc),
    ([], x (.meet (sp (hide (.or [(0, int 1), (0, int 2)]))) a1), dx (.map [])),
    ([], x (.meet (sp (.or [(0, hide (int 1)), (0, int 2)])) a1), dx (.map [])),
    ([], x (.meet (lsp (hide (int 1))) (l [int 1])), dx (.list [])),
    ([], x (.meet (lsp (type b1)) (l [m []])), dx (.list [.map []])),
    ([], x (.meet (sp (hide .hole)) a1), dx (.map [])),
    ([], x (.meet (sp (hide (.call .add [.hole, int 1]))) a1), dx (.map [])),
    ([], x (.meet (lsp (hide .hole)) (l [int 1])), dx (.list [])),
    ([], x (.meet (sp (.ride .metadata (hide (int 1)) [])) a1), dx (.map [])),
    ([], x (.meet (sp (.ride .deprecate (type b1) [])) ae), dx (.map [("a", .map [])])),
    ([], x (.meet (sp (.ride .metadata (int 1) [])) a1), dx (.map []))]

set_option maxRecDepth 16384 in
theorem spreadMarkCases_reads : ∀ c ∈ spreadMarkCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem spreadMark_verdict_exact : ∀ c ∈ spreadMarkCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (spreadMarkCases_reads c hc) v

/-- Bounds written over terms: `min`, `max`, `above` and `below` over a
path to a number and to a string, the empty string among them, over a
relative path and over a call; two bounds over paths met; `neq` over
paths to numbers, to strings and to both; `mulof` over a path to a
number, to a string, to `0` and to a negative number; a path to a
boolean, `null`, a map, a kind, a bound and a meet, which no bound
reads, so that the bound admits nothing, however its argument is
written (decision 28), and a kind and `any` the data fills; a path to a
preference and to a disjunction, a choice no bound takes, an error
whether or not the data fills it (#413); one only the data supplies;
and `len`, which takes a term already, over a path to a count, a
relative one, one to a bound, one to a string, and one only the data
supplies. Then a bound over a path to `true` met with a kind, an error
as the literal is; `neq` over a sole list, written and through a path,
which reads its elements, so that a choice among them is an error, a
list among them admits nothing and so does an empty list; and `len`
over `any`, written and through a path, and over a trial, which admit
no size, a rider and a meet with `any` read through. Last, a choice a
dead arm settles to one arm, which is that arm, as a size's is (ruling
55): either way round, through a path, and in `neq`'s list. -/
def boundArgCases : List (Decls × Val × Data) :=
  let t (x : Data) : Data := dm [("t", x)]
  let lo (v : Val) (b : Bnd := .min) : Val := m [("lo", v), ("t", bnd b [p ["lo"]])]
  [([], lo (int 2), t (j 5)),
    ([], lo (int 2), t (j 1)),
    ([], lo (int 2), dm []),
    ([], lo (str "b"), t (.str "c")),
    ([], lo (str "b"), t (.str "a")),
    ([], lo (str ""), t (.str "a")),
    ([], lo (int 2) .above, t (j 2)),
    ([], m [("hi", int 2), ("t", bnd .below [p ["hi"]])], t (j 1)),
    ([], m [("a", m [("lim", int 2), ("t", bnd .max [rel 1 ["lim"]])])], dm [("a", t (j 3))]),
    ([], m [("t", bnd .min [.call .add [int 1, int 1]])], t (j 1)),
    ([], m [("lo", int 2), ("hi", int 4), ("t", .meet (bnd .min [p ["lo"]]) (bnd .max [p ["hi"]]))], t (j 5)),
    ([], m [("a", int 1), ("b", int 2), ("t", bnd .neq [p ["a"], p ["b"]])], t (j 3)),
    ([], m [("a", int 1), ("b", int 2), ("t", bnd .neq [p ["a"], p ["b"]])], t (j 2)),
    ([], m [("a", str "p"), ("b", str "q"), ("t", bnd .neq [p ["a"], p ["b"]])], t (.str "p")),
    ([], m [("a", int 1), ("t", bnd .neq [p ["a"]])], t (j 1)),
    ([], m [("a", int 1), ("b", str "x"), ("t", bnd .neq [p ["a"], p ["b"]])], t (j 3)),
    ([], m [("d", int 3), ("t", bnd .mulof [p ["d"]])], t (j 6)),
    ([], m [("d", int 3), ("t", bnd .mulof [p ["d"]])], t (j 7)),
    ([], m [("d", str "x"), ("t", bnd .mulof [p ["d"]])], t (j 3)),
    ([], lo (.lit (.bool true)), t (j 1)),
    ([], lo (.lit .null), t (j 1)),
    ([], lo (m []), t (j 1)),
    ([], lo .integer, t (j 1)),
    ([], lo (.min (.num (.integer ⟨1, by decide⟩))), t (j 1)),
    ([], lo (.or [(1, int 2), (0, int 3)]), t (j 1)),
    ([], m [("t", bnd .min [p ["lo"]])], dm [("lo", j 2), ("t", j 1)]),
    ([], lo .number, dm [("lo", j 2), ("t", j 1)]),
    ([], m [("n", int 2), ("t", .len (p ["n"]))], dm [("t", .list [j 1, j 2])]),
    ([], m [("n", int 2), ("t", .len (p ["n"]))], dm [("t", .list [j 1])]),
    ([], m [("n", int 2), ("t", .len (p ["n"]))], dm [("t", .str "ab")]),
    ([], m [("a", m [("n", int 2), ("t", .len (rel 1 ["n"]))])], dm [("a", dm [("t", .list [j 1, j 2])])]),
    ([], m [("n", .min (.num (.integer ⟨1, by decide⟩))), ("t", .len (p ["n"]))], dm [("t", .list [j 1])]),
    ([], m [("n", int 2), ("t", .len (p ["n"]))], dm []),
    ([], m [("t", .len (p ["n"]))], dm [("n", j 2), ("t", .list [j 1, j 2])]),
    ([], m [("d", int 0), ("t", bnd .mulof [p ["d"]])], t (j 7)),
    ([], m [("d", int (-3)), ("t", bnd .mulof [p ["d"]])], t (j 6)),
    ([], m [("s", str "a"), ("t", .len (p ["s"]))], t (.str "abc")),
    ([], lo (.pref 1 (int 2)), t (j 3)),
    ([], lo .number, dm [("lo", j 2), ("t", j 3)]),
    ([], lo .any, dm [("lo", j 2), ("t", j 3)]),
    ([], lo (.or [(1, int 2), (0, int 3)]), dm [("lo", j 3), ("t", j 3)]),
    ([], lo (.meet (.min (.num (.integer ⟨1, by decide⟩))) (.max (.num (.integer ⟨3, by decide⟩)))), t (j 2)),
    ([], lo (.or [(0, int 1), (0, int 3)]), t (j 2)),
    ([], lo (.or [(0, int 1), (0, int 3)]), dm [("lo", j 1), ("t", j 2)]),
    ([], m [("lo", .lit (.bool true)), ("t", .meet (bnd .min [p ["lo"]]) .integer)], t (j 1)),
    ([], m [("x", l [int 1, int 3]), ("t", bnd .neq [p ["x"]])], dm [("x", .list [j 1, j 3]), ("t", j 2)]),
    ([], m [("x", l [int 1, int 3]), ("t", bnd .neq [p ["x"]])], dm [("x", .list [j 1, j 3]), ("t", j 1)]),
    ([], m [("t", bnd .neq [l [int 1, int 3]])], t (j 2)),
    ([], m [("x", l [.or [(0, int 1), (0, int 3)]]), ("t", bnd .neq [p ["x"]])], dm [("x", .list [j 1]), ("t", j 2)]),
    ([], m [("t", bnd .neq [l [.or [(0, int 1), (0, int 3)]]])], t (j 2)),
    ([], m [("x", l [int 1, str "a"]), ("t", bnd .neq [p ["x"]])], t (j 2)),
    ([], m [("x", l [l [int 1]]), ("t", bnd .neq [p ["x"]])], t (j 2)),
    ([], m [("x", l []), ("t", bnd .neq [p ["x"]])], t (j 2)),
    ([], m [("t", .len .any)], t (.list [j 1])),
    ([], m [("n", .any), ("t", .len (p ["n"]))], t (.list [j 1])),
    ([], m [("t", .len (.must .integer "m"))], t (.list [j 1])),
    ([], m [("t", .len (.ride .metadata (int 1) []))], t (.list [j 1])),
    ([], m [("t", .len (.meet .any (int 1)))], t (.list [j 1])),
    ([], m [("t", bnd .min [.or [(0, .meet (int 1) (int 2)), (0, int 1)]])], t (j 1)),
    ([], m [("t", bnd .min [.or [(0, int 2), (0, .meet (int 1) (int 2))]])], t (j 1)),
    ([], lo (.or [(0, .meet (int 1) (int 2)), (0, int 2)]), dm [("lo", j 2), ("t", j 3)]),
    ([], m [("t", bnd .neq [l [.or [(0, int 1), (0, .meet (int 1) (int 2))]]])], t (j 1))]

theorem boundArgCases_checkable : ∀ c ∈ boundArgCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem boundArg_verdict_exact : ∀ c ∈ boundArgCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (boundArgCases_checkable c hc).1 (boundArgCases_checkable c hc).2 v

/-- Bounds over a relative path in a `filter`'s condition, each read
where the member it tries lands: `min`, `above` and `neq` over a path
past the member, which keep the members they admit, and a bound over a
boolean, `null` or a map, and a `neq` over a number and a string, each
refused, which refuses every member rather than making the document an
error. -/
def boundFilterCases : List (Decls × Val × Data) :=
  let f (c : Val) := m [("a", m [("lim", int 2), ("l", l [int 1, int 2, int 3]), ("f", .filter (rel 1 ["l"]) c)])]
  let out (xs : List Data) : Data := dm [("a", dm [("f", .list xs)])]
  let g (lim c : Val) := m [("a", m [("lim", lim), ("l", l [int 1]), ("f", .filter (rel 1 ["l"]) c)])]
  [([], f (bnd .min [rel 2 ["lim"]]), out [j 2, j 3]),
    ([], f (bnd .min [rel 2 ["lim"]]), out [j 1]),
    ([], f (bnd .above [rel 2 ["lim"]]), out [j 3]),
    ([], f (bnd .neq [rel 2 ["lim"]]), out [j 1, j 3]),
    ([], g (.lit (.bool true)) (bnd .min [rel 2 ["lim"]]), out []),
    ([], g (.lit .null) (bnd .min [rel 2 ["lim"]]), out []),
    ([], g (m []) (bnd .max [rel 2 ["lim"]]), out []),
    ([], g (int 1) (bnd .neq [rel 2 ["lim"], .lit (.str "x")]), out [])]

set_option maxRecDepth 16384 in
/-- The checker can't read a `filter` before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem boundFilterCases_reads : ∀ c ∈ boundFilterCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem boundFilter_verdict_exact : ∀ c ∈ boundFilterCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (boundFilterCases_reads c hc) v

/-- Bounds over a relative path in a generator's template, each read
where its instance lands: `min` over a path into the member, in an
`each` and a `pack` whose instances each have a target of their own,
one admitting and one refusing, and over an ancestor's member. -/
def boundEachCases : List (Decls × Val × Data) :=
  let lv (lim v : Val) : Val := m [("lim", lim), ("v", v)]
  let tmpl := Val.meet .hole (m [("v", bnd .min [rel 1 ["lim"]])])
  [([], m [("o", .call .each [l [lv (int 1) (int 1), lv (int 2) (int 2)], tmpl])], dm []),
    ([], m [("o", .call .each [l [lv (int 2) (int 1), lv (int 1) (int 1)], tmpl])], dm []),
    ([], m [("o", .call .pack [m [("a", lv (int 1) (int 1)), ("b", lv (int 2) (int 2))], tmpl])], dm []),
    ([], m [("a", m [("lim", int 2), ("l", l [int 1]),
        ("f", .call .each [rel 1 ["l"], .meet (m [("v", bnd .min [rel 3 ["lim"]])]) (m [("v", int 5)])])])], dm [])]

theorem boundEachCases_checkable : ∀ c ∈ boundEachCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem boundEach_verdict_exact : ∀ c ∈ boundEachCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (boundEachCases_checkable c hc).1 (boundEachCases_checkable c hc).2 v

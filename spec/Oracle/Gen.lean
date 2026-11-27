import Oracle.Base

/-! The oracle's cases: Gen, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-! ## What evaluation singles out -/

/-- The values of the `gen` fragment: literals, kinds, preferences and
disjunctions with their ranks, maps with required, optional and
defaulted keys and spreads, an optional key whose value generates an
empty map or list and so is absent (decision 19 of the design note's
§7), lists with spreads, and meets of these, the fill of a schema with
data among them; and defaults of one rank folded into their meet (ruling
41), in a disjunction and in a meet of two preferences, and the default
of the lower rank where two of different ranks meet, whichever side
either is written on. No value here splits the ports
(#348) or writes a `nil` under an optional key, where the engines
answer `error` and the definition drops the key. -/
def genVals : List Val :=
  [int 1, .pref 1 (int 1), .pref 1 .integer, .integer, .any, .pref 1 (.lit .null),
    .or [(0, int 1), (0, int 2)], .or [(1, int 1), (0, int 2)], .or [(0, int 1), (1, int 2)],
    .or [(1, int 1), (1, int 2)], .or [(1, int 1), (2, int 2)], .or [(2, int 1), (1, int 2)],
    .or [(0, int 1), (0, int 1)], .or [(0, int 1), (0, int 1), (0, int 2)],
    .or [(0, .or [(1, int 1), (0, int 2)]), (0, int 3)],
    .or [(1, .or [(0, int 1), (0, int 2)]), (0, int 3)],
    .or [(1, .integer), (0, int 1)], .or [(0, .integer), (1, int 1)], .or [(1, int 1), (0, .integer)],
    .or [(1, .lit (.bool true)), (0, .lit (.bool false))],
    .pref 1 (.or [(0, int 1), (0, int 2)]),
    .meet (.pref 1 (int 1)) .integer, .meet (.pref 1 (int 1)) .number,
    .meet (.pref 1 (str "a")) .string, .meet (.pref 1 (int 8080)) (.min (.num (.integer (.of 1024)))),
    .meet (.or [(1, int 1), (0, int 2)]) .integer,
    .meet (.or [(1, int 1), (0, int 2)]) (.or [(1, int 2), (0, int 1)]),
    .meet (.or [(1, int 1), (0, int 2)]) (.or [(2, int 2), (0, int 1)]),
    .meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3)))),
    key "x" false (int 1), key "x" true (int 1), key "x" false (.pref 1 (int 1)),
    key "x" true (.pref 1 (int 1)), key "x" false .integer, key "x" true .integer,
    .map [("x", true, .integer), ("y", false, .pref 1 (int 1))] none false,
    .map [("x", false, int 1)] (some .integer) false,
    .map [("x", false, str "a")] (some .integer) false,
    .map [("a", false, key "y" false (int 2))] (some (key "x" false (.pref 1 (int 1)))) false,
    .map [("b", false, int 1), ("a", false, int 2), ("B", false, int 3)] none false,
    key "x" false (.or [(1, int 1), (1, int 2)]), key "x" false (.meet (int 1) (int 2)),
    key "x" false (.or [(0, int 1), (0, int 1)]), key "x" false (key "y" false (.pref 1 (int 1))),
    key "x" false (.list [.pref 1 (int 1), .pref 1 (int 2)] none false),
    .list [int 1, int 2] none false, .list [.pref 1 (int 1), int 2] none false,
    .list [] (some .integer) false, .list [.pref 1 (int 1)] (some .integer) false,
    .list [str "a"] (some .integer) false, .list [.list [.pref 1 (int 1)] none false] none false,
    .list [key "x" false (.pref 1 (int 1))] (some (key "y" false (.pref 1 (int 2)))) false,
    .list [.integer] none false,
    .meet (key "x" false (int 1)) (key "y" false (int 2)),
    .meet (key "x" true (.pref 1 (int 1))) (.map [] none false),
    .meet (key "x" true (.pref 1 (int 1))) (key "x" false .integer),
    .meet (key "x" true (int 1)) (key "x" true (.pref 1 (int 2))),
    .meet (.map [] (some (key "y" false (.pref 1 (int 2)))) false) (key "a" false (key "x" false (int 1))),
    .meet (.list [int 1] (some .integer) false) (.list [.integer] none false),
    .meet (.list [int 1, int 2] none true) (.list [] (some .integer) false),
    .meet (key "a" false (int 1)) (.len (int 1)), .meet (key "a" false (int 1)) (.len (int 2)),
    .meet (.or [(0, key "x" false (int 1)), (0, key "y" false (int 2))])
      (.map [("x", false, int 1), ("y", false, int 2)] none false),
    .meet (.or [(0, key "x" false (int 1)), (0, key "y" false (int 2))]) (key "x" false (int 1)),
    .pref 1 (.list [int 1] none true), .pref 1 (.list [int 1] (some .integer) true),
    .or [(1, key "x" false (int 1)), (0, key "y" false (int 2))],
    .or [(0, key "x" false (int 1)), (1, key "y" false (int 2))],
    .or [(1, .list [int 1] none true), (0, .list [int 2] none true)],
    .or [(0, .list [int 1, int 2] none true), (0, .list [int 1, int 2] none true)],
    .or [(0, key "x" false (int 1)), (0, key "x" false (int 1))],
    .or [(0, .map [("a", false, int 1), ("b", false, int 2)] none false),
      (0, .map [("b", false, int 2), ("a", false, int 1)] none false)],
    .or [(0, key "x" false (.meet (int 1) (int 2))), (0, int 1)],
    .or [(0, .list [.meet (int 1) (int 2)] none false), (0, int 1)],
    .or [(0, Val.void), (0, int 1)],
    key "a" true (.map [] none false), key "a" true (.list [] none false),
    key "a" false (.map [] none false), key "a" false (.list [] none false),
    key "a" true (key "b" true .integer), key "a" true (key "b" true (.map [] none false)),
    key "a" false (key "b" true (.map [] none false)), key "a" true (.map [] none true),
    key "a" true (.map [] (some .integer) false), key "a" true (.list [] (some .integer) false),
    key "a" true (.pref 1 (.map [] none false)),
    key "a" true (.or [(1, .list [] none false), (0, .list [int 1] none false)]),
    key "a" true (.or [(1, .map [] none false), (0, key "x" false (int 1))]),
    key "a" true (.or [(1, .list [int 1] none false), (0, .list [] none false)]),
    key "a" true (.meet (.map [] none false) (key "b" true (int 1))),
    .map [("a", true, .map [] none false), ("b", false, int 1)] none false,
    .meet (key "a" true (.map [] none false)) (key "a" false (.map [] none false)),
    .list [key "a" true (.map [] none false)] none false,
    .meet (.pref 1 (int 1)) (.pref 1 .integer), .or [(1, int 1), (1, .integer)],
    .or [(1, key "a" false (int 1)), (1, key "b" false (int 2))],
    .meet (.pref 1 (key "a" false (int 1))) (.pref 1 (key "b" false (int 2))),
    .meet (.pref 1 (int 1)) (.pref 2 (int 7)), .meet (.pref 1 (int 1)) (.pref 2 .integer),
    .meet (.pref 2 (int 7)) (.pref 1 (int 1))]

set_option maxRecDepth 4096 in
/-- Every value of the `gen` fragment normalises to a checkable one, so
`output` is `Output` on it, by `output_iff`. -/
theorem genVals_checkable : ∀ v ∈ genVals, (normalise v).Checkable := by decide

theorem gen_output_exact : ∀ v ∈ genVals, ∀ (env : Env) (root j : Data),
    output v = some j ↔ Output env root v j :=
  fun v hv _ _ j => output_iff (genVals_checkable v hv) j

/-- Lists that hold a marked element (decision 18), which a document
reads with no position for it, before, between and after the others,
inside a list and beside a seal, met with a list, and a disjunction of
marked arms beside one whose other arm is dead. -/
def listGenVals : List Val :=
  [lst [int 1, hide (int 2), int 3], lst [hide (int 1), int 2], lst [type .integer, .lit (.str "a")],
    lst [type (int 1), hide (int 2)], lst [lst [hide (int 1)], int 2], .list [hide (int 1), int 2] none true,
    .meet (lst [hide (int 1)]) (lst [int 2]), .meet (lst [hide (int 1), int 2]) (lst [hide (int 3), int 2]),
    lst [.or [(1, hide (int 1)), (0, hide (int 2))], int 3],
    lst [.or [(0, hide (int 1)), (0, .meet (int 2) (int 3))], int 3]]

theorem listGenVals_checkable : ∀ v ∈ listGenVals, (normalise (Decls.readR [] v)).Checkable := by decide

theorem list_gen_output_exact : ∀ v ∈ listGenVals, ∀ (env : Env) (root j : Data),
    output (Decls.readR [] v) = some j ↔ Output env root (Decls.readR [] v) j :=
  fun v hv _ _ j => output_iff (listGenVals_checkable v hv) j

/-- The `gens` rows: each value under the key `v` that generates, with
the JSON the engines must write for it. A value that generates nothing
has no row, since the definition gives no code for it until P5. -/
def genRows (tag : String) (vals : List Val) : IO Unit := do
  let mut i := 0
  for v in vals do
    let some src := v.cell | throw (IO.userError "a value of the fragment has no text")
    if let some j := output v then
      let some json := j.json | throw (IO.userError "an output has no JSON")
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ "\t{\"v\":" ++ json ++ "}")
    i := i + 1

/-- The `gens` rows of values read as a document reads them, so that a
list holds no position for a marked element. -/
def readGenRows (tag : String) (vals : List Val) : IO Unit := do
  let mut i := 0
  for v in vals do
    let some src := v.cell | throw (IO.userError "a value of the fragment has no text")
    if let some j := output (Decls.readR [] v) then
      let some json := j.json | throw (IO.userError "an output has no JSON")
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ "\t{\"v\":" ++ json ++ "}")
    i := i + 1

/-- The numbers `Number.significant` is run on, each with a count of
digits: every leaf, ties that go down and up to the even digit, a carry,
an exponent either side, a number no double holds once rounded, and the
largest double, which rounds to none at one digit and so has no row. -/
def significantCases : List (Number × ℕ) :=
  let flt (a : ℤ) (d : ℕ) : Option Number := (Float.nearest a d).map .float
  let int (n : ℤ) : Option Number := Number.ofIntegerLeaf n
  let big (n : ℤ) : Option Number := some (.biginteger ⟨n⟩)
  let dec (c s : ℤ) : Option Number := (BigDecimal.normal c s).map .bigdecimal
  [(flt 314159 100000, 2), (flt 12345 10, 2), (flt 12345 1000000000, 2),
    (flt (-314159) 100000, 3), (flt 9996 100, 3), (flt 15 10, 5), (flt 125 100, 3),
    (flt 25 100, 1), (flt 35 100, 1), (flt 15 100, 1), (flt 125 1000, 2), (flt 25 10, 1),
    (flt 35 10, 1), (flt (-25) 10, 1), (flt 1005 1000, 3), (flt 9995 1000, 3),
    (flt 251 1000, 1), (flt 349 1000, 1), (flt 1500000000000000000000 1, 1),
    (flt 1000000000000000000000 1, 2), (flt 125 1000000000, 2),
    (flt 30000000000000004 100000000000000000, 16), (flt 123456789 1000, 4), (flt 1 10, 1),
    (flt 2 10, 5), (flt 10000000000000000000000 1, 1), (flt 85 10, 1), (flt 95 10, 1),
    (flt 105 10, 2), (flt 9995 10, 3), (flt 435 100, 2), (flt 445 100, 2), (flt 0 1, 2),
    (flt ((2 ^ 53 - 1) * 2 ^ 971) 1, 17), (flt ((2 ^ 53 - 1) * 2 ^ 971) 1, 1),
    (int 1234, 2), (int 25, 1), (int 15, 1), (int 149, 2), (int 150, 1), (int (-15), 1),
    (int 0, 1), (int 1200, 3), (int 999, 2), (int 1234567890123456768, 3),
    (int 999999999999999104, 15), (int 9223372036854774784, 5), (int 9007199254740992, 1),
    (big 123456789012345678901, 3), (big 25, 1), (big (-123456789012345678905), 20),
    (big 9007199254740993, 16),
    (dec 12345 1, 2), (dec 125 3, 2), (dec 135 3, 2), (dec 1 (-3), 2), (dec 9995 2, 3),
    (dec (-25) 1, 1), (dec 12345 9, 2), (dec 123456789123456789123456789 18, 20)].filterMap
    fun (x, n) => x.map (·, n)

/-- The `gens` rows of `Number.significant`: each number met with the
annotation that asks for so many digits, with the JSON of the number it
gives. A number it gives none for has no row. -/
def significantRows (tag : String) (cases : List (Number × ℕ)) : IO Unit := do
  let mut i := 0
  for (x, n) in cases do
    let some src := x.src | throw (IO.userError "a number has no text")
    if let some y := x.significant n then
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ " & gen({\"significant\": " ++
        toString n ++ "})\t{\"v\":" ++ y.text ++ "}")
    i := i + 1

/-- The numbers `Number.rounded` and `Number.written` are run on, each
with a count of significant digits, a count of digits after the point,
either of which a case may leave out, and whether it is written as a
string: every leaf, ties that go down and up to the even digit, a carry,
a number that rounds to zero from either side, a case where the two
counts round at different places, and the plain form of a number the
engines write with an exponent. -/
def writtenCases : List (Number × Option ℕ × Option ℕ × Bool) :=
  let flt (a : ℤ) (d : ℕ) : Option Number := (Float.nearest a d).map .float
  let int (n : ℤ) : Option Number := Number.ofIntegerLeaf n
  let big (n : ℤ) : Option Number := some (.biginteger ⟨n⟩)
  let dec (c s : ℤ) : Option Number := (BigDecimal.normal c s).map .bigdecimal
  let places (x : Option Number) (p : ℕ) := (x, (none : Option ℕ), some p, false)
  let both (x : Option Number) (n p : ℕ) := (x, some n, some p, false)
  let text (x : Option Number) (n : Option ℕ) := (x, n, (none : Option ℕ), true)
  let fixed (x : Option Number) (n : Option ℕ) (p : ℕ) := (x, n, some p, true)
  [places (flt 314159 100000) 2, places (flt 2675 1000) 2, places (flt 125 1000) 2,
    places (flt 135 1000) 2, places (flt 5 10) 0, places (flt 15 10) 0, places (flt 25 10) 0,
    places (flt (-314159) 100000) 3, places (flt (-25) 10) 0, places (flt 245 10) 2,
    places (flt 2425 100) 2, places (flt 9999 1000) 2, places (flt 4 1000) 2,
    places (flt (-4) 1000) 2, places (flt 6 1000) 2, places (flt 5 (10 ^ 324)) 2,
    places (flt 1000000000000000000000 1) 2, places (flt ((2 ^ 53 - 1) * 2 ^ 971) 1) 0,
    places (flt 0 1) 2, places (int 24) 2, places (int 24) 0,
    places (big 123456789012345678901) 2, places (dec 24456 3) 2, places (dec 24456 3) 0,
    places (dec 125 3) 2, places (dec (-4) 3) 2,
    places (dec 123456789123456789123456789 27) 20,
    both (flt 12345678 10000) 6 1, both (flt 12345678 10000) 3 2, both (flt 12451 10000) 4 2,
    both (flt 125 100) 5 3, both (dec 12345678 4) 6 1,
    text (flt 314159 100000) none, text (flt 314159 100000) (some 2),
    text (flt 1000000000000000000000 1) none, text (flt 15 100000000) none,
    text (flt 2 1) none, text (flt 0 1) none, text (int 42) none,
    text (int 1234567890123456768) none, text (big 123456789012345678901) none,
    text (dec 245 1) none, text (dec 1 (-3)) none,
    fixed (int 24) none 2, fixed (flt 245 10) none 2, fixed (flt 24567 1000) none 2,
    fixed (flt 30000000000000004 100000000000000000) none 2, fixed (flt 24567 1000) none 0,
    fixed (flt 0 1) none 2, fixed (flt 4 1000) none 2, fixed (flt (-4) 1000) none 2,
    fixed (flt (-24456) 1000) none 1, fixed (flt 5 100) none 3, fixed (flt (-5) 100) none 3,
    fixed (flt 15 100000000) none 8, fixed (flt 1000000000000000000000 1) none 2,
    fixed (int 1234567890123456768) none 1, fixed (int 24) none 0,
    fixed (big 123456789012345678901) none 2, fixed (dec 24456 3) none 2,
    fixed (dec 24456 3) none 0, fixed (dec 245 1) none 4, fixed (dec 1 (-3)) none 2,
    fixed (flt 12345678 10000) (some 3) 2].filterMap
    fun (x, n, p, s) => x.map (·, n, p, s)

/-- The `gens` rows of `Number.rounded` and `Number.written`: each
number met with the annotation whose record gives the options, with the
JSON of what it writes. A number it writes nothing for has no row. -/
def writtenRows (tag : String) (cases : List (Number × Option ℕ × Option ℕ × Bool)) :
    IO Unit := do
  let mut i := 0
  for (x, n, p, s) in cases do
    let some src := x.src | throw (IO.userError "a number has no text")
    let opts := (n.elim [] fun k => ["\"significant\": " ++ toString k]) ++
      (p.elim [] fun k => ["\"places\": " ++ toString k]) ++
      (if s then ["\"as\": \"string\""] else [])
    let json := if s then (x.written n p).map fun t => "\"" ++ t ++ "\""
      else (x.rounded n p).map Number.text
    if let some j := json then
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ " & gen({" ++
        ", ".intercalate opts ++ "})\t{\"v\":" ++ j ++ "}")
    i := i + 1

/-! ## What generation writes -/

mutual
/-- Written data as JSON, each number as the text it is written with, as
both engines print it: the decimal a float shows, and a big decimal
with its one place. -/
def Aontu.Data.writtenJson : Data → String
  | .num x => x.text
  | .str s => quote s
  | .bool b => if b then "true" else "false"
  | .null => "null"
  | .map fs => "{" ++ ",".intercalate (writtenMembers fs) ++ "}"
  | .list xs => "[" ++ ",".intercalate (writtenElems xs) ++ "]"
  | .addr a => quote a.text

def writtenMembers : List (String × Data) → List String
  | [] => []
  | (k, x) :: fs => (quote k ++ ":" ++ x.writtenJson) :: writtenMembers fs

def writtenElems : List Data → List String
  | [] => []
  | x :: xs => x.writtenJson :: writtenElems xs
end

/-- Documents an output annotation writes: a number rounded, at so many
places and as text; a boolean as a number and as its name; a string in
each case; a value written empty left out of a map, a list and a
spread's member, and a map of them left out in turn; an address in
each form, resolved where it is written, through a link, a copy and a
spread's template; a map's keys in each style, a key with no word, a
hidden member, a map inside a styled one; and the record riding a
reference, a copy, a spread, a name, a default and a list, beside a
fold, a call and `+`, which read the value. -/
def writeCases : List (Decls × Val) :=
  let g (fs : List (String × Val)) : Val := c .gen [m fs]
  let gs (t : String) : Val := c .gen [str t]
  let fl (a : ℤ) (d : ℕ) : Val := match Float.nearest a d with | some f => .lit (.num (.float f)) | none => .nil
  let sig (n : Val) : Val := g [("significant", n)]
  let pl (n : Val) : Val := g [("places", n)]
  let as (t : String) : Val := g [("as", str t)]
  let upr : Val := g [("case", str "upper")]
  let low : Val := g [("case", str "lower")]
  let omt : Val := g [("empty", str "omit")]
  let keep : Val := g [("empty", str "keep")]
  let ks (t : String) : Val := g [("keys", str t)]
  let form (t : String) : Val := g [("form", str t)]
  let v (t : Val) : Val := m [("v", t)]
  let dflt (x y : Val) : Val := .or [(1, x), (0, y)]
  let arms (x y : Val) : Val := .or [(0, x), (0, y)]
  let mlo (fs : List (String × Bool × Val)) : Val := .map fs none false
  [([], (v (.meet (fl 314159 100000) (sig (int 2))))),
    ([], (v (.meet (int 1234) (sig (int 2))))),
    ([], (v (.meet (fl 15 10) (as "string")))),
    ([], (v (.meet (int 24) (g [("places", int 2), ("as", str "string")])))),
    ([], (m [("v", .meet (.meet (int 7) (as "string")) (.max (nb 9))), ("w", c .add [p ["v"], int 1])])),
    ([], (v (.meet (.lit (.bool true)) (as "number")))),
    ([], (v (.meet (.lit (.bool false)) (as "number")))),
    ([], (v (.meet (.lit (.bool true)) (as "string")))),
    ([], (v (.meet (.lit (.bool false)) (as "string")))),
    ([], (v (.meet (.meet .boolean (as "number")) (.lit (.bool true))))),
    ([], (v (.or [(1, .meet (.lit (.bool false)) (as "string")), (0, .boolean)]))),
    ([], (v (.meet (str "Ada") upr))),
    ([], (v (.meet (str "Ada") low))),
    ([], (v (.meet (.meet .string upr) (str "ada")))),
    ([], (m [("m", .meet (tmpl (.meet .string upr)) (m [("a", str "x"), ("b", str "y")]))])),
    ([], (v (.meet (.meet (arms (str "active") (str "closed")) upr) (str "active")))),
    ([], (m [("u", m [("name", str "ada"), ("nick", .meet (str "") omt)])])),
    ([], (m [("u", m [("nick", .meet (str "") keep)])])),
    ([], (m [("u", m [("nick", .meet (str "x") omt)])])),
    ([], (m [("u", m [("note", .meet (.lit .null) omt), ("n", int 1)])])),
    ([], (m [("u", m [("note", .meet (.lit .null) keep)])])),
    ([], (m [("u", m [("note", .or [(1, .meet (.lit .null) omt), (0, .string)])])])),
    ([], (m [("u", m [("m", .meet (m []) omt), ("n", int 1)])])),
    ([], (m [("u", m [("m", .meet (m []) keep)])])),
    ([], (m [("u", m [("m", .meet (m [("a", int 1)]) omt)])])),
    ([], (m [("u", m [("m", .meet (m [("a", hide (int 1))]) omt)])])),
    ([], (m [("u", m [("m", .meet (m [("a", .meet (.lit .null) omt)]) omt)])])),
    ([], (m [("u", m [("m", m [("a", .meet (.lit .null) omt)])])])),
    ([], (m [("a", m [("b", .meet (m [("c", .meet (m [("d", .meet (str "") omt)]) omt)]) omt)])])),
    ([], (m [("u", m [("l", .meet (lst []) omt), ("n", int 1)])])),
    ([], (m [("u", m [("l", .meet (lst [hide (int 1)]) omt)])])),
    ([], (m [("l", lst [int 1, .meet (str "") omt, .meet (.lit .null) omt, .meet (lst []) omt, .meet (m []) omt, int 2])])),
    ([], (m [("m", .meet (tmpl (.meet .anyString omt)) (m [("a", str ""), ("b", str "x"), ("c", str "")]))])),
    ([], (m [("u", mlo [("a", true, .meet (str "") omt), ("b", true, .meet (.lit .null) omt)])])),
    ([], (.meet (m []) omt)),
    ([], (m [("u", m [("note", .meet (.meet (arms (.lit .null) .string) omt) (.lit .null))])])),
    ([], (m [("u", m [("note", .meet (.meet (arms (.lit .null) .string) omt) (str "s"))])])),
    ([], (m [("a", hide (.meet (str "") omt)), ("u", m [("b", p ["a"]), ("c", int 1)])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (form "verbatim"))])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (form "absolute"))])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (form "pointer"))])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (form "key"))])])),
    ([], (m [("x", .meet (ad 0 ["a", "b"]) (form "absolute"))])),
    ([], (m [("x", .meet (ad 0 ["a", "b"]) (form "pointer"))])),
    ([], (m [("x", .meet (ad 0 ["a", "b"]) (form "key"))])),
    ([], (m [("a", m [("x", .meet (ad 1 ["b"]) (form "absolute"))])])),
    ([], (m [("x", .meet (ad 1 ["b"]) (form "pointer"))])),
    ([], (m [("l", lst [.meet (ad 1 ["b"]) (form "absolute"), m [("q", .meet (ad 1 ["b"]) (form "absolute"))]])])),
    ([], (m [("a/b", m [("x", int 1), ("p", .meet (ad 1 ["x"]) (form "pointer"))])])),
    ([], (m [("c~d", m [("x", int 1), ("p", .meet (ad 1 ["x"]) (form "pointer"))])])),
    ([], (m [("~/", m [("x", int 1), ("p", .meet (ad 1 ["x"]) (form "pointer"))])])),
    ([], (m [("a", m [("r", .meet (c .relate []) (.meet (ad 1 ["b"]) (form "absolute"))), ("b", m [])])])),
    ([], (m [("a", m [("r", .meet (c .relate []) (.meet (ad 1 ["b"]) (form "pointer"))), ("b", m [])])])),
    ([], (m [("a", m [("r", .meet (c .relate []) (.meet (ad 1 ["b"]) (form "key"))), ("b", m [])])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (gs "key"))])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (gs "absolute"))])])),
    ([], (m [("a", m [("x", .meet (ad 2 ["b", "c"]) (gs "pointer"))])])),
    ([], (m [("a", m [("x", .meet (ad 1 ["b"]) (form "absolute"))]), ("c", m [("d", m [("e", p ["a", "x"])])])])),
    ([], (m [("y", .meet (tmpl (m [("p", .meet (ad 1 ["b"]) (form "absolute"))])) (m [("k", m []), ("j", m [])]))])),
    ([], (m [("x", .or [(1, .meet (ad 1 ["b"]) (form "absolute")), (0, .pathKind)])])),
    ([], (m [("x", .meet (arms (ad 1 ["b"]) (int 1)) (form "pointer"))])),
    ([], (m [("x", .meet (ad 2 ["b"]) (form "key"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "snake"))])),
    ([], (m [("o", .meet (m [("order_id", int 7), ("ship-to", str "Cork")]) (ks "camel"))])),
    ([], (m [("o", .meet (m [("order_id", int 7), ("ship-to", str "Cork")]) (ks "pascal"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "kebab"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "upper"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "dot"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "path"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "title"))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("shipTo", str "Cork")]) (ks "text"))])),
    ([], (m [("o", .meet (m [("HTTPServer2Go", int 1)]) (ks "kebab")), ("n", c .nom [str "HTTPServer2Go", str "kebab"])])),
    ([], (m [("o", .meet (m [("orderId", m [("innerKey", int 1)])]) (ks "snake"))])),
    ([], (m [("o", .meet (m [("orderId", .meet (m [("innerKey", int 1)]) (ks "upper"))]) (ks "snake"))])),
    ([], (m [("o", .meet (m [("_", int 1), ("-", int 2), ("aB", int 3)]) (ks "snake"))])),
    ([], (m [("o", .meet (m [("zebra_one", int 1), ("AlphaTwo", int 2)]) (ks "camel"))])),
    ([], (m [("o", .meet (.meet .mapKind (ks "snake")) (m [("orderId", int 7)]))])),
    ([], (m [("m", .meet (tmpl (.meet .mapKind (ks "snake"))) (m [("a", m [("orderId", int 1)]), ("bB", m [("shipTo", int 2)])]))])),
    ([], (m [("l", .meet (.list [] (some (.meet .mapKind (ks "snake"))) false) (lst [m [("orderId", int 1)]]))])),
    ([], (m [("o", .meet (m [("orderId", int 7), ("a_b", hide (int 1)), ("aB", int 2)]) (ks "snake"))])),
    ([], (m [("o", .meet (m [("orderId", int 7)]) (ks "snake")), ("w", p ["o", "orderId"])])),
    ([], (m [("u", m [("o", .meet (m [("a", hide (int 1))]) (g [("keys", str "snake"), ("empty", str "omit")]))])])),
    ([], (m [("o", .meet (m [("a_b", int 1), ("aB", int 2)]) (ks "verbatim"))])),
    ([], (m [("o", .meet (m [("__proto__", int 2), ("a", int 1)]) (ks "snake"))])),
    ([], (m [("x", .meet (fl 12345 10000) (sig (int 3))), ("y", p ["x"])])),
    ([], (m [("m", .meet (tmpl (.meet .number (sig (int 2)))) (m [("a", fl 1234 1000), ("b", int 5678)]))])),
    ([], (v (.meet (.pref 1 (fl 12345 10000)) (sig (int 2))))),
    ([], (v (.meet (.meet (dflt (fl 12345 10000) .float) (sig (int 2))) (fl 98765 10000)))),
    ([], (m [("x", type (.meet (fl 125 100) (sig (int 2)))), ("y", p ["x"])])),
    ([], (m [("x", hide (.meet (fl 125 100) (sig (int 2)))), ("y", p ["x"])])),
    ([], (m [("a", m [("b", .meet (fl 125 100) (sig (int 2)))]), ("c", c .sum [p ["a"]])])),
    ([], (m [("x", .meet (fl 12345 10000) (sig (int 3))), ("y", c .add [p ["x"], int 0])])),
    ([], (v (c .plus [.meet (fl 125 100) (sig (int 2)), int 1]))),
    ([], (v (arms (.meet (fl 12345 10000) (sig (int 2))) (.meet (fl 12345 10000) (sig (int 2)))))),
    ([], (v (arms (m [("a", .meet (fl 125 100) (sig (int 2)))]) (mlo [("a", false, .meet (fl 125 100) (sig (int 2))), ("b", true, .string)])))),
    ([], (v (.or [(1, .meet (fl 1255 1000) (sig (int 2))), (2, .meet (fl 1255 1000) (sig (int 1)))]))),
    ([], (v (.meet (.meet (arms .float .string) (sig (int 1))) (fl 15 10)))),
    ([], (v (.meet (.meet (arms .boolean .number) (as "string")) (int 7)))),
    ([], (v (.meet (.meet (arms .boolean .number) (as "string")) (.lit (.bool true))))),
    ([], (m [("x", .meet (.meet (fl 15 10) (pl (int 0))) (as "string")), ("y", .meet (.meet (ad 1 ["b"]) (gs "key")) (g []))])),
    ([], (v (.meet (fl 314159 100000) (pl (int 2))))),
    ([], (v (.meet (fl 125 1000) (pl (int 2))))),
    ([], (v (.meet (int 24) (pl (int 2))))),
    ([], (v (.meet (fl (-4) 1000) (pl (int 2))))),
    ([], (v (.meet (fl 12451 10000) (g [("significant", int 4), ("places", int 2)])))),
    ([], (v (.meet (.meet (fl 12451 10000) (pl (int 2))) (sig (int 4))))),
    ([], (v (.meet (fl 314159 100000) (g [("significant", str "all")])))),
    ([], (v (.meet (fl 314159 100000) (g [])))),
    ([], (v (.meet (fl 314159 100000) (as "number")))),
    ([], (v (.meet (.meet .number (as "string")) (int 7)))),
    ([], (v (.meet (fl 245 10) (g [("places", int 2), ("as", str "string")])))),
    ([], (v (.meet (fl (-4) 1000) (g [("places", int 2), ("as", str "string")])))),
    ([], (m [("m", .meet (tmpl (.meet .number (g [("places", int 2), ("as", str "string")]))) (m [("a", fl 1999 100), ("b", int 5)]))])),
    ([], (v (.meet (fl (-314159) 100000) (sig (int 3))))),
    ([], (v (.meet (fl 9996 100) (sig (int 3))))),
    ([], (v (.meet (int 25) (sig (int 1))))),
    ([], (v (.meet (int 999) (sig (int 2))))),
    ([("m", .meet .number (sig (int 2)))], (m [("v", .meet (.alias "m") (fl 1255 1000)), ("w", .meet (.alias "m") (fl 7777 1000))])),
    ([], (m [("x", .meet (fl 125 100) (sig (int 2))), ("y", c .copy [p ["x"]])])),
    ([], (m [("a", m [("b", .meet (fl 125 100) (sig (int 2)))]), ("c", p ["a"])])),
    ([], (v (lst [.meet (fl 12345 10000) (sig (int 2)), fl 23456 10000]))),
    ([], (m [("l", .meet (.list [] (some (.meet .number (sig (int 1)))) false) (lst [fl 125 100, int 35]))])),
    ([], (v (.meet (.pref 2 (fl 125 100)) (sig (int 2))))),
    ([], (v (.pref 1 (.meet (fl 12345 10000) (sig (int 2)))))),
    ([], (v (.meet (.ride .metadata (fl 12345 10000) [("title", .str "t")]) (sig (int 2))))),
    ([], (v (.meet (.meet (.meet .float (sig (int 2))) (.min (nb 1))) (fl 12345 10000)))),
    ([], (v (.meet (sig (int 2)) (fl 12345 10000)))),
    ([], (m [("v", .meet (fl 125 100) (g [("significant", p ["n"])])), ("n", int 2)])),
    ([], (v (.meet (fl 125 100) (g [("significant", c .add [int 1, int 1])])))),
    ([], (m [("s", hide (m [("money", m [("significant", int 2)])])), ("p", .meet (fl 314159 100000) (c .gen [p ["s", "money"]]))])),
    ([], (v (.meet (.meet (fl 12345 10000) (sig (int 2))) (.max (.num (.float ((Float.nearest 124 100).getD Float.zero))))))),
    ([], (v (.select (.meet (fl 125 100) (sig (int 1))) [(.number, str "n")] (some (str "other"))))),
    ([], (v (c .upper [.meet (fl 125 100) (sig (int 1))]))),
    ([], (m [("x", .meet (fl 12345 10000) (sig (int 3))), ("y", c .plus [str "v", p ["x"]])])),
    ([], (v (.or [(1, .meet (fl 1255 1000) (sig (int 2))), (1, .meet (fl 1255 1000) (sig (int 2)))]))),
    ([], (v (.meet (dflt (fl 12345 10000) .float) (sig (int 2))))),
    ([], (v (.meet (.meet (dflt (fl 1255 1000) .float) (sig (int 2))) (sig (int 2))))),
    ([], (v (.meet (.meet (dflt (fl 1255 1000) .float) (sig (int 2))) (dflt (fl 1255 1000) .float)))),
    ([], (m [("l", .meet (.list [] (some (.meet .boolean (as "number"))) false) (lst [.lit (.bool true), .lit (.bool false)]))])),
    ([], (m [("v", .meet (.lit (.bool true)) (as "number")), ("w", .select (p ["v"]) [(.lit (.bool true), str "yes")] (some (str "no")))])),
    ([], (m [("l", lst [.meet (str "a") upr, .meet (str "B") low, str "c"])])),
    ([], (m [("l", lst [lst [.meet (str "") omt, int 1], .meet (lst [.meet (.lit .null) omt]) omt, int 2])])),
    ([], (m [("o", .meet (m [("fooBar", .meet (str "") omt), ("bazQux", int 1)]) (ks "snake"))])),
    ([], (m [("a", .meet (str "") keep), ("b", .meet (str "") omt)])),
    ([], (m [("l", lst [.meet (m [("aB", m [("cD", int 1)])]) (ks "kebab")])])),
    ([], (m [("o", .meet (m [("a_b", .meet (str "") omt), ("aB", int 2)]) (ks "snake"))])),
    ([], (m [("m", .meet (tmpl (.meet .mapKind (ks "upper"))) (m [("x", m [("someKey", int 1)])]))])),
    ([], (m [("o", .meet (m [("orderId", int 7)]) (ks "snake")), ("c", p ["o"])])),
    ([], (m [("t", type (m [("p", .meet (ad 1 ["b"]) (form "absolute"))])), ("y", m [("z", p ["t"])])])),
    ([], (m [("y", .meet (tmpl (m [("p", .or [(1, .meet (ad 1 ["b"]) (form "absolute")), (0, .pathKind)])])) (m [("k", m [])]))])),
    ([], (m [("a", .meet (m [("r", .meet (c .relate []) (form "key")), ("b", m [])]) (m [("r", ad 0 ["a", "b"])]))])),
    ([], (.meet (m [("aB", int 1)]) (ks "snake"))),
    ([], (.meet (m [("a", int 1)]) omt)),
    ([], (m [("a", .meet (str "s") (g [])), ("b", .meet (.lit (.bool true)) (g [])), ("c", .meet (.lit .null) (g [])), ("d", .meet (m [("x", int 1)]) (g [])), ("e", .meet (lst [int 1]) (g [])), ("f", .meet (ad 0 ["a"]) (g []))])),
    ([], (v (.meet (fl 314159 100000) (g [("significant", str "all"), ("places", str "all"), ("as", str "number")])))),
    ([], (v (.meet (str "Ada") (g [("case", str "verbatim"), ("empty", str "keep")])))),
    ([], (v (.meet (.lit (.bool true)) (as "boolean")))),
    ([], (v (.meet (ad 1 ["b"]) (form "verbatim")))),
    ([], (v (.meet (m [("aB", int 1), ("c", m [])]) (g [("keys", str "verbatim"), ("empty", str "keep")])))),
    ([], (v (.meet (lst []) keep))),
    ([], (v (.meet (arms (fl 15 10) (str "a")) (sig (int 1))))),
    ([], (v (.meet (.meet (ad 1 ["b"]) (gs "key")) (g [("form", str "key")]))))]

/-- The `gens` rows of what a document writes: each case as a document,
its declarations first, with the JSON `outputW` gives. A document that
writes nothing has no row. -/
def writeRows (tag : String) (cases : List (Decls × Val)) : IO Unit := do
  let mut i := 0
  for c in cases do
    if let some j := outputW c.1 c.2 then
      let lines ← declLines c.1
      let some ssrc := c.2.cell | throw (IO.userError "a schema of the fragment has no text")
      let body := match c.2 with | .map _ _ _ => (ssrc.drop 1).dropRight 1 | _ => ssrc
      IO.println (tag ++ toString i ++ "\tgens\t" ++ "\\n".intercalate (lines ++ [body]) ++ "\t" ++ j.writtenJson)
    i := i + 1

/-! ## Variables

A variable is a name the calling program declares. Both runners bind the
same variables for every row, `specVars` in `go/spec_test.go` and
`makeVarsCtx` in `ts/test/spec.test.ts`, and a `gens` row reads them. -/

/-- The runners' bindings, as the calling program makes them: data,
each as its term, and the kind `integer`, since a binding is any value. -/
def progVars : List (String × Val) :=
  (([("foo", .integer 11), ("bar", .str "hello"), ("flag", .bool true), ("obj", .map [("x", .integer 1)]),
    ("big", .integer 1152921504606846976), ("half", .num (.float (.dyadic 3 (-1)))),
    ("off", .bool false), ("bigi", .num (.biginteger ⟨5⟩)), ("bigd", .num (.bigdecimal (.of 15 1))),
    ("nul", .null), ("PARENT", .str "q")] : List (String × Data)).map fun v => (v.1, v.2.term)) ++
    [("kint", .integer)]

/-- The declarations the bindings make, beside a document that declares none. -/
def progDecls : Decls := Decls.withVars [] progVars

/-- Variables read as the values the program binds: each binding alone,
met with a kind, a map and itself, in a list and a map, in a call, as a
default, and as the data a generator reads, and a kind the program binds
met with a number. A float, a big integer and a big decimal bind too,
and have no row, since `Data.json` writes no number but an integer. -/
def varCases : List Val :=
  let v (n : String) : Val := .var n
  [v "foo", v "bar", v "flag", v "obj", v "big", v "off", v "nul", v "PARENT",
    .meet (v "foo") .integer, .meet (v "foo") .number, .meet (v "big") .integer,
    .meet (v "obj") .mapKind, .meet (v "obj") (mp [("y", int 2)]), .meet (v "foo") (v "foo"),
    lst [v "foo", v "bar"], mp [("a", v "foo"), ("b", v "foo")],
    .call .plus [v "foo", int 1], .call .upper [v "bar"], .or [(1, v "foo"), (0, int 1)],
    .call .pack [lst [v "PARENT"], mp [("n", .hole)]],
    .meet (v "kint") (v "foo"), .meet (v "kint") (int 2)]

set_option maxRecDepth 16384 in
theorem varCases_readable : progDecls.guardedB = true ∧ progDecls.bodiesCheckableB = true ∧
    ∀ t ∈ varCases, (normaliseD progDecls (progDecls.readR (docOf t))).checkableAB = true := by decide

/-- What each case generates is the definition's output under the
program's declarations, by `outputD_iff`. -/
theorem var_output_exact : ∀ t ∈ varCases, ∀ (root j : Data),
    outputD progDecls (progDecls.readR (docOf t)) = some j ↔
      OutputD progDecls root (progDecls.readR (docOf t)) j :=
  fun t ht _ j => outputD_iff (Decls.guardedB_iff.mp varCases_readable.1)
    (Decls.bodiesCheckableB_iff.mp varCases_readable.2.1)
    ((Val.checkableAB_iff _).mp (varCases_readable.2.2 t ht)) j

/-- Variables as a path's steps, each read as its value's text: a map
read by key and a list by the index the text spells, a variable as the
first step, two variables in one path, and a `move` that hides the
member a variable names. -/
def varPathCases : List Val :=
  let keyed (k n : String) : Val := mp [("q", mp [(k, int 3)]), ("x", .path [.key "v", .key "q", .var n])]
  [keyed "11" "foo", keyed "hello" "bar", keyed "true" "flag", keyed "false" "off",
    keyed "1152921504606846976" "big", keyed "1.5" "half", keyed "5" "bigi", keyed "1.5" "bigd",
    mp [("q", lst [int 0, int 1, int 2, int 3, int 4, int 5, int 6, int 7, int 8, int 9, int 10, int 11, int 12]),
      ("x", .path [.key "v", .key "q", .var "foo"])],
    mp [("q", lst [int 5, int 6, int 7, int 8, int 9, int 10]), ("x", .path [.key "v", .key "q", .var "bigi"])],
    mp [("q", mp [("c", int 5)]), ("a", mp [("b", .path [.key "v", .var "PARENT", .key "c"])])],
    mp [("q", mp [("hello", mp [("q", int 4)])]), ("x", .path [.key "v", .key "q", .var "bar", .var "PARENT"])],
    mp [("q", mp [("hello", int 1)]), ("x", .call .move [.path [.key "v", .key "q", .var "bar"]])]]

/-- A variable case read as the definition reads a document with paths:
placed, then its paths read as names from the schema alone. -/
def varReading (t : Val) : Decls × Val :=
  ((progDecls.loaded (docOf t)).1.preparedS (progDecls.loaded (docOf t)).2).1.withPathsS
    ((progDecls.loaded (docOf t)).1.preparedS (progDecls.loaded (docOf t)).2).2

set_option maxRecDepth 16384 in
theorem varPathCases_readable : ∀ t ∈ varPathCases,
    (varReading t).1.guardedB = true ∧ (varReading t).1.bodiesCheckableB = true ∧
    (normaliseD (varReading t).1 ((varReading t).1.readR (varReading t).2)).checkableAB = true := by
  decide +kernel

/-- What each case generates is the definition's output with paths
under the program's declarations, by `outputP_iff`. -/
theorem var_path_output_exact : ∀ t ∈ varPathCases, ∀ (root j : Data),
    outputP progDecls (docOf t) = some j ↔ OutputP progDecls root (docOf t) j :=
  fun t ht _ j => outputP_iff (outputL_iff (Decls.guardedB_iff.mp (varPathCases_readable t ht).1)
    (Decls.bodiesCheckableB_iff.mp (varPathCases_readable t ht).2.1)
    ((Val.checkableAB_iff _).mp (varPathCases_readable t ht).2.2) j)

/-- The `gens` rows of the variables: each case under the key `v`, with
the JSON the engines must write for it under the runners' bindings,
the cases with paths read by `outputP`. -/
def varRows (tag : String) : IO Unit := do
  let mut i := 0
  for (t, out) in varCases.map (fun t => (t, outputD progDecls (progDecls.readR (docOf t)))) ++
      varPathCases.map (fun t => (t, outputP progDecls (docOf t))) do
    let some src := t.cell | throw (IO.userError "a variable case has no text")
    match out with
    | some (.map [("v", x)]) =>
      let some json := x.json | throw (IO.userError "an output has no JSON")
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ "\t{\"v\":" ++ json ++ "}")
    | _ => throw (IO.userError s!"a variable case generates nothing: {src}")
    i := i + 1

/-- Path values alone, met with each other by the prefix rule and with
`path` and `any`, in a disjunction and behind a preference, and in a
map and a list, for the `gens` rows k0 on. -/
def addrVals : List Val :=
  [addrAt 0 ["a"], addrAt 0 ["a", "b"], addrAt 1 ["a"], addrAt 2 ["a", "b"], addrAt 0 ["a", "0"],
    .meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"]), .meet (addrAt 0 ["a", "b"]) (addrAt 0 ["a"]),
    .meet (addrAt 1 ["a"]) (addrAt 1 ["a", "b"]), .meet (addrAt 0 ["a"]) (addrAt 0 ["a"]),
    .meet .pathKind (addrAt 0 ["a"]), .meet (addrAt 0 ["a"]) .pathKind, .meet .any (addrAt 0 ["a"]),
    .meet (.meet .pathKind (addrAt 0 ["a", "b"])) (addrAt 0 ["a"]),
    .or [(1, addrAt 0 ["a"]), (0, .pathKind)], .or [(1, addrAt 0 ["a"]), (0, addrAt 0 ["b"])],
    .meet (addrAt 0 ["a"]) (.or [(0, addrAt 0 ["a", "b"]), (0, addrAt 0 ["c"])]),
    mp [("x", addrAt 0 ["a"]), ("y", addrAt 1 ["x"])],
    .list [addrAt 0 ["a"], addrAt 2 ["b"]] none false]

theorem addrVals_checkable : ∀ v ∈ addrVals, (normalise v).Checkable := by decide

theorem addr_output_exact : ∀ v ∈ addrVals, ∀ (env : Env) (root j : Data),
    output v = some j ↔ Output env root v j :=
  fun v hv _ _ j => output_iff (addrVals_checkable v hv) j

/-- Path values met with a string constraint that reads each address by
its spelling (decision 23 of the design note's §7), where the address the
path value spells passes: a size, written before the path and after it,
beside `path` and over a bound of its own, each bound with a string end,
beside another path value and a relative one, for the `gens` rows ks0
on. -/
def spellVals : List Val :=
  let s (b : String) : Bound := .str b
  [.meet (addrAt 0 ["a"]) (.len (n 3)), .meet (.len (n 3)) (addrAt 0 ["a"]),
    .meet (addrAt 0 ["a"]) (.min (s "$")), .meet (.min (s "$.a")) (addrAt 0 ["a"]),
    .meet (addrAt 0 ["a", "b"]) (.above (s "$.a")), .meet (addrAt 0 ["a"]) (.max (s "$.b")),
    .meet (.max (s "$.b")) (addrAt 0 ["a"]), .meet (addrAt 0 ["a"]) (.beneath (s "$.b")),
    .meet (.meet (addrAt 0 ["a", "b"]) (addrAt 0 ["a"])) (.above (s "$.a")),
    .meet (.meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"])) (.len (n 5)),
    .meet (addrAt 1 ["a"]) (.len (n 2)),
    .meet (.meet .pathKind (.len (n 3))) (addrAt 0 ["a"]),
    .meet (addrAt 0 ["a"]) (.len (.min (.num (.integer ⟨2, by decide⟩)))),
    .meet (.meet (addrAt 0 ["a"]) (.min (s "$.a"))) (.max (s "$.b"))]

theorem spellVals_checkable : ∀ v ∈ spellVals, (normalise v).Checkable := by decide

theorem spell_output_exact : ∀ v ∈ spellVals, ∀ (env : Env) (root j : Data),
    output v = some j ↔ Output env root v j :=
  fun v hv _ _ j => output_iff (spellVals_checkable v hv) j

import Aontu.Syntax

/-!
# The oracle's printer

Values and data as text, in the spelling of the published
grammar `grammar/aontu.abnf`, every key quoted as canon writes it. It
is no part of the definition, which says nothing about text: that an
engine reads this text as this value is a claim about its reader, which
the rows test and no theorem makes. It prints the forms the oracle
writes, data as well as terms in aontu's own syntax, and answers `none`
for a sealed map and a path.
-/

namespace Aontu

/-- `s` as a JSON string: `"`, `\` and the control characters escaped. -/
def quote (s : String) : String :=
  "\"" ++ String.join (s.toList.map esc) ++ "\""
where
  esc (c : Char) : String :=
    if c = '"' then "\\\""
    else if c = '\\' then "\\\\"
    else if c.toNat < 0x20 then
      let ds := Nat.toDigits 16 c.toNat
      "\\u" ++ String.mk (List.replicate (4 - ds.length) '0' ++ ds)
    else c.toString

/-- A big decimal's digits, its point placed by its scale: `0.5`, `1.25`. -/
def BigDecimal.digits (x : BigDecimal) : String :=
  if x.scale ≤ 0 then toString (x.coef.natAbs * 10 ^ (-x.scale).toNat)
  else
    let s := x.scale.toNat
    let digits := toString x.coef.natAbs
    let padded := String.mk (List.replicate (s + 1 - digits.length) '0') ++ digits
    let cut := padded.length - s
    padded.take cut ++ "." ++ padded.drop cut

/-- A float's text: the decimal it shows, with a point so that it reads
back as a float: `1.0`, `1.5`, `100.0`. -/
def Float.src (x : Float) : String :=
  let (c, k) := x.shortest
  let digits := toString c.natAbs
  let sign := if c < 0 then "-" else ""
  if 0 ≤ k then sign ++ digits ++ String.mk (List.replicate k.toNat '0') ++ ".0"
  else
    let s := (-k).toNat
    let padded := String.mk (List.replicate (s + 1 - digits.length) '0') ++ digits
    let cut := padded.length - s
    sign ++ padded.take cut ++ "." ++ padded.drop cut

/-- A number as aontu writes it in a term, each leaf marked so that it
reads back in its leaf: an integer plainly, a float with a point, an
exact number after `0d`, an integral big decimal with one decimal
place. -/
def Number.src : Number → Option String
  | .integer x => some (toString x.value)
  | .float x => some x.src
  | .biginteger x => some ((if x.value < 0 then "-" else "") ++ "0d" ++ toString x.value.natAbs)
  | .bigdecimal x =>
    some ((if x.coef < 0 then "-" else "") ++ "0d" ++ x.digits ++ (if x.scale ≤ 0 then ".0" else ""))

def Scalar.src : Scalar → Option String
  | .num x => x.src
  | .str s => some (quote s)
  | .bool b => some (if b then "true" else "false")
  | .null => some "null"

def Bound.src : Bound → Option String
  | .num n => n.src
  | .str s => some (quote s)

/-- A value behind its stars: a map or list literal as it stands, since
both engines read `*(` before a literal container as a bag (#349), and
anything else in parentheses. -/
def prefSrc (r : ℕ) (s : String) : String :=
  let stars := String.mk (List.replicate r '*')
  if s.startsWith "{" || s.startsWith "[" then stars ++ s else stars ++ s!"({s})"

mutual
def Val.src : Val → Option String
  | .integer => some "integer"
  | .float => some "float"
  | .biginteger => some "biginteger"
  | .bigdecimal => some "bigdecimal"
  | .number => some "number"
  | .string => some "string"
  | .anyString => some "string & empty()"
  | .boolean => some "boolean"
  | .lit s => s.src
  | .min b => do pure s!"min({← b.src})"
  | .max b => do pure s!"max({← b.src})"
  | .above b => do pure s!"above({← b.src})"
  | .beneath b => do pure s!"below({← b.src})"
  | .neq vs => do pure s!"neq({", ".intercalate (← vs.mapM Bound.src)})"
  | .multiple d => do pure s!"multiple({← d.src})"
  | .len c => do pure s!"len({← c.src})"
  | .unique none => some "unique()"
  | .unique (some k) => some s!"unique({quote k})"
  | .re p => some s!"re({quote p})"
  | .format g => some s!"format({quote g})"
  | .any => some "any"
  | .nil => some "nil"
  | .map fs spread false => do
    let entries ← fieldsSrc fs
    let rest ← spreadSrc spread
    pure ("{" ++ ", ".intercalate (entries ++ rest) ++ "}")
  | .map _ _ true => none
  | .list items spread closed => do
    let entries ← itemsSrc items
    let rest ← spreadSrc spread
    let body := "[" ++ ", ".intercalate (entries ++ rest) ++ "]"
    pure (if closed then s!"close({body})" else body)
  | .or arms => do pure (" | ".intercalate (← armsSrc arms))
  | .pref r x => do pure (prefSrc r (← x.src))
  | .meet a b => do pure s!"({← a.src}) & ({← b.src})"
  | .alias n => some ("%" ++ n)
  | .path _ => none

def fieldsSrc : List (String × Bool × Val) → Option (List String)
  | [] => some []
  | (k, o, v) :: fs => do
    let t ← v.src
    let rest ← fieldsSrc fs
    pure ((quote k ++ (if o then "?" else "") ++ ": " ++ t) :: rest)

def spreadSrc : Option Val → Option (List String)
  | none => some []
  | some s => do pure ["&: " ++ (← s.src)]

def itemsSrc : List Val → Option (List String)
  | [] => some []
  | v :: vs => do pure ((← v.src) :: (← itemsSrc vs))

/-- Each arm in parentheses, a preferred one behind its stars. -/
def armsSrc : List (ℕ × Val) → Option (List String)
  | [] => some []
  | (r, a) :: arms => do
    let s ← a.src
    pure ((if r = 0 then s!"({s})" else prefSrc r s) :: (← armsSrc arms))
end

mutual
def Data.src : Data → Option String
  | .num x => x.src
  | .str s => some (quote s)
  | .bool b => some (if b then "true" else "false")
  | .null => some "null"
  | .map fs => do pure ("{" ++ ", ".intercalate (← membersSrc fs) ++ "}")
  | .list xs => do pure ("[" ++ ", ".intercalate (← elemsSrc xs) ++ "]")

def membersSrc : List (String × Data) → Option (List String)
  | [] => some []
  | (k, x) :: fs => do pure ((quote k ++ ": " ++ (← x.src)) :: (← membersSrc fs))

def elemsSrc : List Data → Option (List String)
  | [] => some []
  | x :: xs => do pure ((← x.src) :: (← elemsSrc xs))
end

/-! ## JSON

What the engines write for a generated document: compact JSON with the
members in key order, which the `gens` mode compares byte for byte. A
number of any leaf but `integer` has no text here, since its JSON is a
reader's choice the rows keep away from. -/

mutual
def Data.json : Data → Option String
  | .num (.integer x) => some (toString x.value)
  | .num _ => none
  | .str s => some (quote s)
  | .bool b => some (if b then "true" else "false")
  | .null => some "null"
  | .map fs => do pure ("{" ++ ",".intercalate (← membersJson fs) ++ "}")
  | .list xs => do pure ("[" ++ ",".intercalate (← elemsJson xs) ++ "]")

def membersJson : List (String × Data) → Option (List String)
  | [] => some []
  | (k, x) :: fs => do pure ((quote k ++ ":" ++ (← x.json)) :: (← membersJson fs))

def elemsJson : List Data → Option (List String)
  | [] => some []
  | x :: xs => do pure ((← x.json) :: (← elemsJson xs))
end

end Aontu

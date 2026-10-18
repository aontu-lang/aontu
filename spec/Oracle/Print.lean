import Aontu.Syntax

/-!
# The oracle's printer

Values and data as text, in the spelling of the published
grammar `grammar/aontu.abnf`, every key quoted as canon writes it. It
is no part of the definition, which says nothing about text: that an
engine reads this text as this value is a claim about its reader, which
the rows test and no theorem makes. It prints the forms the oracle
writes, data as well as terms in aontu's own syntax, and answers `none`
for a sealed map, a list term, an alias, a path, and a float.
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
def Decimal.digits (x : Decimal) : String :=
  if x.scale ≤ 0 then toString (x.coef.natAbs * 10 ^ (-x.scale).toNat)
  else
    let s := x.scale.toNat
    let digits := toString x.coef.natAbs
    let padded := String.mk (List.replicate (s + 1 - digits.length) '0') ++ digits
    let cut := padded.length - s
    padded.take cut ++ "." ++ padded.drop cut

/-- A number as aontu writes it in a term, each leaf marked so that it
reads back in its leaf: an integer plainly, an exact number after `0d`,
an integral big decimal with one decimal place. The oracle writes no
float. -/
def Number.src : Number → Option String
  | .int n => some (toString n)
  | .float _ => none
  | .bigint n => some ((if n < 0 then "-" else "") ++ "0d" ++ toString n.natAbs)
  | .bigdec x =>
    some ((if x.coef < 0 then "-" else "") ++ "0d" ++ x.digits ++ (if x.scale ≤ 0 then ".0" else ""))

def Scalar.src : Scalar → Option String
  | .num x => x.src
  | .str s => some (quote s)
  | .bool b => some (if b then "true" else "false")
  | .null => some "null"

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
  | .min n => do pure s!"min({← n.src})"
  | .max n => do pure s!"max({← n.src})"
  | .multiple d => do pure s!"multiple({← d.src})"
  | .any => some "any"
  | .nil => some "nil"
  | .map fs spread false => do
    let entries ← fieldsSrc fs
    let rest ← spreadSrc spread
    pure ("{" ++ ", ".intercalate (entries ++ rest) ++ "}")
  | .map _ _ true => none
  | .list _ _ => none
  | .meet a b => do pure s!"({← a.src}) & ({← b.src})"
  | .alias _ => none
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

end Aontu

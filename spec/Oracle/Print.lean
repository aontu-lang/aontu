import Aontu.Syntax

/-!
# The oracle's printer

Values and JSON values as text, in the spelling of the published
grammar `grammar/aontu.abnf`, every key quoted as canon writes it. It
is no part of the definition, which says nothing about text: that an
engine reads this text as this value is a claim about its reader, which
the rows test and no theorem makes. It prints the forms the oracle
writes, and answers `none` for a sealed map, a list, an alias, and a
path.
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

/-- A number as JSON text: its digits, with the point `scale` places from
the end when it has one. -/
def Num.src (x : Num) : String :=
  if x.scale = 0 then toString x.coef
  else
    let digits := toString x.coef.natAbs
    let padded := String.mk (List.replicate (x.scale + 1 - digits.length) '0') ++ digits
    let cut := padded.length - x.scale
    (if x.coef < 0 then "-" else "") ++ padded.take cut ++ "." ++ padded.drop cut

def Scalar.src : Scalar → String
  | .null => "null"
  | .bool b => if b then "true" else "false"
  | .int n => toString n
  | .str s => quote s

mutual
def Val.src : Val → Option String
  | .any => some "any"
  | .nil => some "nil"
  | .boolean => some "boolean"
  | .number => some "number"
  | .integer => some "integer"
  | .string => some "string"
  | .anyString => some "string & empty()"
  | .lit s => some s.src
  | .min n => some s!"min({n.src})"
  | .max n => some s!"max({n.src})"
  | .multiple d => some s!"multiple({d.src})"
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
def Json.src : Json → String
  | .null => "null"
  | .bool b => if b then "true" else "false"
  | .num x => x.src
  | .str s => quote s
  | .arr xs => "[" ++ ", ".intercalate (elemsSrc xs) ++ "]"
  | .obj fs => "{" ++ ", ".intercalate (membersSrc fs) ++ "}"

def elemsSrc : List Json → List String
  | [] => []
  | x :: xs => x.src :: elemsSrc xs

def membersSrc : List (String × Json) → List String
  | [] => []
  | (k, x) :: fs => (quote k ++ ": " ++ x.src) :: membersSrc fs
end

end Aontu

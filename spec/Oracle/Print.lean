import Aontu.Syntax

/-!
# The oracle's printer

Values and JSON values as text, in the spelling of the published
grammar `grammar/aontu.abnf`, every key quoted as canon writes it. It
is no part of the definition, which says nothing about text: that an
engine reads this text as this value is a claim about its reader, which
the rows test and no theorem makes. It prints the forms the oracle
writes, and answers `none` for a sealed map, a list, an alias, a path,
and a number JSON cannot write.
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

/-- A number as JSON text: an integer as its digits, and a fraction as
the decimal that writes it, which exists when `den` divides a power of
ten, at most the `den`th. -/
def Rat.src (x : Rat) : Option String :=
  if x.den = 1 then some (toString x.num)
  else do
    let k ← (List.range x.den).find? fun k => 10 ^ k % x.den = 0
    let digits := toString (x.num.natAbs * (10 ^ k / x.den))
    let padded := String.mk (List.replicate (k + 1 - digits.length) '0') ++ digits
    let cut := padded.length - k
    pure ((if x.num < 0 then "-" else "") ++ padded.take cut ++ "." ++ padded.drop cut)

def Scalar.src : Scalar → String
  | .int n => toString n
  | .str s => quote s
  | .bool b => if b then "true" else "false"
  | .null => "null"

mutual
def Val.src : Val → Option String
  | .integer => some "integer"
  | .number => some "number"
  | .string => some "string"
  | .anyString => some "string & empty()"
  | .boolean => some "boolean"
  | .lit s => some s.src
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
def Json.src : Json → Option String
  | .num x => x.src
  | .str s => some (quote s)
  | .bool b => some (if b then "true" else "false")
  | .null => some "null"
  | .arr xs => do pure ("[" ++ ", ".intercalate (← elemsSrc xs) ++ "]")
  | .obj fs => do pure ("{" ++ ", ".intercalate (← membersSrc fs) ++ "}")

def elemsSrc : List Json → Option (List String)
  | [] => some []
  | x :: xs => do pure ((← x.src) :: (← elemsSrc xs))

def membersSrc : List (String × Json) → Option (List String)
  | [] => some []
  | (k, x) :: fs => do pure ((quote k ++ ": " ++ (← x.src)) :: (← membersSrc fs))
end

end Aontu

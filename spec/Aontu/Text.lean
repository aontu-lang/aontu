import Aontu.Data

/-!
# Text

The escaping conventions `esc` writes and `usc` reads back, on a
string's code points. A convention is a function from text to text and
a partial inverse, which refuses text no text escapes to: a lone quote
where the convention doubles it, an escape it does not define, a code
point a surrogate pair or a byte sequence does not spell.
-/

namespace Aontu

/-! ## Digits -/

/-- A hexadecimal digit's character, lowercase or uppercase. -/
def hexChar (upper : Bool) (d : ℕ) : Char :=
  if d < 10 then Char.ofNat (48 + d) else Char.ofNat ((if upper then 55 else 87) + d)

/-- `n`'s last `w` hexadecimal digits, the leading ones zeros. -/
def hexPad (upper : Bool) (w n : ℕ) : List Char :=
  ((List.range w).reverse).map fun k => hexChar upper (n / 16 ^ k % 16)

/-- A hexadecimal digit's value, of either case. -/
def hexValue? (c : Char) : Option ℕ :=
  if '0' ≤ c ∧ c ≤ '9' then some (c.toNat - 48)
  else if 'a' ≤ c ∧ c ≤ 'f' then some (c.toNat - 87)
  else if 'A' ≤ c ∧ c ≤ 'F' then some (c.toNat - 55)
  else none

/-- Four hexadecimal digits' value. -/
def hex4? (a b c d : Char) : Option ℕ := do
  let a ← hexValue? a
  let b ← hexValue? b
  let c ← hexValue? c
  let d ← hexValue? d
  pure (((a * 16 + b) * 16 + c) * 16 + d)

/-! ## The C family -/

/-- The C escape in the quote `q`: a backslash, the quote and the five
short forms escaped, any other control character below U+0020 written
`\uXXXX` in lowercase, as JSON writes it, and the rest, U+007F among
it, as it stands. -/
def escC (q : Char) : List Char → List Char :=
  List.flatMap fun c =>
    if c = '\\' then ['\\', '\\']
    else if c = q then ['\\', q]
    else if c = '\n' then ['\\', 'n']
    else if c = '\r' then ['\\', 'r']
    else if c = '\t' then ['\\', 't']
    else if c = Char.ofNat 8 then ['\\', 'b']
    else if c = Char.ofNat 12 then ['\\', 'f']
    else if c.toNat < 0x20 then '\\' :: 'u' :: hexPad false 4 c.toNat
    else [c]

/-- The character a short C escape names after its backslash, the quote
`q` among them. -/
def cShort (q n : Char) : Option Char :=
  if n = '\\' then some '\\'
  else if n = q then some q
  else if n = 'n' then some '\n'
  else if n = 'r' then some '\r'
  else if n = 't' then some '\t'
  else if n = 'b' then some (Char.ofNat 8)
  else if n = 'f' then some (Char.ofNat 12)
  else none

/-- The C escape read back: a short form, or a `\uXXXX` that names a
character, a high surrogate only with the low one that completes it;
none for any other escape, a lone surrogate, or a backslash that ends
the text. -/
def uscC (q : Char) : List Char → Option (List Char)
  | [] => some []
  | '\\' :: 'u' :: a :: b :: c :: d :: rest =>
    match hex4? a b c d with
    | none => none
    | some hi =>
      if 0xD800 ≤ hi ∧ hi ≤ 0xDBFF then
        match rest with
        | '\\' :: 'u' :: e :: f :: g :: h :: rest' =>
          match hex4? e f g h with
          | some lo =>
            if 0xDC00 ≤ lo ∧ lo ≤ 0xDFFF then
              (Char.ofNat (0x10000 + (hi - 0xD800) * 0x400 + (lo - 0xDC00)) :: ·) <$> uscC q rest'
            else none
          | none => none
        | _ => none
      else if 0xDC00 ≤ hi ∧ hi ≤ 0xDFFF then none
      else (Char.ofNat hi :: ·) <$> uscC q rest
  | '\\' :: n :: rest => (cShort q n).bind fun c => (c :: ·) <$> uscC q rest
  | ['\\'] => none
  | c :: rest => (c :: ·) <$> uscC q rest

/-! ## Quoting by doubling -/

/-- Standard SQL: the quote doubled. -/
def escSql : List Char → List Char :=
  List.flatMap fun c => if c = '\'' then ['\'', '\''] else [c]

/-- A doubled quote read back; a lone quote has no original. -/
def uscSql : List Char → Option (List Char)
  | [] => some []
  | '\'' :: '\'' :: rest => ('\'' :: ·) <$> uscSql rest
  | '\'' :: _ => none
  | c :: rest => (c :: ·) <$> uscSql rest

/-- POSIX single quotes: a quote inside closes them, escapes a quote and
opens them again. -/
def escShell : List Char → List Char :=
  List.flatMap fun c => if c = '\'' then ['\'', '\\', '\'', '\''] else [c]

/-- The closed, escaped and reopened quote read back; any other quote
has no original. -/
def uscShell : List Char → Option (List Char)
  | [] => some []
  | '\'' :: '\\' :: '\'' :: '\'' :: rest => ('\'' :: ·) <$> uscShell rest
  | '\'' :: _ => none
  | c :: rest => (c :: ·) <$> uscShell rest

/-! ## Entities -/

/-- XML's five entities, which cover HTML. -/
def escXml : List Char → List Char :=
  List.flatMap fun c =>
    if c = '&' then "&amp;".toList
    else if c = '<' then "&lt;".toList
    else if c = '>' then "&gt;".toList
    else if c = '"' then "&quot;".toList
    else if c = '\'' then "&apos;".toList
    else [c]

/-- The five entities read back; any other `&` has no original. -/
def uscXml : List Char → Option (List Char)
  | [] => some []
  | '&' :: 'a' :: 'm' :: 'p' :: ';' :: rest => ('&' :: ·) <$> uscXml rest
  | '&' :: 'l' :: 't' :: ';' :: rest => ('<' :: ·) <$> uscXml rest
  | '&' :: 'g' :: 't' :: ';' :: rest => ('>' :: ·) <$> uscXml rest
  | '&' :: 'q' :: 'u' :: 'o' :: 't' :: ';' :: rest => ('"' :: ·) <$> uscXml rest
  | '&' :: 'a' :: 'p' :: 'o' :: 's' :: ';' :: rest => ('\'' :: ·) <$> uscXml rest
  | '&' :: _ => none
  | c :: rest => (c :: ·) <$> uscXml rest

/-! ## Percent-encoding -/

/-- A code point's UTF-8 bytes. -/
def utf8Bytes (c : Char) : List ℕ :=
  let n := c.toNat
  if n < 0x80 then [n]
  else if n < 0x800 then [0xC0 + n / 64, 0x80 + n % 64]
  else if n < 0x10000 then [0xE0 + n / 4096, 0x80 + n / 64 % 64, 0x80 + n % 64]
  else [0xF0 + n / 262144, 0x80 + n / 4096 % 64, 0x80 + n / 64 % 64, 0x80 + n % 64]

/-- Whether a byte continues a UTF-8 sequence. -/
def utf8Cont (b : ℕ) : Bool := 0x80 ≤ b && b < 0xC0

/-- Bytes read as UTF-8, strictly: none for a byte that starts no
sequence, a sequence cut short, an overlong form, a surrogate or a
value past U+10FFFF. -/
def utf8Decode : List ℕ → Option (List Char)
  | [] => some []
  | b :: rest =>
    if b < 0x80 then (Char.ofNat b :: ·) <$> utf8Decode rest
    else if 0xC0 ≤ b ∧ b < 0xE0 then
      match rest with
      | c1 :: rest' =>
        let n := (b - 0xC0) * 64 + (c1 - 0x80)
        if utf8Cont c1 && 0x80 ≤ n then (Char.ofNat n :: ·) <$> utf8Decode rest' else none
      | _ => none
    else if 0xE0 ≤ b ∧ b < 0xF0 then
      match rest with
      | c1 :: c2 :: rest' =>
        let n := (b - 0xE0) * 4096 + (c1 - 0x80) * 64 + (c2 - 0x80)
        if utf8Cont c1 && utf8Cont c2 && 0x800 ≤ n && !(0xD800 ≤ n && n ≤ 0xDFFF) then
          (Char.ofNat n :: ·) <$> utf8Decode rest'
        else none
      | _ => none
    else if 0xF0 ≤ b ∧ b < 0xF8 then
      match rest with
      | c1 :: c2 :: c3 :: rest' =>
        let n := (b - 0xF0) * 262144 + (c1 - 0x80) * 4096 + (c2 - 0x80) * 64 + (c3 - 0x80)
        if utf8Cont c1 && utf8Cont c2 && utf8Cont c3 && 0x10000 ≤ n && n ≤ 0x10FFFF then
          (Char.ofNat n :: ·) <$> utf8Decode rest'
        else none
      | _ => none
    else none

/-- Whether a character is one RFC 3986 leaves unreserved. -/
def uriUnreserved (c : Char) : Bool :=
  ('A' ≤ c && c ≤ 'Z') || ('a' ≤ c && c ≤ 'z') || ('0' ≤ c && c ≤ '9') ||
    c = '-' || c = '.' || c = '_' || c = '~'

/-- Percent-encoding, RFC 3986: an unreserved character as it stands,
and every other one as its UTF-8 bytes, each `%` and two uppercase
hexadecimal digits. -/
def escUri : List Char → List Char :=
  List.flatMap fun c =>
    if uriUnreserved c then [c] else (utf8Bytes c).flatMap fun b => '%' :: hexPad true 2 b

/-- The bytes percent-encoded text spells: a `%` and two hexadecimal
digits of either case a byte, and any other character its UTF-8 bytes;
none for a `%` without its two digits. -/
def uriBytes : List Char → Option (List ℕ)
  | [] => some []
  | '%' :: h :: l :: rest =>
    match hexValue? h, hexValue? l with
    | some h, some l => ((h * 16 + l) :: ·) <$> uriBytes rest
    | _, _ => none
  | '%' :: _ => none
  | c :: rest => (utf8Bytes c ++ ·) <$> uriBytes rest

/-- Percent-encoding read back: the bytes it spells, read as UTF-8. -/
def uscUri (cs : List Char) : Option (List Char) := (uriBytes cs).bind utf8Decode

/-! ## Patterns -/

/-- The metacharacters of a pattern, which `regex` escapes. -/
def regexPunct : List Char := "\\.+*?()[]{}|^$/".toList

/-- A pattern's metacharacters each after a backslash, so a pattern
reads them literally. -/
def escRegex : List Char → List Char :=
  List.flatMap fun c => if c ∈ regexPunct then ['\\', c] else [c]

/-- A backslash and a metacharacter read back; a backslash before
anything else has no original. -/
def uscRegex : List Char → Option (List Char)
  | [] => some []
  | '\\' :: n :: rest => if n ∈ regexPunct then (n :: ·) <$> uscRegex rest else none
  | ['\\'] => none
  | c :: rest => (c :: ·) <$> uscRegex rest

/-! ## The conventions -/

/-- The conventions `esc` and `usc` name: C and JSON in double quotes,
where no variant is given, then single-quoted C, standard SQL, POSIX
shell quoting, XML's entities, percent-encoding and a pattern's
metacharacters. -/
inductive Escape where
  | dq | sq | sql | shell | xml | uri | regex
  deriving DecidableEq

/-- The convention a variant names; none for any other name. -/
def Escape.ofName? : String → Option Escape
  | "sq" => some .sq
  | "sql" => some .sql
  | "shell" => some .shell
  | "xml" => some .xml
  | "uri" => some .uri
  | "regex" => some .regex
  | _ => none

/-- Text written in a convention. -/
def Escape.esc : Escape → List Char → List Char
  | .dq => escC '"'
  | .sq => escC '\''
  | .sql => escSql
  | .shell => escShell
  | .xml => escXml
  | .uri => escUri
  | .regex => escRegex

/-- Text read back out of a convention; none where it has no original. -/
def Escape.usc : Escape → List Char → Option (List Char)
  | .dq => uscC '"'
  | .sq => uscC '\''
  | .sql => uscSql
  | .shell => uscShell
  | .xml => uscXml
  | .uri => uscUri
  | .regex => uscRegex

end Aontu

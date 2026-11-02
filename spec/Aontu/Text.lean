import Aontu.Data

/-!
# Text

The escaping conventions `esc` writes and `usc` reads back, on a
string's code points. A convention is a function from text to text and
a partial inverse, which refuses text no text escapes to: a lone quote
where the convention doubles it, an escape it does not define, a code
point a surrogate pair or a byte sequence does not spell.

The words of a name and the nine spellings `nom` writes them in.

And what `rep` and `split` make of a pattern's matches. Where a match
falls is the host's regex engine's to say; which matches a scan of the
text reads, the fields they cut it into, and what a replacement writes
for each are aontu's, read as Go's regexp reads them.
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

/-! ## Names -/

/-- Whether a character separates the words of a name. -/
def nameSep (c : Char) : Bool := c == '_' || c == '-' || c == ' '

/-- Whether a new word starts at `c`, `prev` the character before it in
the word and `next` the one after it in the name: both ASCII, and a
capital after a small letter or a digit, a digit beside a non-digit,
or the last capital of a run that a small letter follows. -/
def wordStarts (prev c : Char) (next : Option Char) : Bool :=
  c.toNat < 128 && prev.toNat < 128 &&
    ((c.isUpper && (prev.isLower || prev.isDigit)) || c.isDigit != prev.isDigit ||
      (c.isUpper && prev.isUpper && (next.map Char.isLower).getD false))

/-- The words of a name from here on, `cur` the word being read,
reversed, and `acc` the words before it, reversed. -/
def nameWordsGo : List Char → List Char → List (List Char) → List (List Char)
  | [], cur, acc => (if cur = [] then acc else cur.reverse :: acc).reverse
  | c :: rest, cur, acc =>
    if nameSep c then nameWordsGo rest [] (if cur = [] then acc else cur.reverse :: acc)
    else match cur with
      | [] => nameWordsGo rest [c] acc
      | prev :: _ =>
        if wordStarts prev c rest.head? then nameWordsGo rest [c] (cur.reverse :: acc)
        else nameWordsGo rest (c :: cur) acc

/-- The words of a name: the runs between `_`, `-` and spaces, each
cut again where `wordStarts`, so `HTTPServer` is `HTTP` and `Server`
and `v2Api` is `v`, `2` and `Api`. -/
def nameWords (cs : List Char) : List (List Char) := nameWordsGo cs [] []

/-- A word capitalised: the first acronym that matches it, ignoring
ASCII case, as the acronym is written, and otherwise the word in small
letters with its first one a capital. -/
def capitalise (acr : List (List Char)) (w : List Char) : List Char :=
  let low := w.map Char.toLower
  match acr.find? (fun a => a.map Char.toLower == low) with
  | some a => a
  | none => match low with
    | [] => []
    | c :: cs => c.toUpper :: cs

/-- Whether a word is one of the acronyms, ignoring ASCII case. -/
def isAcronym (acr : List (List Char)) (w : List Char) : Bool :=
  acr.any fun a => a.map Char.toLower == w.map Char.toLower

/-- The spellings `nom` writes a name in. -/
inductive NameStyle where
  | camel | dot | kebab | pascal | path | snake | text | title | upper
  deriving DecidableEq

/-- Every spelling, in the order the map of them is written. -/
def NameStyle.all : List NameStyle := [.camel, .dot, .kebab, .pascal, .path, .snake, .text, .title, .upper]

/-- A spelling's name. -/
def NameStyle.name : NameStyle → String
  | .camel => "camel" | .dot => "dot" | .kebab => "kebab" | .pascal => "pascal" | .path => "path"
  | .snake => "snake" | .text => "text" | .title => "title" | .upper => "upper"

/-- The spelling a style names; none for any other string. -/
def NameStyle.ofName? (s : String) : Option NameStyle := NameStyle.all.find? (·.name == s)

/-- A name's words in a spelling, an acronym capitalised as it is
written wherever a word is capitalised: `camel` the first word small
and the rest capitalised, never the first an acronym; `pascal` every
word capitalised; `snake`, `kebab`, `dot` and `path` the words small,
joined by `_`, `-`, `.` and `/`; `upper` the words in capitals joined
by `_`; `title` every word capitalised and `text` the first, the rest
small but an acronym, each joined by a space. -/
def NameStyle.write (acr : List (List Char)) : NameStyle → List (List Char) → List Char
  | .camel, [] => []
  | .camel, w :: ws => w.map Char.toLower ++ (ws.map (capitalise acr)).flatten
  | .pascal, ws => (ws.map (capitalise acr)).flatten
  | .snake, ws => ['_'].intercalate (ws.map (·.map Char.toLower))
  | .kebab, ws => ['-'].intercalate (ws.map (·.map Char.toLower))
  | .dot, ws => ['.'].intercalate (ws.map (·.map Char.toLower))
  | .path, ws => ['/'].intercalate (ws.map (·.map Char.toLower))
  | .upper, ws => ['_'].intercalate (ws.map (·.map Char.toUpper))
  | .title, ws => [' '].intercalate (ws.map (capitalise acr))
  | .text, [] => []
  | .text, w :: ws =>
    [' '].intercalate (capitalise acr w :: ws.map fun v =>
      if isAcronym acr v then capitalise acr v else v.map Char.toLower)

/-- A name in a spelling, `.` and `/` read as `_`; none where the name
holds no word. -/
def nomName (acr : List (List Char)) (st : NameStyle) (name : List Char) : Option (List Char) :=
  match nameWords (name.map fun c => if c == '.' || c == '/' then '_' else c) with
  | [] => none
  | ws => some (st.write acr ws)

/-! ## Matches -/

/-- Where a pattern matches a text: the code point the match starts at
and the one it stops before, and what each of the pattern's groups
captured, `none` where a group took no part. -/
structure Match where
  start : ℕ
  stop : ℕ
  groups : List (Option String)

/-- Every match a scan of a text reads, from the left, given the
leftmost match at or after each position: a scan resumes where the
last match stopped, one code point on after an empty match, and an
empty match that starts where the last match stopped counts for
nothing. The fuel bounds a scan whose matches do not move it on. -/
def scanMatches (find : ℕ → Option Match) (len : ℕ) : ℕ → ℕ → Option ℕ → List Match
  | 0, _, _ => []
  | fuel + 1, pos, last =>
    if len < pos then [] else
    match find pos with
    | none => []
    | some m =>
      let empty := m.stop == pos
      let rest := scanMatches find len fuel (if empty then pos + 1 else m.stop) (some m.stop)
      if empty && last == some m.start then rest else m :: rest

/-- The fields matches cut a text into, from code point `beg` on: the
text before each match, but none before an empty match at the very
start, and the text after the last match, but none where the last
match starts at the end, `last` being where the last match started. -/
def cutFields (cs : List Char) : ℕ → ℕ → List Match → List (List Char)
  | beg, last, [] => if last = cs.length then [] else [cs.drop beg]
  | beg, _, m :: ms =>
    let rest := cutFields cs m.stop m.start ms
    if m.stop = 0 then rest else (cs.drop beg).take (m.start - beg) :: rest

/-- Whether a replacement names only what a pattern with `n` groups
has: each `$` followed by `$`, `&`, or a digit from `1` to `n`. A call
reads it before the text is scanned (decision 20 of the design note's
§7), so a replacement that names a missing group is refused whatever
the text holds. -/
def subReads (n : ℕ) : List Char → Bool
  | [] => true
  | '$' :: '$' :: rest | '$' :: '&' :: rest => subReads n rest
  | '$' :: d :: rest => decide ('1' ≤ d ∧ d ≤ '9' ∧ d.toNat - 48 ≤ n) && subReads n rest
  | ['$'] => false
  | _ :: rest => subReads n rest

/-- What a replacement writes for one match: `$1` to `$9` what that
group captured, nothing where it took no part, `$&` the whole match,
`$$` a `$`, and any other character itself; `none` where a `$` names
none of these, or a group the pattern has not got. -/
def expandSub (whole : List Char) (gs : List (Option String)) : List Char → Option (List Char)
  | [] => some []
  | '$' :: '$' :: rest => ('$' :: ·) <$> expandSub whole gs rest
  | '$' :: '&' :: rest => (whole ++ ·) <$> expandSub whole gs rest
  | '$' :: d :: rest =>
    if '1' ≤ d ∧ d ≤ '9' ∧ d.toNat - 48 ≤ gs.length then
      (((gs.getD (d.toNat - 49) none).getD "").toList ++ ·) <$> expandSub whole gs rest
    else none
  | ['$'] => none
  | c :: rest => (c :: ·) <$> expandSub whole gs rest

/-- The text a replacement makes of matches, from code point `pos` on:
the text before each match kept, and the match replaced by what the
replacement writes for it; `none` where it writes nothing for one. -/
def replaceMatches (cs sub : List Char) : ℕ → List Match → Option (List Char)
  | pos, [] => some (cs.drop pos)
  | pos, m :: ms => do
    let piece ← expandSub ((cs.drop m.start).take (m.stop - m.start)) m.groups sub
    let rest ← replaceMatches cs sub m.stop ms
    pure ((cs.drop pos).take (m.start - pos) ++ piece ++ rest)

end Aontu

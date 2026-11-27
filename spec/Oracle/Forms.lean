import Oracle.Base

/-! The oracle's cases: Forms, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-! ## The forms

The spellings of the definition's forms, as the printer writes them, for
the check that the JSON Schema importer writes nothing else
(`ts/test/jsonschema-forms.test.ts`, `go/jsonschema_forms_test.go`): a
word, the name of a call, or a mark of the grammar, each beside the
constructor of `Val` it spells. The forms the importer writes that are
none of these wait in `spec/forms-outside.tsv`, each on its decision. -/

def forms : List (String × String × String) :=
  [("integer", "word", "integer"), ("float", "word", "float"),
    ("biginteger", "word", "biginteger"), ("bigdecimal", "word", "bigdecimal"),
    ("number", "word", "number"), ("string", "word", "string"), ("anyString", "call", "empty"),
    ("boolean", "word", "boolean"), ("mapKind", "word", "map"), ("listKind", "word", "list"),
    ("pathKind", "word", "path"), ("lit", "word", "true"), ("lit", "word", "false"),
    ("lit", "word", "null"), ("min", "call", "min"), ("max", "call", "max"),
    ("above", "call", "above"), ("beneath", "call", "below"), ("neq", "call", "neq"),
    ("mulof", "call", "mulof"), ("len", "call", "len"), ("unique", "call", "unique"),
    ("re", "call", "re"), ("format", "call", "format"), ("grammar", "call", "parse"),
    ("any", "word", "any"),
    ("nil", "word", "nil"), ("map", "syntax", "{}"), ("map", "call", "close"),
    ("list", "syntax", "[]"),
    ("or", "syntax", "|"), ("pref", "syntax", "*"), ("meet", "syntax", "&"),
    ("alias", "syntax", "%"), ("path", "syntax", "$"), ("addr", "call", "path"), ("nof", "call", "nof"),
    ("must", "call", "must"), ("when", "call", "when"), ("contains", "call", "contains"),
    ("rest", "call", "rest"), ("select", "call", "match"), ("filter", "call", "filter"),
    ("ride", "call", "meta"), ("ride", "call", "deprecate"), ("ride", "call", "ident"),
    ("ride", "call", "type"), ("ride", "call", "hide"), ("ride", "call", "open"), ("key", "call", "key"),
    ("keyUp", "call", "key"),
    ("call", "call", "add"), ("call", "call", "sub"), ("call", "call", "mul"),
    ("call", "call", "div"), ("call", "call", "mod"), ("call", "call", "rem"),
    ("call", "syntax", "-"), ("call", "call", "sum"), ("call", "call", "least"),
    ("call", "call", "greatest"), ("call", "syntax", "+"), ("call", "call", "join"),
    ("call", "call", "pick"), ("call", "call", "sort"), ("call", "call", "upper"),
    ("call", "call", "lower"), ("call", "call", "translate"), ("call", "call", "esc"),
    ("call", "call", "usc"), ("call", "call", "encode"), ("call", "call", "decode"),
    ("call", "call", "super"), ("call", "call", "pref"),
    ("call", "call", "move"), ("call", "call", "copy"), ("call", "call", "relate"), ("call", "syntax", "@"), ("call", "call", "split"),
    ("call", "call", "rep"), ("call", "call", "nom"), ("call", "call", "path"), ("call", "call", "abnf"),
    ("call", "call", "parse"), ("call", "call", "project"),
    ("call", "call", "folder"), ("call", "call", "file"), ("call", "call", "content"),
    ("call", "call", "line"), ("call", "call", "fragment"), ("call", "call", "slot"),
    ("call", "call", "inject"), ("call", "call", "copyfiles"), ("call", "call", "listitems"),
    ("call", "call", "each"), ("call", "call", "pack"), ("call", "call", "maybe"),
    ("call", "call", "emit"), ("call", "call", "apply"), ("absent", "call", "maybe"),
    ("call", "call", "acyclic"), ("call", "call", "inverse"), ("call", "call", "gen"),
    ("hole", "syntax", "_")]

/-- A term of each call form, so that the oracle can hold the list to
the printer: each prints as its name and a parenthesis. -/
def formSamples : List (String × Val) :=
  [("min", .min (.num one)), ("max", .max (.num one)), ("above", .above (.num one)),
    ("below", .beneath (.num one)), ("neq", .neq [.num one]), ("mulof", .mulof one),
    ("len", .len .integer), ("unique", .unique none), ("re", .re "a"), ("format", .format "email"),
    ("parse", .grammar "v = \"a\""), ("abnf", .call .abnf [.string]), ("parse", .call .parse [.string]),
    ("close", .list [.integer] none true), ("nof", .nof .integer [.integer]),
    ("must", .must .integer "m"), ("when", .when .integer .integer none),
    ("contains", .contains .integer (.min (.num one))), ("rest", .rest .integer []),
    ("match", .select .integer [] none), ("filter", .filter .integer .integer),
    ("meta", .ride .metadata .integer []), ("deprecate", .ride .deprecate .integer []),
    ("ident", .ride .ident .integer []), ("type", .ride .type .integer []),
    ("hide", .ride .hide .integer []), ("open", .ride .opened .integer []), ("key", .key), ("key", .keyUp 1), ("path", .addr ⟨0, ["a"]⟩),
    ("add", .call .add [.integer, .integer]), ("sub", .call .sub [.integer, .integer]),
    ("mul", .call .mul [.integer, .integer]), ("div", .call .div [.integer, .integer]),
    ("mod", .call .mod [.integer, .integer]), ("rem", .call .rem [.integer, .integer]),
    ("-", .call .neg [.integer]), ("sum", .call .sum [.listKind]),
    ("least", .call .least [.listKind]), ("greatest", .call .greatest [.listKind]),
    ("join", .call .join [.listKind]), ("pick", .call .pick [.listKind, .string]),
    ("at", .call .at [.mapKind, .string]),
    ("sort", .call .sort [.listKind]), ("upper", .call .upper [.string]),
    ("lower", .call .lower [.string]), ("translate", .call .translate [.string, .string]),
    ("esc", .call .esc [.string]), ("usc", .call .usc [.string]),
    ("encode", .call .encode [.string, .string]), ("decode", .call .decode [.string, .string]),
    ("super", .call .super [.integer]),
    ("pref", .call .pref [.integer]), ("move", .call .move [.integer]), ("copy", .call .copy [.integer]), ("relate", .call .relate []),
    ("split", .call .split [.string, .string]), ("rep", .call .rep [.string, .string, .string]),
    ("nom", .call .nom [.string]), ("path", .call .path [.string]), ("project", .call (.cmp .project) []),
    ("folder", .call (.cmp .folder) [.string]), ("file", .call (.cmp .file) [.string]),
    ("content", .call (.cmp .content) [.string]), ("line", .call (.cmp .line) [.string]),
    ("fragment", .call (.cmp .fragment) [.string]), ("slot", .call (.cmp .slot) [.string]),
    ("inject", .call (.cmp .inject) [.string]), ("copyfiles", .call (.cmp .copyfiles) [.string]),
    ("listitems", .call (.cmp .listitems) [.mapKind]), ("each", .call .each [.listKind, .hole]),
    ("pack", .call .pack [.listKind, .hole]), ("maybe", .call .maybe [.string]),
    ("emit", .call .emit [.listKind, .mapKind]), ("apply", .call .apply [.integer, .hole]),
    ("acyclic", .call .acyclic []), ("inverse", .call .inverse [.lit (.str "k")]),
    ("gen", .call .gen [.mapKind])]

/-- The `forms` file: each form with its kind and spelling, after the
spellings are held to the printer. -/
def formRows : IO Unit := do
  for (name, v) in formSamples do
    let some src := v.src | throw (IO.userError s!"the sample of {name} has no text")
    unless src.startsWith (name ++ "(") do
      throw (IO.userError s!"the form {name} prints as {src}")
  unless Val.anyString.src = some "string & empty()" do
    throw (IO.userError "string & empty() prints otherwise")
  for (ctor, kind, text) in forms do
    IO.println (ctor ++ "\t" ++ kind ++ "\t" ++ text)

import Aontu.Verdict

/-!
# A term held as data

The output option `custom` holds an expression, and a rider's record
holds data (`Record`). The reader reads the expression a `gen` record
writes under `custom` as its quotation, `Val.quote`: data that spells
the term, so that the record rides, unifies and is held to its type as
any other, and writing reads the term back (`Data.unquote`) to evaluate
it. Two records meet by the expression, as both ports compare its
written form.

Data quotes itself: a literal, an address, and a map of required
members or a list, neither with a spread, whose members are data. Every
other term is a **node**, a map whose one key is `quoteKey` and whose
value lists the constructor's name and then its parts, each a term
quoted in turn or a part written as data: a string, a count as its
digits, a number, a flag, a record. An optional part is a list of none
or one, and a list of parts is a list, but a map's declarations, which
a map holds by key, so that the record's key order is theirs too.
-/

namespace Aontu

/-- The key of a node, under the prefix `\u0000aontu_` that both ports
refuse in a document's key (`reserved_key`), so no map a document
writes has it. -/
def quoteKey : String := "\u0000aontu_term"

/-- A node: the constructor's name, then its parts. -/
def quoteNode (t : String) (xs : List Data) : Data := .map [(quoteKey, .list (.str t :: xs))]

/-- A bound as data. -/
def Bound.quote : Bound → Data
  | .num n => .num n
  | .str s => .str s

/-- A count as its digits. -/
def quoteNat (n : ℕ) : Data := .str (toString n)

/-- A step of a path as a list: its kind's name, then its part. -/
def Seg.quote : Seg → Data
  | .key k => .list [.str "key", .str k]
  | .idx i => .list [.str "idx", quoteNat i]
  | .var n => .list [.str "var", .str n]
  | .up n => .list [.str "up", quoteNat n]
  | .node => .list [.str "node"]
  | .own n => .list [.str "own", .str n]
  | .lands n => .list [.str "lands", quoteNat n]

/-- A rider by its name, and the name a rider's part takes. -/
def Rider.quote : Rider → Data
  | .metadata => .str "metadata"
  | .deprecate => .str "deprecate"
  | .ident => .str "ident"
  | .type => .str "type"
  | .hide => .str "hide"
  | .opened => .str "opened"
  | .lifts => .str "lifts"
  | .seals => .str "seals"
  | .move n => .list [.str "move", .str n]
  | .void => .str "void"
  | .parent => .str "parent"
  | .failed => .str "failed"
  | .acyclic => .str "acyclic"
  | .inverse k => .list [.str "inverse", .str k]
  | .gen => .str "gen"

/-- Every function, so that one is read back by its name. -/
def Fn.all : List Fn :=
  [.add, .sub, .mul, .div, .mod, .rem, .neg, .sum, .least, .greatest, .plus, .join, .pick, .sort,
    .upper, .lower, .translate, .esc, .usc, .encode, .decode, .at, .split, .rep, .nom, .super, .pref,
    .move, .copy, .relate, .path, .abnf, .parse, .load,
    .cmp .project, .cmp .folder, .cmp .file, .cmp .content, .cmp .line, .cmp .fragment, .cmp .slot,
    .cmp .inject, .cmp .copyfiles, .cmp .listitems,
    .each, .pack, .emit, .apply, .maybe,
    .bnd .min, .bnd .max, .bnd .above, .bnd .below, .bnd .neq, .bnd .mulof,
    .acyclic, .inverse, .gen]

/-- A function by its name. -/
def Fn.quote (f : Fn) : Data := .str (reprStr f)

/-- Whether a map's declarations are all required, so that the map is
data where its values are. -/
def requiredFields : List (String × Bool × Val) → Bool
  | [] => true
  | (_, o, _) :: fs => !o && requiredFields fs

mutual
/-- A term as data: data as itself, every other term a node. -/
def Val.quote : Val → Data
  | .lit s => s.data
  | .addr a => .addr a
  | .map fs spread closed =>
    if spread.isNone && !closed && requiredFields fs then .map (quoteMembers fs)
    else quoteNode "map" [.map (quoteFields fs), quoteOpt spread, .bool closed]
  | .list items spread closed =>
    if spread.isNone && !closed then .list (quoteItems items)
    else quoteNode "list" [.list (quoteItems items), quoteOpt spread, .bool closed]
  | .integer => quoteNode "integer" []
  | .float => quoteNode "float" []
  | .biginteger => quoteNode "biginteger" []
  | .bigdecimal => quoteNode "bigdecimal" []
  | .number => quoteNode "number" []
  | .string => quoteNode "string" []
  | .anyString => quoteNode "anyString" []
  | .boolean => quoteNode "boolean" []
  | .mapKind => quoteNode "mapKind" []
  | .listKind => quoteNode "listKind" []
  | .pathKind => quoteNode "pathKind" []
  | .min b => quoteNode "min" [b.quote]
  | .max b => quoteNode "max" [b.quote]
  | .above b => quoteNode "above" [b.quote]
  | .beneath b => quoteNode "beneath" [b.quote]
  | .neq vs => quoteNode "neq" [.list (vs.map Bound.quote)]
  | .mulof d => quoteNode "mulof" [.num d]
  | .len c => quoteNode "len" [c.quote]
  | .unique k => quoteNode "unique" [.list (k.toList.map .str)]
  | .re p => quoteNode "re" [.str p]
  | .format g => quoteNode "format" [.str g]
  | .grammar g => quoteNode "grammar" [.str g]
  | .any => quoteNode "any" []
  | .nil => quoteNode "nil" []
  | .absent => quoteNode "absent" []
  | .nothing => quoteNode "nothing" []
  | .or arms => quoteNode "or" [.list (quoteArms arms)]
  | .pref r x => quoteNode "pref" [quoteNat r, x.quote]
  | .meet a b => quoteNode "meet" [a.quote, b.quote]
  | .alias n => quoteNode "alias" [.str n]
  | .path p => quoteNode "path" [.list (p.map Seg.quote)]
  | .nof n cs => quoteNode "nof" [n.quote, .list (quoteItems cs)]
  | .must c msg => quoteNode "must" [c.quote, .str msg]
  | .when c t e => quoteNode "when" [c.quote, t.quote, quoteOpt e]
  | .contains c n => quoteNode "contains" [c.quote, n.quote]
  | .rest t cs => quoteNode "rest" [t.quote, .list (quoteCovers cs)]
  | .select s arms d => quoteNode "select" [s.quote, .list (quotePairs arms), quoteOpt d]
  | .filter s c => quoteNode "filter" [s.quote, c.quote]
  | .ride k v r => quoteNode "ride" [k.quote, v.quote, .map r]
  | .link v t => quoteNode "link" [v.quote, t.quote]
  | .key => quoteNode "key" []
  | .keyUp n => quoteNode "keyUp" [.str (toString n)]
  | .hole => quoteNode "hole" []
  | .call f args => quoteNode "call" [f.quote, .list (quoteItems args)]

def quoteMembers : List (String × Bool × Val) → List (String × Data)
  | [] => []
  | (k, _, v) :: fs => (k, v.quote) :: quoteMembers fs

def quoteFields : List (String × Bool × Val) → List (String × Data)
  | [] => []
  | (k, o, v) :: fs => (k, .list [.bool o, v.quote]) :: quoteFields fs

def quoteItems : List Val → List Data
  | [] => []
  | v :: vs => v.quote :: quoteItems vs

def quoteOpt : Option Val → Data
  | none => .list []
  | some v => .list [v.quote]

def quoteArms : List (ℕ × Val) → List Data
  | [] => []
  | (r, a) :: arms => .list [quoteNat r, a.quote] :: quoteArms arms

def quotePairs : List (Val × Val) → List Data
  | [] => []
  | (p, r) :: ps => .list [p.quote, r.quote] :: quotePairs ps

def quoteCovers : List (Option Val × Option Val × Option Val) → List Data
  | [] => []
  | (i, k, v) :: cs => .list [quoteOpt i, quoteOpt k, quoteOpt v] :: quoteCovers cs
end

/-! ## Reading a quotation back

Each part is read back as a term first, and a part that is data is
taken from the term it reads as: a string from a string literal, a
count from its digits, a list from a list. -/

def Val.str? : Val → Option String
  | .lit (.str s) => some s
  | _ => none

def Val.nat? (v : Val) : Option ℕ := v.str?.bind String.toNat?

def Val.items? : Val → Option (List Val)
  | .list items none false => some items
  | _ => none

def Val.opt? (v : Val) : Option (Option Val) :=
  match v.items? with
  | some [] => some none
  | some [x] => some (some x)
  | _ => none

def Val.bound? : Val → Option Bound
  | .lit (.num n) => some (.num n)
  | .lit (.str s) => some (.str s)
  | _ => none

def Val.flag? : Val → Option Bool
  | .lit (.bool b) => some b
  | _ => none

def Val.pair? (v : Val) : Option (Val × Val) :=
  match v.items? with
  | some [a, b] => some (a, b)
  | _ => none

def Val.rider? : Val → Option Rider
  | .lit (.str "metadata") => some .metadata
  | .lit (.str "deprecate") => some .deprecate
  | .lit (.str "ident") => some .ident
  | .lit (.str "type") => some .type
  | .lit (.str "hide") => some .hide
  | .lit (.str "opened") => some .opened
  | .lit (.str "lifts") => some .lifts
  | .lit (.str "seals") => some .seals
  | .lit (.str "void") => some .void
  | .lit (.str "parent") => some .parent
  | .lit (.str "failed") => some .failed
  | .lit (.str "acyclic") => some .acyclic
  | .lit (.str "gen") => some .gen
  | .list [.lit (.str "move"), .lit (.str n)] none false => some (.move n)
  | .list [.lit (.str "inverse"), .lit (.str k)] none false => some (.inverse k)
  | _ => none

def Val.fn? (v : Val) : Option Fn := v.str?.bind fun s => Fn.all.find? (reprStr · == s)

/-- A step of a path from the list it is quoted as. -/
def Val.seg? (v : Val) : Option Seg :=
  match v.items? with
  | some [.lit (.str "key"), k] => k.str?.map .key
  | some [.lit (.str "idx"), i] => i.nat?.map .idx
  | some [.lit (.str "var"), n] => n.str?.map .var
  | some [.lit (.str "up"), n] => n.nat?.map .up
  | some [.lit (.str "node")] => some .node
  | some [.lit (.str "own"), n] => n.str?.map .own
  | some [.lit (.str "lands"), n] => n.nat?.map .lands
  | _ => none

/-- A map's declaration from its key and its parts. -/
def fieldOf? (f : String × Bool × Val) : Option (String × Bool × Val) :=
  match f.2.2.items? with
  | some [o, x] => do pure (f.1, ← o.flag?, x)
  | _ => none

/-- A map's declarations from the map that holds them by key. -/
def Val.fields? : Val → Option (List (String × Bool × Val))
  | .map fs none false => fs.mapM fieldOf?
  | _ => none

/-- A cover from its parts. -/
def Val.cover? (v : Val) : Option (Option Val × Option Val × Option Val) :=
  match v.items? with
  | some [i, k, x] => do pure (← i.opt?, ← k.opt?, ← x.opt?)
  | _ => none

/-- A `gen` call read back with its record's `custom` quoted again, as
the reader writes it. -/
def requoteCustom : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs =>
    (k, o, if k = "custom" then v.quote.term else v) :: requoteCustom fs

/-- The term a node reads back as, from its name and its parts each
read back as a term. -/
def quotedNode : String → List Val → Option Val
  | "map", [fs, sp, cl] => do pure (.map (← fs.fields?) (← sp.opt?) (← cl.flag?))
  | "list", [xs, sp, cl] => do pure (.list (← xs.items?) (← sp.opt?) (← cl.flag?))
  | "integer", [] => some .integer
  | "float", [] => some .float
  | "biginteger", [] => some .biginteger
  | "bigdecimal", [] => some .bigdecimal
  | "number", [] => some .number
  | "string", [] => some .string
  | "anyString", [] => some .anyString
  | "boolean", [] => some .boolean
  | "mapKind", [] => some .mapKind
  | "listKind", [] => some .listKind
  | "pathKind", [] => some .pathKind
  | "min", [b] => b.bound?.map .min
  | "max", [b] => b.bound?.map .max
  | "above", [b] => b.bound?.map .above
  | "beneath", [b] => b.bound?.map .beneath
  | "neq", [vs] => do pure (.neq (← (← vs.items?).mapM Val.bound?))
  | "mulof", [.lit (.num d)] => some (.mulof d)
  | "len", [c] => some (.len c)
  | "unique", [k] => do pure (.unique (← (← k.opt?).mapM Val.str?))
  | "re", [p] => p.str?.map .re
  | "format", [g] => g.str?.map .format
  | "grammar", [g] => g.str?.map .grammar
  | "any", [] => some .any
  | "nil", [] => some .nil
  | "absent", [] => some .absent
  | "nothing", [] => some .nothing
  | "or", [arms] => do
    pure (.or (← (← arms.items?).mapM fun a => do let (r, x) ← a.pair?; pure (← r.nat?, x)))
  | "pref", [r, x] => do pure (.pref (← r.nat?) x)
  | "meet", [a, b] => some (.meet a b)
  | "alias", [n] => n.str?.map .alias
  | "path", [p] => do pure (.path (← (← p.items?).mapM fun s => s.seg?))
  | "nof", [n, cs] => do pure (.nof n (← cs.items?))
  | "must", [c, m] => do pure (.must c (← m.str?))
  | "when", [c, t, e] => do pure (.when c t (← e.opt?))
  | "contains", [c, n] => some (.contains c n)
  | "rest", [t, cs] => do pure (.rest t (← (← cs.items?).mapM Val.cover?))
  | "select", [s, arms, d] => do pure (.select s (← (← arms.items?).mapM Val.pair?) (← d.opt?))
  | "filter", [s, c] => some (.filter s c)
  | "ride", [k, v, r] => do
    let some (.map r) := r.spelt? | none
    pure (.ride (← k.rider?) v r)
  | "link", [v, t] => some (.link v t)
  | "key", [] => some .key
  | "keyUp", [n] => do pure (.keyUp (← (← n.str?).toInt?))
  | "hole", [] => some .hole
  | "call", [f, args] => do
    match ← f.fn?, ← args.items? with
    | .gen, [.map fs none false] => pure (.call .gen [.map (requoteCustom fs) none false])
    | g, xs => pure (.call g xs)
  | _, _ => none

mutual
/-- The term a quotation spells: a node read back by `quotedNode`, a
map, a list and a scalar as the data term they are. -/
def Data.unquote : Data → Option Val
  | .map ms => (unquoteMembers ms).bind fun fs =>
    match fs with
    | [(k, _, .list (.lit (.str t) :: vs) none false)] =>
      if k = quoteKey then quotedNode t vs else some (.map fs none false)
    | _ => some (.map fs none false)
  | .list xs => (unquoteItems xs).map fun vs => .list vs none false
  | .addr a => some (.addr a)
  | .num x => some (.lit (.num x))
  | .str s => some (.lit (.str s))
  | .bool b => some (.lit (.bool b))
  | .null => some (.lit .null)

def unquoteMembers : List (String × Data) → Option (List (String × Bool × Val))
  | [] => some []
  | (k, x) :: ms => do pure ((k, false, ← x.unquote) :: (← unquoteMembers ms))

def unquoteItems : List Data → Option (List Val)
  | [] => some []
  | x :: xs => do pure ((← x.unquote) :: (← unquoteItems xs))
end

end Aontu

import Aontu.Graph
import Aontu.Written
import Aontu.Quote

/-!
# What generation writes

Generation singles out a value (`Aontu/Output.lean`), and an output
annotation (`Aontu/Annotation.lean`) says how that value is written.
This module takes the step from the one to the other: it generates the
document as `genWith` does, and writes each value by the record it
carries, from the inside out, so that a map's members are written
before its keys are styled.

- A **number** rounds as `Aontu/Written.lean` says, by `significant`
  and `places`, and `as: "string"` writes its digits as text.
- A **boolean** is itself, `1` or `0` under `as: "number"`, or its name
  under `as: "string"`.
- A **string** is itself, or what `upper` or `lower` answers under
  `case`.
- An **address** is its text as written, or under `form` the address
  resolved from the place the value is written at, from the root
  (`"absolute"`) or as a JSON Pointer (`"pointer"`), or its last step
  (`"key"`). One that climbs past the root is written nowhere.
- A **map** writes its keys as `nom` spells them under `keys`, a key
  that holds no word as it is; two keys that would be written alike
  are written nowhere.
- Under `empty: "omit"` a value written empty, `""`, `null`, `{}` or
  `[]`, is left out of the map or list that holds it, and at the top
  is `null`.
- Two picked arms of a disjunction must write alike, as they must
  generate alike.

- Under `custom` the value is written by an expression, which the
  record holds quoted (`Aontu/Quote.lean`): the record's other options
  write the value first, and the expression is evaluated on its own,
  as `apply` evaluates one, in the document `out: apply(d, e)` that
  reads nothing else, with its hole bound to what the value writes,
  read as data (`Data.given`). What `out` writes, its own annotations
  written in turn, is the value's writing, and where `out` is left out
  the value is too. `empty: "omit"` reads that writing.
-/

namespace Aontu

/-! ## A record's options -/

/-- The option a record gives under `k`, where it is a string. -/
def Record.text? (r : Record) (k : String) : Option String :=
  match lookup k r with
  | some (.str s) => some s
  | _ => none

/-- The count a record gives under `k`: a whole number, and none for
`"all"` or where the record gives none. -/
def Record.count? (r : Record) (k : String) : Option ℕ :=
  match lookup k r with
  | some (.num (.integer n)) => if 0 ≤ n.value then some n.value.toNat else none
  | _ => none

/-- Whether a record leaves a value written empty out. -/
def Record.omits (r : Record) : Bool := r.text? "empty" == some "omit"

/-- Whether written data is empty, as `empty: "omit"` reads it. -/
def Data.emptyWritten : Data → Bool
  | .str s => s.isEmpty
  | .null => true
  | .map ms => ms.isEmpty
  | .list xs => xs.isEmpty
  | _ => false

/-! ## Addresses -/

/-- The steps from the root of the place an address names, read from the
place the value is written at: its own steps where it starts at the
root, and otherwise from the map or list that holds the value, a step up
for each dot after the first. None where it climbs past the root, or
where the value is the document itself, which nothing holds. -/
def Addr.resolveAt (a : Addr) (place : List String) : Option (List String) :=
  match a.up, place with
  | 0, _ => some a.steps
  | _ + 1, [] => none
  | n + 1, place =>
    if n ≤ place.dropLast.length then some (place.dropLast.take (place.dropLast.length - n) ++ a.steps) else none

/-- A step of a JSON Pointer, as RFC 6901 writes it: `~` as `~0`, then
`/` as `~1`. -/
def pointerStep (s : String) : String := (s.replace "~" "~0").replace "/" "~1"

/-- The steps from the root as a JSON Pointer. -/
def pointerText (ss : List String) : String := String.join (ss.map fun s => "/" ++ pointerStep s)

/-! ## Writing a value by its record -/

/-- A map's members with their keys as `nom` spells them in a style, a
key that holds no word as it is, in key order; none where two keys
would be written alike. -/
def styleKeys (st : NameStyle) (ms : List (String × Data)) : Option Data :=
  let ms' := ms.map fun m => (((nomName [] st m.1.toList).map String.mk).getD m.1, m.2)
  if (ms'.map Prod.fst).Nodup then some (.map (sortMembers ms')) else none

/-- Data as a record writes it at a place: a number rounded and
perhaps as text, a boolean as a number or its name, a string in a case,
an address in a form, and a map with its keys styled; none where the
writing refuses. `custom` is read after it (`rideWrites`). -/
def Data.writeBy (r : Record) (place : List String) (d : Data) : Option Data :=
  match d with
  | .num x =>
    if r.text? "as" = some "string" then (x.written (r.count? "significant") (r.count? "places")).map .str
    else (x.rounded (r.count? "significant") (r.count? "places")).map .num
  | .bool b =>
    match r.text? "as" with
    | some "number" => some (.num (.integer (if b then Integer.of 1 else Integer.of 0)))
    | some "string" => some (.str (if b then "true" else "false"))
    | _ => some d
  | .str s =>
    match r.text? "case" with
    | some "upper" => some (.str (host.upper s))
    | some "lower" => some (.str (host.lower s))
    | _ => some d
  | .addr a =>
    match r.text? "form" with
    | some "absolute" => (a.resolveAt place).map fun ss => .str (Addr.text ⟨0, ss⟩)
    | some "pointer" => (a.resolveAt place).map fun ss => .str (pointerText ss)
    | some "key" => a.steps.getLast?.map .str
    | _ => some d
  | .map ms =>
    match (r.text? "keys").bind NameStyle.ofName? with
    | some st => styleKeys st ms
    | none => some d
  | .null | .list _ => some d

/-- A record that says nothing writes data as it is. -/
theorem Data.writeBy_nil (place : List String) : ∀ d : Data, d.writeBy [] place = some d := by
  intro d
  cases d <;> simp [Data.writeBy, Record.text?, Record.count?, lookup, Number.rounded_none]

/-! ## Writing a document -/

mutual
/-- Data as the hole of a `custom` expression is given it: what the
value writes read back as data, so an address as its text and a float
written as a whole number, digits alone, as the integer it is; none
where the `integer` leaf doesn't hold that integer, as the reader
refuses such digits. -/
def Data.given : Data → Option Data
  | .addr a => some (.str a.text)
  | .num (.float x) =>
    let n := x.shortest.1 * 10 ^ x.shortest.2.toNat
    if 0 ≤ x.shortest.2 ∧ x.text.all (fun c => c.isDigit || c == '-') = true then
      if h : IntegerLeaf n then some (.num (.integer ⟨n, h⟩)) else none
    else some (.num (.float x))
  | .map ms => (givenMembers ms).map .map
  | .list xs => (givenElems xs).map .list
  | d => some d

def givenMembers : List (String × Data) → Option (List (String × Data))
  | [] => some []
  | (k, x) :: ms => do pure ((k, ← x.given) :: (← givenMembers ms))

def givenElems : List Data → Option (List Data)
  | [] => some []
  | x :: xs => do pure ((← x.given) :: (← givenElems xs))
end

/-- A `custom` expression's writing of the data `d`, by the writer `cw`
it is given (`customW`), or as the record's other options leave it
where the record holds none. -/
def customWrites (cw : Val → Data → Option (Option Data)) (r : Record) (d : Data) : Option (Option Data) :=
  match lookup "custom" r with
  | some q => q.unquote.bind fun e => d.given.bind (cw e)
  | none => some (some d)

/-- A value's writing under a record that rides it: the data written by
the record and then by its `custom` expression, left out where the
record omits it and it is written empty; a value left out, or one that
writes nothing, stays so. -/
def rideWrites (cw : Val → Data → Option (Option Data)) (r : Record) (place : List String) :
    Option (Option Data) → Option (Option Data)
  | some (some d) => (d.writeBy r place).bind fun d' =>
    (customWrites cw r d').map fun w => w.bind fun d'' => if r.omits && d''.emptyWritten then none else some d''
  | w => w

/-- A disjunction's writing: what its picked arms all write, where it
generates. -/
def orWrites : Option Data → Option (Option (Option Data)) → Option (Option Data)
  | some _, some (some w) => some w
  | _, _ => none

/-- A meet's writing, read from the side that generates, as `genWith`
reads a meet: `wa` where `a` generates a value `b` admits, else `wb`
where `b` generates one `a` admits. -/
def meetWrites (chk : Val → Data → Bool) (a b : Val) (wa wb : Option (Option Data)) : Option (Option Data) :=
  match genWith chk a with
  | some x => if chk b x then wa else none
  | none =>
    match genWith chk b with
    | some y => if chk a y then wb else none
    | none => none

/-- One arm's step among the picked arms: none where the arm writes
nothing, the arm's writing where it is the first, and the agreed
writing where it writes as the arms before it did; none where it
writes apart. `next` reads the arms after it. -/
def armsStep (w : Option (Option Data)) (acc : Option (Option Data))
    (next : Option (Option Data) → Option (Option (Option Data))) : Option (Option (Option Data)) :=
  match w, acc with
  | none, _ => none
  | some w, none => next (some w)
  | some w, some w' => if w = w' then next (some w') else none

/-- A member's writing beside the members after it: the member where it
writes, the rest alone where it is left out. -/
def consWrites {α : Type} (w : Option (Option α)) (rest : Option (List α)) : Option (List α) :=
  match w, rest with
  | some (some d), some rest => some (d :: rest)
  | some none, some rest => some rest
  | _, _ => none

mutual
/-- What `v` writes at a place, mirroring `genWith`: `some (some d)`
where it generates and writes `d`, `some none` where the value is left
out, and `none` where it generates nothing or its writing refuses. -/
def writeWith (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) : Val → Option (Option Data)
  | .lit s => some (some s.data)
  | .addr a => some (some (.addr a))
  | .map fs spread _ =>
    if keysDistinct fs then (writeFieldsWith chk cw place spread fs).map fun ms => some (.map (sortMembers ms))
    else none
  | .list items spread _ => (writeItemsWith chk cw place spread 0 items).map fun xs => some (.list xs)
  | .or arms => orWrites (genWith chk (.or arms)) (writeArmsWith chk cw place arms arms none)
  | .pref _ x => writeWith chk cw place x
  | .ride k v r => if k = .gen then rideWrites cw r place (writeWith chk cw place v) else writeWith chk cw place v
  | .link v _ => writeWith chk cw place v
  | .meet a b => meetWrites chk a b (writeWith chk cw place a) (writeWith chk cw place b)
  | .integer | .float | .biginteger | .bigdecimal | .number | .string | .anyString | .boolean
  | .mapKind | .listKind | .pathKind
  | .min _ | .max _ | .above _ | .beneath _ | .neq _ | .mulof _ | .len _ | .unique _
  | .re _ | .format _ | .grammar _ | .any | .absent | .nil | .nothing | .alias _ | .path _ | .nof _ _
  | .must _ _ | .when _ _ _ | .contains _ _ | .rest _ _ | .select _ _ _ | .filter _ _ | .key | .keyUp _
  | .call _ _ | .hole => none

/-- The members a map's declarations write, as `genFieldsWith` generates
them, a member left out where its value is. -/
def writeFieldsWith (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) (spread : Option Val) :
    List (String × Bool × Val) → Option (List (String × Data))
  | [] => some []
  | (k, o, v) :: fs =>
    match genWith chk v with
    | some x =>
      if spreadOk chk k spread x then
        if o && x.emptyBag then writeFieldsWith chk cw place spread fs
        else consWrites ((writeWith chk cw (place ++ [k]) v).map (·.map ((k, ·))))
          (writeFieldsWith chk cw place spread fs)
      else if o then writeFieldsWith chk cw place spread fs else none
    | none => if o then writeFieldsWith chk cw place spread fs else none

/-- The elements a list's positions write, from the position `i` on, an
element left out where its value is. -/
def writeItemsWith (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) (spread : Option Val) (i : ℕ) :
    List Val → Option (List Data)
  | [] => some []
  | v :: vs =>
    match genWith chk v with
    | some x =>
      if spreadOk chk (toString i) spread x then
        consWrites (writeWith chk cw (place ++ [toString i]) v) (writeItemsWith chk cw place spread (i + 1) vs)
      else none
    | none => none

/-- What the picked arms write, as `genArmsWith` reads what they
generate: `some (some w)` where every picked arm writes `w`, `some acc`
where none is picked, and `none` where one writes nothing or two write
apart. -/
def writeArmsWith (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) (arms₀ : List (ℕ × Val)) :
    List (ℕ × Val) → Option (Option Data) → Option (Option (Option Data))
  | [], acc => some acc
  | p :: arms, acc =>
    if picked arms₀ p then armsStep (writeWith chk cw place p.2) acc (writeArmsWith chk cw place arms₀ arms)
    else writeArmsWith chk cw place arms₀ arms acc
end

/-- The declarations and the visible part of the staged normal form a
document writes from with no data: the form `OutputP` generates from,
staged as `vet` stages it, so that each value carries one record, held
to its type. -/
def Decls.writeForm (ds : Decls) (S : Val) : Decls × Val :=
  let P := (ds.loaded S).1.preparedS (ds.loaded S).2
  let F := P.1.withPathsS P.2
  (F.1, ((normaliseD F.1 (F.1.readR F.2)).staged F.1).visible)

/-- What a document writes, a `custom` expression written by `cw`: its
staged form written (`writeWith`), `null` where the document itself is
left out, after the checks `OutputG` makes before it generates: the
atoms' graph, a load the reading couldn't make, and a path that names
nothing. Writing reads the staged form, as `vet` does, so that an arm
of a type its record refuses drops before the arms are compared. -/
def outputWBy (cw : Val → Data → Option (Option Data)) (ds : Decls) (S : Val) : Option Data :=
  let P := (ds.loaded S).1.preparedS (ds.loaded S).2
  if (ds.genFormS S).graphOk && !ds.unread S && P.1.resolvesB P.2 then
    match writeWith (checkR (ds.writeForm S).1) cw [] (ds.writeForm S).2 with
    | some (some d) => some d
    | some none => some .null
    | none => none
  else none

/-- The document a `custom` expression `e` is evaluated in for the data
`d`: `out: apply(d, e)`, which reads nothing else. -/
def customDoc (e : Val) (d : Data) : Val := .map [("out", false, .call .apply [d.term, e])] none false

/-- What a `custom` expression writes for the data its hole is given:
what `out` writes in `customDoc`, written with `n` more levels of
`custom` beneath it, and left out where `out` is. -/
def customW : ℕ → Val → Data → Option (Option Data)
  | 0, _, _ => none
  | n + 1, e, d =>
    match outputWBy (customW n) [] (customDoc e d) with
    | some (.map ms) => some (lookup "out" ms)
    | _ => none

/-- What a document writes (`outputWBy`), each `custom` expression
evaluated by `customW`, with as many levels as the document and its
declarations have terms, more than the expressions they hold can
nest, since the reader holds each in the term it writes. -/
def outputW (ds : Decls) (S : Val) : Option Data := outputWBy (customW (S.size + ds.bodiesSize + 1)) ds S

/-! ## Writing without an annotation is generating -/

mutual
/-- Whether a term carries no output annotation where writing reads it. -/
def Val.plain : Val → Bool
  | .ride k v _ => k != .gen && v.plain
  | .link v _ => v.plain
  | .pref _ x => x.plain
  | .meet a b => a.plain && b.plain
  | .map fs _ _ => plainFields fs
  | .list items _ _ => plainItems items
  | .or arms => plainArms arms
  | _ => true

def plainFields : List (String × Bool × Val) → Bool
  | [] => true
  | (_, _, v) :: fs => v.plain && plainFields fs

def plainItems : List Val → Bool
  | [] => true
  | v :: vs => v.plain && plainItems vs

def plainArms : List (ℕ × Val) → Bool
  | [] => true
  | (_, a) :: arms => a.plain && plainArms arms
end

mutual
/-- **A term that carries no output annotation writes what it
generates**, whatever place it is written at: writing is generation
where no record says otherwise. -/
theorem writeWith_plain (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) :
    ∀ v : Val, v.plain = true → writeWith chk cw place v = (genWith chk v).map some
  | .lit _, _ => by rw [writeWith, genWith]; rfl
  | .addr _, _ => by rw [writeWith, genWith]; rfl
  | .map fs spread _, h => by
    rw [Val.plain] at h
    rw [writeWith, genWith]
    split
    · rw [writeFieldsWith_plain chk cw place spread fs h, Option.map_map]
      rfl
    · rfl
  | .list items spread _, h => by
    rw [Val.plain] at h
    rw [writeWith, genWith, writeItemsWith_plain chk cw place spread 0 items h, Option.map_map]
    rfl
  | .or arms, h => by
    rw [Val.plain] at h
    have ha : writeArmsWith chk cw place arms arms none =
        (genArmsWith chk arms arms none).map (Option.map some) :=
      writeArmsWith_plain chk cw place arms arms none h
    rw [writeWith, ha, genWith]
    generalize genArmsWith chk arms arms none = g
    rcases g with _ | _ | j <;> rfl
  | .pref _ x, h => by
    rw [Val.plain] at h
    rw [writeWith, genWith]
    exact writeWith_plain chk cw place x h
  | .ride k v _, h => by
    rw [Val.plain, Bool.and_eq_true, bne_iff_ne] at h
    rw [writeWith, genWith, if_neg h.1]
    exact writeWith_plain chk cw place v h.2
  | .link v _, h => by
    rw [Val.plain] at h
    rw [writeWith, genWith]
    exact writeWith_plain chk cw place v h
  | .meet a b, h => by
    rw [Val.plain, Bool.and_eq_true] at h
    rw [writeWith, genWith, writeWith_plain chk cw place a h.1, writeWith_plain chk cw place b h.2]
    unfold meetWrites
    cases genWith chk a with
    | some x =>
      dsimp only
      cases chk b x <;> rfl
    | none =>
      dsimp only
      cases genWith chk b with
      | some y =>
        dsimp only
        cases chk a y <;> rfl
      | none => rfl
  | .integer, _ | .float, _ | .biginteger, _ | .bigdecimal, _ | .number, _ | .string, _
  | .anyString, _ | .boolean, _ | .mapKind, _ | .listKind, _ | .pathKind, _
  | .min _, _ | .max _, _ | .above _, _ | .beneath _, _ | .neq _, _ | .mulof _, _ | .len _, _
  | .unique _, _ | .re _, _ | .format _, _ | .grammar _, _ | .any, _ | .absent, _ | .nil, _
  | .nothing, _ | .alias _, _ | .path _, _ | .nof _ _, _ | .must _ _, _ | .when _ _ _, _
  | .contains _ _, _ | .rest _ _, _ | .select _ _ _, _ | .filter _ _, _ | .key, _ | .keyUp _, _
  | .call _ _, _ | .hole, _ => by rw [writeWith, genWith]; rfl

theorem writeFieldsWith_plain (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) (spread : Option Val) :
    ∀ fs : List (String × Bool × Val), plainFields fs = true →
      writeFieldsWith chk cw place spread fs = genFieldsWith chk spread fs
  | [], _ => by rw [writeFieldsWith, genFieldsWith]
  | (k, o, v) :: fs, h => by
    rw [plainFields, Bool.and_eq_true] at h
    rw [writeFieldsWith, genFieldsWith, writeWith_plain chk cw (place ++ [k]) v h.1,
      writeFieldsWith_plain chk cw place spread fs h.2]
    cases genWith chk v with
    | none => rfl
    | some x =>
      dsimp only [Option.map]
      split
      · split
        · rfl
        · cases genFieldsWith chk spread fs <;> rfl
      · rfl

theorem writeItemsWith_plain (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) (spread : Option Val) :
    ∀ (i : ℕ) (items : List Val), plainItems items = true →
      writeItemsWith chk cw place spread i items = genItemsWith chk spread i items
  | _, [], _ => by rw [writeItemsWith, genItemsWith]
  | i, v :: vs, h => by
    rw [plainItems, Bool.and_eq_true] at h
    rw [writeItemsWith, genItemsWith, writeWith_plain chk cw (place ++ [toString i]) v h.1,
      writeItemsWith_plain chk cw place spread (i + 1) vs h.2]
    cases genWith chk v with
    | none => rfl
    | some x =>
      dsimp only [Option.map]
      split
      · cases genItemsWith chk spread (i + 1) vs <;> rfl
      · rfl

theorem writeArmsWith_plain (chk : Val → Data → Bool) (cw : Val → Data → Option (Option Data)) (place : List String) (arms₀ : List (ℕ × Val)) :
    ∀ (arms : List (ℕ × Val)) (acc : Option Data), plainArms arms = true →
      writeArmsWith chk cw place arms₀ arms (acc.map some) = (genArmsWith chk arms₀ arms acc).map (Option.map some)
  | [], _, _ => by rw [writeArmsWith, genArmsWith]; rfl
  | (r, a) :: arms, acc, h => by
    rw [plainArms, Bool.and_eq_true] at h
    rw [writeArmsWith, genArmsWith]
    split
    · rw [writeWith_plain chk cw place a h.1]
      unfold armsStep
      cases genWith chk a with
      | none => rfl
      | some x =>
        cases acc with
        | none => exact writeArmsWith_plain chk cw place arms₀ arms (some x) h.2
        | some y =>
          dsimp only [Option.map]
          by_cases hxy : x = y
          · subst hxy
            rw [if_pos rfl, if_pos rfl]
            exact writeArmsWith_plain chk cw place arms₀ arms (some x) h.2
          · rw [if_neg (fun he => hxy (Option.some.inj he)), if_neg hxy]
    · exact writeArmsWith_plain chk cw place arms₀ arms acc h.2
end

end Aontu

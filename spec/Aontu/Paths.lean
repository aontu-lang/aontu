import Aontu.Verdict

/-!
# Paths

A path, `$.a.b`, names a position in the document and reads as what the
document holds there: the term at the position in the normal form of
the schema met with the data. The reading is by declaration: each path
a document writes becomes a name, declared as that term, so that the
expansion, the residuals, the checker and the alias-cycle rule of
`Aontu/Alias.lean` carry paths as they carry names, and a document that
reads only by its own paths is an `error` as a cycle of names is. A path
resolves within the schema's own tree, through maps by key and lists by
index and through nothing else, not a disjunction and not a reference
left as a residual; a path that does not is an `error`.
-/

namespace Aontu

/-! ## Positions -/

/-- The term at a path in a term: through maps by key and lists by
index, the riders around either read through, and through nothing
else. -/
def Val.at : Val → List Seg → Option Val
  | v, [] => some v
  | v, .key k :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == k) with
      | some f => f.2.2.at p
      | none => none
    | _ => none
  | v, .idx i :: p =>
    match v.unride with
    | .list items _ _ =>
      match items[i]? with
      | some w => w.at p
      | none => none
    | _ => none
  | _, .var _ :: _ => none
  | _, .up _ :: _ => none
termination_by structural _ p => p

/-- The index digits spell in canonical decimal: `0`, or digits that
don't begin with `0`. -/
def digitsOf? : List Char → Option ℕ
  | ['0'] => some 0
  | '0' :: _ => none
  | [] => none
  | cs => cs.foldl (fun acc c => acc.bind fun n =>
      if c.isDigit then some (10 * n + (c.toNat - '0'.toNat)) else none) (some 0)

/-- The index a step's text spells in canonical decimal. -/
def indexOf? (k : String) : Option ℕ := digitsOf? k.toList

/-- The step a written step takes in the container it meets, the riders
around it read through: in a map, the key its text spells, and in a
list, the index its text spells in canonical decimal. A variable names
no step until it's bound. -/
def Seg.stepIn (s : Seg) (v : Val) : Option Seg :=
  match s, v.unride with
  | .var _, _ | .up _, _ => none
  | s, .map _ _ _ => some (.key s.text)
  | .idx i, .list _ _ _ => some (.idx i)
  | .key k, .list _ _ _ => (indexOf? k).map .idx
  | _, _ => none

/-- The term at a written path in a term: each step read as text, by
the container it meets (`Seg.stepIn`). -/
def Val.atW : Val → List Seg → Option Val
  | v, [] => some v
  | v, s :: p =>
    match s.stepIn v with
    | some t =>
      match v.at [t] with
      | some w => w.atW p
      | none => none
    | none => none
termination_by structural _ p => p

/-! ## Paths as names -/

/-- The name a path is declared under: each key behind its length, so
that no two paths share a name, and no document can write it as an
alias, since an alias begins with a letter. -/
def pathName (p : List Seg) : String :=
  "$" ++ String.join (p.map fun
    | .key k => "." ++ toString k.length ++ ":" ++ k
    | .idx i => "#" ++ toString i
    | .var n => "$" ++ toString n.length ++ ":" ++ n
    | .up n => "^" ++ toString n)

mutual
/-- The term with each path replaced by a reference to the path's name. -/
def Val.pathsToAliases : Val → Val
  | .path p => .alias (pathName p)
  | .len c => .len c.pathsToAliases
  | .map fs spread closed => .map (ptaFields fs) (ptaSpread spread) closed
  | .list items spread closed => .list (ptaItems items) (ptaSpread spread) closed
  | .or arms => .or (ptaArms arms)
  | .pref r x => .pref r x.pathsToAliases
  | .meet a b => .meet a.pathsToAliases b.pathsToAliases
  | .nof n cs => .nof n.pathsToAliases (ptaItems cs)
  | .must c m => .must c.pathsToAliases m
  | .when c t e => .when c.pathsToAliases t.pathsToAliases (ptaSpread e)
  | .contains c n => .contains c.pathsToAliases n.pathsToAliases
  | .rest t cs => .rest t.pathsToAliases (ptaCovers cs)
  | .select s arms d => .select s.pathsToAliases (ptaPairs arms) (ptaSpread d)
  | .filter s c => .filter s.pathsToAliases c.pathsToAliases
  | .call f args => .call f (ptaItems args)
  | .ride k v r => .ride k v.pathsToAliases r
  | v => v

def ptaPairs : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.pathsToAliases, r.pathsToAliases) :: ptaPairs ps

def ptaCovers : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (ptaSpread c, ptaSpread k, ptaSpread m) :: ptaCovers cs

def ptaFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.pathsToAliases) :: ptaFields fs

def ptaItems : List Val → List Val
  | [] => []
  | v :: vs => v.pathsToAliases :: ptaItems vs

def ptaSpread : Option Val → Option Val
  | none => none
  | some s => some s.pathsToAliases

def ptaArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.pathsToAliases) :: ptaArms as
end

/-! ## Relative paths -/

mutual
/-- The term standing at `pos`, each relative path it writes made
absolute where it stands, its dots climbing as many steps: a map's
member stands one key below the map and a list's element one index
below, as `resolveD` places a key. A path that climbs past the top stays
as written, and resolves nowhere. A spread, a template and a `filter`'s
condition keep theirs as written, since each stands at a position the
written document doesn't name. -/
def Val.placed (pos : List Seg) : Val → Val
  | .path (.up n :: p) => if n ≤ pos.length then .path (pos.take (pos.length - n) ++ p) else .path (.up n :: p)
  | .len c => .len (c.placed pos)
  | .map fs spread closed => .map (plFields pos fs) spread closed
  | .list items spread closed => .list (plElems pos 0 items) spread closed
  | .or arms => .or (plArms pos arms)
  | .pref r x => .pref r (x.placed pos)
  | .meet a b => .meet (a.placed pos) (b.placed pos)
  | .nof n cs => .nof (n.placed pos) (plItems pos cs)
  | .must c m => .must (c.placed pos) m
  | .when c t e => .when (c.placed pos) (t.placed pos) (plSpread pos e)
  | .contains c n => .contains (c.placed pos) (n.placed pos)
  | .rest t cs => .rest (t.placed pos) (plCovers pos cs)
  | .select s arms d => .select (s.placed pos) (plPairs pos arms) (plSpread pos d)
  | .filter s c => .filter (s.placed pos) c
  | .call f args => .call f (plArgs pos f args)
  | .ride k v r => .ride k (v.placed pos) r
  | v => v

def plPairs (pos : List Seg) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.placed pos, r.placed pos) :: plPairs pos ps

def plCovers (pos : List Seg) : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (plSpread pos c, plSpread pos k, plSpread pos m) :: plCovers pos cs

def plFields (pos : List Seg) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.placed (pos ++ [.key k])) :: plFields pos fs

def plElems (pos : List Seg) : ℕ → List Val → List Val
  | _, [] => []
  | i, v :: vs => v.placed (pos ++ [.idx i]) :: plElems pos (i + 1) vs

def plItems (pos : List Seg) : List Val → List Val
  | [] => []
  | v :: vs => v.placed pos :: plItems pos vs

/-- A call's arguments placed, but a generator's template, which stays
as written. -/
def plArgs (pos : List Seg) (f : Fn) : List Val → List Val
  | [] => []
  | v :: vs => v.placed pos :: (if f = .each ∨ f = .pack then vs else plArgs pos f vs)

def plSpread (pos : List Seg) : Option Val → Option Val
  | none => none
  | some s => some (s.placed pos)

def plArms (pos : List Seg) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.placed pos) :: plArms pos as
end

/-- A document with each relative path it writes made absolute where it
stands: the schema from the top, and each body at its name's own place,
`%` and the name as a key at the top, as both ports place a body. -/
def Decls.placed (ds : Decls) (S : Val) : Decls × Val :=
  (ds.map fun d => (d.1, d.2.placed [.key ("%" ++ d.1)]), S.placed [])

/-- A variable's step: the text of the scalar the calling program binds
it to, a string as itself, a number as `Number.text` writes it and a
boolean as `true` or `false`, as both ports take a step only from a
scalar. A variable bound to nothing, to `null`, to a container or to
any other term, one that generates text among them, names no step. -/
def Decls.bindSeg (ds : Decls) : Seg → Option Seg
  | .var n =>
    match ds.filter (·.1 == "$" ++ n) with
    | [(_, .lit (.str s))] => some (.key s)
    | [(_, .lit (.num x))] => some (.key x.text)
    | [(_, .lit (.bool b))] => some (.key (if b then "true" else "false"))
    | _ => none
  | s => some s

/-- The term a written path names in a root: the path with each
variable bound (`Decls.bindSeg`), read by `Val.atW`. -/
def Decls.pathAt (ds : Decls) (root : Val) (p : List Seg) : Option Val :=
  (p.mapM ds.bindSeg).bind root.atW

/-- The declarations a document's paths make: each path's name, declared
as the term at the path in the root, with that term's own paths read as
names too. A path to nothing declares nothing. -/
def Decls.ofPaths (ds : Decls) (root : Val) (ps : List (List Seg)) : Decls :=
  ps.filterMap fun p => (ds.pathAt root p).map fun w => (pathName p, w.pathsToAliases)

/-- The paths a document writes: in the schema as read and in every body. -/
def Decls.docPaths (ds : Decls) (S : Val) : List (List Seg) :=
  ((ds.read S).paths ++ ds.paths).eraseDups

/-- The paths a document writes that must name something: every path
but one `maybe` forgives (`Val.forgive`). -/
def Decls.strictPaths (ds : Decls) (S : Val) : List (List Seg) :=
  ((ds.read S).forgive.paths ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.forgive.paths) []).eraseDups

/-- Whether every path of the document that must name something
resolves in the schema's own tree: the normal form of the schema as
read, before any data, its calls made (`Decls.readU`), the root its
paths read from, so that a path into a call's output resolves. -/
def Decls.resolvesB (ds : Decls) (S : Val) : Bool :=
  (ds.strictPaths S).all fun p => (ds.pathAt (normaliseD ds (ds.readU S)) p).isSome

/-- Every path of the document that must name something resolves in
the schema's own tree. -/
def Decls.Resolves (ds : Decls) (S : Val) : Prop :=
  ∀ p, p ∈ ds.strictPaths S → (ds.pathAt (normaliseD ds (ds.readU S)) p).isSome = true

theorem Decls.resolvesB_iff {ds : Decls} {S : Val} : ds.resolvesB S = true ↔ ds.Resolves S := by
  simp only [Decls.resolvesB, Decls.Resolves, List.all_eq_true]

/-- The document with its paths read as names from a root: each path is
declared as the term at it, and the bodies and the schema refer to the
names. -/
def Decls.withPathsFrom (ds : Decls) (S : Val) (root : Val) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.pathsToAliases)) ++ ds.ofPaths root (ds.docPaths S), S.pathsToAliases)

/-- The document with its paths read as names from the schema alone:
the root is the normal form of the schema as read, before any data,
which is what the error class is judged on. The root keeps its keys as
written, so that a key a path reaches reads where the path lands. -/
def Decls.withPathsS (ds : Decls) (S : Val) : Decls × Val :=
  ds.withPathsFrom S (normaliseD ds (ds.readU S))

/-- The document with its paths read as names from the data too: the
root is the normal form of the schema met with the data, which is what
the other classes are judged on. -/
def Decls.withPaths (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ds.withPathsFrom S (normaliseD ds (meetD ds (ds.readU S) j.term))

/-! ## The verdict with paths -/

/-- The verdict of a document whose paths are absolute. It is an `error`
where a path does not resolve in the schema's own tree, or where the
document is an error with its paths read from the schema alone: a name
declared nowhere, a cycle, a `nil` in the schema. Otherwise the paths
read from the data too, and the document is `invalid` where that
reading is dead or an error, since the data made it so, and `valid` or
`incomplete` as that reading is. -/
def VetA (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Resolves S ∨ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error
  | .invalid =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      (Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j .invalid ∨
        Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j .error)
  | v =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j v

/-- The verdict of a document whose paths are absolute, computed. -/
def vetA (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if ds.resolvesB S then
    if vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j = .error then .error
    else
      match vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j with
      | .error => .invalid
      | v => v
  else .error

/-! ## Moves -/

/-- The path a `move` reads its source from: its argument where that is
a path, the riders around it read through, as both ports read a rider's
value as the reference it wraps. -/
def movedSrc : Fn → List Val → List (List Seg)
  | .move, [v] =>
    match v.unride with
    | .path p => [p]
    | _ => []
  | _, _ => []

mutual
/-- The paths the `move` calls of a term read, each the call's argument
as written. -/
def Val.moved : Val → List (List Seg)
  | .len c => c.moved
  | .map fs spread _ => movedFields fs ++ movedSpread spread
  | .list items spread _ => movedItems items ++ movedSpread spread
  | .or arms => movedArms arms
  | .pref _ x => x.moved
  | .meet a b => a.moved ++ b.moved
  | .nof n cs => n.moved ++ movedItems cs
  | .must c _ => c.moved
  | .when c t e => c.moved ++ t.moved ++ movedSpread e
  | .contains c n => c.moved ++ n.moved
  | .rest t cs => t.moved ++ movedCovers cs
  | .select s arms d => s.moved ++ movedPairs arms ++ movedSpread d
  | .filter s c => s.moved ++ c.moved
  | .call f args => movedSrc f args ++ movedItems args
  | .ride _ v _ => v.moved
  | _ => []

def movedPairs : List (Val × Val) → List (List Seg)
  | [] => []
  | (p, r) :: ps => p.moved ++ r.moved ++ movedPairs ps

def movedCovers : List Cover → List (List Seg)
  | [] => []
  | (c, k, m) :: cs => movedSpread c ++ movedSpread k ++ movedSpread m ++ movedCovers cs

def movedFields : List (String × Bool × Val) → List (List Seg)
  | [] => []
  | (_, _, v) :: fs => v.moved ++ movedFields fs

def movedItems : List Val → List (List Seg)
  | [] => []
  | v :: vs => v.moved ++ movedItems vs

def movedSpread : Option Val → List (List Seg)
  | none => []
  | some s => s.moved

def movedArms : List (ℕ × Val) → List (List Seg)
  | [] => []
  | (_, a) :: as => a.moved ++ movedArms as
end

/-- What hides the value at a path and asks nothing else: an open map
holding the path's key as optional, down to `hide(any)`. A step into a
list, which no position can make optional, hides nothing. -/
def hideAt : List Seg → Val
  | [] => .ride .hide .any []
  | .key k :: p => .map [(k, true, hideAt p)] none false
  | _ :: _ => .any

/-- The steps a written path takes in a term, each read by the container
it meets (`Seg.stepIn`), where the path names something there. -/
def Val.stepsW : Val → List Seg → Option (List Seg)
  | _, [] => some []
  | v, s :: p =>
    match s.stepIn v with
    | some t =>
      match v.at [t] with
      | some w => (w.stepsW p).map (t :: ·)
      | none => none
    | none => none
termination_by structural _ p => p

/-- The schema with each source a `move` reads hidden, met with
`hideAt` of the steps its path takes in the root, each variable bound
and each step read by the container it meets, so that the document
generates the value once, at its new place, and the data needn't supply
the source. A `move` in a body hides its source as one in the schema
does, used or not, as both ports read a body where it's declared. A
path to nothing hides nothing, so that it stays the error any path to
nothing is. -/
def Decls.withMoves (ds : Decls) (S : Val) : Val :=
  ((S.moved ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.moved) []).filterMap fun p =>
      (p.mapM ds.bindSeg).bind (normaliseD ds (ds.readU S)).stepsW).foldl
    (fun acc p => .meet acc (hideAt p)) S

/-- A document as the definition reads it: its relative paths placed
(`Decls.placed`) and the sources its moves read hidden
(`Decls.withMoves`). -/
def Decls.prepared (ds : Decls) (S : Val) : Decls × Val :=
  ((ds.placed S).1, (ds.placed S).1.withMoves (ds.placed S).2)

theorem hideAt_checkableA : ∀ p, (hideAt p).CheckableA
  | [] => .ride .any
  | .key _ :: p => .map (fun _ _ _ hv => by
      simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hv
      rw [hv.2.2]; exact hideAt_checkableA p) (fun _ h => nomatch h)
  | .idx _ :: _ | .var _ :: _ | .up _ :: _ => .any

theorem foldl_hide_checkableA : ∀ (ps : List (List Seg)) {S : Val}, S.CheckableA →
    (ps.foldl (fun acc p => Val.meet acc (hideAt p)) S).CheckableA
  | [], _, h => h
  | p :: ps, _, h => foldl_hide_checkableA ps (.meet h (hideAt_checkableA p))

/-- A schema the checker can read reads with its moves' sources hidden. -/
theorem withMoves_checkableA {ds : Decls} {S : Val} (h : S.CheckableA) :
    (ds.withMoves S).CheckableA :=
  foldl_hide_checkableA _ h

/-- The verdict of a document with paths: the document prepared
(`Decls.prepared`), its relative paths placed and the sources its moves
read hidden, the verdict of the document whose paths are absolute. -/
def VetP (m : Mode) (ds : Decls) (S : Val) (j : Data) (v : Verdict) : Prop :=
  VetA m (ds.prepared S).1 (ds.prepared S).2 j v

/-- The verdict with paths, computed. -/
def vetP (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  vetA m (ds.prepared S).1 (ds.prepared S).2 j

/-! ## Paths read as names keep a term checkable -/

theorem mem_ptaFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ ptaFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.pathsToAliases := by
  induction fs with
  | nil => simp [ptaFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [ptaFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_ptaPairs {ps : List (Val × Val)} {p r : Val} :
    (p, r) ∈ ptaPairs ps ↔ ∃ p₀ r₀, (p₀, r₀) ∈ ps ∧ p = p₀.pathsToAliases ∧ r = r₀.pathsToAliases := by
  induction ps with
  | nil => simp [ptaPairs]
  | cons q ps ih =>
    obtain ⟨p', r'⟩ := q
    simp only [ptaPairs, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨p₀, r₀, hm, rfl, rfl⟩)
      · exact ⟨p', r', Or.inl ⟨rfl, rfl⟩, rfl, rfl⟩
      · exact ⟨p₀, r₀, Or.inr hm, rfl, rfl⟩
    · rintro ⟨p₀, r₀, ⟨rfl, rfl⟩ | hm, rfl, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨p₀, r₀, hm, rfl, rfl⟩

theorem mem_ptaItems {items : List Val} {w : Val} :
    w ∈ ptaItems items ↔ ∃ v, v ∈ items ∧ w = v.pathsToAliases := by
  induction items with
  | nil => simp [ptaItems]
  | cons v vs ih =>
    simp only [ptaItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

theorem ptaSpread_eq {spread : Option Val} {t : Val} :
    ptaSpread spread = some t ↔ ∃ s, spread = some s ∧ t = s.pathsToAliases := by
  cases spread with
  | none => simp [ptaSpread]
  | some s =>
    simp only [ptaSpread, Option.some.injEq]
    exact ⟨fun h => ⟨s, rfl, h.symm⟩, fun ⟨s', hs, ht⟩ => by cases hs; exact ht.symm⟩

theorem mem_ptaCovers {cs : List Cover} {c' : Cover} :
    c' ∈ ptaCovers cs ↔ ∃ c, c ∈ cs ∧ c' = (ptaSpread c.1, ptaSpread c.2.1, ptaSpread c.2.2) := by
  induction cs with
  | nil => simp [ptaCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [ptaCovers, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨d, hd, rfl⟩)
      · exact ⟨(a, k, m), .inl rfl, rfl⟩
      · exact ⟨d, .inr hd, rfl⟩
    · rintro ⟨d, rfl | hd, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨d, hd, rfl⟩

theorem mem_ptaArms {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ ptaArms arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.pathsToAliases := by
  induction arms with
  | nil => simp [ptaArms]
  | cons q qs ih =>
    obtain ⟨r', a'⟩ := q
    simp only [ptaArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

/-- A term the checker can read, its paths read as names, is one it can read. -/
theorem pathsToAliases_checkableA {v : Val} (h : v.CheckableA) : v.pathsToAliases.CheckableA := by
  induction h with
  | len _ ih => exact .len ih
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_ptaFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_ptaItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_ptaArms.mp hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | ride _ ih => exact .ride ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | path => exact .alias
  | @nof n cs _ _ ihn ihcs =>
    refine .nof ihn fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_ptaItems.mp hm
    exact ihcs c hc
  | @call f args _ ih =>
    refine .call fun w hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_ptaItems.mp hm
    exact ih a ha
  | must _ ih => exact .must ih
  | @when c t e _ _ _ ihc iht ihe =>
    refine .when ihc iht fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp he
    exact ihe s hs
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    refine .rest iht ?_ ?_ ?_
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_ptaCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp hv
      exact ih1 c hc s hs
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_ptaCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp hv
      exact ih2 c hc s hs
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_ptaCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp hv
      exact ih3 c hc s hs
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_ptaPairs.mp hm
      exact ihp p₀ r₀ hm₀
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_ptaPairs.mp hm
      exact ihr p₀ r₀ hm₀
    · obtain ⟨e₀, he₀, rfl⟩ := ptaSpread_eq.mp he
      exact ihd e₀ he₀
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_ptaPairs.mp hm
      exact ihp p₀ r₀ hm₀
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_ptaPairs.mp hm
      exact ihr p₀ r₀ hm₀
    · obtain ⟨e₀, he₀, rfl⟩ := ptaSpread_eq.mp he
      exact ihd e₀ he₀
  | _ => simp only [Val.pathsToAliases]; constructor

/-! ## Placing keeps a term checkable -/

theorem mem_plFields {pos : List Seg} {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ plFields pos fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.placed (pos ++ [.key k]) := by
  induction fs with
  | nil => simp [plFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [plFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_plElems {pos : List Seg} : ∀ {i : ℕ} {items : List Val} {w : Val},
    w ∈ plElems pos i items → ∃ v, v ∈ items ∧ ∃ j, w = v.placed (pos ++ [.idx j])
  | _, [], _, h => by simp [plElems] at h
  | i, v :: vs, w, h => by
    simp only [plElems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, i, rfl⟩
    · obtain ⟨u, hu, j, rfl⟩ := mem_plElems h
      exact ⟨u, List.mem_cons_of_mem _ hu, j, rfl⟩

theorem mem_plItems {pos : List Seg} {items : List Val} {w : Val} :
    w ∈ plItems pos items ↔ ∃ v, v ∈ items ∧ w = v.placed pos := by
  induction items with
  | nil => simp [plItems]
  | cons v vs ih =>
    simp only [plItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

theorem mem_plArgs {pos : List Seg} {f : Fn} : ∀ {args : List Val} {w : Val},
    w ∈ plArgs pos f args → ∃ v, v ∈ args ∧ (w = v.placed pos ∨ w = v)
  | [], _, h => by simp [plArgs] at h
  | v :: vs, w, h => by
    simp only [plArgs, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, .inl rfl⟩
    · split at h
      · exact ⟨w, List.mem_cons_of_mem _ h, .inr rfl⟩
      · obtain ⟨u, hu, hw⟩ := mem_plArgs h
        exact ⟨u, List.mem_cons_of_mem _ hu, hw⟩

theorem mem_plPairs {pos : List Seg} {ps : List (Val × Val)} {p r : Val} :
    (p, r) ∈ plPairs pos ps ↔ ∃ p₀ r₀, (p₀, r₀) ∈ ps ∧ p = p₀.placed pos ∧ r = r₀.placed pos := by
  induction ps with
  | nil => simp [plPairs]
  | cons q ps ih =>
    obtain ⟨p', r'⟩ := q
    simp only [plPairs, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨p₀, r₀, hm, rfl, rfl⟩)
      · exact ⟨p', r', Or.inl ⟨rfl, rfl⟩, rfl, rfl⟩
      · exact ⟨p₀, r₀, Or.inr hm, rfl, rfl⟩
    · rintro ⟨p₀, r₀, ⟨rfl, rfl⟩ | hm, rfl, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨p₀, r₀, hm, rfl, rfl⟩

theorem plSpread_eq {pos : List Seg} {spread : Option Val} {t : Val} :
    plSpread pos spread = some t ↔ ∃ s, spread = some s ∧ t = s.placed pos := by
  cases spread with
  | none => simp [plSpread]
  | some s =>
    simp only [plSpread, Option.some.injEq]
    exact ⟨fun h => ⟨s, rfl, h.symm⟩, fun ⟨s', hs, ht⟩ => by cases hs; exact ht.symm⟩

theorem mem_plCovers {pos : List Seg} {cs : List Cover} {c' : Cover} :
    c' ∈ plCovers pos cs ↔ ∃ c, c ∈ cs ∧ c' = (plSpread pos c.1, plSpread pos c.2.1, plSpread pos c.2.2) := by
  induction cs with
  | nil => simp [plCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [plCovers, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨d, hd, rfl⟩)
      · exact ⟨(a, k, m), .inl rfl, rfl⟩
      · exact ⟨d, .inr hd, rfl⟩
    · rintro ⟨d, rfl | hd, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨d, hd, rfl⟩

theorem mem_plArms {pos : List Seg} {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ plArms pos arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.placed pos := by
  induction arms with
  | nil => simp [plArms]
  | cons q qs ih =>
    obtain ⟨r', a'⟩ := q
    simp only [plArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

/-- A term the checker can read, its relative paths placed, is one it
can read. -/
theorem placed_checkableA {v : Val} (h : v.CheckableA) : ∀ pos, (v.placed pos).CheckableA := by
  induction h with
  | len _ ih => intro pos; exact .len (ih pos)
  | @map fs spread closed _ hs ihf _ =>
    intro pos
    refine .map ?_ hs
    intro k o w hm
    obtain ⟨v, hv, rfl⟩ := mem_plFields.mp hm
    exact ihf k o v hv _
  | @list items spread closed _ hs ihi _ =>
    intro pos
    refine .list ?_ hs
    intro w hm
    obtain ⟨v, hv, j, rfl⟩ := mem_plElems hm
    exact ihi v hv _
  | @or arms _ ih =>
    intro pos
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_plArms.mp hm
    exact ih r a ha pos
  | pref _ ih => intro pos; exact .pref (ih pos)
  | ride _ ih => intro pos; exact .ride (ih pos)
  | meet _ _ iha ihb => intro pos; exact .meet (iha pos) (ihb pos)
  | @path p =>
    intro pos
    match p with
    | .up n :: q =>
      simp only [Val.placed]
      split <;> exact .path
    | [] => exact .path
    | .key _ :: _ => exact .path
    | .idx _ :: _ => exact .path
    | .var _ :: _ => exact .path
  | @nof n cs _ _ ihn ihcs =>
    intro pos
    refine .nof (ihn pos) fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_plItems.mp hm
    exact ihcs c hc pos
  | @call f args hargs ih =>
    intro pos
    refine .call fun w hm => ?_
    obtain ⟨a, ha, hw | hw⟩ := mem_plArgs hm
    · rw [hw]; exact ih a ha pos
    · rw [hw]; exact hargs a ha
  | must _ ih => intro pos; exact .must (ih pos)
  | @when c t e _ _ _ ihc iht ihe =>
    intro pos
    refine .when (ihc pos) (iht pos) fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := plSpread_eq.mp he
    exact ihe s hs pos
  | contains _ _ ihc ihn => intro pos; exact .contains (ihc pos) (ihn pos)
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    intro pos
    refine .rest (iht pos) ?_ ?_ ?_
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_plCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := plSpread_eq.mp hv
      exact ih1 c hc s hs pos
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_plCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := plSpread_eq.mp hv
      exact ih2 c hc s hs pos
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_plCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := plSpread_eq.mp hv
      exact ih3 c hc s hs pos
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    intro pos
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_plPairs.mp hm
      exact ihp p₀ r₀ hm₀ pos
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_plPairs.mp hm
      exact ihr p₀ r₀ hm₀ pos
    · obtain ⟨e₀, he₀, rfl⟩ := plSpread_eq.mp he
      exact ihd e₀ he₀ pos
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    intro pos
    refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_plPairs.mp hm
      exact ihp p₀ r₀ hm₀ pos
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_plPairs.mp hm
      exact ihr p₀ r₀ hm₀ pos
    · obtain ⟨e₀, he₀, rfl⟩ := plSpread_eq.mp he
      exact ihd e₀ he₀ pos
  | _ => intro pos; simp only [Val.placed]; constructor

theorem Decls.placed_bodies_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ d, d ∈ (ds.placed S).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.placed, List.mem_map] at hd
  obtain ⟨d', hd', rfl⟩ := hd
  exact placed_checkableA (hb d' hd') _

/-- The term at a path in a term the checker can read is one it can read. -/
theorem at_checkableA : ∀ (p : List Seg) {v w : Val}, v.CheckableA → v.at p = some w → w.CheckableA
  | [], _, _, hv, h => by
    simp only [Val.at, Option.some.injEq] at h
    exact h ▸ hv
  | .key k :: p, v, w, hv, h => by
    have hu := Val.checkableA_unride hv
    simp only [Val.at] at h
    split at h
    · rename_i fs _ _ hm
      rw [hm] at hu
      cases hu with
      | map hf _ =>
        split at h
        · rename_i f hfind
          exact at_checkableA p (hf f.1 f.2.1 f.2.2 (List.mem_of_find?_eq_some hfind)) h
        · exact absurd h (by simp)
    · exact absurd h (by simp)
  | .idx i :: p, v, w, hv, h => by
    have hu := Val.checkableA_unride hv
    simp only [Val.at] at h
    split at h
    · rename_i items _ _ hm
      rw [hm] at hu
      cases hu with
      | list hi _ =>
        split at h
        · rename_i x hx
          exact at_checkableA p (hi x (List.mem_of_getElem? hx)) h
        · exact absurd h (by simp)
    · exact absurd h (by simp)
  | .var _ :: _, _, _, _, h => by simp [Val.at] at h
  | .up _ :: _, _, _, _, h => by simp [Val.at] at h

/-- The term at a written path in a term the checker can read is one it
can read. -/
theorem atW_checkableA : ∀ (p : List Seg) {v w : Val}, v.CheckableA → v.atW p = some w → w.CheckableA
  | [], _, _, hv, h => by
    simp only [Val.atW, Option.some.injEq] at h
    exact h ▸ hv
  | s :: p, v, w, hv, h => by
    simp only [Val.atW] at h
    split at h
    · rename_i t _
      split at h
      · rename_i u hu
        exact atW_checkableA p (at_checkableA [t] hv hu) h
      · exact absurd h (by simp)
    · exact absurd h (by simp)

theorem Decls.pathAt_checkableA {ds : Decls} {root w : Val} {p : List Seg} (hr : root.CheckableA)
    (h : ds.pathAt root p = some w) : w.CheckableA := by
  unfold Decls.pathAt at h
  cases hq : p.mapM ds.bindSeg with
  | none => rw [hq] at h; exact absurd h (by simp)
  | some q => rw [hq] at h; exact atW_checkableA q hr h

theorem Decls.ofPaths_checkableA {ds : Decls} {root : Val} (hr : root.CheckableA) (ps : List (List Seg)) :
    ∀ d, d ∈ ds.ofPaths root ps → d.2.CheckableA := by
  intro d hd
  simp only [Decls.ofPaths, List.mem_filterMap] at hd
  obtain ⟨p, -, hp⟩ := hd
  cases hw : ds.pathAt root p with
  | none => rw [hw] at hp; exact absurd hp (by simp)
  | some w =>
    rw [hw] at hp
    simp only [Option.map_some, Option.some.injEq] at hp
    rw [← hp]
    exact pathsToAliases_checkableA (Decls.pathAt_checkableA hr hw)

theorem Decls.withPathsFrom_bodies_checkableA {ds : Decls} {S : Val} {root : Val}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hr : root.CheckableA) :
    ∀ d, d ∈ (ds.withPathsFrom S root).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.withPathsFrom, List.mem_append, List.mem_map] at hd
  rcases hd with ⟨d', hd', rfl⟩ | hd
  · exact pathsToAliases_checkableA (hb d' hd')
  · exact Decls.ofPaths_checkableA hr _ d hd

/-- `vetA` computes `VetA` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetA_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetA m ds S j = v ↔ VetA m ds S j v := by
  have hbS := Decls.withPathsFrom_bodies_checkableA (S := S) hb (normaliseD_checkableA hb (readU_checkableA hb hS))
  have hvS := vet_iff (m := m) (ds := (ds.withPathsS S).1) (S := (ds.withPathsS S).2) (j := j) hbS
    (readR_checkableA hbS (pathsToAliases_checkableA hS))
  have hbP := Decls.withPathsFrom_bodies_checkableA (S := S) hb
    (normaliseD_checkableA hb (meetD_checkableA hb (readU_checkableA hb hS) (Data.term_checkableA j)))
  have hvP := vet_iff (m := m) (ds := (ds.withPaths S j).1) (S := (ds.withPaths S j).2) (j := j) hbP
    (readR_checkableA hbP (pathsToAliases_checkableA hS))
  unfold vetA
  by_cases hr : ds.resolvesB S = true
  · rw [if_pos hr]
    have hR := Decls.resolvesB_iff.mp hr
    by_cases he : vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j = .error
    · rw [if_pos he]
      have hE := (hvS .error).mp he
      cases v <;> simp only [VetA, hR, hE, not_true_eq_false, false_and, and_false, or_true,
        reduceCtorEq]
    · rw [if_neg he]
      have hE : ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error := fun h => he ((hvS .error).mpr h)
      cases hp : vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j <;> cases v <;>
        simp only [VetA, hR, hE, ← hvP, hp, not_true_eq_false, not_false_eq_true,
          or_true, or_false, and_false, and_true, reduceCtorEq]
  · rw [if_neg hr]
    have hR : ¬ ds.Resolves S := fun h => hr (Decls.resolvesB_iff.mpr h)
    cases v <;> simp only [VetA, hR, not_false_eq_true, true_or, false_and, reduceCtorEq]

/-- `vetP` computes `VetP` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetP_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetP m ds S j = v ↔ VetP m ds S j v :=
  vetA_iff (ds := (ds.placed S).1) (S := (ds.placed S).1.withMoves (ds.placed S).2)
    (Decls.placed_bodies_checkableA hb) (withMoves_checkableA (placed_checkableA hS [])) v

/-! ## The output with paths -/

/-- What a document whose paths are absolute generates, where every
path resolves: the output of the document with its paths read as names
from the schema alone. -/
def OutputA (ds : Decls) (root : Data) (S : Val) (j : Data) : Prop :=
  ds.Resolves S ∧ OutputD (ds.withPathsS S).1 root ((ds.withPathsS S).1.readR (ds.withPathsS S).2) j

/-- What a document whose paths are absolute generates, computed. -/
def outputA (ds : Decls) (S : Val) : Option Data :=
  if ds.resolvesB S then outputD (ds.withPathsS S).1 ((ds.withPathsS S).1.readR (ds.withPathsS S).2)
  else none

/-- `outputA` computes `OutputA` where the reading keeps the alias-cycle
rule and the checker can read its bodies and its normal form. -/
theorem outputA_iff {ds : Decls} {S : Val} {root : Data} (hg : (ds.withPathsS S).1.Guarded)
    (hb : ∀ d, d ∈ (ds.withPathsS S).1 → d.2.CheckableA)
    (h : (normaliseD (ds.withPathsS S).1 ((ds.withPathsS S).1.readR (ds.withPathsS S).2)).CheckableA)
    (j : Data) : outputA ds S = some j ↔ OutputA ds root S j := by
  unfold outputA OutputA
  by_cases hr : ds.resolvesB S = true
  · rw [if_pos hr, outputD_iff hg hb h j]
    exact ⟨fun h' => ⟨Decls.resolvesB_iff.mp hr, h'⟩, fun h' => h'.2⟩
  · rw [if_neg hr]
    exact ⟨fun h' => absurd h' (by simp), fun h' => absurd (Decls.resolvesB_iff.mpr h'.1) hr⟩

/-- What a document with paths generates: the document prepared
(`Decls.prepared`), its relative paths placed and the sources its moves
read hidden, what the document whose paths are absolute generates. -/
def OutputP (ds : Decls) (root : Data) (S : Val) (j : Data) : Prop :=
  OutputA (ds.prepared S).1 root (ds.prepared S).2 j

/-- What a document with paths generates, computed. -/
def outputP (ds : Decls) (S : Val) : Option Data :=
  outputA (ds.prepared S).1 (ds.prepared S).2

/-- `outputP` computes `OutputP` where the reading of the placed
document keeps the alias-cycle rule and the checker can read its bodies
and its normal form. -/
theorem outputP_iff {ds : Decls} {S : Val} {root : Data}
    (hg : ((ds.prepared S).1.withPathsS (ds.prepared S).2).1.Guarded)
    (hb : ∀ d, d ∈ ((ds.prepared S).1.withPathsS (ds.prepared S).2).1 → d.2.CheckableA)
    (h : (normaliseD ((ds.prepared S).1.withPathsS (ds.prepared S).2).1
      (((ds.prepared S).1.withPathsS (ds.prepared S).2).1.readR
        ((ds.prepared S).1.withPathsS (ds.prepared S).2).2)).CheckableA)
    (j : Data) : outputP ds S = some j ↔ OutputP ds root S j :=
  outputA_iff hg hb h j

end Aontu

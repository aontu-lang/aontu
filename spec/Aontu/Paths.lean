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

/-- The term a written path names in the first of the roots it names
something in. -/
def Decls.pathIn (ds : Decls) (roots : List Val) (p : List Seg) : Option Val :=
  roots.findSome? fun root => ds.pathAt root p

/-- The declarations a document's paths make: each path's name, declared
as the term at the path in the first of the roots it names something
in, with that term's own paths read as names too. A path to nothing
declares nothing. -/
def Decls.ofPaths (ds : Decls) (roots : List Val) (ps : List (List Seg)) : Decls :=
  ps.filterMap fun p => (ds.pathIn roots p).map fun w => (pathName p, w.pathsToAliases)

/-- The paths a document writes: in the schema as read and in every body. -/
def Decls.docPaths (ds : Decls) (S : Val) : List (List Seg) :=
  ((ds.read S).paths ++ ds.paths).eraseDups

/-- The paths a document writes that must name something: every path
but one `maybe` forgives (`Val.forgive`). -/
def Decls.strictPaths (ds : Decls) (S : Val) : List (List Seg) :=
  ((ds.read S).forgive.paths ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.forgive.paths) []).eraseDups

/-- The document with its paths read as names from roots: each path is
declared as the term at it in the first root it names something in, and
the bodies and the schema refer to the names. -/
def Decls.withPathsFrom (ds : Decls) (S : Val) (roots : List Val) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.pathsToAliases)) ++ ds.ofPaths roots (ds.docPaths S), S.pathsToAliases)

/-- The roots a document's paths read, round by round, `r` reading a
document to its root: the first with its paths unread, and each after
with its paths read as names from the roots before it. A call over a
path makes its value the round after the path names something, and a
path into that value names something the round after that, so each
round reaches one more step of a chain of paths. A path keeps the term
the first round that reaches it holds there. -/
def Decls.rounds (ds : Decls) (S : Val) (r : Decls → Val → Val) : ℕ → List Val
  | 0 => [r ds S]
  | n + 1 =>
    let rs := ds.rounds S r n
    let d := ds.withPathsFrom S rs
    rs ++ [r d.1 d.2]

/-- The schema's own tree: the normal form of the schema as read, before
any data, its calls made (`Decls.readU`), in as many rounds as the
document writes paths, since a round that reaches no new path changes
nothing after it. The roots keep their keys as written, so that a key a
path reaches reads where the path lands. -/
def Decls.rootsS (ds : Decls) (S : Val) : List Val :=
  ds.rounds S (fun d T => normaliseD d (d.readU T)) (ds.docPaths S).length

/-- The tree the data reads in: the normal form of the schema met with
the data, in as many rounds. -/
def Decls.rootsD (ds : Decls) (S : Val) (j : Data) : List Val :=
  ds.rounds S (fun d T => normaliseD d (meetD d (d.readU T) j.term)) (ds.docPaths S).length

/-- Whether every path of the document that must name something
resolves in the schema's own tree (`Decls.rootsS`), so that a path into
a call's output resolves, the call's arguments paths or not. -/
def Decls.resolvesB (ds : Decls) (S : Val) : Bool :=
  (ds.strictPaths S).all fun p => (ds.pathIn (ds.rootsS S) p).isSome

/-- Every path of the document that must name something resolves in
the schema's own tree. -/
def Decls.Resolves (ds : Decls) (S : Val) : Prop :=
  ∀ p, p ∈ ds.strictPaths S → (ds.pathIn (ds.rootsS S) p).isSome = true

theorem Decls.resolvesB_iff {ds : Decls} {S : Val} : ds.resolvesB S = true ↔ ds.Resolves S := by
  simp only [Decls.resolvesB, Decls.Resolves, List.all_eq_true]

/-- The document with its paths read as names from the schema alone,
from its own tree, which is what the error class is judged on. -/
def Decls.withPathsS (ds : Decls) (S : Val) : Decls × Val :=
  ds.withPathsFrom S (ds.rootsS S)

/-- The document with its paths read as names from the data too, from
the tree the data reads in, which is what the other classes are judged
on. -/
def Decls.withPaths (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ds.withPathsFrom S (ds.rootsD S j)

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
`hideAt` of the steps its path takes in the first of the schema's roots
it names something in, each variable bound and each step read by the
container it meets, so that the document
generates the value once, at its new place, and the data needn't supply
the source. A `move` in a body hides its source as one in the schema
does, used or not, as both ports read a body where it's declared. A
path to nothing hides nothing, so that it stays the error any path to
nothing is. -/
def Decls.withMoves (ds : Decls) (S : Val) : Val :=
  ((S.moved ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.moved) []).filterMap fun p =>
      (p.mapM ds.bindSeg).bind fun q => (ds.rootsS S).findSome? fun root => root.stepsW q).foldl
    (fun acc p => .meet acc (hideAt p)) S

/-! ## Links -/

/-- A link call's template, `any` where none is written, at the
position the call stands at, and whether it's a relation, whose value
holds a link at each leaf: a `refer` or a `rel`. -/
def referSrc (pos : List Seg) : Fn → List Val → List (List Seg × Val × Bool)
  | .refer, [] => [(pos, .any, false)]
  | .refer, [t] => [(pos, t, false)]
  | .rel, [] => [(pos, .any, true)]
  | .rel, [t] => [(pos, t, true)]
  | _, _ => []

mutual
/-- The `refer` and `rel` calls of a term, each with its template, the
position it stands at and whether it's a relation: through maps by key,
lists by index, meets and riders, where a link's own value stands. -/
def Val.refers (pos : List Seg) : Val → List (List Seg × Val × Bool)
  | .call f args => referSrc pos f args
  | .map fs _ _ => refersFields pos fs
  | .list items _ _ => refersElems pos 0 items
  | .meet a b => a.refers pos ++ b.refers pos
  | .ride _ v _ => v.refers pos
  | _ => []

def refersFields (pos : List Seg) : List (String × Bool × Val) → List (List Seg × Val × Bool)
  | [] => []
  | (k, _, v) :: fs => v.refers (pos ++ [.key k]) ++ refersFields pos fs

def refersElems (pos : List Seg) : ℕ → List Val → List (List Seg × Val × Bool)
  | _, [] => []
  | i, v :: vs => v.refers (pos ++ [.idx i]) ++ refersElems pos (i + 1) vs
end

/-- The address a term holds, the riders around it read through. -/
def Val.addrOf? (v : Val) : Option Addr :=
  match v.unride with
  | .addr a => some a
  | _ => none

mutual
/-- The addresses at a term's leaves: the term where it's an address,
and those of each element of a list and each member of a map, through
meets, riders and a disjunction of one arm, as the relation kind's
normal form leaves its value. -/
def Val.addrs : Val → List Addr
  | .addr a => [a]
  | .list items _ _ => addrsItems items
  | .map fs _ _ => addrsFields fs
  | .meet a b => a.addrs ++ b.addrs
  | .ride _ v _ => v.addrs
  | .or arms => addrsArms arms
  | _ => []

def addrsArms : List (ℕ × Val) → List Addr
  | [(_, x)] => x.addrs
  | _ => []

def addrsItems : List Val → List Addr
  | [] => []
  | v :: vs => v.addrs ++ addrsItems vs

def addrsFields : List (String × Bool × Val) → List Addr
  | [] => []
  | (_, _, v) :: fs => v.addrs ++ addrsFields fs
end

/-- The addresses a link written in `src` holds at its position: a
`refer`'s one, and one at each leaf of a relation's value. -/
def linkAddrs (src : Val) (e : List Seg × Val × Bool) : List Addr :=
  ((src.at e.1).map fun v => if e.2.2 then v.addrs else v.addrOf?.toList).getD []

mutual
/-- The positions a term holds, as `Val.at` reads them: the empty path,
and each position below each member of a map and each element of a
list, the riders around either read through. -/
def Val.positions : Val → List (List Seg)
  | .map fs _ _ => [] :: positionsFields fs
  | .list items _ _ => [] :: positionsItems 0 items
  | .ride _ v _ => v.positions
  | _ => [[]]

def positionsFields : List (String × Bool × Val) → List (List Seg)
  | [] => []
  | (k, _, v) :: fs => v.positions.map (.key k :: ·) ++ positionsFields fs

def positionsItems : ℕ → List Val → List (List Seg)
  | _, [] => []
  | i, v :: vs => v.positions.map (.idx i :: ·) ++ positionsItems (i + 1) vs
end

/-- What a term leaves for the next step of a path, each with the path
left after the step: a map's member at the step and its spread, which
holds every member, a list's element at the step and its spread, and a
generator's template, which makes every member of its output, `each`'s
and `pack`'s. -/
def Val.stepItems (t : Val) (s : Seg) (p : List Seg) : List (Val × List Seg) :=
  match t with
  | .map fs spread _ =>
    (match s.stepIn t with
      | some (.key k) => (fs.filter fun f => f.1 == k).map fun f => (f.2.2, p)
      | _ => []) ++ spread.toList.map fun sp => (sp, p)
  | .list items spread _ =>
    (match s.stepIn t with
      | some (.idx i) => items[i]?.toList.map fun w => (w, p)
      | _ => []) ++ spread.toList.map fun sp => (sp, p)
  | .call .each [_, tmpl] => [(tmpl, p)]
  | .call .pack [_, tmpl] => [(tmpl, p)]
  | _ => []

/-- A term on a path where no meet, rider or reference stands: the term
itself where the path is spent, and what it leaves for the next step
where it isn't (`Val.stepItems`). -/
def landLeaf (t : Val) : List Seg → List Val × List (Val × List Seg)
  | [] => ([t], [])
  | s :: p => ([], t.stepItems s p)

/-- One step of reading what the schema `S` writes at a path, on an
item, a term and the path left below it: a meet's two sides and a
rider's term on the same path, a path reference's target read from the
top of `S` with the rest of the path after it, and any other term as
`landLeaf` reads it. -/
def landStep (S : Val) (i : Val × List Seg) : List Val × List (Val × List Seg) :=
  match i.1 with
  | .meet a b => ([], [(a, i.2), (b, i.2)])
  | .ride _ v _ => ([], [(v, i.2)])
  | .path q => ([], [(S, q ++ i.2)])
  | _ => landLeaf i.1 i.2

/-- What the schema `S` writes at a path, read from the items within `n`
steps (`landStep`), so that a cycle of references reads to the end of
the budget and no further. -/
def landing (S : Val) : ℕ → List (Val × List Seg) → List Val
  | 0, _ => []
  | _, [] => []
  | n + 1, i :: rest => (landStep S i).1 ++ landing S n ((landStep S i).2 ++ rest)

/-- The link a term is at a position, where it's a `refer` or `rel`
call. -/
def callLinks (pos : List Seg) : Val → List (List Seg × Val × Bool)
  | .call f args => referSrc pos f args
  | _ => []

/-- The links that land at a position of the schema `S`: each `refer`
and `rel` call among the terms `S` writes there (`landing`), whether
written there, in a spread's template that holds the member, or where a
path reference copies it from, and read at that position. -/
def Val.linksAt (S : Val) (pos : List Seg) : List (List Seg × Val × Bool) :=
  (landing S ((S.size + pos.length + 2) * (S.size + 2)) [(S, pos)]).flatMap (callLinks pos)

/-- The links that land in the schema `S`, at each position its normal
form `root` holds. -/
def Val.landedLinks (S root : Val) : List (List Seg × Val × Bool) :=
  root.positions.flatMap S.linksAt

/-- The written path an address names from the position its link stands
at: from the root for `$`, and for `n` dots from the map or list that
holds the link and `n - 1` steps up from there, none where that climbs
past the top. -/
def Addr.from (a : Addr) (pos : List Seg) : Option (List Seg) :=
  if a.up = 0 then some (a.steps.map .key)
  else if a.up ≤ pos.length then some (pos.take (pos.length - a.up) ++ a.steps.map .key)
  else none

/-- What meets `t` into the term at a written path and asks nothing else,
each step read in a root by the container it meets: an open map holding
the step's key as optional, or a list as long as the root's holding
`any` at every other position, down to `t`; none where the path names
nothing in the root. -/
def Val.putW : Val → List Seg → Val → Option Val
  | _, [], t => some t
  | v, s :: p, t =>
    match s.stepIn v with
    | some (.key k) =>
      match v.at [.key k] with
      | some w => (w.putW p t).map fun u => .map [(k, true, u)] none false
      | none => none
    | some (.idx i) =>
      match v.unride with
      | .list items _ _ =>
        match items[i]? with
        | some w => (w.putW p t).map fun u =>
            .list (items.zipIdx.map fun e => if e.2 = i then u else .any) none false
        | none => none
      | _ => none
    | _ => none
termination_by structural _ p _ => p

/-- One address's part in the schema: `t` met at the path the address
names from `pos` (`Addr.from`, `Val.putW`) in the first of `roots` it
names something in, or `miss` where it names nothing in them or climbs
past the top. -/
def referFlow (roots : List Val) (miss : Val) (pos : List Seg) (t : Val) (acc : Val) (a : Addr) :
    Val :=
  match (a.from pos).bind fun p => roots.findSome? fun root => root.putW p t with
  | some u => .meet acc u
  | none => .meet acc miss

/-- One link's part in the schema, the link written in `src` at `home`:
for each address `src`'s normal form holds at the link's position
(`linkAddrs`), the template with its marks cleared (`Val.unmark`), as a
reference copies it, met at the address's target read from where the
link stands, a relation's every leaf read from the relation's own
position. A link whose position holds no address has no target yet,
and meets nothing. -/
def referStep (roots : List Val) (miss : Val) (home : List Seg) (src : Val) (acc : Val)
    (e : List Seg × Val × Bool) : Val :=
  (linkAddrs src e).foldl (referFlow roots miss (home ++ e.1) e.2.1.unmark) acc

/-- The schema with each link's template met into its target as `roots`
hold it, and `miss` for each link whose target they don't hold: each
link that lands at a position of the schema's own tree
(`Val.landedLinks`), read there, and each a body writes
(`Val.refers`), read in the body's normal form at the body's own place,
`%` and the name as a key at the top, as both ports read a body where
it's declared, used or not. -/
def Decls.referPass (ds : Decls) (S : Val) (roots : List Val) (miss : Val) : Val :=
  ds.foldl (fun acc d => (d.2.refers []).foldl
      (referStep roots miss [.key ("%" ++ d.1)] (normaliseD ds (ds.readU d.2))) acc)
    ((S.landedLinks ((ds.rootsS S).getLast?.getD .any)).foldl
      (referStep roots miss [] ((ds.rootsS S).getLast?.getD .any)) S)

/-- The flows a document's links make, one for each address they hold:
the schema's and its bodies', each read as `Decls.referPass` reads it. -/
def Decls.referCount (ds : Decls) (S : Val) : ℕ :=
  ds.foldl (fun n d => n + ((d.2.refers []).map fun e =>
      (linkAddrs (normaliseD ds (ds.readU d.2)) e).length).sum)
    ((S.landedLinks ((ds.rootsS S).getLast?.getD .any)).map fun e =>
      (linkAddrs ((ds.rootsS S).getLast?.getD .any) e).length).sum

/-- The schema after `n` passes, each meeting the templates of the links
whose targets the roots of the last pass's schema hold, so that one
link's template can make another link's target. -/
def Decls.referPasses (ds : Decls) (S : Val) : ℕ → Val
  | 0 => S
  | n + 1 => ds.referPass S (ds.rootsS (ds.referPasses S n)) .any

/-- The schema with each link's template met into its target, so that
the template flows into the target and a link to nothing is an error:
read in the roots of the schema after as many passes as the links make
flows, so that links whose templates make each other's targets resolve
in any order, a link whose target is still missing meeting `nil`. -/
def Decls.withRefers (ds : Decls) (S : Val) : Val :=
  ds.referPass S (ds.rootsS (ds.referPasses S (ds.referCount S))) .nil

/-- A document's declarations with the relation kind declared under its
name, which a `rel` reads as (`relKind`). -/
def Decls.withRel (ds : Decls) : Decls := ds ++ [(relName, relKind)]

/-- A document as the definition reads it: the relation kind declared
(`Decls.withRel`), its relative paths placed (`Decls.placed`), the
sources its moves read hidden (`Decls.withMoves`), and its links'
templates met into their targets (`Decls.withRefers`). -/
def Decls.prepared (ds : Decls) (S : Val) : Decls × Val :=
  ((ds.withRel.placed S).1,
    (ds.withRel.placed S).1.withRefers ((ds.withRel.placed S).1.withMoves (ds.withRel.placed S).2))

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

theorem referSrc_checkableA {pos : List Seg} {f : Fn} {args : List Val}
    (h : ∀ a, a ∈ args → a.CheckableA) : ∀ e, e ∈ referSrc pos f args → e.2.1.CheckableA := by
  intro e he
  unfold referSrc at he
  split at he
  · simp only [List.mem_singleton] at he
    rw [he]; exact .any
  · simp only [List.mem_singleton] at he
    rw [he]; exact h _ (by simp)
  · simp only [List.mem_singleton] at he
    rw [he]; exact .any
  · simp only [List.mem_singleton] at he
    rw [he]; exact h _ (by simp)
  · exact absurd he (by simp)

theorem mem_refersFields {pos : List Seg} : ∀ {fs : List (String × Bool × Val)} {e : List Seg × Val × Bool},
    e ∈ refersFields pos fs → ∃ k o v, (k, o, v) ∈ fs ∧ e ∈ v.refers (pos ++ [.key k])
  | [], _, h => nomatch h
  | (k, o, v) :: fs, e, h => by
    simp only [refersFields, List.mem_append] at h
    rcases h with h | h
    · exact ⟨k, o, v, List.mem_cons_self, h⟩
    · obtain ⟨k', o', v', hm, h'⟩ := mem_refersFields h
      exact ⟨k', o', v', List.mem_cons_of_mem _ hm, h'⟩

theorem mem_refersElems {pos : List Seg} : ∀ {i : ℕ} {vs : List Val} {e : List Seg × Val × Bool},
    e ∈ refersElems pos i vs → ∃ j v, v ∈ vs ∧ e ∈ v.refers (pos ++ [.idx j])
  | _, [], _, h => nomatch h
  | i, v :: vs, e, h => by
    simp only [refersElems, List.mem_append] at h
    rcases h with h | h
    · exact ⟨i, v, List.mem_cons_self, h⟩
    · obtain ⟨j, w, hm, h'⟩ := mem_refersElems h
      exact ⟨j, w, List.mem_cons_of_mem _ hm, h'⟩

/-- Each link's template in a term the checker can read is one it can
read. -/
theorem refers_checkableA {v : Val} (h : v.CheckableA) :
    ∀ pos, ∀ e, e ∈ v.refers pos → e.2.1.CheckableA := by
  induction h
  case map fs spread closed hf hs ihf ihs =>
    intro pos e he
    simp only [Val.refers] at he
    obtain ⟨k, o, w, hw, he'⟩ := mem_refersFields he
    exact ihf k o w hw _ e he'
  case list items spread closed hi hs ihi ihs =>
    intro pos e he
    simp only [Val.refers] at he
    obtain ⟨j, w, hw, he'⟩ := mem_refersElems he
    exact ihi w hw _ e he'
  case meet a b ha hb iha ihb =>
    intro pos e he
    simp only [Val.refers, List.mem_append] at he
    rcases he with he | he
    · exact iha pos e he
    · exact ihb pos e he
  case ride k w r hw ih =>
    intro pos e he
    simp only [Val.refers] at he
    exact ih pos e he
  case call f args hargs ih =>
    intro pos e he
    simp only [Val.refers] at he
    exact referSrc_checkableA hargs e he
  all_goals
    intro pos e he
    simp only [Val.refers, List.not_mem_nil] at he

/-- What meets a template the checker can read into a target is a term
it can read. -/
theorem putW_checkableA {t : Val} (ht : t.CheckableA) :
    ∀ (p : List Seg) {v u : Val}, v.putW p t = some u → u.CheckableA
  | [], v, u, h => by
    simp only [Val.putW, Option.some.injEq] at h
    exact h ▸ ht
  | s :: p, v, u, h => by
    simp only [Val.putW] at h
    split at h
    · split at h
      · rename_i k _ w _
        cases hw : w.putW p t with
        | none => rw [hw] at h; exact absurd h (by simp)
        | some u' =>
          rw [hw] at h
          simp only [Option.map_some, Option.some.injEq] at h
          rw [← h]
          refine .map (fun k' o v' hv => ?_) (fun _ hs => nomatch hs)
          simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hv
          rw [hv.2.2]
          exact putW_checkableA ht p hw
      · exact absurd h (by simp)
    · split at h
      · split at h
        · rename_i i _ items _ _ w _
          cases hw : w.putW p t with
          | none => rw [hw] at h; exact absurd h (by simp)
          | some u' =>
            rw [hw] at h
            simp only [Option.map_some, Option.some.injEq] at h
            rw [← h]
            refine .list (fun x hx => ?_) (fun _ hs => nomatch hs)
            simp only [List.mem_map] at hx
            obtain ⟨e, -, rfl⟩ := hx
            split
            · exact putW_checkableA ht p hw
            · exact .any
        · exact absurd h (by simp)
      · exact absurd h (by simp)
    · exact absurd h (by simp)
termination_by p => p

theorem stepItems_checkableA {t : Val} (ht : t.CheckableA) {s : Seg} {p : List Seg} :
    ∀ j, j ∈ t.stepItems s p → j.1.CheckableA := by
  intro j hj
  cases ht
  case map fs spread closed hf hs =>
    unfold Val.stepItems at hj
    rw [List.mem_append] at hj
    rcases hj with hj | hj
    · split at hj
      · simp only [List.mem_map, List.mem_filter] at hj
        obtain ⟨⟨k', o', v'⟩, ⟨hm, -⟩, rfl⟩ := hj
        exact hf k' o' v' hm
      · simp at hj
    · simp only [List.mem_map, Option.mem_toList] at hj
      obtain ⟨sp, hsp, rfl⟩ := hj
      exact hs sp hsp
  case list items spread closed hi hs =>
    unfold Val.stepItems at hj
    rw [List.mem_append] at hj
    rcases hj with hj | hj
    · split at hj
      · simp only [List.mem_map, Option.mem_toList] at hj
        obtain ⟨w, hw, rfl⟩ := hj
        exact hi w (List.mem_of_getElem? hw)
      · simp at hj
    · simp only [List.mem_map, Option.mem_toList] at hj
      obtain ⟨sp, hsp, rfl⟩ := hj
      exact hs sp hsp
  case call f args hargs =>
    unfold Val.stepItems at hj
    split at hj
    next _ _ _ _ heq => cases heq
    next _ _ _ _ heq => cases heq
    next _ _ tmpl heq =>
      injection heq with _ ha
      subst ha
      simp only [List.mem_singleton] at hj
      rw [hj]; exact hargs tmpl (by simp)
    next _ _ tmpl heq =>
      injection heq with _ ha
      subst ha
      simp only [List.mem_singleton] at hj
      rw [hj]; exact hargs tmpl (by simp)
    next => simp at hj
  all_goals simp [Val.stepItems] at hj

theorem landLeaf_checkableA {t : Val} (ht : t.CheckableA) :
    ∀ (p : List Seg), (∀ u, u ∈ (landLeaf t p).1 → u.CheckableA) ∧
      (∀ j, j ∈ (landLeaf t p).2 → j.1.CheckableA)
  | [] => ⟨fun u hu => by simp only [landLeaf, List.mem_singleton] at hu; exact hu ▸ ht,
      fun _ h => by simp [landLeaf] at h⟩
  | _ :: _ => ⟨fun _ h => by simp [landLeaf] at h, stepItems_checkableA ht⟩

theorem landStep_checkableA {S : Val} (hS : S.CheckableA) {i : Val × List Seg}
    (hi : i.1.CheckableA) :
    (∀ u, u ∈ (landStep S i).1 → u.CheckableA) ∧ (∀ j, j ∈ (landStep S i).2 → j.1.CheckableA) := by
  unfold landStep
  split
  next a b heq =>
    rw [heq] at hi
    cases hi with
    | meet ha hb =>
      refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
      simp only [List.mem_cons, List.mem_nil_iff, or_false] at hj
      rcases hj with rfl | rfl
      · exact ha
      · exact hb
  next k v r heq =>
    rw [heq] at hi
    cases hi with
    | ride hv =>
      refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
      simp only [List.mem_singleton] at hj
      rw [hj]; exact hv
  next =>
    refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
    simp only [List.mem_singleton] at hj
    rw [hj]; exact hS
  next => exact landLeaf_checkableA hi i.2

/-- What the schema writes at a path, where the schema is a term the
checker can read, is too. -/
theorem landing_checkableA {S : Val} (hS : S.CheckableA) :
    ∀ (n : ℕ) (items : List (Val × List Seg)), (∀ i, i ∈ items → i.1.CheckableA) →
      ∀ u, u ∈ landing S n items → u.CheckableA
  | 0, _, _, _, h => by simp [landing] at h
  | _ + 1, [], _, _, h => by simp [landing] at h
  | n + 1, i :: rest, hi, u, h => by
    have hs := landStep_checkableA hS (hi i List.mem_cons_self)
    simp only [landing, List.mem_append] at h
    rcases h with h | h
    · exact hs.1 u h
    · refine landing_checkableA hS n _ (fun j hj => ?_) u h
      rw [List.mem_append] at hj
      rcases hj with hj | hj
      · exact hs.2 j hj
      · exact hi j (List.mem_cons_of_mem _ hj)

theorem callLinks_checkableA {pos : List Seg} {t : Val} (ht : t.CheckableA) :
    ∀ e, e ∈ callLinks pos t → e.2.1.CheckableA := by
  intro e he
  cases ht
  case call f args hargs => exact referSrc_checkableA hargs e he
  all_goals simp [callLinks] at he

/-- Each link that lands in a schema the checker can read has a
template it can read. -/
theorem landedLinks_checkableA {S root : Val} (hS : S.CheckableA) :
    ∀ e, e ∈ S.landedLinks root → e.2.1.CheckableA := by
  intro e he
  simp only [Val.landedLinks, Val.linksAt, List.mem_flatMap] at he
  obtain ⟨pos, -, t, ht, he⟩ := he
  exact callLinks_checkableA (landing_checkableA hS _ _ (fun i hi => by
    simp only [List.mem_singleton] at hi; rw [hi]; exact hS) t ht) e he

theorem referFlow_checkableA {roots : List Val} {miss acc t : Val} {pos : List Seg} {a : Addr}
    (hm : miss.CheckableA) (hacc : acc.CheckableA) (ht : t.CheckableA) :
    (referFlow roots miss pos t acc a).CheckableA := by
  unfold referFlow
  split
  next u hu =>
    cases hq : a.from pos with
    | none => rw [hq] at hu; exact absurd hu (by simp)
    | some p =>
      rw [hq] at hu
      simp only [Option.bind_some] at hu
      obtain ⟨root, -, hr⟩ := List.exists_of_findSome?_eq_some hu
      exact .meet hacc (putW_checkableA ht p hr)
  next => exact .meet hacc hm

theorem foldl_referFlow_checkableA {roots : List Val} {miss t : Val} {pos : List Seg}
    (hm : miss.CheckableA) (ht : t.CheckableA) :
    ∀ (as : List Addr) {acc : Val}, acc.CheckableA →
      (as.foldl (referFlow roots miss pos t) acc).CheckableA
  | [], _, h => h
  | _ :: as, _, h => foldl_referFlow_checkableA hm ht as (referFlow_checkableA hm h ht)

theorem referStep_checkableA {roots : List Val} {miss acc src : Val} {home : List Seg}
    {e : List Seg × Val × Bool} (hm : miss.CheckableA) (hacc : acc.CheckableA)
    (he : e.2.1.CheckableA) : (referStep roots miss home src acc e).CheckableA :=
  foldl_referFlow_checkableA hm he.unmark _ hacc

theorem foldl_referStep_checkableA {roots : List Val} {miss src : Val} {home : List Seg}
    (hm : miss.CheckableA) :
    ∀ (es : List (List Seg × Val × Bool)) {acc : Val}, acc.CheckableA → (∀ e, e ∈ es → e.2.1.CheckableA) →
      (es.foldl (referStep roots miss home src) acc).CheckableA
  | [], _, h, _ => h
  | e :: es, _, h, he =>
    foldl_referStep_checkableA hm es (referStep_checkableA hm h (he e List.mem_cons_self))
      fun e' h' => he e' (List.mem_cons_of_mem _ h')

theorem foldl_bodyRefers_checkableA {ds : Decls} {roots : List Val} {miss : Val}
    (hm : miss.CheckableA) :
    ∀ (bs : Decls) {acc : Val}, acc.CheckableA → (∀ d, d ∈ bs → d.2.CheckableA) →
      (bs.foldl (fun acc d => (d.2.refers []).foldl
        (referStep roots miss [.key ("%" ++ d.1)] (normaliseD ds (ds.readU d.2))) acc) acc).CheckableA
  | [], _, h, _ => h
  | d :: bs, _, h, hd =>
    foldl_bodyRefers_checkableA hm bs
      (foldl_referStep_checkableA hm _ h (refers_checkableA (hd d List.mem_cons_self) []))
      fun d' h' => hd d' (List.mem_cons_of_mem _ h')

/-- A schema the checker can read, under bodies it can read, reads with
the templates of the links a pass finds targets for met into them,
whatever roots the pass reads. -/
theorem referPass_checkableA {ds : Decls} {S miss : Val} {roots : List Val}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) (hm : miss.CheckableA) :
    (ds.referPass S roots miss).CheckableA :=
  foldl_bodyRefers_checkableA hm ds (foldl_referStep_checkableA hm _ hS (landedLinks_checkableA hS)) hb

/-- A schema the checker can read, under bodies it can read, reads with
its links' templates met into their targets. -/
theorem withRefers_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : (ds.withRefers S).CheckableA :=
  referPass_checkableA hb hS .nil

theorem relKind_checkableA : relKind.CheckableA := by decide

/-- Declarations the checker can read can read with the relation kind
declared. -/
theorem Decls.withRel_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ d, d ∈ ds.withRel → d.2.CheckableA := by
  intro d hd
  simp only [Decls.withRel, List.mem_append, List.mem_singleton] at hd
  rcases hd with hd | rfl
  · exact hb d hd
  · exact relKind_checkableA

/-- The verdict of a document with paths: the document prepared
(`Decls.prepared`), the relation kind declared, its relative paths
placed, the sources its moves read hidden and its links' templates met
into their targets, the verdict of the document whose paths are
absolute. -/
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

theorem Decls.pathIn_checkableA {ds : Decls} {roots : List Val} {w : Val} {p : List Seg}
    (hr : ∀ root, root ∈ roots → root.CheckableA) (h : ds.pathIn roots p = some w) : w.CheckableA := by
  obtain ⟨root, hm, hw⟩ := List.exists_of_findSome?_eq_some h
  exact Decls.pathAt_checkableA (hr root hm) hw

theorem Decls.ofPaths_checkableA {ds : Decls} {roots : List Val} (hr : ∀ root, root ∈ roots → root.CheckableA)
    (ps : List (List Seg)) : ∀ d, d ∈ ds.ofPaths roots ps → d.2.CheckableA := by
  intro d hd
  simp only [Decls.ofPaths, List.mem_filterMap] at hd
  obtain ⟨p, -, hp⟩ := hd
  cases hw : ds.pathIn roots p with
  | none => rw [hw] at hp; exact absurd hp (by simp)
  | some w =>
    rw [hw] at hp
    simp only [Option.map_some, Option.some.injEq] at hp
    rw [← hp]
    exact pathsToAliases_checkableA (Decls.pathIn_checkableA hr hw)

theorem Decls.withPathsFrom_bodies_checkableA {ds : Decls} {S : Val} {roots : List Val}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hr : ∀ root, root ∈ roots → root.CheckableA) :
    ∀ d, d ∈ (ds.withPathsFrom S roots).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.withPathsFrom, List.mem_append, List.mem_map] at hd
  rcases hd with ⟨d', hd', rfl⟩ | hd
  · exact pathsToAliases_checkableA (hb d' hd')
  · exact Decls.ofPaths_checkableA hr _ d hd

/-- Every round's root is one the checker can read, where `r` reads a
document the checker can read to one. -/
theorem Decls.rounds_checkableA {r : Decls → Val → Val}
    (hr : ∀ {d : Decls} {T : Val}, (∀ x, x ∈ d → x.2.CheckableA) → T.CheckableA → (r d T).CheckableA)
    {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    ∀ n, ∀ root, root ∈ ds.rounds S r n → root.CheckableA
  | 0, root, h => by
    simp only [Decls.rounds, List.mem_singleton] at h
    rw [h]
    exact hr hb hS
  | n + 1, root, h => by
    simp only [Decls.rounds, List.mem_append, List.mem_singleton] at h
    rcases h with h | h
    · exact Decls.rounds_checkableA hr hb hS n root h
    · rw [h]
      exact hr (Decls.withPathsFrom_bodies_checkableA hb (Decls.rounds_checkableA hr hb hS n))
        (pathsToAliases_checkableA hS)

theorem Decls.rootsS_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : ∀ root, root ∈ ds.rootsS S → root.CheckableA :=
  Decls.rounds_checkableA (fun hd hT => normaliseD_checkableA hd (readU_checkableA hd hT)) hb hS _

theorem Decls.rootsD_checkableA {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : ∀ root, root ∈ ds.rootsD S j → root.CheckableA :=
  Decls.rounds_checkableA
    (fun hd hT => normaliseD_checkableA hd (meetD_checkableA hd (readU_checkableA hd hT) (Data.term_checkableA j)))
    hb hS _

/-- `vetA` computes `VetA` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetA_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetA m ds S j = v ↔ VetA m ds S j v := by
  have hbS := Decls.withPathsFrom_bodies_checkableA (S := S) hb (Decls.rootsS_checkableA hb hS)
  have hvS := vet_iff (m := m) (ds := (ds.withPathsS S).1) (S := (ds.withPathsS S).2) (j := j) hbS
    (readR_checkableA hbS (pathsToAliases_checkableA hS))
  have hbP := Decls.withPathsFrom_bodies_checkableA (S := S) hb (Decls.rootsD_checkableA (j := j) hb hS)
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
  vetA_iff (ds := (ds.withRel.placed S).1)
    (S := (ds.withRel.placed S).1.withRefers ((ds.withRel.placed S).1.withMoves (ds.withRel.placed S).2))
    (Decls.placed_bodies_checkableA (Decls.withRel_checkableA hb))
    (withRefers_checkableA (Decls.placed_bodies_checkableA (Decls.withRel_checkableA hb))
      (withMoves_checkableA (placed_checkableA hS []))) v

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
(`Decls.prepared`), the relation kind declared, its relative paths
placed, the sources its moves read hidden and its links' templates met
into their targets, what the document whose paths are absolute
generates. -/
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

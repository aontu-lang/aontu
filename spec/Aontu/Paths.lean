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
index, the riders around either read through, a name's own place as the
member `%` and the name of the one-member document a body is read in
(`ownDoc`), and through nothing else. -/
def Val.at : Val → List Seg → Option Val
  | v, [] => some v
  | v, .key k :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == k) with
      | some f => f.2.2.at p
      | none => none
    | _ => none
  | v, .own n :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == "%" ++ n) with
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
  | _, .node :: _ => none
  | _, .lands _ :: _ => none
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
  | .var _, _ | .up _, _ | .node, _ => none
  | s, .map _ _ _ => some (.key s.text)
  | .idx i, .list _ _ _ => some (.idx i)
  | .key k, .list _ _ _ => (indexOf? k).map .idx
  | _, _ => none

/-- A term with the riders around it read through, and a disjunction
left with one arm read as that arm, as a meet that leaves one arm
leaves that arm's value. -/
def Val.oneArm : Val → Val
  | .or [(_, a)] => a.oneArm
  | .ride _ v _ => v.oneArm
  | .link v _ => v.oneArm
  | v => v

/-- The term at a written path in a term: each step read as text, by
the container it meets (`Seg.stepIn`), through a disjunction left with
one arm (`Val.oneArm`). -/
def Val.atW : Val → List Seg → Option Val
  | v, [] => some v
  | v, s :: p =>
    match s.stepIn v.oneArm with
    | some t =>
      match v.oneArm.at [t] with
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
    | .up n => "^" ++ toString n
    | .node => "_"
    | .own n => "%" ++ toString n.length ++ ":" ++ n
    | .lands n => "<" ++ toString n)

/-- Whether a path starts at a link's target (`Seg.lands`): a relative
path in a link's template, placed where the template lands (ruling 50),
which names a place only once its link's target is read. -/
def landsPath : List Seg → Bool
  | .lands _ :: _ => true
  | _ => false

mutual
/-- The term with each path replaced by a reference to the path's name,
but a reference into an `emit`'s node (`Seg.node`), which names no
place, and which the `emit` reads for each node, and a path in a link's
template that starts at the link's target (`landsPath`), which the
template reads once it lands there (`Val.atTarget`). A `move` keeps the
name of the path it reads, a rider around the reference
(`Rider.move`), so that the value the call makes carries it into the
normal form (`Val.moves`). -/
def Val.pathsToAliases : Val → Val
  | .path p => if p.head? == some .node || landsPath p then .path p else .alias (pathName p)
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
  | .call f args => .call f (ptaCall f args)
  | .ride k v r => .ride k v.pathsToAliases r
  | .link v lt => .link v.pathsToAliases lt
  | v => v

def ptaCall : Fn → List Val → List Val
  | .move, [v] =>
    match v.unride with
    | .path p => [.ride (.move (pathName p)) v.pathsToAliases []]
    | _ => [v.pathsToAliases]
  | _, [] => []
  | _, v :: vs => v.pathsToAliases :: ptaItems vs

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

/-- The place a spread that is the relative path of `n` dots and `p`
names from the members of a map or list at `pos`: one step below it,
the same place for every member, since the path's first dot leaves the
member's own step behind. A path that climbs past the top stays as
written, and resolves nowhere. -/
def bareTo (pos : List Seg) (n : ℕ) (p : List Seg) : List Seg :=
  match pos with
  | .lands c :: rest =>
    if 0 < n then
      if n ≤ rest.length + 1 then .lands c :: rest.take (rest.length + 1 - n) ++ p
      else .lands (c + (n - (rest.length + 1))) :: p
    else .up n :: p
  | _ => if 0 < n ∧ n ≤ pos.length + 1 then pos.take (pos.length + 1 - n) ++ p else .up n :: p

/-- The written path `n` dots and `p` name from a term at `pos`: `n`
steps up from `pos`, then `p`, none where that climbs past the top; and
from a place in a link's template, which stands at the link's target
(`Seg.lands`), the place it names from there, as many steps above the
target as it climbs past the template. -/
def climb (pos : List Seg) (n : ℕ) (p : List Seg) : Option (List Seg) :=
  match pos with
  | .lands c :: rest =>
    if n ≤ rest.length then some (.lands c :: rest.take (rest.length - n) ++ p)
    else some (.lands (c + (n - rest.length)) :: p)
  | _ => if n ≤ pos.length then some (pos.take (pos.length - n) ++ p) else none

/-- A spread that is a relative path, placed where its members stand
(`bareTo`). Any other spread stays as written, to be read at each member
(`Decls.membersRead`). -/
def plBare (pos : List Seg) : Option Val → Option Val
  | some (.path (.up n :: p)) => some (.path (bareTo pos n p))
  | s => s

mutual
/-- The term standing at `pos`, each relative path it writes made
absolute where it stands, its dots climbing as many steps: a map's
member stands one key below the map and a list's element one index
below, as `resolveD` places a key. A path that climbs past the top stays
as written, and resolves nowhere. A spread that is a path stands where
its members do (`plBare`). A `filter`'s condition stands where the
member it tries lands, one step below the filter, a step no written
path names (`.up 0`): a path that climbs out of the member names the
same place for every member, and one that stays inside it keeps the
step and names nothing, as both ports read it. A link's template
stands where it lands, at the link's target (`Seg.lands`, ruling 50).
Any other spread and a template keep theirs as written, since each
stands at a position the written document doesn't name. -/
def Val.placed (pos : List Seg) : Val → Val
  | .path (.up n :: p) =>
    match climb pos n p with
    | some q => .path q
    | none => .path (.up n :: p)
  | .len c => .len (c.placed pos)
  | .map fs spread closed => .map (plFields pos fs) (plBare pos spread) closed
  | .list items spread closed => .list (plElems pos 0 items) (plBare pos spread) closed
  | .or arms => .or (plArms pos arms)
  | .pref r x => .pref r (x.placed pos)
  | .meet a b => .meet (a.placed pos) (b.placed pos)
  | .nof n cs => .nof (n.placed pos) (plItems pos cs)
  | .must c m => .must (c.placed pos) m
  | .when c t e => .when (c.placed pos) (t.placed pos) (plSpread pos e)
  | .contains c n => .contains (c.placed pos) (n.placed pos)
  | .rest t cs => .rest (t.placed pos) (plCovers pos cs)
  | .select s arms d => .select (s.placed pos) (plPairs pos arms) (plSpread pos d)
  | .filter s c => .filter (s.placed pos) (c.placed (pos ++ [.up 0]))
  | .call f args => .call f (plArgs pos f args)
  | .ride k v r => .ride k (v.placed pos) r
  | .link v lt => .link (v.placed pos) lt
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
as written, and a link's template, placed where it lands, at its link's
target (`Seg.lands`), wherever the link stands (ruling 50). -/
def plArgs (pos : List Seg) (f : Fn) : List Val → List Val
  | [] => []
  | v :: vs => v.placed (if f = .refer ∨ f = .rel then [.lands 0] else pos) ::
      (if f = .each ∨ f = .pack then vs else plArgs pos f vs)

def plSpread (pos : List Seg) : Option Val → Option Val
  | none => none
  | some s => some (s.placed pos)

def plArms (pos : List Seg) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.placed pos) :: plArms pos as
end

mutual
/-- The schema's term at `pos`, placed as `Val.placed` places it, but a
spread that is a relative path on a map or a list reached through maps
by key, lists by index, meets and riders, where `Decls.membersRead` reads
one: it stays as written, to be read at each member wherever its map or
list lands, a path reference's copy included, as both ports read it. -/
def Val.placedT (pos : List Seg) : Val → Val
  | .map fs spread closed => .map (ptdFields pos fs) spread closed
  | .list items spread closed => .list (ptdElems pos 0 items) spread closed
  | .meet a b => .meet (a.placedT pos) (b.placedT pos)
  | .ride k v r => .ride k (v.placedT pos) r
  | .link v lt => .link (v.placedT pos) lt
  | v => v.placed pos

def ptdFields (pos : List Seg) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.placedT (pos ++ [.key k])) :: ptdFields pos fs

def ptdElems (pos : List Seg) : ℕ → List Val → List Val
  | _, [] => []
  | i, v :: vs => v.placedT (pos ++ [.idx i]) :: ptdElems pos (i + 1) vs
end

/-- Whether a path is relative: its first step climbs from where it's
written. -/
def relPath : List Seg → Bool
  | .up _ :: _ => true
  | _ => false

/-- Whether a term holds a relative path, at any depth. -/
def Val.holdsRel (v : Val) : Bool := v.paths.any relPath

/-- The written path a path standing at `pos` names: a relative one made
absolute as `Val.placed` makes it, any other as written. -/
def absPath (pos : List Seg) : List Seg → List Seg
  | .up n :: p => if n ≤ pos.length then pos.take (pos.length - n) ++ p else .up n :: p
  | p => p

/-! ## A copy reads its relative paths where it stands

Ruling 26 of the design note's §7: a copy is a destination. A use of a
name whose body writes a relative path reads a copy of the body placed
where the use stands, declared under a name of its own (`useName`), and
the body still reads at its own place too, where it must stand. -/

/-- The name a copy of a body at a position is declared under: the
name, `@` and the position's name (`pathName`), which no document can
write, since a name a document writes holds no `@`. -/
def useName (n : String) (pos : List Seg) : String := n ++ "@" ++ pathName pos

/-- What a use stands for: a name, or the place a path reference names. -/
inductive Use where
  | name (n : String)
  | place (p : List Seg)
  deriving DecidableEq

/-- The key a use is copied under: a name's own, and for a path
reference, `^` and the path's name (`pathName`), which no name a
document writes begins with. -/
def Use.key : Use → String
  | .name n => n
  | .place p => "^" ++ pathName p

/-- A use read as written: the name, or the path to the place. -/
def Use.plain : Use → Val
  | .name n => .alias n
  | .place p => .path p

/-- A path reference to `p` standing at `pos`, read as the copy of what
the document writes at `p` (`useName`), met with `d` where it's given:
the data at `p` (`dataLit`). -/
def refUse (p pos : List Seg) : Option Val → Val
  | some d => .meet (.alias (useName (Use.place p).key pos)) d
  | none => .alias (useName (Use.place p).key pos)

mutual
/-- The term standing at `pos` with each use of a name of `rs` read as
the copy of the name's body at the use (`useName`), and each path
reference to a place `rt` holds, one whose terms read their own place
(`Decls.relTarget`), as the copy of what the document writes there
(`refUse`), met with what `dl` reads at the place, at the positions
`Val.placed` places a relative path: not in a generator's template or a
spread, which are read at each member, not the path a `move` reads,
which names its source, and not a reference that stands inside its own
place, a recursion, which reads as it's written. -/
def Val.atUses (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) :
    Val → Val
  | .alias n => if rs.contains n then .alias (useName n pos) else .alias n
  | .path q =>
    if rt (absPath pos q) && !(absPath pos q).isPrefixOf pos then refUse (absPath pos q) pos (dl (absPath pos q))
    else .path q
  | .len c => .len (c.atUses rs rt dl pos)
  | .map fs spread closed => .map (auFields rs rt dl pos fs) spread closed
  | .list items spread closed => .list (auElems rs rt dl pos 0 items) spread closed
  | .or arms => .or (auArms rs rt dl pos arms)
  | .pref r x => .pref r (x.atUses rs rt dl pos)
  | .meet a b => .meet (a.atUses rs rt dl pos) (b.atUses rs rt dl pos)
  | .nof n cs => .nof (n.atUses rs rt dl pos) (auItems rs rt dl pos cs)
  | .must c m => .must (c.atUses rs rt dl pos) m
  | .when c t e => .when (c.atUses rs rt dl pos) (t.atUses rs rt dl pos) (auSpread rs rt dl pos e)
  | .contains c n => .contains (c.atUses rs rt dl pos) (n.atUses rs rt dl pos)
  | .rest t cs => .rest (t.atUses rs rt dl pos) (auCovers rs rt dl pos cs)
  | .select s arms d => .select (s.atUses rs rt dl pos) (auPairs rs rt dl pos arms) (auSpread rs rt dl pos d)
  | .filter s c => .filter (s.atUses rs rt dl pos) (c.atUses rs rt dl (pos ++ [.up 0]))
  | .call f args => .call f (auArgs rs (if f = .move then fun _ => false else rt) dl pos f args)
  | .ride k v r => .ride k (v.atUses rs rt dl pos) r
  | .link v lt => .link (v.atUses rs rt dl pos) lt
  | v => v

def auPairs (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.atUses rs rt dl pos, r.atUses rs rt dl pos) :: auPairs rs rt dl pos ps

def auCovers (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (auSpread rs rt dl pos c, auSpread rs rt dl pos k, auSpread rs rt dl pos m) :: auCovers rs rt dl pos cs

def auFields (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.atUses rs rt dl (pos ++ [.key k])) :: auFields rs rt dl pos fs

def auElems (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : ℕ → List Val → List Val
  | _, [] => []
  | i, v :: vs => v.atUses rs rt dl (pos ++ [.idx i]) :: auElems rs rt dl pos (i + 1) vs

def auItems (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : List Val → List Val
  | [] => []
  | v :: vs => v.atUses rs rt dl pos :: auItems rs rt dl pos vs

def auArgs (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) (f : Fn) : List Val → List Val
  | [] => []
  | v :: vs => v.atUses rs rt dl pos :: (if f = .each ∨ f = .pack then vs else auArgs rs rt dl pos f vs)

def auSpread (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : Option Val → Option Val
  | none => none
  | some s => some (s.atUses rs rt dl pos)

def auArms (rs : List String) (rt : List Seg → Bool) (dl : List Seg → Option Val) (pos : List Seg) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.atUses rs rt dl pos) :: auArms rs rt dl pos as
end

mutual
/-- Each use a term standing at `pos` holds, a name of `rs` or a path
reference to a place `rt` holds, with the position it stands at, where
`Val.atUses` reads one. -/
def Val.usesAt (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : Val → List (Use × List Seg)
  | .alias n => if rs.contains n then [(.name n, pos)] else []
  | .path q => if rt (absPath pos q) && !(absPath pos q).isPrefixOf pos then [(.place (absPath pos q), pos)] else []
  | .len c => c.usesAt rs rt pos
  | .map fs _ _ => usFields rs rt pos fs
  | .list items _ _ => usElems rs rt pos 0 items
  | .or arms => usArms rs rt pos arms
  | .pref _ x => x.usesAt rs rt pos
  | .meet a b => a.usesAt rs rt pos ++ b.usesAt rs rt pos
  | .nof n cs => n.usesAt rs rt pos ++ usItems rs rt pos cs
  | .must c _ => c.usesAt rs rt pos
  | .when c t e => c.usesAt rs rt pos ++ t.usesAt rs rt pos ++ usSpread rs rt pos e
  | .contains c n => c.usesAt rs rt pos ++ n.usesAt rs rt pos
  | .rest t cs => t.usesAt rs rt pos ++ usCovers rs rt pos cs
  | .select s arms d => s.usesAt rs rt pos ++ usPairs rs rt pos arms ++ usSpread rs rt pos d
  | .filter s c => s.usesAt rs rt pos ++ c.usesAt rs rt (pos ++ [.up 0])
  | .call f args => usArgs rs (if f = .move then fun _ => false else rt) pos f args
  | .ride _ v _ => v.usesAt rs rt pos
  | .link v _ => v.usesAt rs rt pos
  | _ => []

def usPairs (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : List (Val × Val) → List (Use × List Seg)
  | [] => []
  | (p, r) :: ps => p.usesAt rs rt pos ++ r.usesAt rs rt pos ++ usPairs rs rt pos ps

def usCovers (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : List Cover → List (Use × List Seg)
  | [] => []
  | (c, k, m) :: cs => usSpread rs rt pos c ++ usSpread rs rt pos k ++ usSpread rs rt pos m ++ usCovers rs rt pos cs

def usFields (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : List (String × Bool × Val) → List (Use × List Seg)
  | [] => []
  | (k, _, v) :: fs => v.usesAt rs rt (pos ++ [.key k]) ++ usFields rs rt pos fs

def usElems (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : ℕ → List Val → List (Use × List Seg)
  | _, [] => []
  | i, v :: vs => v.usesAt rs rt (pos ++ [.idx i]) ++ usElems rs rt pos (i + 1) vs

def usItems (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : List Val → List (Use × List Seg)
  | [] => []
  | v :: vs => v.usesAt rs rt pos ++ usItems rs rt pos vs

def usArgs (rs : List String) (rt : List Seg → Bool) (pos : List Seg) (f : Fn) : List Val → List (Use × List Seg)
  | [] => []
  | v :: vs => v.usesAt rs rt pos ++ (if f = .each ∨ f = .pack then [] else usArgs rs rt pos f vs)

def usSpread (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : Option Val → List (Use × List Seg)
  | none => []
  | some s => s.usesAt rs rt pos

def usArms (rs : List String) (rt : List Seg → Bool) (pos : List Seg) : List (ℕ × Val) → List (Use × List Seg)
  | [] => []
  | (_, a) :: as => a.usesAt rs rt pos ++ usArms rs rt pos as
end

/-- The place a spread that is a relative path names where its map or
list at `pos` is written (`bareTo`); none for any other spread. -/
def bareAt (pos : List Seg) : Option Val → List (List Seg)
  | some (.path (.up n :: p)) => [bareTo pos n p]
  | _ => []

mutual
/-- The places the spreads that are relative paths name where the schema
writes them, on the maps and lists `Val.placedT` leaves them on. -/
def Val.bares (pos : List Seg) : Val → List (List Seg)
  | .map fs spread _ => bareAt pos spread ++ baFields pos fs
  | .list items spread _ => bareAt pos spread ++ baElems pos 0 items
  | .meet a b => a.bares pos ++ b.bares pos
  | .ride _ v _ => v.bares pos
  | .link v _ => v.bares pos
  | _ => []

def baFields (pos : List Seg) : List (String × Bool × Val) → List (List Seg)
  | [] => []
  | (k, _, v) :: fs => v.bares (pos ++ [.key k]) ++ baFields pos fs

def baElems (pos : List Seg) : ℕ → List Val → List (List Seg)
  | _, [] => []
  | i, v :: vs => v.bares (pos ++ [.idx i]) ++ baElems pos (i + 1) vs
end

/-- The name the places of the schema's relative spreads are declared
under, which no document can write, since a name a document writes
begins with a letter. -/
def bareName : String := "&"

/-! ## Sources -/

/-- The extensions a source may be loaded with: aontu's own, the data
formats, each of which maps onto JSON, and text. -/
def loadExts : List String :=
  ["aontu", "json", "jsonld", "jsonc", "json5", "jsonic", "jsc", "toml", "yaml", "yml", "ini", "txt"]

/-- A file's steps as both ports read them, `acc` the steps so far, the
last first: a `.` and an empty step dropped, and a `..` taking back the
step before it, or kept where there's none to take. -/
def normSteps : List String → List String → List String
  | acc, [] => acc.reverse
  | acc, s :: ss =>
    if s == "." || s == "" then normSteps acc ss
    else if s == ".." then
      match acc with
      | t :: rest => if t == ".." then normSteps (s :: acc) ss else normSteps rest ss
      | [] => normSteps [s] ss
    else normSteps (s :: acc) ss

/-- Whether a load names a module: it's written bare, with no `./`,
`../` or `/` before it, and its first step holds a dot, a domain. -/
def moduleRef (p : String) : Bool :=
  !(p.startsWith "./" || p.startsWith "../" || p.startsWith "/") && ((p.splitOn "/").headD "").contains '.'

/-- The name a source written `p` in the source named `src` loads: read
from `src`'s own directory, or from the top where `p` begins with `/`,
as both ports read it, its steps read as `normSteps` reads them, and
`.aontu` supplied where the last step names no extension. None where
the last step names one no source may be loaded with, and none for a
module (`moduleRef`), which the definition doesn't read yet: both ports
refuse one whose last step names an extension, as a file written
without `./`. The document itself is the source named `""`. -/
def loadPath (src p : String) : Option String :=
  let q := "/".intercalate
    (normSteps [] ((if p.startsWith "/" then [] else (src.splitOn "/").dropLast) ++ p.splitOn "/"))
  if moduleRef p then none else
  match ((q.splitOn "/").getLast?.getD "").splitOn "." with
  | [_] => some (q ++ ".aontu")
  | parts => if parts.getLast?.getD "" ∈ loadExts then some q else none

/-- The term a document declares for the source it loads under a name:
`@` and the name, which no document can write, since a name a document
writes begins with a letter. A source is aontu's own term for a source
in the language, the term `Data.term` makes of data, or a string for
text. -/
def Decls.source? (ds : Decls) (q : String) : Option Val :=
  (ds.find? fun d => d.1 == "@" ++ q).map (·.2)

/-- The text a load's argument writes, where it's one string, and a
destructure's, `{ %b: %a } = @"p"`, which writes the names it takes
after it (`Decls.takeBinds`). -/
def loadArg? : List Val → Option String
  | .lit (.str p) :: _ => some p
  | _ => none

mutual
/-- The term with each `@"p"` it writes, at any depth, read as the term
`k` gives `p`, and left as written where `k` gives none. -/
def Val.mapLoads (k : String → Option Val) : Val → Val
  | .len c => .len (c.mapLoads k)
  | .map fs spread closed => .map (mlFields k fs) (mlSpread k spread) closed
  | .list items spread closed => .list (mlItems k items) (mlSpread k spread) closed
  | .or arms => .or (mlArms k arms)
  | .pref r x => .pref r (x.mapLoads k)
  | .meet a b => .meet (a.mapLoads k) (b.mapLoads k)
  | .nof n cs => .nof (n.mapLoads k) (mlItems k cs)
  | .must c m => .must (c.mapLoads k) m
  | .when c t e => .when (c.mapLoads k) (t.mapLoads k) (mlSpread k e)
  | .contains c n => .contains (c.mapLoads k) (n.mapLoads k)
  | .rest t cs => .rest (t.mapLoads k) (mlCovers k cs)
  | .select s arms d => .select (s.mapLoads k) (mlPairs k arms) (mlSpread k d)
  | .filter s c => .filter (s.mapLoads k) (c.mapLoads k)
  | .call f args =>
    match f, loadArg? args with
    | .load, some p => (k p).getD (.call f args)
    | _, _ => .call f (mlItems k args)
  | .ride rd v r => .ride rd (v.mapLoads k) r
  | .link v lt => .link (v.mapLoads k) lt
  | v => v

def mlPairs (k : String → Option Val) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.mapLoads k, r.mapLoads k) :: mlPairs k ps

def mlCovers (k : String → Option Val) : List Cover → List Cover
  | [] => []
  | (c, ky, m) :: cs => (mlSpread k c, mlSpread k ky, mlSpread k m) :: mlCovers k cs

def mlFields (k : String → Option Val) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (ky, o, v) :: fs => (ky, o, v.mapLoads k) :: mlFields k fs

def mlItems (k : String → Option Val) : List Val → List Val
  | [] => []
  | v :: vs => v.mapLoads k :: mlItems k vs

def mlSpread (k : String → Option Val) : Option Val → Option Val
  | none => none
  | some s => some (s.mapLoads k)

def mlArms (k : String → Option Val) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.mapLoads k) :: mlArms k as
end

/-- The name a declaration takes in the source named `q` that makes it:
`%`, the source's name, `%` and the declaration's own name, which no
document can write, since a name a document writes begins with a letter,
and which no other source shares, so that two sources that declare one
name hold two names. -/
def scopedName (q n : String) : String := "%" ++ q ++ "%" ++ n

/-- Whether a declaration's name is a source's own (`scopedName`) or one
it publishes (`exportName`). -/
def scopedDecl (n : String) : Bool := n.toList.head? == some '%' || n.toList.head? == some '!'

/-- The source a declaration's name scopes it to (`scopedName`,
`exportName`): the name from its second character to its last `%`,
since the declaration's own name holds none. None for a name no source
scopes. -/
def scopeOf (n : String) : Option String :=
  if scopedDecl n then some ("%".intercalate ((n.drop 1).splitOn "%").dropLast) else none

mutual
/-- A term written in the source named `q`, each alias it names read as
the source's own (`scopedName`), as both ports scope a name to the file
that declares it: the source reads its own declarations and none of the
document's, and the document none of the source's. A variable, `$` and
its name, is the calling program's and stays as it is. -/
def Val.scoped (q : String) : Val → Val
  | .alias n => if n.toList.head? == some '$' then .alias n else .alias (scopedName q n)
  | .len c => .len (c.scoped q)
  | .map fs spread closed => .map (scFields q fs) (scSpread q spread) closed
  | .list items spread closed => .list (scItems q items) (scSpread q spread) closed
  | .or arms => .or (scArms q arms)
  | .pref r x => .pref r (x.scoped q)
  | .meet a b => .meet (a.scoped q) (b.scoped q)
  | .nof n cs => .nof (n.scoped q) (scItems q cs)
  | .must c m => .must (c.scoped q) m
  | .when c t e => .when (c.scoped q) (t.scoped q) (scSpread q e)
  | .contains c n => .contains (c.scoped q) (n.scoped q)
  | .rest t cs => .rest (t.scoped q) (scCovers q cs)
  | .select s arms d => .select (s.scoped q) (scPairs q arms) (scSpread q d)
  | .filter s c => .filter (s.scoped q) (c.scoped q)
  | .call f args => .call f (scItems q args)
  | .ride rd v r => .ride rd (v.scoped q) r
  | .link v lt => .link (v.scoped q) lt
  | v => v

def scPairs (q : String) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.scoped q, r.scoped q) :: scPairs q ps

def scCovers (q : String) : List Cover → List Cover
  | [] => []
  | (c, ky, m) :: cs => (scSpread q c, scSpread q ky, scSpread q m) :: scCovers q cs

def scFields (q : String) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (ky, o, v) :: fs => (ky, o, v.scoped q) :: scFields q fs

def scItems (q : String) : List Val → List Val
  | [] => []
  | v :: vs => v.scoped q :: scItems q vs

def scSpread (q : String) : Option Val → Option Val
  | none => none
  | some s => some (s.scoped q)

def scArms (q : String) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.scoped q) :: scArms q as
end

/-- The name under which the source named `q` publishes a name it
declares: `!`, the source's name, `%` and the name, which no document
can write. -/
def exportName (q n : String) : String := "!" ++ q ++ "%" ++ n

/-- The declarations a source named `q` adds to a document that loads
it: its term under `@` and its name; each declaration it makes, `own`,
under its own name (`scopedName`), each read in the source's scope
(`Val.scoped`); and each name it publishes, `export({ %a })`, under the
name it publishes it by (`exportName`), naming its own. A name it
exports that it doesn't declare, one that arrived through a load among
them, it publishes as `nil`, which no destructure can take
(`Decls.takesLeft`), as both ports refuse to take it. -/
def Decls.ofSource (q : String) (own : Decls) (t : Val) (exports : List String := []) : Decls :=
  ("@" ++ q, t.scoped q) :: own.map (fun d => (scopedName q d.1, d.2.scoped q)) ++
    exports.map fun n => (exportName q n, if own.any (·.1 == n) then .alias (scopedName q n) else .nil)

/-- The names a destructure takes from the source named `q`, each the
document's name and the name the source publishes: `{ %b: %a }` takes
`a` as `b`, written as the two strings `b` and `a`, and `{ % }`, written
as `%`, takes each name the source publishes under its own. None for
names written any other way. -/
def Decls.takeNames (ds : Decls) (q : String) : List Val → Option (List (String × String))
  | [.lit (.str "%")] => some (ds.filterMap fun d =>
      if d.1.startsWith ("!" ++ q ++ "%") then some (d.1.drop (q.length + 2), d.1.drop (q.length + 2)) else none)
  | [] => some []
  | .lit (.str b) :: .lit (.str a) :: rest => (ds.takeNames q rest).map ((b, a) :: ·)
  | _ => none

mutual
/-- The destructures a document writes, each the text of its load and
the names it takes, wherever its values land while its names are the
document's: at the top, in a side of a meet, under a key, in a map's or
a list's spread, in an arm of a disjunction, under a preference or a
rider, and in a call's argument, as both ports bind them. A list's
element holds none, where the ports differ (#518). -/
def Val.takes : Val → List (String × List Val)
  | .call .load (.lit (.str p) :: names@(_ :: _)) => [(p, names)]
  | .call _ args => takesItems args
  | .meet a b => a.takes ++ b.takes
  | .map fs spread _ => takesFields fs ++ takesSpread spread
  | .list _ spread _ => takesSpread spread
  | .or arms => takesArms arms
  | .pref _ x => x.takes
  | .ride _ v _ => v.takes
  | .link v _ => v.takes
  | _ => []

def takesFields : List (String × Bool × Val) → List (String × List Val)
  | [] => []
  | (_, _, v) :: fs => v.takes ++ takesFields fs

def takesItems : List Val → List (String × List Val)
  | [] => []
  | v :: vs => v.takes ++ takesItems vs

def takesSpread : Option Val → List (String × List Val)
  | none => []
  | some s => s.takes

def takesArms : List (ℕ × Val) → List (String × List Val)
  | [] => []
  | (_, a) :: as => a.takes ++ takesArms as
end

/-- The names a document's destructures bind: each name a destructure
takes, under the document's name, naming what the source publishes
(`exportName`), so that it meets any declaration the document makes of
the same name. -/
def Decls.takeBinds (ds : Decls) (S : Val) : Decls :=
  S.takes.flatMap fun t => match loadPath "" t.1 with
    | none => []
    | some q => ((ds.takeNames q t.2).getD []).map fun n => (n.1, .alias (exportName q n.2))

/-- Whether a document's destructure asks for a name its source doesn't
publish, or publishes without declaring it (`nil`), which makes the
document an error whether or not anything reads the name, as both ports
refuse it: a wildcard, `{ % }`, asks for every name the source
publishes. -/
def Decls.takesLeft (ds : Decls) (S : Val) : Bool :=
  S.takes.any fun t => match loadPath "" t.1 with
    | none => true
    | some q => match ds.takeNames q t.2 with
      | none => true
      | some ns => ns.any fun n => match ds.find? (·.1 == exportName q n.2) with
        | some (_, .nil) => true
        | some _ => false
        | none => true

/-- A term written in the source named `src` with the sources it loads
read in, `n` deep, `seen` the sources it's being read into: each `@"p"`
read as the term the document declares for the source it names
(`loadPath`, `Decls.source?`), that term's own sources read in from
there. A source the document declares no term for, one no source may be
loaded with, and one `seen` holds, a cycle, stays as written: a load the
reading can't make, which makes the document an `error`. Each step of a
chain reads a source not yet seen, so a depth past the number of
sources reads every chain to its end. -/
def Decls.loadIn (ds : Decls) : ℕ → List String → String → Val → Val
  | 0, _, _, v => v
  | n + 1, seen, src, v => v.mapLoads fun p => (loadPath src p).bind fun q =>
    if q ∈ seen then none else (ds.source? q).map (ds.loadIn n (q :: seen) q)

/-- Whether a declaration's name is a source's: `@` and the name it's
loaded by. -/
def sourceName (n : String) : Bool := n.toList.head? == some '@'

/-- How many sources a document declares. -/
def Decls.sourceCount (ds : Decls) : ℕ := (ds.filter fun d => sourceName d.1).length

mutual
/-- The arguments of each load a term writes, at any depth. -/
def Val.loads : Val → List (List Val)
  | .call .load args => [args]
  | .call _ args => ldItems args
  | .len c => c.loads
  | .map fs spread _ => ldFields fs ++ ldSpread spread
  | .list items spread _ => ldItems items ++ ldSpread spread
  | .or arms => ldArms arms
  | .pref _ x => x.loads
  | .meet a b => a.loads ++ b.loads
  | .nof n cs => n.loads ++ ldItems cs
  | .must c _ => c.loads
  | .when c t e => c.loads ++ t.loads ++ ldSpread e
  | .contains c n => c.loads ++ n.loads
  | .rest t cs => t.loads ++ ldCovers cs
  | .select s arms d => s.loads ++ ldPairs arms ++ ldSpread d
  | .filter s c => s.loads ++ c.loads
  | .ride _ v _ => v.loads
  | .link v _ => v.loads
  | _ => []

def ldFields : List (String × Bool × Val) → List (List Val)
  | [] => []
  | (_, _, v) :: fs => v.loads ++ ldFields fs

def ldItems : List Val → List (List Val)
  | [] => []
  | v :: vs => v.loads ++ ldItems vs

def ldSpread : Option Val → List (List Val)
  | none => []
  | some s => s.loads

def ldArms : List (ℕ × Val) → List (List Val)
  | [] => []
  | (_, a) :: arms => a.loads ++ ldArms arms

def ldPairs : List (Val × Val) → List (List Val)
  | [] => []
  | (p, r) :: ps => p.loads ++ r.loads ++ ldPairs ps

def ldCovers : List Cover → List (List Val)
  | [] => []
  | (c, k, m) :: cs => ldSpread c ++ ldSpread k ++ ldSpread m ++ ldCovers cs
end

/-- The sources a term written in the source named `src` reads, `n`
deep, `seen` the sources it's being read into: each source it loads that
`Decls.loadIn` reads in, and those that source's term and the names it
declares read in turn. -/
def Decls.sourcesRead (ds : Decls) : ℕ → List String → String → Val → List String
  | 0, _, _, _ => []
  | n + 1, seen, src, v => v.loads.flatMap fun a => match (loadArg? a).bind (loadPath src) with
    | none => []
    | some q => if q ∈ seen then [] else match ds.source? q with
      | none => []
      | some t => q :: (t :: (ds.filter fun d => scopeOf d.1 == some q).map (·.2)).flatMap
          (ds.sourcesRead n (q :: seen) q)

/-- A document with the sources it loads read in where it loads them, as
both ports read a source in place: as deep as it declares sources, so
that a chain of loads reads to its end and a cycle never does. Its
schema and its own bodies read in from the document itself, each body a
source declares from that source, a load of the source itself a cycle,
and the sources no longer declared, so that a source nothing loads is
no part of the document, nor are the names it declares
(`Decls.sourcesRead`). -/
def Decls.loaded (ds : Decls) (S : Val) : Decls × Val :=
  let read := (S :: (ds.filter fun d => !sourceName d.1 && !scopedDecl d.1).map (·.2)).flatMap
    (ds.sourcesRead (ds.sourceCount + 1) [] "")
  ((ds.filter fun d => !sourceName d.1 && (scopeOf d.1).all read.contains).map (fun d =>
      (d.1, ds.loadIn (ds.sourceCount + 1) (scopeOf d.1).toList ((scopeOf d.1).getD "") d.2))
      ++ ds.takeBinds S,
    ds.loadIn (ds.sourceCount + 1) [] "" S)

/-- Whether a term holds a load, at any depth: once the sources are read
in, one the reading couldn't make. -/
def Val.holdsLoad (v : Val) : Bool := !v.loads.isEmpty

/-- Whether a document, its sources read in, still holds a load, in its
schema or in a body: one the reading couldn't make. -/
def Decls.loadsLeft (ds : Decls) (S : Val) : Bool :=
  (ds.loaded S).2.holdsLoad || ((ds.loaded S).1.any fun d => d.2.holdsLoad) || ds.takesLeft S

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

/-- The term a written path names at a body's own place, a declared
name's own place (`Seg.own`) its first step, as both ports read a body
there: the rest of the path read in the normal form of that name's
bodies met, the body's own members among them. -/
def Decls.bodyAt (ds : Decls) : List Seg → Option Val
  | .own n :: p =>
    match ds.filter (fun d => d.1 == n) with
    | [] => none
    | bs => ds.pathAt (normaliseD ds (ds.readU (bs.foldl (fun acc d => .meet acc d.2) .any))) p
  | _ => none

/-- Whether a path starts at a declared name's own place (`Seg.own`), as
only a relative path a body writes does once it's placed. -/
def ownPath : List Seg → Bool
  | .own _ :: _ => true
  | _ => false

/-- The term a written path names in the first of the roots it names
something in, or, for a path from a name's own place (`ownPath`), at a
body's own place, which no root holds and no path the schema writes
reaches: in the first of the places `bs` it names something in
(`Decls.bodyRoots`), and else in the normal form of the name's bodies
(`Decls.bodyAt`). -/
def Decls.pathIn (ds : Decls) (roots : List Val) (p : List Seg) (bs : List Val := []) : Option Val :=
  (roots.findSome? fun root => ds.pathAt root p).or
    (if ownPath p then (bs.findSome? fun root => ds.pathAt root p).or (ds.bodyAt p) else none)

/-- The declarations a document's paths make: each path's name, declared
as the term at the path in the first of the roots it names something
in, or of the places `bs` for a path a body writes, with that term's
own paths read as names too. A path to nothing declares nothing. -/
def Decls.ofPaths (ds : Decls) (roots : List Val) (ps : List (List Seg)) (bs : List Val := []) : Decls :=
  ps.filterMap fun p => (ds.pathIn roots p bs).map fun w => (pathName p, w.pathsToAliases)

/-- Whether a path names a place, as every path does but a reference
into an `emit`'s node (`Seg.node`) and a path in a link's template that
starts at the link's target (`landsPath`), which names one only once
the template lands there. -/
def placePath (p : List Seg) : Bool := p.head? != some .node && !landsPath p

/-- The paths a document writes: in the schema as read and in every body,
each that names a place (`placePath`). -/
def Decls.docPaths (ds : Decls) (S : Val) : List (List Seg) :=
  (((ds.read S).paths ++ ds.paths).filter placePath).eraseDups

/-- The paths a document writes that must name something: every path
that names a place but one `maybe` or a `filter`'s condition forgives
(`Val.forgive`). -/
def Decls.strictPaths (ds : Decls) (S : Val) : List (List Seg) :=
  (((ds.read S).forgive.paths ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.forgive.paths) []).filter
    placePath).eraseDups

/-- The document with its paths read as names from roots: each path is
declared as the term at it in the first root it names something in, or
of the places `bs` for a path a body writes, and the bodies and the
schema refer to the names. -/
def Decls.withPathsFrom (ds : Decls) (S : Val) (roots : List Val) (bs : List Val := []) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.pathsToAliases)) ++ ds.ofPaths roots (ds.docPaths S) bs, S.pathsToAliases)

/-! ## What a link names and sends -/

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
  | .link v _ => v.addrs
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

/-- The addresses a link holds at its position, at the leaves of the
value it stands in there: a `refer`'s one, and one at each leaf of a
relation's value. -/
def linkAddrs (e : List Seg × Val × Val) : List Addr := e.2.2.addrs

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

mutual
/-- The values a term holds within the arms of a disjunction that the
rank rule picks (`picked`), through the riders: where a link's address
is read, as the output takes its arm. -/
def Val.pickedLeaves : Val → List Val
  | .or arms => pickedLeavesArms arms arms
  | .ride _ v _ => v.pickedLeaves
  | v => [v]

def pickedLeavesArms (all : List (ℕ × Val)) : List (ℕ × Val) → List Val
  | [] => []
  | (r, a) :: rest => (if picked all (r, a) then a.pickedLeaves else []) ++ pickedLeavesArms all rest
end

mutual
/-- The links a normal form holds below `pos`, each with its position,
its template, and each value it stands in that the rank rule picks:
a member's under its key,
an element's under its position, through riders and meets, and within
each arm of a disjunction the rule picks, since a link in an arm sends
where the output takes the arm (decision 33 of the design note's §7).
A spread's template holds no position, so its links send from the
members it reaches. -/
def Val.links (pos : List Seg) : Val → List (List Seg × Val × Val)
  | .map fs _ _ => linksFields pos fs
  | .list items _ _ => linksItems pos 0 items
  | .ride _ v _ => v.links pos
  | .link v t => (v.pickedLeaves.map fun w => (pos, t, w)) ++ v.links pos
  | .meet a b => a.links pos ++ b.links pos
  | .or arms => linksArms pos arms arms
  | _ => []

def linksFields (pos : List Seg) : List (String × Bool × Val) → List (List Seg × Val × Val)
  | [] => []
  | (k, _, v) :: fs => v.links (pos ++ [.key k]) ++ linksFields pos fs

def linksItems (pos : List Seg) : ℕ → List Val → List (List Seg × Val × Val)
  | _, [] => []
  | i, v :: vs => v.links (pos ++ [.idx i]) ++ linksItems pos (i + 1) vs

def linksArms (pos : List Seg) (all : List (ℕ × Val)) :
    List (ℕ × Val) → List (List Seg × Val × Val)
  | [] => []
  | (r, a) :: rest => (if picked all (r, a) then a.links pos else []) ++ linksArms pos all rest
end

/-- The links a tree holds, read from its normal form (`Val.links`),
the tree standing at `home`: each template read where its link stands,
each `key(n)` reading the link's own place, as both ports read a
template where its link stands. -/
def Decls.nfLinks (ds : Decls) (root : Val) (home : List Seg) : List (List Seg × Val × Val) :=
  (root.links []).map fun e => (e.1, resolveD ds none (some ((home ++ e.1).map .seg)) e.2.1, e.2.2)

mutual
/-- A link's template as it lands at its target `T` (ruling 50): each
path that starts at the link's target (`Seg.lands`) read from `T`, as
many steps above it as the path climbs past the template, and `nil`
where that climbs past the top; a link's template inside it kept as it
is, since it lands at its own link's target. -/
def Val.atTarget (T : List Seg) : Val → Val
  | .path (.lands c :: p) => if c ≤ T.length then .path (T.take (T.length - c) ++ p) else .nil
  | .len c => .len (c.atTarget T)
  | .map fs spread closed => .map (atFields T fs) (atSpread T spread) closed
  | .list items spread closed => .list (atItems T items) (atSpread T spread) closed
  | .or arms => .or (atArms T arms)
  | .pref r x => .pref r (x.atTarget T)
  | .meet a b => .meet (a.atTarget T) (b.atTarget T)
  | .nof n cs => .nof (n.atTarget T) (atItems T cs)
  | .must c m => .must (c.atTarget T) m
  | .when c t e => .when (c.atTarget T) (t.atTarget T) (atSpread T e)
  | .contains c n => .contains (c.atTarget T) (n.atTarget T)
  | .rest t cs => .rest (t.atTarget T) (atCovers T cs)
  | .select s arms d => .select (s.atTarget T) (atPairs T arms) (atSpread T d)
  | .filter s c => .filter (s.atTarget T) (c.atTarget T)
  | .call f args => if f = .refer ∨ f = .rel then .call f args else .call f (atItems T args)
  | .ride k v r => .ride k (v.atTarget T) r
  | .link v t => .link (v.atTarget T) t
  | v => v

def atFields (T : List Seg) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.atTarget T) :: atFields T fs

def atItems (T : List Seg) : List Val → List Val
  | [] => []
  | v :: vs => v.atTarget T :: atItems T vs

def atSpread (T : List Seg) : Option Val → Option Val
  | none => none
  | some s => some (s.atTarget T)

def atArms (T : List Seg) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.atTarget T) :: atArms T as

def atPairs (T : List Seg) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.atTarget T, r.atTarget T) :: atPairs T ps

def atCovers (T : List Seg) : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (atSpread T c, atSpread T k, atSpread T m) :: atCovers T cs
end

mutual
/-- The links a term writes, at any depth: each `refer` and each `rel`,
in a call's arguments and in another link's template as well. -/
def Val.linkCalls : Val → ℕ
  | .call .refer args => lcItems args + 1
  | .call .rel args => lcItems args + 1
  | .call _ args => lcItems args
  | .ride _ v _ => v.linkCalls
  | .link v t => v.linkCalls + t.linkCalls
  | .len c => c.linkCalls
  | .map fs spread _ => lcFields fs + lcSpread spread
  | .list items spread _ => lcItems items + lcSpread spread
  | .or arms => lcArms arms
  | .pref _ x => x.linkCalls
  | .meet a b => a.linkCalls + b.linkCalls
  | .nof n cs => n.linkCalls + lcItems cs
  | .must c _ => c.linkCalls
  | .when c t e => c.linkCalls + t.linkCalls + lcSpread e
  | .contains c n => c.linkCalls + n.linkCalls
  | .rest t cs => t.linkCalls + lcCovers cs
  | .select s arms d => s.linkCalls + lcPairs arms + lcSpread d
  | .filter s c => s.linkCalls + c.linkCalls
  | _ => 0

def lcFields : List (String × Bool × Val) → ℕ
  | [] => 0
  | (_, _, v) :: fs => v.linkCalls + lcFields fs

def lcItems : List Val → ℕ
  | [] => 0
  | v :: vs => v.linkCalls + lcItems vs

def lcSpread : Option Val → ℕ
  | none => 0
  | some s => s.linkCalls

def lcArms : List (ℕ × Val) → ℕ
  | [] => 0
  | (_, a) :: arms => a.linkCalls + lcArms arms

def lcPairs : List (Val × Val) → ℕ
  | [] => 0
  | (p, r) :: ps => p.linkCalls + r.linkCalls + lcPairs ps

def lcCovers : List Cover → ℕ
  | [] => 0
  | (c, k, m) :: cs => lcSpread c + lcSpread k + lcSpread m + lcCovers cs
end

/-- One address's part in a body's own place, read in normal form as
`R`: `t` met at the path the address names from `pos`, read where it
lands (`Val.atTarget`), where `R` holds the target, and nothing where it
doesn't. -/
def ownFlow (R : Val) (pos : List Seg) (t : Val) (acc : Val) (a : Addr) : Val :=
  match (a.from pos).bind fun p => R.putW p (t.atTarget p) with
  | some u => .meet acc u
  | none => acc

/-- One link's part in a body's own place, read in normal form as `R`:
its template, its marks cleared, met at each target its addresses name
from where it stands (`ownFlow`). -/
def ownStep (R : Val) (acc : Val) (e : List Seg × Val × Val) : Val :=
  (linkAddrs e).foldl (ownFlow R e.1 e.2.1.unmark) acc

/-- A body's own place, `B`, with the template of each link it holds met
at the link's target where the place holds the target (`ownStep`), as
both ports meet a link's template into a member of its own body. A
target the place doesn't hold meets nothing here, since the link passes
judge it (`Decls.withRefers`). -/
def Decls.ownLinked (ds : Decls) (B : Val) : Val :=
  let R := normaliseD ds (ds.readU B)
  (ds.nfLinks R []).foldl (ownStep R) B

/-- A body's own place with its links' templates met in `n` times over
(`Decls.ownLinked`), each pass reading the place the last one made, so
that one link's template can make another link's target there. -/
def Decls.ownLinkedN (ds : Decls) (B : Val) : ℕ → Val
  | 0 => B
  | n + 1 => ds.ownLinked (ds.ownLinkedN B n)

/-- The tree at a declared name's own place, as the schema's own tree
reads it: the name's bodies met, at `%` and the name, with its links'
templates met in, a pass for each link the bodies write and one more
(`Decls.ownLinkedN`), in normal form, its calls made. -/
def Decls.ownPlace (ds : Decls) (n : String) : Val :=
  normaliseD ds (ds.readU (ds.ownLinkedN
    (.map [("%" ++ n, false, (ds.filter (·.1 == n)).foldl (fun acc d => .meet acc d.2) .any)] none false)
    ((ds.filter (·.1 == n)).foldl (fun k d => k + d.2.linkCalls) 1)))

/-- Whether a path names a member of the body a link written at `pos`
stands in, at the body's own place: the path's first step the link's
own, and the place holding a member there with its links' templates met
in (`Decls.ownPlace`), so that one link's template there can make
another link's target. -/
def Decls.atOwnBody (ds : Decls) (pos p : List Seg) : Bool :=
  p.head? == pos.head? && (match p with
    | .own n :: _ => (ds.pathAt (ds.ownPlace n) p).isSome
    | _ => false)

/-- One address's part in the schema: `t` met at the path the address
names from `pos` (`Addr.from`, `Val.putW`), read where it lands there
(`Val.atTarget`), in the first of `roots` it names something in;
nothing at a member of the link's own body
(`Decls.atOwnBody`), which the schema doesn't hold, where
`Decls.bodyClash` reads what the links send; and `miss` where it names
nothing or climbs past the top. -/
def referFlow (ds : Decls) (roots : List Val) (miss : Val) (pos : List Seg) (t : Val) (acc : Val)
    (a : Addr) : Val :=
  match (a.from pos).bind fun p => roots.findSome? fun root => root.putW p (t.atTarget p) with
  | some u => .meet acc u
  | none => if (a.from pos).any (ds.atOwnBody pos) then acc else .meet acc miss

/-- One link's part in the schema, the link written at `home`: for each
address the normal form it stands in holds at its position
(`linkAddrs`), the template with its marks cleared (`Val.unmark`), as a
reference copies it, met at the address's target read from where the
link stands, a relation's every leaf read from the relation's own
position. A link whose position holds no address has no target yet,
and meets nothing. -/
def referStep (ds : Decls) (roots : List Val) (miss : Val) (home : List Seg) (acc : Val)
    (e : List Seg × Val × Val) : Val :=
  (linkAddrs e).foldl (referFlow ds roots miss (home ++ e.1) e.2.1.unmark) acc

/-! ## Roots read in rounds -/

/-- The declared names whose own place (`Seg.own`) a path the bodies
write starts at. -/
def Decls.placedNames (ds : Decls) : List String :=
  (ds.paths.filterMap fun p => match p with
    | .own n :: _ => if ds.any (fun d => d.1 == n) then some n else none
    | _ => none).eraseDups

/-- The tree at each of the places `ns` names, a body's own place, as the
schema's own tree reads it (`Decls.ownPlace`). -/
def Decls.bodyRoots (ds : Decls) (ns : List String) : List Val :=
  ns.map ds.ownPlace

/-- The roots a document's paths read, round by round, `r` reading a
document to its root, beside the places of the bodies their own paths
start at (`Decls.bodyRoots`): the first round with its paths unread, and
each after with its paths read as names from the roots and the places
before it. A call over a path makes its value the round after the path
names something, and a path into that value names something the round
after that, so each round reaches one more step of a chain of paths, at
a body's own place as in the schema's tree. A path keeps the term the
first round that reaches it holds there. -/
def Decls.rounds (ds : Decls) (S : Val) (r : Decls → Val → Val) : ℕ → List Val × List Val
  | 0 => ([r ds S], ds.bodyRoots ds.placedNames)
  | n + 1 =>
    let rs := ds.rounds S r n
    let d := ds.withPathsFrom S rs.1 rs.2
    (rs.1 ++ [r d.1 d.2], rs.2 ++ d.1.bodyRoots ds.placedNames)

/-- A document's declarations with each recursive name's body read where
no place is yet (`Decls.readU`), its calls and its selections made, so
that each unfolding of the name, at a meet or by the checker, holds
them made, as both ports make them wherever the body stands. One that
waits on a reference, a hole or what the data writes stays as written. -/
def Decls.callsMade (ds : Decls) : Decls :=
  ds.map fun d => if ds.recursiveB d.1 then (d.1, ds.readU d.2) else d

/-- The schema's own tree, with the bodies' own places: the normal form
of the schema as read, before any data, its calls made (`Decls.readU`),
each recursive name's body with its calls made too (`Decls.callsMade`),
so that a path into a call a body holds reads what the call makes
wherever the name unfolds, in as many rounds as the document writes
paths, since a round that reaches no new path changes nothing after it.
The roots keep their keys as written, so that a key a path reaches reads
where the path lands. -/
def Decls.roundsS (ds : Decls) (S : Val) : List Val × List Val :=
  ds.rounds S (fun d T => normaliseD d.callsMade (d.callsMade.readU T)) (ds.docPaths S).length

/-- The schema's own tree, round by round (`Decls.roundsS`). -/
def Decls.rootsS (ds : Decls) (S : Val) : List Val := (ds.roundsS S).1

/-- The tree the data reads in, with the bodies' own places, which no
data reaches: the normal form of the schema met with the data, each
recursive name's body with its calls made, in as many rounds. -/
def Decls.roundsD (ds : Decls) (S : Val) (j : Data) : List Val × List Val :=
  ds.rounds S (fun d T => normaliseD d.callsMade (meetD d.callsMade (d.callsMade.readU T) j.term))
    (ds.docPaths S).length

/-- The tree the data reads in, round by round (`Decls.roundsD`). -/
def Decls.rootsD (ds : Decls) (S : Val) (j : Data) : List Val := (ds.roundsD S j).1

/-- Whether every path of the document that must name something
resolves in the schema's own tree (`Decls.roundsS`), so that a path into
a call's output resolves, the call's arguments paths or not. -/
def Decls.resolvesB (ds : Decls) (S : Val) : Bool :=
  let rs := ds.roundsS S
  (ds.strictPaths S).all fun p => (ds.pathIn rs.1 p rs.2).isSome

/-- Every path of the document that must name something resolves in
the schema's own tree. -/
def Decls.Resolves (ds : Decls) (S : Val) : Prop :=
  ∀ p, p ∈ ds.strictPaths S → (ds.pathIn (ds.roundsS S).1 p (ds.roundsS S).2).isSome = true

theorem Decls.resolvesB_iff {ds : Decls} {S : Val} : ds.resolvesB S = true ↔ ds.Resolves S := by
  simp only [Decls.resolvesB, Decls.Resolves, List.all_eq_true]

/-- The document with its paths read as names from the schema alone,
from its own tree, which is what the error class is judged on, each
recursive name's body with its calls made (`Decls.callsMade`). -/
def Decls.withPathsS (ds : Decls) (S : Val) : Decls × Val :=
  let rs := ds.roundsS S
  ((ds.withPathsFrom S rs.1 rs.2).1.callsMade, (ds.withPathsFrom S rs.1 rs.2).2)

/-- The document with its paths read as names from the data too, from
the tree the data reads in, which is what the other classes are judged
on, each recursive name's body with its calls made. -/
def Decls.withPaths (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  let rs := ds.roundsD S j
  ((ds.withPathsFrom S rs.1 rs.2).1.callsMade, (ds.withPathsFrom S rs.1 rs.2).2)

/-! ## The verdict with paths -/

/-- The verdict of a document whose paths are absolute, its declarations
`ds` and schema `S` as the schema alone reads them and `ds'` and `S'` as
the data does. It is an `error` where a path of `S` does not resolve in
the schema's own tree, or where the document is an error with its paths
read from the schema alone: a name declared nowhere, a cycle, a `nil` in
the schema. Otherwise the paths of `S'` read from the data too, and the
document is `invalid` where that reading is dead or an error, since the
data made it so, and `valid` or `incomplete` as that reading is. -/
def VetA (m : Mode) (ds : Decls) (S : Val) (ds' : Decls) (S' : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Resolves S ∨ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error
  | .invalid =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      (Vet m (ds'.withPaths S' j).1 (ds'.withPaths S' j).2 j .invalid ∨
        Vet m (ds'.withPaths S' j).1 (ds'.withPaths S' j).2 j .error)
  | v =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      Vet m (ds'.withPaths S' j).1 (ds'.withPaths S' j).2 j v

/-- The verdict of a document whose paths are absolute, computed. -/
def vetA (m : Mode) (ds : Decls) (S : Val) (ds' : Decls) (S' : Val) (j : Data) : Verdict :=
  if ds.resolvesB S then
    if vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j = .error then .error
    else
      match vet m (ds'.withPaths S' j).1 (ds'.withPaths S' j).2 j with
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
  | .link v _ => v.moved
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
holding the path's key as optional, or an open list holding `any` at
each position before the path's index, down to `hide(any)`. A path the
schema names (`Decls.withMoves`) reaches an element the list holds, so
the open list adds no position, and the hidden element holds none
(decision 18). -/
def hideAt : List Seg → Val
  | [] => .ride .hide .any []
  | .key k :: p => .map [(k, true, hideAt p)] none false
  | .idx i :: p => .list (List.replicate i .any ++ [hideAt p]) none false
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

/-- The names of the paths the moves a document's reading makes read,
`r` reading the document to its roots: those the last root holds
(`Val.moves`), and those each body that writes a `move` holds, read
with the paths the roots declare, used or not, as both ports read a
body where it's declared. -/
def Decls.movesMade (ds : Decls) (r : Decls → Val → List Val) (S : Val) : List String :=
  ((r ds S).getLast?.getD .any).moves ++
    (ds.filter fun d => !d.2.moved.isEmpty).flatMap fun d =>
      (normaliseD (ds.withPathsFrom S (r ds S)).1
        ((ds.withPathsFrom S (r ds S)).1.readU (((ds.withPathsFrom S (r ds S)).1.env d.1).getD .any))).moves

/-- The schema with the source each `move` the reading makes reads
hidden (`Decls.movesMade`), `r` reading the document to its roots, met
with `hideAt` of the steps its path takes in the first of the schema's
roots it names something in, each variable bound and each step read by
the container it meets, so that the document generates the value once,
at its new place, and the data needn't supply the source. A `move` in
an arm no selection takes, or in a template no member instantiates,
hides nothing, as both ports never make it. A path to nothing hides
nothing, so that it stays the error any path to nothing is. -/
def Decls.withMoves (ds : Decls) (r : Decls → Val → List Val) (S : Val) : Val :=
  (((S.moved ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.moved) []).filter fun p =>
      pathName p ∈ ds.movesMade r S).filterMap fun p =>
      (p.mapM ds.bindSeg).bind fun q => (ds.rootsS S).findSome? fun root => root.stepsW q).foldl
    (fun acc p => .meet acc (hideAt p)) S

/-! ## Links -/

mutual
/-- The positions a term holds, as `Val.at` reads them: the empty path,
and each position below each member of a map and each element of a
list, the riders around either read through. -/
def Val.positions : Val → List (List Seg)
  | .map fs _ _ => [] :: positionsFields fs
  | .list items _ _ => [] :: positionsItems 0 items
  | .ride _ v _ => v.positions
  | .link v _ => v.positions
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
  | .link v _ => ([], [(v, i.2)])
  | .path q => ([], [(S, q ++ i.2)])
  | _ => landLeaf i.1 i.2

/-- What the schema `S` writes at a path, read from the items within `n`
steps (`landStep`), so that a cycle of references reads to the end of
the budget and no further. -/
def landing (S : Val) : ℕ → List (Val × List Seg) → List Val
  | 0, _ => []
  | _, [] => []
  | n + 1, i :: rest => (landStep S i).1 ++ landing S n ((landStep S i).2 ++ rest)

/-- One step of `landStep`, a name stepped into through each of its
bodies too, as a copy stands where its use does. -/
def Decls.landStepD (ds : Decls) (S : Val) (i : Val × List Seg) : List Val × List (Val × List Seg) :=
  match i.1 with
  | .alias n => ([], (ds.filter (·.1 == n)).map fun d => (d.2, i.2))
  | _ => landStep S i

/-- What the schema `S` writes at a path, a name's bodies read where the
name stands (`Decls.landStepD`), within `n` steps. -/
def Decls.landingD (ds : Decls) (S : Val) : ℕ → List (Val × List Seg) → List Val
  | 0, _ => []
  | _, [] => []
  | n + 1, i :: rest => (ds.landStepD S i).1 ++ ds.landingD S n ((ds.landStepD S i).2 ++ rest)

/-- The names whose bodies `Decls.landingD` reads within `n` steps. -/
def Decls.landedNames (ds : Decls) (S : Val) : ℕ → List (Val × List Seg) → List String
  | 0, _ => []
  | _, [] => []
  | n + 1, i :: rest =>
    (match i.1 with
      | .alias m => [m]
      | _ => []) ++ ds.landedNames S n ((ds.landStepD S i).2 ++ rest)

/-- The tree a body's links land in: the body's normal form, read under
`dp`, which declares the document's paths as names. -/
def Decls.bodyRoot (dp : Decls) (d : String × Val) : Val := normaliseD dp (dp.readU d.2.pathsToAliases)

/-- The schema with each link's template met into its target as the
tree `L` reads hold it, and `miss` for each link whose target they
don't hold: each link that lands at a position of that tree, read there
(`Decls.landedLinks`), and each that lands in a body, at a position of
the body's own tree (`Decls.bodyRoot`), read at the body's own place
(`Seg.own`), as both ports read a body where
it's declared, used or not (ruling 35). Read from the tree an earlier
pass made, so a link a template carries lands with it and sends too. -/
def Decls.referPass (ds : Decls) (r : Decls → Val → List Val) (S L : Val) (miss : Val) : Val :=
  let own := r ds L
  let dp := (ds.withPathsFrom L own).1
  let R := own.getLast?.getD .any
  ds.foldl (fun acc d => (ds.nfLinks (dp.bodyRoot d) [.own d.1]).foldl
      (referStep ds own miss [.own d.1]) acc)
    ((ds.nfLinks R []).foldl (referStep ds own miss []) S)

/-- The flows a document's links make, one for each address they hold:
the schema's and its bodies', each read as `Decls.referPass` reads it. -/
def Decls.referCount (ds : Decls) (r : Decls → Val → List Val) (S : Val) : ℕ :=
  let own := r ds S
  let dp := (ds.withPathsFrom S own).1
  let R := own.getLast?.getD .any
  ds.foldl (fun n d => n + ((ds.nfLinks (dp.bodyRoot d) [.own d.1]).map fun e =>
      (linkAddrs e).length).sum)
    ((ds.nfLinks R []).map fun e => (linkAddrs e).length).sum

/-- The schema after `n` passes, each meeting the templates of the links
the last pass's tree holds into the targets it holds, so that one link's
template can make another link's target, or carry another link, and
meeting them into that tree, so that a flow once found stays, even one
whose conflict leaves its own link no address to read again. -/
def Decls.referPasses (ds : Decls) (r : Decls → Val → List Val) (S : Val) : ℕ → Val
  | 0 => S
  | n + 1 => ds.referPass r (ds.referPasses r S n) (ds.referPasses r S n) .any

/-- The flows of one link, written at `home`, into a member of its own
body: each target no root holds that `Decls.atOwnBody` finds, with the
template, its marks cleared, read where it lands (`Val.atTarget`). -/
def bodyFlowsOf (ds : Decls) (roots : List Val) (home : List Seg) (e : List Seg × Val × Val) :
    List (List Seg × Val) :=
  (linkAddrs e).filterMap fun a =>
    (a.from (home ++ e.1)).bind fun p =>
      if (roots.findSome? fun root => root.putW p (e.2.1.unmark.atTarget p)).isNone && ds.atOwnBody (home ++ e.1) p then
        some (p, e.2.1.unmark.atTarget p)
      else none

/-- The flows a tree's links make into a member of their own body, the
schema's and each body's, read as `Decls.referPass` reads them. -/
def Decls.bodyFlows (ds : Decls) (r : Decls → Val → List Val) (L : Val) : List (List Seg × Val) :=
  let own := r ds L
  let dp := (ds.withPathsFrom L own).1
  let R := own.getLast?.getD .any
  (ds.nfLinks R []).flatMap (bodyFlowsOf ds own []) ++
    ds.flatMap fun d => (ds.nfLinks (dp.bodyRoot d) [.own d.1]).flatMap
      (bodyFlowsOf ds own [.own d.1])

/-- Whether the templates the flows send to a body's own place conflict
there, with the body's member or with each other, as both ports meet
each into the body's own place: the tree at the place, its links'
templates met in (`Decls.ownPlace`), with each template met at its
place, each recursive name read with its calls made (`Decls.callsMade`),
so that a template that is the name unfolds as both ports make it. -/
def Decls.bodyClash (ds : Decls) (fs : List (List Seg × Val)) : Bool :=
  ds.any fun d =>
    match fs.filter (fun f => f.1.head? == some (.own d.1)) with
    | [] => false
    | gs =>
      let b := ((ds.callsMade.ownPlace d.1).at [.own d.1]).getD .any
      ((normaliseD ds.callsMade (ds.callsMade.readU
        (gs.foldl (fun acc f => ((b.putW f.1.tail f.2).map acc.meet).getD acc) b))).staged ds.callsMade).illFormed

/-- The schema with each link's template met into its target, so that
the template flows into the target and a link to nothing is an error:
read in the tree the passes make, as many as the links make flows and
as the document writes links, so that links whose templates make each
other's targets, or carry each other, resolve in any order, a link
whose target is still missing meeting `nil`, as does the schema where
the templates sent to a body's own place conflict there. -/
def Decls.withRefers (ds : Decls) (r : Decls → Val → List Val) (S : Val) : Val :=
  let L := ds.referPasses r S (ds.referCount r S + S.linkCalls + ds.foldl (fun n d => n + d.2.linkCalls) 0)
  if ds.bodyClash (ds.bodyFlows r L) then .meet (ds.referPass r L L .nil) .nil else ds.referPass r L L .nil

/-! ## A spread read at each member -/

/-- Whether a spread's template reads its member's place: it's a
relative path, or holds a path or a `key(n)` at any depth, but isn't
itself an absolute path, which names the same place for every member. -/
def Val.perMember : Val → Bool
  | .path (.up _ :: _) => true
  | .path _ => false
  | s => !s.paths.isEmpty || s.holdsKey

mutual
/-- The term with each relative path and each `key(n)` it holds, at any
depth, read as `any`: a template as the tree its spread is read at holds
it, its members' structure kept, and what an absolute path names too,
since that's the same at every member, but none of the places the
template reads from its member's. -/
def Val.blank : Val → Val
  | .path (.up _ :: _) | .keyUp _ => .any
  | .len c => .len c.blank
  | .map fs spread closed => .map (blFields fs) (blSpread spread) closed
  | .list items spread closed => .list (blItems items) (blSpread spread) closed
  | .or arms => .or (blArms arms)
  | .pref r x => .pref r x.blank
  | .meet a b => .meet a.blank b.blank
  | .nof n cs => .nof n.blank (blItems cs)
  | .must c m => .must c.blank m
  | .when c t e => .when c.blank t.blank (blSpread e)
  | .contains c n => .contains c.blank n.blank
  | .rest t cs => .rest t.blank (blCovers cs)
  | .select s arms d => .select s.blank (blPairs arms) (blSpread d)
  | .filter s c => .filter s.blank c.blank
  | .call f args => .call f (blItems args)
  | .ride k v r => .ride k v.blank r
  | .link v lt => .link v.blank lt
  | v => v

def blPairs : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.blank, r.blank) :: blPairs ps

def blCovers : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (blSpread c, blSpread k, blSpread m) :: blCovers cs

def blFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.blank) :: blFields fs

def blItems : List Val → List Val
  | [] => []
  | v :: vs => v.blank :: blItems vs

def blSpread : Option Val → Option Val
  | none => none
  | some s => some s.blank

def blArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.blank) :: blArms as
end

/-- A spread whose template reads its member's place, blanked. -/
def opSpread : Option Val → Option Val
  | some s => some (if s.perMember then s.blank else s)
  | none => none

mutual
/-- The term with each spread whose template reads its member's place
blanked (`Val.blank`), where `Val.neutral` reads one, and in each result
a selection can take, since the result it takes stands where the
selection does: the schema the tree a spread is read at comes from. -/
def Val.opened : Val → Val
  | .map fs spread closed => .map (opFields fs) (opSpread spread) closed
  | .list items spread closed => .list (opItems items) (opSpread spread) closed
  | .meet a b => .meet a.opened b.opened
  | .ride k v r => .ride k v.opened r
  | .link v lt => .link v.opened lt
  | .select s arms d => .select s (opPairs arms) (opResult d)
  | v => v

def opFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.opened) :: opFields fs

def opItems : List Val → List Val
  | [] => []
  | v :: vs => v.opened :: opItems vs

def opPairs : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p, r.opened) :: opPairs ps

def opResult : Option Val → Option Val
  | none => none
  | some e => some e.opened
end

/-- A spread whose template reads its member's place, left to admit any
value. -/
def ntSpread : Option Val → Option Val
  | some s => some (if s.perMember then .any else s)
  | none => none

/-- A term of a generator's template as the generator's own instance
holds it: `any` where it holds a relative path. -/
def relAny (v : Val) : Val := if v.holdsRel then .any else v

mutual
/-- A generator's template with each term that holds a relative path,
other than a map, a list, a meet or a rider, read as `any` (`relAny`):
what the generator's own instance holds, since the template's relative
paths read at each member instead (`Val.relPart`). -/
def Val.relBlank : Val → Val
  | .map fs spread closed => .map (rbFields fs) spread closed
  | .list items spread closed => .list (rbItems items) spread closed
  | .meet a b => .meet a.relBlank b.relBlank
  | .ride k v r => .ride k v.relBlank r
  | .link v lt => .link v.relBlank lt
  | v => relAny v

def rbFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.relBlank) :: rbFields fs

def rbItems : List Val → List Val
  | [] => []
  | v :: vs => v.relBlank :: rbItems vs
end

/-- A term of a generator's template as the part met at each member holds
it: whole where it holds a relative path, and `any` otherwise. -/
def relWhole (v : Val) : Val := if v.holdsRel then v else .any

mutual
/-- The part of a generator's template that reads its member's place
through a relative path, through maps by key, lists by index, meets and
riders: a map's members that hold one, in an open map, a list's
elements, and any other term that holds one, whole (`relWhole`). Met at
a member of the generator's output, it asks of the member what the
template's relative paths read there. -/
def Val.relPart : Val → Val
  | .map fs _ _ => .map (rpFields fs) none false
  | .list items _ _ => .list (rpItems items) none false
  | .meet a b => .meet a.relPart b.relPart
  | .ride k v r => .ride k v.relPart r
  | .link v lt => .link v.relPart lt
  | v => relWhole v

def rpFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => if v.holdsRel then (k, o, v.relPart) :: rpFields fs else rpFields fs

def rpItems : List Val → List Val
  | [] => []
  | v :: vs => v.relPart :: rpItems vs
end

mutual
/-- The term with each spread whose template reads its member's place
left to admit any value (`ntSpread`), through maps by key, lists by
index, meets, riders and a generator's template, whose relative paths
it reads as `any` (`Val.relBlank`), where `landing` reads one: the
schema each member's instance is met into. -/
def Val.neutral : Val → Val
  | .map fs spread closed => .map (ntFields fs) (ntSpread spread) closed
  | .list items spread closed => .list (ntItems items) (ntSpread spread) closed
  | .meet a b => .meet a.neutral b.neutral
  | .ride k v r => .ride k v.neutral r
  | .link v lt => .link v.neutral lt
  | .call f args => .call f (ntArgs f args)
  | v => v

def ntFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.neutral) :: ntFields fs

def ntItems : List Val → List Val
  | [] => []
  | v :: vs => v.neutral :: ntItems vs

/-- A call's arguments, a generator's template neutral and with its
relative paths read as `any` (`Val.relBlank`). -/
def ntArgs (f : Fn) : List Val → List Val
  | [d, t] => if f == .each || f == .pack then [d, t.neutral.relBlank] else [d, t]
  | args => args
end

mutual
/-- Whether a term holds a spread whose template reads its member's
place, where `Val.neutral` reads one, or in a result a selection there
can take (`Decls.armsRead`). -/
def Val.perMembers : Val → Bool
  | .map fs spread _ => pmFields fs || (spread.map Val.perMember).getD false
  | .list items spread _ => pmItems items || (spread.map Val.perMember).getD false
  | .meet a b => a.perMembers || b.perMembers
  | .ride _ v _ => v.perMembers
  | .link v _ => v.perMembers
  | .call f args => pmArgs f args
  | .select _ arms d => pmPairs arms || pmResult d
  | _ => false

def pmFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.perMembers || pmFields fs

def pmItems : List Val → Bool
  | [] => false
  | v :: vs => v.perMembers || pmItems vs

def pmPairs : List (Val × Val) → Bool
  | [] => false
  | (_, r) :: ps => r.perMembers || pmPairs ps

def pmResult : Option Val → Bool
  | none => false
  | some e => e.perMembers

/-- Whether a call is a generator whose template reads its member's
place: through a relative path, or a spread that does. -/
def pmArgs (f : Fn) : List Val → Bool
  | [_, t] => (f == .each || f == .pack) && (t.holdsRel || t.perMembers)
  | _ => false
end

/-- The spread a map or a list holds, where its template reads its
member's place. -/
def Val.memberSpread : Val → Option Val
  | .map _ (some s) _ | .list _ (some s) _ => if s.perMember then some s else none
  | _ => none

/-- The members a tree holds at a position, the riders around it read
through: a map's keys, and a list's indices. -/
def Val.membersAt (root : Val) (p : List Seg) : List Seg :=
  match (root.at p).map Val.unride with
  | some (.map fs _ _) => fs.map fun f => .key f.1
  | some (.list items _ _) => (List.range items.length).map .idx
  | _ => []

/-- A spread's template at the member `t` below the position `p`: tried
on the member's key (`Val.atKey`), placed at the member, below `base`
where the tree stands there, its own spreads that read their member's
place left to admit any value, since each lands at its own members too,
and met at the member's path in `root` (`Val.putW`). -/
def Val.spreadInst (root s : Val) (base p : List Seg) (t : Seg) : Option Val :=
  root.putW (p ++ [t]) ((s.atKey t.text).placed (base ++ p ++ [t])).neutral

/-- A generator's template where it reads its member's place through a
relative path, `each`'s or `pack`'s: the part that does (`Val.relPart`). -/
def Val.genTemplate : Val → Option Val
  | .call .each [_, t] | .call .pack [_, t] => if t.holdsRel then some t.relPart else none
  | _ => none

/-- A generator's template part at the member `t` of its output at the
position `p`: placed at the member, below `base`, its own spreads and
generators that read their member's place left as `Val.neutral` leaves
them, and met at the member's path in `root` (`Val.putW`). -/
def Val.genInst (root u : Val) (base p : List Seg) (t : Seg) : Option Val :=
  root.putW (p ++ [t]) (u.placed (base ++ p ++ [t])).neutral

/-- What the templates that land at a position of `root` make there: for
each term the schema `P` writes at the position (`Decls.landingD`),
whether written there, in a template that holds the position, in the
body of a name used there or where a path reference copies it from, the
template of a spread on it that reads its member's place, and the part
of a generator's template that reads its member's place through a
relative path (`Val.genTemplate`), each at each member `root` holds
there, placed below `base`, where `root` stands. -/
def Decls.instancesAt (ds : Decls) (P root : Val) (base p : List Seg) : List Val :=
  (ds.landingD P ((P.size + ds.bodiesSize + p.length + 2) * (P.size + ds.bodiesSize + 2)) [(P, p)]).flatMap
    fun w =>
      (w.memberSpread.toList.flatMap fun s => (root.membersAt p).filterMap (root.spreadInst s base p)) ++
        w.genTemplate.toList.flatMap fun u => (root.membersAt p).filterMap (root.genInst u base p)

/-- The term `P`, standing at `base`, with each template that reads its
member's place, a spread's or the part of a generator's that does
through a relative path, read at each member `root` holds wherever it
lands, a name's body among the places (`Decls.instancesAt`), at every
position of `root`; the spread left to admit any other member, and the
generator's own template its relative paths as `any` (`Val.neutral`),
as both ports try such a template only on the members there are, at the
place each stands. -/
def Decls.membersRead (ds : Decls) (P root : Val) (base : List Seg) : Val :=
  if P.perMembers || ds.any (·.2.perMembers) then
    (root.positions.flatMap (ds.instancesAt P root base)).foldl .meet P.neutral
  else P

/-- The names whose bodies the templates `P` writes are read through at
each position of `root` (`Decls.landedNames`): each holds a copy whose
own templates are read there, at the members where it stands. -/
def Decls.reached (ds : Decls) (P root : Val) : List String :=
  root.positions.flatMap fun p =>
    ds.landedNames P ((P.size + ds.bodiesSize + p.length + 2) * (P.size + ds.bodiesSize + 2)) [(P, p)]

mutual
/-- The term `v`, standing at `pos` in `root` and below `base` in the
document, with each result of each selection it holds, through maps by
key, lists by index, meets, riders and links, read at each member `root`
holds where the selection stands (`Decls.membersRead`): the result a
selection takes stands there, and `root`, read with its selections made,
holds the members that result meets, as both ports read a template in
the result they take. -/
def Decls.armsRead (ds : Decls) (root : Val) (base pos : List Seg) : Val → Val
  | .map fs spread closed => .map (ds.arFields root base pos fs) spread closed
  | .list items spread closed => .list (ds.arElems root base pos 0 items) spread closed
  | .meet a b => .meet (ds.armsRead root base pos a) (ds.armsRead root base pos b)
  | .ride k v r => .ride k (ds.armsRead root base pos v) r
  | .link v lt => .link (ds.armsRead root base pos v) lt
  | .select s arms d => .select s (ds.arPairs root base pos arms) (ds.arResult root base pos d)
  | v => v

def Decls.arFields (ds : Decls) (root : Val) (base pos : List Seg) :
    List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, ds.armsRead root base (pos ++ [.key k]) v) :: ds.arFields root base pos fs

def Decls.arElems (ds : Decls) (root : Val) (base pos : List Seg) : ℕ → List Val → List Val
  | _, [] => []
  | i, v :: vs => ds.armsRead root base (pos ++ [.idx i]) v :: ds.arElems root base pos (i + 1) vs

def Decls.arPairs (ds : Decls) (root : Val) (base pos : List Seg) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps =>
    (p, ds.membersRead (ds.armsRead root base pos r) ((root.at pos).getD .any) (base ++ pos)) ::
      ds.arPairs root base pos ps

def Decls.arResult (ds : Decls) (root : Val) (base pos : List Seg) : Option Val → Option Val
  | none => none
  | some e => some (ds.membersRead (ds.armsRead root base pos e) ((root.at pos).getD .any) (base ++ pos))
end

mutual
/-- The names whose bodies `Decls.armsRead` reads a selection's results
through (`Decls.reached`): each holds a copy whose own templates are read
where the result stands. -/
def Decls.armsReached (ds : Decls) (root : Val) (pos : List Seg) : Val → List String
  | .map fs _ _ => ds.arnFields root pos fs
  | .list items _ _ => ds.arnElems root pos 0 items
  | .meet a b => ds.armsReached root pos a ++ ds.armsReached root pos b
  | .ride _ v _ => ds.armsReached root pos v
  | .link v _ => ds.armsReached root pos v
  | .select _ arms d => ds.arnPairs root pos arms ++ ds.arnResult root pos d
  | _ => []

def Decls.arnFields (ds : Decls) (root : Val) (pos : List Seg) : List (String × Bool × Val) → List String
  | [] => []
  | (k, _, v) :: fs => ds.armsReached root (pos ++ [.key k]) v ++ ds.arnFields root pos fs

def Decls.arnElems (ds : Decls) (root : Val) (pos : List Seg) : ℕ → List Val → List String
  | _, [] => []
  | i, v :: vs => ds.armsReached root (pos ++ [.idx i]) v ++ ds.arnElems root pos (i + 1) vs

def Decls.arnPairs (ds : Decls) (root : Val) (pos : List Seg) : List (Val × Val) → List String
  | [] => []
  | (_, r) :: ps =>
    ds.armsReached root pos r ++ ds.reached r ((root.at pos).getD .any) ++ ds.arnPairs root pos ps

def Decls.arnResult (ds : Decls) (root : Val) (pos : List Seg) : Option Val → List String
  | none => []
  | some e => ds.armsReached root pos e ++ ds.reached e ((root.at pos).getD .any)
end

mutual
/-- Each name the term `v`, standing at `pos`, uses, with the position
it's used at: through maps by key, lists by index, meets, riders and
links, and in a disjunction's arms, a preference and a selection's
results, which stand where the term does. -/
def Val.usedAt (pos : List Seg) : Val → List (String × List Seg)
  | .alias n => [(n, pos)]
  | .map fs _ _ => usdFields pos fs
  | .list items _ _ => usdItems pos 0 items
  | .meet a b => a.usedAt pos ++ b.usedAt pos
  | .ride _ v _ => v.usedAt pos
  | .link v _ => v.usedAt pos
  | .or arms => usdArms pos arms
  | .pref _ x => x.usedAt pos
  | .select _ arms d => usdPairs pos arms ++ usdResult pos d
  | _ => []

def usdFields (pos : List Seg) : List (String × Bool × Val) → List (String × List Seg)
  | [] => []
  | (k, _, v) :: fs => v.usedAt (pos ++ [.key k]) ++ usdFields pos fs

def usdItems (pos : List Seg) : ℕ → List Val → List (String × List Seg)
  | _, [] => []
  | i, v :: vs => v.usedAt (pos ++ [.idx i]) ++ usdItems pos (i + 1) vs

def usdArms (pos : List Seg) : List (ℕ × Val) → List (String × List Seg)
  | [] => []
  | (_, a) :: as => a.usedAt pos ++ usdArms pos as

def usdPairs (pos : List Seg) : List (Val × Val) → List (String × List Seg)
  | [] => []
  | (_, r) :: ps => r.usedAt pos ++ usdPairs pos ps

def usdResult (pos : List Seg) : Option Val → List (String × List Seg)
  | none => []
  | some e => e.usedAt pos
end

/-- The position each name is used at, where the schema `S` uses it or
the body of a name used at a position uses it, as deep as the document
declares names: the place a copy stands, since each copy has one use. -/
def Decls.usePlaces (ds : Decls) (S : Val) : List (String × List Seg) :=
  (List.range ds.length).foldl
    (fun acc _ => S.usedAt [] ++ ds.flatMap fun d => ((acc.lookup d.1).map fun q => d.2.usedAt q).getD []) []

/-- A copy's body with each selection's results read where the copy
stands (`Decls.armsRead`), where the document uses it at a position. -/
def Decls.copyArms (ds : Decls) (root : Val) (places : List (String × List Seg)) (d : String × Val) : Val :=
  ((places.lookup d.1).map fun q => ds.armsRead root [] q d.2).getD d.2

/-- The tree a body's own place holds: the normal form of the name's
bodies, met, as `Decls.bodyAt` reads the place, each template that reads
its member's place blanked (`Val.opened`), so that a template in one body
reads at each member another body of the name writes. -/
def Decls.ownRoot (ds : Decls) (d : String × Val) : Val :=
  normaliseD ds (ds.readU ((ds.filter (·.1 == d.1)).foldl (fun acc e => .meet acc e.2.opened) .any))

/-- A body read at its own place (`Seg.own`): each template that
reads its member's place read at each member the body's own normal form
holds (`Decls.membersRead`), in a selection's results too
(`Decls.armsRead`), as both ports read a body there whether or not
anything uses it. -/
def Decls.ownRead (ds : Decls) (d : String × Val) : Val :=
  ds.membersRead (ds.armsRead (ds.ownRoot d) [.own d.1] [] d.2) (ds.ownRoot d) [.own d.1]

/-! ## A path reference's copy reads its relative paths where it stands

Ruling 26 again: a path reference to a place whose terms read their own
place is a copy of what the document writes there, read where the
reference stands, as a use of a name is. What the data writes at the
place is part of what the document writes there, as `vet(S, D)` and
`eval(S ∪ D)` are one question (ADR-007), so it meets the copy too. -/

/-- What a term leaves for the next step of a path through its members
alone, a map's member and a list's element at the step: as
`Val.stepItems` reads one, but no template, a spread's or a
generator's, which holds every member and names none. -/
def Val.stepMembers (t : Val) (s : Seg) (p : List Seg) : List (Val × List Seg) :=
  match s.stepIn t, t with
  | some (.key k), .map fs _ _ => (fs.filter fun f => f.1 == k).map fun f => (f.2.2, p)
  | some (.idx i), .list items _ _ => items[i]?.toList.map fun w => (w, p)
  | _, _ => []

/-- One step of reading what the schema `S` writes at a path, on an
item, a term, the position it stands at and the path left below it, as
`landStep` reads one, but a term that the path is spent at taken whole,
riders and all, a relative path reference read from where it stands
(`absPath`), and a name stepped into through each of its bodies; through
templates too where `tm` holds, and through members alone where it
doesn't (`Val.stepMembers`). -/
def Decls.landStepAt (ds : Decls) (S : Val) (tm : Bool) (i : Val × List Seg × List Seg) :
    List Val × List (Val × List Seg × List Seg) :=
  match i.1, i.2.2 with
  | .meet a b, _ => ([], [(a, i.2.1, i.2.2), (b, i.2.1, i.2.2)])
  | .path q, _ => if relPath (absPath i.2.1 q) then ([], []) else ([], [(S, [], absPath i.2.1 q ++ i.2.2)])
  | t, [] => ([t], [])
  | .ride _ v _, p => ([], [(v, i.2.1, p)])
  | .link v _, p => ([], [(v, i.2.1, p)])
  | .alias n, p => ([], (ds.filter (·.1 == n)).map fun d => (d.2, i.2.1, p))
  | t, s :: p =>
    ([], ((if tm then t.stepItems s p else t.stepMembers s p).map fun w =>
      (w.1, i.2.1 ++ [(s.stepIn t).getD s], w.2)))

/-- What the schema `S` writes at a path, read from the items within `n`
steps (`Decls.landStepAt`). -/
def Decls.landingAt (ds : Decls) (S : Val) (tm : Bool) : ℕ → List (Val × List Seg × List Seg) → List Val
  | 0, _ => []
  | _, [] => []
  | n + 1, i :: rest => (ds.landStepAt S tm i).1 ++ ds.landingAt S tm n ((ds.landStepAt S tm i).2 ++ rest)

/-- The places the reading of `Decls.landingAt` is for, each item's
position with the path left below it: the place itself, and each place
a path reference on the way names, with what is left of the path, where
the data writes too. -/
def Decls.landPlaces (ds : Decls) (S : Val) : ℕ → List (Val × List Seg × List Seg) → List (List Seg)
  | 0, _ => []
  | _, [] => []
  | n + 1, i :: rest => (i.2.1 ++ i.2.2) :: ds.landPlaces S n ((ds.landStepAt S true i).2 ++ rest)

/-- The budget a reading of what the document writes at `p` takes, which
the schema and the bodies bound. -/
def Decls.landBudget (ds : Decls) (S : Val) (p : List Seg) : ℕ :=
  (S.size + ds.bodiesSize + p.length + 2) * (S.size + ds.bodiesSize + 2)

/-- What the document writes at a place (`Decls.landingAt`). -/
def Decls.written (ds : Decls) (S : Val) (p : List Seg) : List Val :=
  ds.landingAt S true (ds.landBudget S p) [(S, [], p)]

/-- Whether the document writes at a place through its members alone, so
that the place is one the schema holds, not one a template would
reach if a member stood there. -/
def Decls.writes (ds : Decls) (S : Val) (p : List Seg) : Bool :=
  !(ds.landingAt S false (ds.landBudget S p) [(S, [], p)]).isEmpty

/-- The places the data at a place is read from (`Decls.landPlaces`). -/
def Decls.writtenAt (ds : Decls) (S : Val) (p : List Seg) : List (List Seg) :=
  ds.landPlaces S (ds.landBudget S p) [(S, [], p)]

/-- Whether what the document writes at a place reads its own place, so
that a copy of it reads again where the copy stands: the schema holds
the place (`Decls.writes`), and one of its terms holds a relative path,
a template's among them, a use of a name of `rs`, or a path reference to
such a place, within `k` turns. -/
def Decls.relTarget (ds : Decls) (S : Val) (rs : List String) : ℕ → List Seg → Bool
  | 0, _ => false
  | k + 1, p =>
    match ds.written S p with
    | [] => false
    | ws => ds.writes S p && ws.any fun w => w.holdsRel || w.refs.any rs.contains ||
        w.paths.any fun q => !relPath q && ds.relTarget S rs k q

/-- Whether the document writes a relative path at all, in the schema or
in a body; a copy reads its own place only through one. -/
def Decls.writesRel (ds : Decls) (S : Val) : Bool :=
  S.holdsRel || ds.any (fun d => d.2.holdsRel)

/-- The names whose uses read as copies: those whose bodies write a
relative path, use such a name, or hold a path reference to a place
whose terms read their own place (`Decls.relTarget`), read to a fixed
point, a recursive name aside, whose uses read its body at its own
place. -/
def Decls.copyNames (ds : Decls) (S : Val) : List String :=
  if ds.writesRel S then
    ((List.range ds.length).foldl
      (fun rs _ => (ds.filter fun d => d.2.holdsRel || d.2.refs.any rs.contains ||
          d.2.paths.any fun q => !relPath q && ds.relTarget S rs (S.size + 1) q).map (·.1)) []).filter
      fun n => !ds.recursiveB n
  else []

/-- The places a path reference to reads as a copy, those whose terms
read their own place through a relative path or a use of a name of `rs`
(`Decls.relTarget`); none where the document writes no relative path. -/
def Decls.copyTargets (ds : Decls) (S : Val) (rs : List String) : List Seg → Bool :=
  if ds.writesRel S then ds.relTarget S rs (S.size + 1) else fun _ => false

/-- What a use is a copy of: a name's bodies, and for a path reference,
what the document writes at its place (`Decls.written`). -/
def Decls.useBodies (ds : Decls) (S : Val) : Use → List Val
  | .name n => (ds.filter (·.1 == n)).map (·.2)
  | .place p => ds.written S p

/-- The copies of the bodies the uses `us` read: each body of the name,
or each term the document writes at the place, its own uses read as
copies in turn, met with what `dl` reads at a place one names, and its
relative paths placed where the use stands as the schema's are
(`Val.placedT`), a spread that is one kept to be read at each member,
declared under the use's name (`useName`, `Use.key`), within `k` turns,
enough for every chain of uses that isn't recursive; a use the turns
don't reach reads as written (`Use.plain`). -/
def Decls.copies (ds : Decls) (S : Val) (rs : List String) (rt : List Seg → Bool)
    (dl : List Seg → Option Val) : ℕ → List (Use × List Seg) → Decls
  | 0, us => us.eraseDups.map fun u => (useName u.1.key u.2, u.1.plain)
  | k + 1, us =>
    (us.eraseDups.flatMap fun u =>
        (ds.useBodies S u.1).map fun b => (useName u.1.key u.2, (b.atUses rs rt dl u.2).placedT u.2)) ++
      ds.copies S rs rt dl k (us.eraseDups.flatMap fun u => (ds.useBodies S u.1).flatMap fun b => b.usesAt rs rt u.2)

/-- What the data `j` writes at the places `rs` name, met; none where it
writes at none. -/
def dataLit (j : Data) (rs : List (List Seg)) : Option Val :=
  match rs.eraseDups.filterMap fun r => (j.at r).map Data.term with
  | [] => none
  | v :: vs => some (vs.foldl .meet v)

/-- A document with each relative path it writes made absolute where it
stands: the schema from the top (`Val.placedT`), each body at its
name's own place (`Seg.own`), as both ports place a body, and in either, each use of a name whose uses read as
copies (`Decls.copyNames`) read as the copy of the body placed where the
use stands, and each path reference to a place whose terms read their
own place (`Decls.copyTargets`) as the copy of what the document writes
there, each met with what the data `oj` writes at the place it names
where it's given (`Decls.copies`, ruling 26). Each place a spread
that is a relative path names where the schema writes it (`Val.bares`)
is declared too, under a name no term refers to (`bareName`), since
both ports read such a spread there as well as at each member, so that
one naming nothing is an `error` with no member to read it at. -/
def Decls.placed (ds : Decls) (S : Val) (oj : Option Data := none) : Decls × Val :=
  let rs := ds.copyNames S
  let rt := ds.copyTargets S rs
  let dl : List Seg → Option Val := fun p => oj.bind fun j => dataLit j (ds.writtenAt S p)
  let own (n : String) : List Seg := [.own n]
  (ds.map (fun d => (d.1, (d.2.atUses rs rt dl (own d.1)).placed (own d.1))) ++
      ds.copies S rs rt dl (ds.length + S.size + 1) (S.usesAt rs rt [] ++ ds.flatMap fun d => d.2.usesAt rs rt (own d.1)) ++
      (S.bares []).map fun p => (bareName, .path p),
    (S.atUses rs rt dl []).placedT [])

/-- A document's declarations with the relation kind declared under its
name, which a `rel` reads as (`relKind`). -/
def Decls.withRel (ds : Decls) : Decls := ds ++ [(relName, relKind)]

/-- A document with its links read, `r` reading a document to its roots,
the links and their targets read there: the relation kind declared
(`Decls.withRel`), its relative paths placed (`Decls.placed`), the
sources its moves read hidden (`Decls.withMoves`), and its links'
templates met into their targets (`Decls.withRefers`). -/
def Decls.linked (ds : Decls) (S : Val) (r : Decls → Val → List Val := Decls.rootsS)
    (oj : Option Data := none) : Decls × Val :=
  ((ds.withRel.placed S oj).1,
    (ds.withRel.placed S oj).1.withRefers r ((ds.withRel.placed S oj).1.withMoves r (ds.withRel.placed S oj).2))

/-- The tree a document's spreads are read at, `r` reading a document to
its roots: the last root of the document with its links read, each
template that reads its member's place blanked (`Val.opened`), so that
the tree holds the members the templates and the links write and none
of the places the templates read; `any` where no spread reads its
member's place. -/
def Decls.spreadRoot (ds : Decls) (S : Val) (rl r : Decls → Val → List Val) (oj : Option Data := none) :
    Val :=
  if (ds.linked S rl oj).2.perMembers || (ds.linked S rl oj).1.any (·.2.perMembers) then
    (r ((ds.linked S rl oj).1.map fun d => (d.1, d.2.opened)) (ds.linked S rl oj).2.opened).getLast?.getD .any
  else .any

/-! ## A path in a disjunction's arm reads where the arm holds

Both ports read a path written in an arm of a disjunction in the
document where the disjunction holds that arm, once it's the one arm
left, and drop an arm whose path names nothing there, where a path from
outside into an arm names nothing. The definition reads each arm so: in
the document with the arm in the disjunction's place, its templates at
the members it holds there, and its paths as names of the arm's own,
declared from that document's roots. -/

/-- Whether a name is one a path is read as (`pathName`): `$` alone, or
`$` and a step, so that a variable's name, `$` and a letter, and an
arm's own name (`Val.armed`), `$|`, are no path's. -/
def pathNamed (n : String) : Bool :=
  match n.toList with
  | ['$'] => true
  | '$' :: c :: _ => c == '.' || c == '#' || c == '$' || c == '^' || c == '%'
  | _ => false

mutual
/-- The term with each name a path is read as (`pathName`, which begins
with `$`) read under a name of the arm's own: `$`, `pre`, and the
path's name, which no document can write. -/
def Val.armed (pre : String) : Val → Val
  | .alias n => if pathNamed n then .alias ("$" ++ pre ++ n) else .alias n
  | .len c => .len (c.armed pre)
  | .map fs spread closed => .map (amFields pre fs) (amSpread pre spread) closed
  | .list items spread closed => .list (amItems pre items) (amSpread pre spread) closed
  | .or arms => .or (amArms pre arms)
  | .pref r x => .pref r (x.armed pre)
  | .meet a b => .meet (a.armed pre) (b.armed pre)
  | .nof n cs => .nof (n.armed pre) (amItems pre cs)
  | .must c m => .must (c.armed pre) m
  | .when c t e => .when (c.armed pre) (t.armed pre) (amSpread pre e)
  | .contains c n => .contains (c.armed pre) (n.armed pre)
  | .rest t cs => .rest (t.armed pre) (amCovers pre cs)
  | .select s arms d => .select (s.armed pre) (amPairs pre arms) (amSpread pre d)
  | .filter s c => .filter (s.armed pre) (c.armed pre)
  | .call f args => .call f (amItems pre args)
  | .ride rd v r => .ride rd (v.armed pre) r
  | .link v lt => .link (v.armed pre) lt
  | v => v

def amPairs (pre : String) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.armed pre, r.armed pre) :: amPairs pre ps

def amCovers (pre : String) : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (amSpread pre c, amSpread pre k, amSpread pre m) :: amCovers pre cs

def amFields (pre : String) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.armed pre) :: amFields pre fs

def amItems (pre : String) : List Val → List Val
  | [] => []
  | v :: vs => v.armed pre :: amItems pre vs

def amSpread (pre : String) : Option Val → Option Val
  | none => none
  | some s => some (s.armed pre)

def amArms (pre : String) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.armed pre) :: amArms pre as
end

mutual
/-- Each disjunction and each lone preference the term `v`, standing at
`pos`, holds through maps by key, lists by index, meets, riders and
links: its address in the term, the steps that reach it
(`Val.replaceAt`), where it stands, and the disjunction or the
preference; and each one an arm or a preferred value holds, before the
node that holds it, so that an inner node is read before the arm it
stands in. -/
def Val.orNodes (pos : List Seg) (addr : List ℕ) : Val → List (List ℕ × List Seg × Val)
  | .or arms => onArms pos addr 0 arms ++ [(addr, pos, .or arms)]
  | .pref r x => x.orNodes pos (addr ++ [0]) ++ [(addr, pos, .pref r x)]
  | .map fs _ _ => onFields pos addr 0 fs
  | .list items _ _ => onItems pos addr 0 items
  | .meet a b => a.orNodes pos (addr ++ [0]) ++ b.orNodes pos (addr ++ [1])
  | .ride _ v _ => v.orNodes pos (addr ++ [0])
  | .link v _ => v.orNodes pos (addr ++ [0])
  | _ => []

def onFields (pos : List Seg) (addr : List ℕ) : ℕ → List (String × Bool × Val) →
    List (List ℕ × List Seg × Val)
  | _, [] => []
  | j, (k, _, v) :: fs => v.orNodes (pos ++ [.key k]) (addr ++ [j]) ++ onFields pos addr (j + 1) fs

def onItems (pos : List Seg) (addr : List ℕ) : ℕ → List Val → List (List ℕ × List Seg × Val)
  | _, [] => []
  | j, v :: vs => v.orNodes (pos ++ [.idx j]) (addr ++ [j]) ++ onItems pos addr (j + 1) vs

def onArms (pos : List Seg) (addr : List ℕ) : ℕ → List (ℕ × Val) → List (List ℕ × List Seg × Val)
  | _, [] => []
  | j, (_, a) :: as => a.orNodes pos (addr ++ [j]) ++ onArms pos addr (j + 1) as
end

/-- The arms a disjunction's paths read in, and a lone preference's
one, the value it prefers. -/
def Val.nodeArms : Val → List (ℕ × Val)
  | .or arms => arms
  | .pref r x => [(r, x)]
  | _ => []

/-- The term with the term at the address `a` (`Val.orNodes`) replaced
by `x`: a map's member and a list's element by their place, a meet's
side by `0` or `1`, a rider's value, a disjunction's arm by its place
and a preference's value. -/
def Val.replaceAt : List ℕ → Val → Val → Val
  | [], _, x => x
  | j :: a, .map fs s c, x =>
    match fs[j]? with
    | some (k, o, v) => .map (fs.set j (k, o, Val.replaceAt a v x)) s c
    | none => .map fs s c
  | j :: a, .list items s c, x =>
    match items[j]? with
    | some v => .list (items.set j (Val.replaceAt a v x)) s c
    | none => .list items s c
  | 0 :: a, .meet l r, x => .meet (Val.replaceAt a l x) r
  | _ :: a, .meet l r, x => .meet l (Val.replaceAt a r x)
  | _ :: a, .ride k v r, x => .ride k (Val.replaceAt a v x) r
  | _ :: a, .link v t, x => .link (Val.replaceAt a v x) t
  | j :: a, .or arms, x =>
    match arms[j]? with
    | some (rk, b) => .or (arms.set j (rk, Val.replaceAt a b x))
    | none => .or arms
  | _ :: a, .pref r v, x => .pref r (Val.replaceAt a v x)
  | _ :: _, v, _ => v
termination_by structural a _ _ => a

/-- The term with `x` at the address `a`, each disjunction on the way
read as the arm the address passes through and each preference as its
value: the document where those arms hold. -/
def Val.chooseAt : List ℕ → Val → Val → Val
  | [], _, x => x
  | j :: a, .map fs s c, x =>
    match fs[j]? with
    | some (k, o, v) => .map (fs.set j (k, o, Val.chooseAt a v x)) s c
    | none => .map fs s c
  | j :: a, .list items s c, x =>
    match items[j]? with
    | some v => .list (items.set j (Val.chooseAt a v x)) s c
    | none => .list items s c
  | 0 :: a, .meet l r, x => .meet (Val.chooseAt a l x) r
  | _ :: a, .meet l r, x => .meet l (Val.chooseAt a r x)
  | _ :: a, .ride k v r, x => .ride k (Val.chooseAt a v x) r
  | _ :: a, .link v t, x => .link (Val.chooseAt a v x) t
  | j :: a, .or arms, x =>
    match arms[j]? with
    | some (_, b) => Val.chooseAt a b x
    | none => .or arms
  | _ :: a, .pref _ v, x => Val.chooseAt a v x
  | _ :: _, v, _ => v
termination_by structural a _ _ => a

/-- The term at the address `a` (`Val.orNodes`), if the term holds one. -/
def Val.termAt : List ℕ → Val → Option Val
  | [], v => some v
  | j :: a, .map fs _ _ => (fs[j]?).bind fun f => Val.termAt a f.2.2
  | j :: a, .list items _ _ => (items[j]?).bind (Val.termAt a)
  | 0 :: a, .meet l _ => Val.termAt a l
  | _ :: a, .meet _ r => Val.termAt a r
  | _ :: a, .ride _ v _ => Val.termAt a v
  | _ :: a, .link v _ => Val.termAt a v
  | j :: a, .or arms => (arms[j]?).bind fun p => Val.termAt a p.2
  | _ :: a, .pref _ v => Val.termAt a v
  | _ :: _, _ => none
termination_by structural a _ => a

mutual
/-- The term with each use of a name `f` picks, through maps by key,
lists by index, meets, riders and links, read as `g` reads the name. -/
def Val.unfoldAt (f : String → Bool) (g : String → Val) : Val → Val
  | .alias n => if f n then g n else .alias n
  | .map fs spread closed => .map (ufFields f g fs) spread closed
  | .list items spread closed => .list (ufItems f g items) spread closed
  | .meet a b => .meet (a.unfoldAt f g) (b.unfoldAt f g)
  | .ride k v r => .ride k (v.unfoldAt f g) r
  | .link v lt => .link (v.unfoldAt f g) lt
  | v => v

def ufFields (f : String → Bool) (g : String → Val) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.unfoldAt f g) :: ufFields f g fs

def ufItems (f : String → Bool) (g : String → Val) : List Val → List Val
  | [] => []
  | v :: vs => v.unfoldAt f g :: ufItems f g vs
end

/-- The name of the arm `i` of the disjunction named `tag`, which heads
the names its paths are read under (`Val.armed`). -/
def armPre (tag : String) (i : ℕ) : String := "|" ++ tag ++ "|" ++ toString i ++ "|"

/-- Whether an arm holds something its place reads: a path, a template
that reads its member's place, or a name, whose body may hold one. -/
def Val.armReads (a : Val) : Bool := !a.paths.isEmpty || a.perMembers || !a.refs.isEmpty

/-- The arm `a` of a disjunction standing at `pos`, read where it holds,
`doc` the document with a term in the disjunction's place and `root` the
tree that document with the arm there holds where the disjunction
stands: each name it uses read as its bodies (`expandF`), since a copy
is read where its use stands, its selections' results and its templates
read at the members `root` holds (`Decls.armsRead`,
`Decls.membersRead`), under the declarations `L1` as written; and its
paths read as names of its own, under `pre` (`Val.armed`), declared
from the roots `r` reads the document with the arm read so in the
disjunction's place, with each path the declared terms read in turn, so
that a chain of paths reads within the arm; `nil` where a path that must
name something names nothing there, or where a path names a dead term,
since the arm is dead there with the data met in. `parent` reads it as
a lone preference's parent arm (`Decls.nodeChosen`): the parent type of
the arm with each path read as the term it names (`expand`), so that
`Val.super` lifts what the arm reads as. -/
def Decls.armChosen (L1 : Decls) (r : Decls → Val → List Val) (doc : Val → Decls × Val) (pre : String)
    (pos : List Seg) (root a : Val) (parent : Bool) : Val × Decls :=
  let a' := L1.membersRead (L1.armsRead root pos [] (expandF L1 (a.size + L1.bodiesSize + 1) a)) root pos
  let roots := r (doc a').1 (doc a').2
  let ps := (List.range ((doc a').1.docPaths (doc a').2).length).foldl
    (fun acc _ => (acc ++ acc.flatMap fun p =>
      ((doc a').1.pathIn roots p).toList.flatMap fun w => w.paths.filter placePath).eraseDups)
    (a'.paths.filter placePath).eraseDups
  if ((a'.forgive.paths.filter placePath).all fun p => ((doc a').1.pathIn roots p).isSome) &&
      !(((doc a').1.ofPaths roots ps).any fun d => d.2.dead) then
    if parent then
      ((expand ((doc a').1.ofPaths roots ps) a'.pathsToAliases).super.armed pre,
        ((doc a').1.ofPaths roots ps).map fun d => ("$" ++ pre ++ d.1, d.2.super.armed pre))
    else
      (a'.pathsToAliases.armed pre,
        ((doc a').1.ofPaths roots ps).map fun d => ("$" ++ pre ++ d.1, d.2.armed pre))
  else (.nil, [])

/-- The arms `as` of the disjunction at the node `n`, from the arm `i`
on, each read where it holds (`Decls.armChosen`) under a name of its
own, `tag` and its place among the arms (`armPre`), `doc` the document
with a term at an address and `root` the tree that document with an arm
in the disjunction's place holds there, with the declarations the arms'
paths make. -/
def Decls.armsAt (L1 : Decls) (r : Decls → Val → List Val) (doc : List ℕ → Val → Decls × Val) (tag : String)
    (n : List ℕ × List Seg × Val) (root : List ℕ × List Seg × Val → Val → Val) :
    ℕ → List (ℕ × Val) → List (ℕ × Val) × Decls
  | _, [] => ([], [])
  | i, (rk, a) :: as =>
    ((rk, (L1.armChosen r (doc n.1) (armPre tag i) n.2.1 (root n a) a false).1) ::
        (L1.armsAt r doc tag n root (i + 1) as).1,
      (L1.armChosen r (doc n.1) (armPre tag i) n.2.1 (root n a) a false).2 ++
        (L1.armsAt r doc tag n root (i + 1) as).2)

/-- The term the node `n` reads as with each arm read where it holds
(`Decls.armChosen`), and the declarations the arms' paths make: a
disjunction's arms each under a name of its own (`Decls.armsAt`), and a
lone preference `*x` as `x | super(x)`, `x` read so and its parent arm
the parent type of what `x` reads as on its own, `xS`, which is `x` with
each node inside it read before any data, its paths read where it
stands in the schema's own tree (`Decls.rootsS`), and the arm lifted
with each path read as the term it names (decision 40). -/
def Decls.nodeChosen (L1 : Decls) (r : Decls → Val → List Val) (doc : List ℕ → Val → Decls × Val)
    (tag : String) (n : List ℕ × List Seg × Val) (root : List ℕ × List Seg × Val → Val → Val) (xS : Val) :
    Val × Decls :=
  match n.2.2 with
  | .pref rk x =>
    (.or [(rk, (L1.armChosen r (doc n.1) (armPre tag 0) n.2.1 (root n x) x false).1),
        (0, (L1.armChosen Decls.rootsS (doc n.1) (armPre tag 1) n.2.1 (root n xS) xS true).1)],
      (L1.armChosen r (doc n.1) (armPre tag 0) n.2.1 (root n x) x false).2 ++
        (L1.armChosen Decls.rootsS (doc n.1) (armPre tag 1) n.2.1 (root n xS) xS true).2)
  | v => ((.or (L1.armsAt r doc tag n root 0 v.nodeArms).1), (L1.armsAt r doc tag n root 0 v.nodeArms).2)

/-- The node `n` as the term `Q` holds it now, the nodes inside it read
already. -/
def nodeIn (Q : Val) (n : List ℕ × List Seg × Val) : List ℕ × List Seg × Val :=
  (n.1, n.2.1, (Q.termAt n.1).getD n.2.2)

/-- The value a lone preference's parent arm lifts (`Decls.nodeChosen`):
what the preference prefers, as the term `QS` holds it. -/
def prefValue (QS : Val) (n : List ℕ × List Seg × Val) : Val :=
  match (nodeIn QS n).2.2 with
  | .pref _ v => v
  | v => v

/-- Whether the node `n` stands inside a lone preference among the nodes
`ns`, read after it. -/
def underPref (ns : List (List ℕ × List Seg × Val)) (n : List ℕ × List Seg × Val) : Bool :=
  ns.any fun m => match m.2.2 with
    | .pref _ _ => m.1.isPrefixOf n.1
    | _ => false

/-- The term `Q` with each arm of each disjunction and lone preference at
the nodes `ns`, from the node `k` on, read where the arm holds
(`Decls.nodeChosen`), each node as `Q` holds it when its turn comes
(`nodeIn`), so that an arm holding a node read before it holds that
node's reading, with each name the reading declares read as its term
(`expand`), the node `k` named by `tag k`, and the declarations the
arms' paths make. `QS` is the term with each node inside a lone
preference read so before any data (`Decls.rootsS`), which the
preference's parent arm lifts. -/
def Decls.armsChosen (L1 : Decls) (r : Decls → Val → List Val) (doc : List ℕ → Val → Decls × Val)
    (tag : ℕ → String) (root : List ℕ × List Seg × Val → Val → Val) :
    ℕ → List (List ℕ × List Seg × Val) → Val → Val → Val × Decls
  | _, [], Q, _ => (Q, [])
  | k, n :: ns, Q, QS =>
    let c := L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)
    let s := if underPref ns n then L1.nodeChosen Decls.rootsS doc (tag k) (nodeIn QS n) root (prefValue QS n)
      else c
    ((L1.armsChosen r doc tag root (k + 1) ns (Q.replaceAt n.1 (expand c.2 c.1))
        (QS.replaceAt n.1 (expand s.2 s.1))).1,
      c.2 ++ (L1.armsChosen r doc tag root (k + 1) ns (Q.replaceAt n.1 (expand c.2 c.1))
        (QS.replaceAt n.1 (expand s.2 s.1))).2)

/-- The disjunctions and lone preferences of a term whose arms read
something (`Val.armReads`), where `Val.orNodes` finds them from `pos`. -/
def Val.armNodes (v : Val) (pos : List Seg) : List (List ℕ × List Seg × Val) :=
  (v.orNodes pos []).filter fun n => n.2.2.nodeArms.any (·.2.armReads)

/-! ### Disjunctions met at one place -/

/-- The disjunctions among a meet's conjuncts, at any depth of the meet,
each as its arms, and the conjuncts that are no disjunction. -/
def Val.splitOrs : Val → List (List (ℕ × Val)) × List Val
  | .meet a b => (a.splitOrs.1 ++ b.splitOrs.1, a.splitOrs.2 ++ b.splitOrs.2)
  | .or arms => ([arms], [])
  | v => ([], [v])

/-- Whether a term is a lone preference, a node beside the disjunctions
of a meet (`Val.meetOrs`). -/
def Val.isPrefB : Val → Bool
  | .pref _ _ => true
  | _ => false

/-- A lone preference as the arms of a node met beside disjunctions
(`Val.meetOrs`): its value at its rank, and its parent arm kept as the
preference one rank weaker, so that the reading lifts what the value
reads as (decision 40), which the meet reads as `x | super(x)`. The
default that parent arm holds again only repeats an arm the value's own
arm makes, so it is dead wherever the rank rule could pick it. -/
def Val.prefArms : Val → List (ℕ × Val)
  | .pref r x => [(r, x), (0, .pref (r + 1) x)]
  | v => [(0, v)]

/-- A meet whose conjuncts hold a disjunction and another disjunction or a
lone preference, an arm of one of which reads its place
(`Val.armReads`), read as one disjunction of the meets of the nodes'
arms (`orMeet`), a lone preference's as `Val.prefArms` gives them,
ranked as the meet ranks them (`meetNodes`), each met with the other
conjuncts, so that a path in an arm, or in a preference's value, reads
the arm the meet makes there; any other term as written. -/
def Val.meetOrs (v : Val) : Val :=
  match v.splitOrs.1 with
  | as :: more =>
    if 2 ≤ more.length + 1 + (v.splitOrs.2.filter Val.isPrefB).length &&
        ((as :: more).any (·.any (·.2.armReads)) ||
          (v.splitOrs.2.filter Val.isPrefB).any (·.nodeArms.any (·.2.armReads))) then
      .or (((more ++ (v.splitOrs.2.filter Val.isPrefB).map Val.prefArms).foldl orMeet as).map
        fun p => (p.1, (v.splitOrs.2.filter fun c => !c.isPrefB).foldl .meet p.2))
    else v
  | [] => v

mutual
/-- The term with each meet of disjunctions read as one (`Val.meetOrs`),
the meets inside it first, through maps by key, lists by index,
disjunctions' arms, preferred values, meets, riders and links, where
`Val.orNodes` finds the disjunctions. -/
def Val.distributed : Val → Val
  | .meet a b => (Val.meet a.distributed b.distributed).meetOrs
  | .map fs s c => .map (dsFields fs) s c
  | .list items s c => .list (dsItems items) s c
  | .or arms => .or (dsArms arms)
  | .pref r x => .pref r x.distributed
  | .ride k v r => .ride k v.distributed r
  | .link v t => .link v.distributed t
  | v => v

def dsFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.distributed) :: dsFields fs

def dsItems : List Val → List Val
  | [] => []
  | v :: vs => v.distributed :: dsItems vs

def dsArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.distributed) :: dsArms as
end

/-- The tree a document a reader `r` reads holds at `pos`, its templates
blanked (`Val.opened`), under the declarations `ds` blanked so too. -/
def Decls.treeAt (ds : Decls) (r : Decls → Val → List Val) (T : Val) (pos : List Seg) : Val :=
  (((r (ds.map fun d => (d.1, d.2.opened)) T.opened).getLast?.getD .any).at pos).getD .any

/-- The one-member document a body reads at its own place, `%` and its
name, as `Decls.bodyAt` reads the place. -/
def ownDoc (n : String) (b : Val) : Val := .map [("%" ++ n, false, b)] none false

/-- A document's declarations `ds'` and schema `P`, read with each arm of
each disjunction they hold read where it holds (`Decls.armsChosen`): the
schema's own, at the nodes `ns`, in the document itself, `root` the tree
it holds where a disjunction stands with an arm there, and each body's
at its own place, in the one-member document it reads there
(`ownDoc`); a declaration `drop` names left out where nothing the
reading keeps still uses it, since its use is read in an arm. -/
def Decls.readArms (L1 ds' : Decls) (r : Decls → Val → List Val) (P : Val)
    (ns : List (List ℕ × List Seg × Val)) (root : List ℕ × List Seg × Val → Val → Val)
    (isBody : String → Bool) (drop : List String) : Decls × Val :=
  let own (d : String × Val) : Val × Decls :=
    L1.armsChosen r (fun a x => (ds', ownDoc d.1 (d.2.chooseAt a x))) (fun k => d.1 ++ "#" ++ toString k)
      (fun n a => L1.treeAt r (ownDoc d.1 (d.2.chooseAt n.1 a)) n.2.1) 0 (d.2.armNodes [.own d.1]) d.2 d.2
  let top := L1.armsChosen r (fun a x => (ds', P.chooseAt a x)) toString root 0 ns P P
  let owned : Decls := ds'.map fun d => if isBody d.1 then (d.1, (own d).1) else d
  let armDs : Decls := (ds'.filter (isBody ·.1)).flatMap (fun d => (own d).2) ++ top.2
  let used := (List.range ds'.length).foldl
    (fun acc _ => acc ++ (owned.filter fun d => drop.contains d.1 && acc.contains d.1).flatMap (·.2.refs))
    (top.1.refs ++ armDs.flatMap (·.2.refs) ++ (owned.filter fun d => !drop.contains d.1).flatMap (·.2.refs))
  (owned.filter (fun d => isBody d.1 || !drop.contains d.1 || used.contains d.1) ++ armDs, top.1)

/-- A document as the definition reads it, `rl` reading a document to the
roots its links are read in and `r` to those its spreads are read at:
its links read (`Decls.linked`), and each spread whose template reads
its member's place read at each member where it lands, a name's body
among the places (`Decls.membersRead`), in the tree `Decls.spreadRoot`
reads, a member a link's template makes among them, and in each result a
selection can take, where the selection stands (`Decls.armsRead`); each
body read at its own place too (`Decls.ownRead`), and each copy whose
templates that reading reaches (`Decls.reached`, `Decls.armsReached`)
left to admit any member, since each is read where the copy stands, its
selections' results read there (`Decls.copyArms`, `Decls.usePlaces`);
the data `oj`, where it's given, met into each copy of a place it writes
at (`Decls.placed`). -/
def Decls.prepared (ds : Decls) (S : Val) (rl r : Decls → Val → List Val) (oj : Option Data := none) :
    Decls × Val :=
  let L := ds.linked S rl oj
  let root := ds.spreadRoot S rl r oj
  let isBody (n : String) : Bool := ds.withRel.any (·.1 == n)
  let places := L.1.usePlaces L.2
  let orNames := (L.1.filter fun d => !isBody d.1 && !(d.2.armNodes []).isEmpty).map (·.1)
  let T := L.2.unfoldAt orNames.contains fun n => expandF L.1 1 (.alias n)
  let P := (L.1.membersRead (L.1.armsRead root [] [] T) root []).distributed
  let ns := P.armNodes []
  let armRoot (n : List ℕ × List Seg × Val) (a : Val) : Val := L.1.treeAt r (P.chooseAt n.1 a) n.2.1
  let reached := L.1.reached T root ++ L.1.armsReached root [] T ++
    (L.1.filter (isBody ·.1)).flatMap (fun b =>
      L.1.reached b.2 (L.1.ownRoot b) ++ L.1.armsReached (L.1.ownRoot b) [] b.2) ++
    (L.1.filter (!isBody ·.1)).flatMap (fun c =>
      ((places.lookup c.1).map fun q => L.1.armsReached root q c.2).getD []) ++
    ns.flatMap fun n => n.2.2.nodeArms.flatMap fun a =>
      L.1.reached a.2 (armRoot n a.2) ++ L.1.armsReached (armRoot n a.2) [] a.2
  let ds' : Decls := L.1.map fun d =>
    (d.1, if isBody d.1 then (L.1.ownRead d).distributed
      else if reached.contains d.1 then (L.1.copyArms root places d).neutral else d.2)
  let armUses := (List.range L.1.length).foldl
    (fun acc _ => acc ++ (L.1.filter fun d => acc.contains d.1).flatMap (·.2.refs))
    (ns.flatMap fun n => n.2.2.nodeArms.flatMap (·.2.refs))
  L.1.readArms ds' r P ns armRoot isBody (armUses ++ orNames)

/-- A document as the definition reads it before any data: its links and
its spreads read in the schema's own tree (`Decls.rootsS`). -/
def Decls.preparedS (ds : Decls) (S : Val) : Decls × Val :=
  ds.prepared S Decls.rootsS Decls.rootsS

/-- The roots a document's links are read in beside data: the tree the
data reads in (`Decls.rootsD`), so that an address the data supplies is
read, checked and met into its target (ruling 37); or the schema's own
tree, for a document read before any data with a name that refers to
itself with nothing between, an `error` whatever the data is. -/
def Decls.linkReader (ds : Decls) (S : Val) (j : Data) : Decls → Val → List Val :=
  if ((ds.preparedS S).1.withPathsS (ds.preparedS S).2).1.guardedB then fun d T => d.rootsD T j
  else Decls.rootsS

/-- The document as the definition reads it beside data: its links read
in the roots `Decls.linkReader` picks, its spreads at the members of the
tree the data reads in (`Decls.rootsD`), and what the data writes at a
place met into each copy of the place, the copies its declarations hold
among them. -/
def Decls.preparedD (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ds.prepared S (ds.linkReader S j) (fun d T => d.rootsD T j) (some j)

theorem hideAt_checkableA : ∀ p, (hideAt p).CheckableA
  | [] => .ride .any
  | .key _ :: p => .map (fun _ _ _ hv => by
      simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hv
      rw [hv.2.2]; exact hideAt_checkableA p) (fun _ h => nomatch h)
  | .idx i :: p => .list (fun v hv => by
      rcases List.mem_append.mp hv with h | h
      · rw [List.eq_of_mem_replicate h]; exact .any
      · rw [List.mem_singleton.mp h]; exact hideAt_checkableA p) (fun _ h => nomatch h)
  | .var _ :: _ | .up _ :: _ | .node :: _ | .own _ :: _ | .lands _ :: _ => .any

theorem foldl_hide_checkableA : ∀ (ps : List (List Seg)) {S : Val}, S.CheckableA →
    (ps.foldl (fun acc p => Val.meet acc (hideAt p)) S).CheckableA
  | [], _, h => h
  | p :: ps, _, h => foldl_hide_checkableA ps (.meet h (hideAt_checkableA p))

/-- A schema the checker can read reads with its moves' sources hidden. -/
theorem withMoves_checkableA {ds : Decls} {r : Decls → Val → List Val} {S : Val} (h : S.CheckableA) :
    (ds.withMoves r S).CheckableA :=
  foldl_hide_checkableA _ h

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
  next v t heq =>
    rw [heq] at hi
    cases hi with
    | link hv _ =>
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

/-- One step of reading what the document writes at a place leaves
terms the checker can read, where the schema and the bodies are such
terms. -/
theorem stepMembers_checkableA {t : Val} (ht : t.CheckableA) {s : Seg} {p : List Seg} :
    ∀ j, j ∈ t.stepMembers s p → j.1.CheckableA := by
  intro j hj
  unfold Val.stepMembers at hj
  split at hj
  · cases ht with
    | map hf _ =>
      simp only [List.mem_map, List.mem_filter] at hj
      obtain ⟨⟨k', o', v'⟩, ⟨hm, -⟩, rfl⟩ := hj
      exact hf k' o' v' hm
  · cases ht with
    | list hi _ =>
      simp only [List.mem_map, Option.mem_toList] at hj
      obtain ⟨w, hw, rfl⟩ := hj
      exact hi w (List.mem_of_getElem? hw)
  · simp at hj

theorem landStepAt_checkableA {ds : Decls} {S : Val} {tm : Bool} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) {i : Val × List Seg × List Seg} (hi : i.1.CheckableA) :
    (∀ u, u ∈ (ds.landStepAt S tm i).1 → u.CheckableA) ∧
      (∀ j, j ∈ (ds.landStepAt S tm i).2 → j.1.CheckableA) := by
  obtain ⟨t, pos, rest⟩ := i
  simp only at hi
  simp only [Decls.landStepAt]
  split
  · cases hi with
    | meet ha hb' =>
      refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
      simp only [List.mem_cons, List.mem_nil_iff, or_false] at hj
      rcases hj with rfl | rfl
      · exact ha
      · exact hb'
  · split
    · exact ⟨fun _ h => (nomatch h), fun _ h => (nomatch h)⟩
    · refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
      simp only [List.mem_singleton] at hj
      rw [hj]; exact hS
  · refine ⟨fun u hu => ?_, fun _ h => (nomatch h)⟩
    simp only [List.mem_singleton] at hu
    rw [hu]; exact hi
  · cases hi with
    | ride hv =>
      refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
      simp only [List.mem_singleton] at hj
      rw [hj]; exact hv
  · cases hi with
    | link hv _ =>
      refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
      simp only [List.mem_singleton] at hj
      rw [hj]; exact hv
  · refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
    simp only [List.mem_map, List.mem_filter] at hj
    obtain ⟨d, ⟨hd, -⟩, rfl⟩ := hj
    exact hb d hd
  · refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
    simp only [List.mem_map] at hj
    obtain ⟨w, hw, rfl⟩ := hj
    split at hw
    · exact stepItems_checkableA hi w hw
    · exact stepMembers_checkableA hi w hw

/-- What the document writes at a place, where the schema and the bodies
are terms the checker can read, is too. -/
theorem landingAt_checkableA {ds : Decls} {S : Val} {tm : Bool} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) :
    ∀ (n : ℕ) (items : List (Val × List Seg × List Seg)), (∀ i, i ∈ items → i.1.CheckableA) →
      ∀ u, u ∈ ds.landingAt S tm n items → u.CheckableA
  | 0, _, _, _, h => by simp [Decls.landingAt] at h
  | _ + 1, [], _, _, h => by simp [Decls.landingAt] at h
  | n + 1, i :: rest, hi, u, h => by
    have hs := landStepAt_checkableA (tm := tm) hb hS (hi i List.mem_cons_self)
    simp only [Decls.landingAt, List.mem_append] at h
    rcases h with h | h
    · exact hs.1 u h
    · refine landingAt_checkableA hb hS n _ (fun j hj => ?_) u h
      rw [List.mem_append] at hj
      rcases hj with hj | hj
      · exact hs.2 j hj
      · exact hi j (List.mem_cons_of_mem _ hj)

theorem written_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) {p : List Seg} : ∀ u, u ∈ ds.written S p → u.CheckableA :=
  landingAt_checkableA hb hS _ _ (fun i hi => by
    simp only [List.mem_singleton] at hi
    rw [hi]; exact hS)

theorem useBodies_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : ∀ (u : Use) b, b ∈ ds.useBodies S u → b.CheckableA
  | .name n, b, h => by
    simp only [Decls.useBodies, List.mem_map, List.mem_filter] at h
    obtain ⟨d, ⟨hd, -⟩, rfl⟩ := h
    exact hb d hd
  | .place _, b, h => written_checkableA hb hS b h

/-- The data's terms met are a term the checker can read. -/
theorem dataLit_checkableA {j : Data} {rs : List (List Seg)} {w : Val} (h : dataLit j rs = some w) :
    w.CheckableA := by
  unfold dataLit at h
  split at h
  · exact nomatch h
  · next v vs hm =>
    simp only [Option.some.injEq] at h
    subst h
    have hall : ∀ x, x ∈ v :: vs → x.CheckableA := by
      intro x hx
      rw [← hm] at hx
      simp only [List.mem_filterMap, Option.map_eq_some_iff] at hx
      obtain ⟨_, _, _, _, rfl⟩ := hx
      exact Data.term_checkableA _
    have key : ∀ (l : List Val) (acc : Val), acc.CheckableA → (∀ x, x ∈ l → x.CheckableA) →
        (l.foldl .meet acc).CheckableA := by
      intro l
      induction l with
      | nil => intro acc ha _; exact ha
      | cons x xs ih =>
        intro acc ha hx
        exact ih _ (.meet ha (hx x List.mem_cons_self)) (fun y hy => hx y (List.mem_cons_of_mem _ hy))
    exact key vs v (hall v List.mem_cons_self) (fun x hx => hall x (List.mem_cons_of_mem _ hx))

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

/-- The verdict of a document with paths whose sources are read in: the
document prepared (`Decls.prepared`), the relation kind declared, its
relative paths placed, the sources its moves read hidden, its links'
templates met into their targets and its spreads read at each member,
the verdict of the document whose paths are absolute. The error class
reads a spread at the members the schema's own tree holds, and the
others at those of the tree the data reads in, so that a member the
data alone supplies makes the document `invalid`, never an `error`. -/
def VetL (m : Mode) (ds : Decls) (S : Val) (j : Data) (v : Verdict) : Prop :=
  VetA m (ds.preparedS S).1 (ds.preparedS S).2 (ds.preparedD S j).1 (ds.preparedD S j).2 j v

/-- The verdict of a document with paths whose sources are read in,
computed. -/
def vetL (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  vetA m (ds.preparedS S).1 (ds.preparedS S).2 (ds.preparedD S j).1 (ds.preparedD S j).2 j

/-- The verdict of a document with paths: the document with the sources
it loads read in where it loads them (`Decls.loaded`), and its verdict
as `VetL` gives it; an `error` where a load is left the reading couldn't
make (`Decls.loadsLeft`), wherever it stands, since both ports read
every load before anything else reads the document, so a selection
that leaves the load's arm out doesn't excuse it. -/
def VetP (m : Mode) (ds : Decls) (S : Val) (j : Data) (v : Verdict) : Prop :=
  if ds.loadsLeft S then v = .error else VetL m (ds.loaded S).1 (ds.loaded S).2 j v

/-- The verdict with paths, computed. -/
def vetP (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if ds.loadsLeft S then .error else vetL m (ds.loaded S).1 (ds.loaded S).2 j

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
theorem ptaCall_checkableA {f : Fn} {args : List Val}
    (h : ∀ a, a ∈ args → a.pathsToAliases.CheckableA) : ∀ w, w ∈ ptaCall f args → w.CheckableA := by
  intro w hw
  unfold ptaCall at hw
  split at hw
  · split at hw <;> (simp only [List.mem_singleton] at hw; subst hw)
    · exact .ride (h _ (List.mem_singleton.mpr rfl))
    · exact h _ (List.mem_singleton.mpr rfl)
  · exact nomatch hw
  · rcases List.mem_cons.mp hw with rfl | hw
    · exact h _ (List.mem_cons.mpr (.inl rfl))
    · obtain ⟨a, ha, rfl⟩ := mem_ptaItems.mp hw
      exact h a (List.mem_cons.mpr (.inr ha))

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
  | link _ ht ih _ => exact .link ih ht
  | meet _ _ iha ihb => exact .meet iha ihb
  | path => simp only [Val.pathsToAliases]; split <;> constructor
  | @nof n cs _ _ ihn ihcs =>
    refine .nof ihn fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_ptaItems.mp hm
    exact ihcs c hc
  | @call f args _ ih => exact .call (ptaCall_checkableA ih)
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
    w ∈ plArgs pos f args → ∃ v, v ∈ args ∧ ((∃ q, w = v.placed q) ∨ w = v)
  | [], _, h => by simp [plArgs] at h
  | v :: vs, w, h => by
    simp only [plArgs, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, .inl ⟨_, rfl⟩⟩
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
theorem plBare_checkableA {pos : List Seg} {spread : Option Val} (hs : ∀ s, spread = some s → s.CheckableA) :
    ∀ s, plBare pos spread = some s → s.CheckableA := by
  intro s h
  unfold plBare at h
  split at h
  · injection h with h
    subst h
    exact .path
  · exact hs s h

theorem placed_checkableA {v : Val} (h : v.CheckableA) : ∀ pos, (v.placed pos).CheckableA := by
  induction h with
  | len _ ih => intro pos; exact .len (ih pos)
  | @map fs spread closed _ hs ihf _ =>
    intro pos
    refine .map ?_ (plBare_checkableA hs)
    intro k o w hm
    obtain ⟨v, hv, rfl⟩ := mem_plFields.mp hm
    exact ihf k o v hv _
  | @list items spread closed _ hs ihi _ =>
    intro pos
    refine .list ?_ (plBare_checkableA hs)
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
  | link _ ht ih _ => intro pos; exact .link (ih pos) ht
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
    | .node :: _ => exact .path
    | .own _ :: _ => exact .path
    | .lands _ :: _ => exact .path
  | @nof n cs _ _ ihn ihcs =>
    intro pos
    refine .nof (ihn pos) fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_plItems.mp hm
    exact ihcs c hc pos
  | @call f args hargs ih =>
    intro pos
    refine .call fun w hm => ?_
    obtain ⟨a, ha, ⟨q, hw⟩ | hw⟩ := mem_plArgs hm
    · rw [hw]; exact ih a ha q
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

theorem mem_mlFields {ld : String → Option Val} {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ mlFields ld fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.mapLoads ld := by
  induction fs with
  | nil => simp [mlFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [mlFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_mlPairs {ld : String → Option Val} {ps : List (Val × Val)} {p r : Val} :
    (p, r) ∈ mlPairs ld ps ↔ ∃ p₀ r₀, (p₀, r₀) ∈ ps ∧ p = p₀.mapLoads ld ∧ r = r₀.mapLoads ld := by
  induction ps with
  | nil => simp [mlPairs]
  | cons q ps ih =>
    obtain ⟨p', r'⟩ := q
    simp only [mlPairs, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨p₀, r₀, hm, rfl, rfl⟩)
      · exact ⟨p', r', Or.inl ⟨rfl, rfl⟩, rfl, rfl⟩
      · exact ⟨p₀, r₀, Or.inr hm, rfl, rfl⟩
    · rintro ⟨p₀, r₀, ⟨rfl, rfl⟩ | hm, rfl, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨p₀, r₀, hm, rfl, rfl⟩

theorem mem_mlItems {ld : String → Option Val} {items : List Val} {w : Val} :
    w ∈ mlItems ld items ↔ ∃ v, v ∈ items ∧ w = v.mapLoads ld := by
  induction items with
  | nil => simp [mlItems]
  | cons v vs ih =>
    simp only [mlItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

theorem mlSpread_eq {ld : String → Option Val} {spread : Option Val} {t : Val} :
    mlSpread ld spread = some t ↔ ∃ s, spread = some s ∧ t = s.mapLoads ld := by
  cases spread with
  | none => simp [mlSpread]
  | some s =>
    simp only [mlSpread, Option.some.injEq]
    exact ⟨fun h => ⟨s, rfl, h.symm⟩, fun ⟨s', hs, ht⟩ => by cases hs; exact ht.symm⟩

theorem mem_mlCovers {ld : String → Option Val} {cs : List Cover} {c' : Cover} :
    c' ∈ mlCovers ld cs ↔ ∃ c, c ∈ cs ∧ c' = (mlSpread ld c.1, mlSpread ld c.2.1, mlSpread ld c.2.2) := by
  induction cs with
  | nil => simp [mlCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [mlCovers, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨d, hd, rfl⟩)
      · exact ⟨(a, k, m), .inl rfl, rfl⟩
      · exact ⟨d, .inr hd, rfl⟩
    · rintro ⟨d, rfl | hd, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨d, hd, rfl⟩

theorem mem_mlArms {ld : String → Option Val} {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ mlArms ld arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.mapLoads ld := by
  induction arms with
  | nil => simp [mlArms]
  | cons q qs ih =>
    obtain ⟨r', a'⟩ := q
    simp only [mlArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

/-- A term the checker can read, its paths read as names, is one it can read. -/
theorem mapLoads_checkableA {ld : String → Option Val} (hk : ∀ p w, ld p = some w → w.CheckableA)
    {v : Val} (h : v.CheckableA) : (v.mapLoads ld).CheckableA := by
  induction h with
  | len _ ih => exact .len ih
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_mlFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := mlSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_mlItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := mlSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_mlArms.mp hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | meet _ _ iha ihb => exact .meet iha ihb
  | @nof n cs _ _ ihn ihcs =>
    refine .nof ihn fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_mlItems.mp hm
    exact ihcs c hc
  | @call f args hargs ih =>
    simp only [Val.mapLoads]
    split
    · next p _ =>
      cases hkp : ld p with
      | none => exact .call hargs
      | some w => exact hk p w hkp
    · refine .call fun w hm => ?_
      obtain ⟨a, ha, rfl⟩ := mem_mlItems.mp hm
      exact ih a ha
  | must _ ih => exact .must ih
  | @when c t e _ _ _ ihc iht ihe =>
    refine .when ihc iht fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := mlSpread_eq.mp he
    exact ihe s hs
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    refine .rest iht ?_ ?_ ?_
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_mlCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := mlSpread_eq.mp hv
      exact ih1 c hc s hs
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_mlCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := mlSpread_eq.mp hv
      exact ih2 c hc s hs
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_mlCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := mlSpread_eq.mp hv
      exact ih3 c hc s hs
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_mlPairs.mp hm
      exact ihp p₀ r₀ hm₀
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_mlPairs.mp hm
      exact ihr p₀ r₀ hm₀
    · obtain ⟨e₀, he₀, rfl⟩ := mlSpread_eq.mp he
      exact ihd e₀ he₀
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_mlPairs.mp hm
      exact ihp p₀ r₀ hm₀
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_mlPairs.mp hm
      exact ihr p₀ r₀ hm₀
    · obtain ⟨e₀, he₀, rfl⟩ := mlSpread_eq.mp he
      exact ihd e₀ he₀
  | _ => simp only [Val.mapLoads]; constructor

theorem Decls.source?_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {q : String} {w : Val}
    (h : ds.source? q = some w) : w.CheckableA := by
  simp only [Decls.source?, Option.map_eq_some_iff] at h
  obtain ⟨d, hd, rfl⟩ := h
  exact hb d (List.mem_of_find?_eq_some hd)

theorem Decls.loadIn_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ (n : ℕ) (seen : List String) (src : String) {v : Val}, v.CheckableA → (ds.loadIn n seen src v).CheckableA
  | 0, _, _, _, h => h
  | n + 1, seen, src, _, h => by
    simp only [Decls.loadIn]
    refine mapLoads_checkableA (fun p w hw => ?_) h
    simp only [Option.bind_eq_some_iff] at hw
    obtain ⟨q, -, hq⟩ := hw
    split at hq
    · exact nomatch hq
    · obtain ⟨t, ht, rfl⟩ := Option.map_eq_some_iff.mp hq
      exact Decls.loadIn_checkableA hb n (q :: seen) q (Decls.source?_checkableA hb ht)

theorem Decls.takeBinds_alias {ds : Decls} {S : Val} {d : String × Val} (h : d ∈ ds.takeBinds S) :
    ∃ n, d.2 = .alias n := by
  simp only [Decls.takeBinds, List.mem_flatMap] at h
  obtain ⟨t, -, ht⟩ := h
  split at ht
  · simp at ht
  · simp only [List.mem_map] at ht
    obtain ⟨n, -, rfl⟩ := ht
    exact ⟨_, rfl⟩

theorem Decls.loaded_bodies_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ d, d ∈ (ds.loaded S).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.loaded, List.mem_append, List.mem_map, List.mem_filter] at hd
  rcases hd with ⟨d', ⟨hd', -⟩, rfl⟩ | hd
  · exact Decls.loadIn_checkableA hb _ _ _ (hb d' hd')
  · obtain ⟨n, hn⟩ := Decls.takeBinds_alias hd
    rw [hn]
    exact .alias

theorem Decls.loaded_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : (ds.loaded S).2.CheckableA :=
  Decls.loadIn_checkableA hb _ _ _ hS

theorem mem_ptdFields {pos : List Seg} {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ ptdFields pos fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.placedT (pos ++ [.key k]) := by
  induction fs with
  | nil => simp [ptdFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [ptdFields, List.mem_cons, Prod.mk.injEq]
    rintro (⟨rfl, rfl, rfl⟩ | hm)
    · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := ih hm
      exact ⟨v, Or.inr hv, rfl⟩

theorem mem_ptdElems {pos : List Seg} : ∀ {i : ℕ} {items : List Val} {w : Val},
    w ∈ ptdElems pos i items → ∃ v, v ∈ items ∧ ∃ j, w = v.placedT (pos ++ [.idx j])
  | _, [], _, h => by simp [ptdElems] at h
  | i, v :: vs, w, h => by
    simp only [ptdElems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, i, rfl⟩
    · obtain ⟨u, hu, j, rfl⟩ := mem_ptdElems h
      exact ⟨u, List.mem_cons_of_mem _ hu, j, rfl⟩

theorem placedT_checkableA {v : Val} (h : v.CheckableA) : ∀ pos, (v.placedT pos).CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ =>
    intro pos
    refine .map ?_ hs
    intro k o w hm
    obtain ⟨v, hv, rfl⟩ := mem_ptdFields hm
    exact ihf k o v hv _
  | @list items spread closed _ hs ihi _ =>
    intro pos
    refine .list ?_ hs
    intro w hm
    obtain ⟨v, hv, j, rfl⟩ := mem_ptdElems hm
    exact ihi v hv _
  | meet _ _ iha ihb => intro pos; exact .meet (iha pos) (ihb pos)
  | ride _ ih => intro pos; exact .ride (ih pos)
  | link _ ht ih _ => intro pos; exact .link (ih pos) ht
  | len hc _ => intro pos; exact placed_checkableA (.len hc) pos
  | or ha _ => intro pos; exact placed_checkableA (.or ha) pos
  | pref hx _ => intro pos; exact placed_checkableA (.pref hx) pos
  | nof hn hcs _ _ => intro pos; exact placed_checkableA (.nof hn hcs) pos
  | call ha _ => intro pos; exact placed_checkableA (.call ha) pos
  | must hc _ => intro pos; exact placed_checkableA (.must hc) pos
  | when hc ht he _ _ _ => intro pos; exact placed_checkableA (.when hc ht he) pos
  | contains hc hn _ _ => intro pos; exact placed_checkableA (.contains hc hn) pos
  | rest ht h1 h2 h3 _ _ _ _ => intro pos; exact placed_checkableA (.rest ht h1 h2 h3) pos
  | selectKey hp hr hd _ _ _ => intro pos; exact placed_checkableA (.selectKey hp hr hd) pos
  | selectLit hp hr hd _ _ _ => intro pos; exact placed_checkableA (.selectLit hp hr hd) pos
  | _ => intro pos; exact placed_checkableA (by constructor) pos

theorem mem_auFields {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ auFields rs rt dl pos fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.atUses rs rt dl (pos ++ [.key k]) := by
  induction fs with
  | nil => simp [auFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [auFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_auElems {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} : ∀ {i : ℕ} {items : List Val} {w : Val},
    w ∈ auElems rs rt dl pos i items → ∃ v, v ∈ items ∧ ∃ j, w = v.atUses rs rt dl (pos ++ [.idx j])
  | _, [], _, h => by simp [auElems] at h
  | i, v :: vs, w, h => by
    simp only [auElems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, i, rfl⟩
    · obtain ⟨u, hu, j, rfl⟩ := mem_auElems h
      exact ⟨u, List.mem_cons_of_mem _ hu, j, rfl⟩

theorem mem_auItems {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {items : List Val} {w : Val} :
    w ∈ auItems rs rt dl pos items ↔ ∃ v, v ∈ items ∧ w = v.atUses rs rt dl pos := by
  induction items with
  | nil => simp [auItems]
  | cons v vs ih =>
    simp only [auItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

theorem mem_auArgs {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {f : Fn} : ∀ {args : List Val} {w : Val},
    w ∈ auArgs rs rt dl pos f args → ∃ v, v ∈ args ∧ (w = v.atUses rs rt dl pos ∨ w = v)
  | [], _, h => by simp [auArgs] at h
  | v :: vs, w, h => by
    simp only [auArgs, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, .inl rfl⟩
    · split at h
      · exact ⟨w, List.mem_cons_of_mem _ h, .inr rfl⟩
      · obtain ⟨u, hu, hw⟩ := mem_auArgs h
        exact ⟨u, List.mem_cons_of_mem _ hu, hw⟩

theorem mem_auPairs {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {ps : List (Val × Val)} {p r : Val} :
    (p, r) ∈ auPairs rs rt dl pos ps ↔ ∃ p₀ r₀, (p₀, r₀) ∈ ps ∧ p = p₀.atUses rs rt dl pos ∧ r = r₀.atUses rs rt dl pos := by
  induction ps with
  | nil => simp [auPairs]
  | cons q ps ih =>
    obtain ⟨p', r'⟩ := q
    simp only [auPairs, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨p₀, r₀, hm, rfl, rfl⟩)
      · exact ⟨p', r', Or.inl ⟨rfl, rfl⟩, rfl, rfl⟩
      · exact ⟨p₀, r₀, Or.inr hm, rfl, rfl⟩
    · rintro ⟨p₀, r₀, ⟨rfl, rfl⟩ | hm, rfl, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨p₀, r₀, hm, rfl, rfl⟩

theorem auSpread_eq {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {spread : Option Val} {t : Val} :
    auSpread rs rt dl pos spread = some t ↔ ∃ s, spread = some s ∧ t = s.atUses rs rt dl pos := by
  cases spread with
  | none => simp [auSpread]
  | some s =>
    simp only [auSpread, Option.some.injEq]
    exact ⟨fun h => ⟨s, rfl, h.symm⟩, fun ⟨s', hs, ht⟩ => by cases hs; exact ht.symm⟩

theorem mem_auCovers {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {cs : List Cover} {c' : Cover} :
    c' ∈ auCovers rs rt dl pos cs ↔ ∃ c, c ∈ cs ∧ c' = (auSpread rs rt dl pos c.1, auSpread rs rt dl pos c.2.1, auSpread rs rt dl pos c.2.2) := by
  induction cs with
  | nil => simp [auCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [auCovers, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨d, hd, rfl⟩)
      · exact ⟨(a, k, m), .inl rfl, rfl⟩
      · exact ⟨d, .inr hd, rfl⟩
    · rintro ⟨d, rfl | hd, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨d, hd, rfl⟩

theorem mem_auArms {rs : List String} {rt : List Seg → Bool} {dl : List Seg → Option Val} {pos : List Seg} {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ auArms rs rt dl pos arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.atUses rs rt dl pos := by
  induction arms with
  | nil => simp [auArms]
  | cons q qs ih =>
    obtain ⟨r', a'⟩ := q
    simp only [auArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

theorem atUses_checkableA {rs : List String} {dl : List Seg → Option Val}
    (hdl : ∀ p w, dl p = some w → w.CheckableA) {v : Val} (h : v.CheckableA) :
    ∀ rt pos, (v.atUses rs rt dl pos).CheckableA := by
  induction h with
  | len _ ih => intro rt pos; exact .len (ih rt pos)
  | @map fs spread closed _ hs ihf _ =>
    intro rt pos
    refine .map ?_ hs
    intro k o w hm
    obtain ⟨v, hv, rfl⟩ := mem_auFields.mp hm
    exact ihf k o v hv rt _
  | @list items spread closed _ hs ihi _ =>
    intro rt pos
    refine .list ?_ hs
    intro w hm
    obtain ⟨v, hv, j, rfl⟩ := mem_auElems hm
    exact ihi v hv rt _
  | @or arms _ ih =>
    intro rt pos
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_auArms.mp hm
    exact ih r a ha rt pos
  | pref _ ih => intro rt pos; exact .pref (ih rt pos)
  | ride _ ih => intro rt pos; exact .ride (ih rt pos)
  | link _ ht ih _ => intro rt pos; exact .link (ih rt pos) ht
  | meet _ _ iha ihb => intro rt pos; exact .meet (iha rt pos) (ihb rt pos)
  | @alias n =>
    intro rt pos
    simp only [Val.atUses]
    split <;> exact .alias
  | @path q =>
    intro rt pos
    simp only [Val.atUses]
    split
    · unfold refUse
      split
      · next w hw => exact .meet .alias (hdl _ w hw)
      · exact .alias
    · exact .path
  | @nof n cs _ _ ihn ihcs =>
    intro rt pos
    refine .nof (ihn rt pos) fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_auItems.mp hm
    exact ihcs c hc rt pos
  | @call f args hargs ih =>
    intro rt pos
    refine .call fun w hm => ?_
    obtain ⟨a, ha, hw | hw⟩ := mem_auArgs hm
    · rw [hw]; exact ih a ha _ pos
    · rw [hw]; exact hargs a ha
  | must _ ih => intro rt pos; exact .must (ih rt pos)
  | @when c t e _ _ _ ihc iht ihe =>
    intro rt pos
    refine .when (ihc rt pos) (iht rt pos) fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := auSpread_eq.mp he
    exact ihe s hs rt pos
  | contains _ _ ihc ihn => intro rt pos; exact .contains (ihc rt pos) (ihn rt pos)
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    intro rt pos
    refine .rest (iht rt pos) ?_ ?_ ?_
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_auCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := auSpread_eq.mp hv
      exact ih1 c hc s hs rt pos
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_auCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := auSpread_eq.mp hv
      exact ih2 c hc s hs rt pos
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_auCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := auSpread_eq.mp hv
      exact ih3 c hc s hs rt pos
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    intro rt pos
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_auPairs.mp hm
      exact ihp p₀ r₀ hm₀ rt pos
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_auPairs.mp hm
      exact ihr p₀ r₀ hm₀ rt pos
    · obtain ⟨e₀, he₀, rfl⟩ := auSpread_eq.mp he
      exact ihd e₀ he₀ rt pos
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    intro rt pos
    refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_auPairs.mp hm
      exact ihp p₀ r₀ hm₀ rt pos
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_auPairs.mp hm
      exact ihr p₀ r₀ hm₀ rt pos
    · obtain ⟨e₀, he₀, rfl⟩ := auSpread_eq.mp he
      exact ihd e₀ he₀ rt pos
  | _ => intro rt pos; simp only [Val.atUses]; constructor

theorem copies_checkableA {ds : Decls} {S : Val} {rs : List String} {rt : List Seg → Bool}
    {dl : List Seg → Option Val} (hdl : ∀ p w, dl p = some w → w.CheckableA)
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    ∀ k us d, d ∈ ds.copies S rs rt dl k us → d.2.CheckableA
  | 0, _, d, h => by
    simp only [Decls.copies, List.mem_map] at h
    obtain ⟨u, -, rfl⟩ := h
    cases u.1 <;> constructor
  | k + 1, us, d, h => by
    simp only [Decls.copies, List.mem_append, List.mem_flatMap, List.mem_map] at h
    rcases h with ⟨u, -, b, hbu, rfl⟩ | h
    · exact placedT_checkableA (atUses_checkableA hdl (useBodies_checkableA hb hS u.1 b hbu) _ _) _
    · exact copies_checkableA hdl hb hS k _ d h

/-- What the data writes at the places a copy names is a term the
checker can read. -/
theorem dataAt_checkableA {ds : Decls} {S : Val} {oj : Option Data} :
    ∀ p w, (oj.bind fun j => dataLit j (ds.writtenAt S p)) = some w → w.CheckableA := by
  intro _ w h
  simp only [Option.bind_eq_some_iff] at h
  obtain ⟨_, -, h⟩ := h
  exact dataLit_checkableA h

theorem Decls.placed_bodies_checkableA {ds : Decls} {S : Val} {oj : Option Data}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    ∀ d, d ∈ (ds.placed S oj).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.placed, List.mem_append, List.mem_map] at hd
  rcases hd with (⟨d', hd', rfl⟩ | hd) | ⟨p, -, rfl⟩
  · exact placed_checkableA (atUses_checkableA dataAt_checkableA (hb d' hd') _ _) _
  · exact copies_checkableA dataAt_checkableA hb hS _ _ d hd
  · exact .path

/-- The schema with its uses read as copies, the data met into each copy
of a place it writes at, is a term the checker can read. -/
theorem Decls.placed_checkableA {ds : Decls} {S : Val} {oj : Option Data} (hS : S.CheckableA) :
    (ds.placed S oj).2.CheckableA :=
  placedT_checkableA (atUses_checkableA dataAt_checkableA hS _ []) []

/-! ## Reading a spread at each member keeps a term checkable -/

theorem ntSpread_checkableA {spread : Option Val} (hs : ∀ s, spread = some s → s.CheckableA) :
    ∀ s, ntSpread spread = some s → s.CheckableA := by
  intro s h
  cases spread with
  | none => exact nomatch h
  | some t =>
    simp only [ntSpread, Option.some.injEq] at h
    subst h
    split
    · exact .any
    · exact hs t rfl

theorem mem_ntFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ ntFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.neutral := by
  induction fs with
  | nil => simp [ntFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [ntFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_ntItems {items : List Val} {w : Val} : w ∈ ntItems items ↔ ∃ v, v ∈ items ∧ w = v.neutral := by
  induction items with
  | nil => simp [ntItems]
  | cons v vs ih =>
    simp only [ntItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

theorem relAny_checkableA {v : Val} (h : v.CheckableA) : (relAny v).CheckableA := by
  unfold relAny
  split
  · exact .any
  · exact h

theorem relWhole_checkableA {v : Val} (h : v.CheckableA) : (relWhole v).CheckableA := by
  unfold relWhole
  split
  · exact h
  · exact .any

theorem mem_rbFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ rbFields fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.relBlank := by
  induction fs with
  | nil => simp [rbFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [rbFields, List.mem_cons, Prod.mk.injEq]
    rintro (⟨rfl, rfl, rfl⟩ | hm)
    · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := ih hm
      exact ⟨v, Or.inr hv, rfl⟩

theorem mem_rbItems {items : List Val} {w : Val} : w ∈ rbItems items → ∃ v, v ∈ items ∧ w = v.relBlank := by
  induction items with
  | nil => simp [rbItems]
  | cons v vs ih =>
    simp only [rbItems, List.mem_cons]
    rintro (rfl | hm)
    · exact ⟨v, Or.inl rfl, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := ih hm
      exact ⟨u, Or.inr hu, rfl⟩

theorem relBlank_checkableA {v : Val} (h : v.CheckableA) : v.relBlank.CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ =>
    refine .map (fun k o w hm => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_rbFields hm
    exact ihf k o v hv
  | @list items spread closed _ hs ihi _ =>
    refine .list (fun w hm => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_rbItems hm
    exact ihi v hv
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | len hc _ => exact relAny_checkableA (.len hc)
  | or ha _ => exact relAny_checkableA (.or ha)
  | pref hx _ => exact relAny_checkableA (.pref hx)
  | nof hn hcs _ _ => exact relAny_checkableA (.nof hn hcs)
  | call ha _ => exact relAny_checkableA (.call ha)
  | must hc _ => exact relAny_checkableA (.must hc)
  | when hc ht he _ _ _ => exact relAny_checkableA (.when hc ht he)
  | contains hc hn _ _ => exact relAny_checkableA (.contains hc hn)
  | rest ht h1 h2 h3 _ _ _ _ => exact relAny_checkableA (.rest ht h1 h2 h3)
  | selectKey hp hr hd _ _ _ => exact relAny_checkableA (.selectKey hp hr hd)
  | selectLit hp hr hd _ _ _ => exact relAny_checkableA (.selectLit hp hr hd)
  | _ => exact relAny_checkableA (by constructor)

theorem mem_rpFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ rpFields fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.relPart := by
  induction fs with
  | nil => simp [rpFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [rpFields]
    split
    · simp only [List.mem_cons, Prod.mk.injEq]
      rintro (⟨rfl, rfl, rfl⟩ | hm)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · obtain ⟨v, hv, rfl⟩ := ih hm
        exact ⟨v, Or.inr hv, rfl⟩
    · intro hm
      obtain ⟨v, hv, rfl⟩ := ih hm
      exact ⟨v, List.mem_cons_of_mem _ hv, rfl⟩

theorem mem_rpItems {items : List Val} {w : Val} : w ∈ rpItems items → ∃ v, v ∈ items ∧ w = v.relPart := by
  induction items with
  | nil => simp [rpItems]
  | cons v vs ih =>
    simp only [rpItems, List.mem_cons]
    rintro (rfl | hm)
    · exact ⟨v, Or.inl rfl, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := ih hm
      exact ⟨u, Or.inr hu, rfl⟩

theorem relPart_checkableA {v : Val} (h : v.CheckableA) : v.relPart.CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ =>
    refine .map (fun k o w hm => ?_) (fun _ h => nomatch h)
    obtain ⟨v, hv, rfl⟩ := mem_rpFields hm
    exact ihf k o v hv
  | @list items spread closed _ hs ihi _ =>
    refine .list (fun w hm => ?_) (fun _ h => nomatch h)
    obtain ⟨v, hv, rfl⟩ := mem_rpItems hm
    exact ihi v hv
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | len hc _ => exact relWhole_checkableA (.len hc)
  | or ha _ => exact relWhole_checkableA (.or ha)
  | pref hx _ => exact relWhole_checkableA (.pref hx)
  | nof hn hcs _ _ => exact relWhole_checkableA (.nof hn hcs)
  | call ha _ => exact relWhole_checkableA (.call ha)
  | must hc _ => exact relWhole_checkableA (.must hc)
  | when hc ht he _ _ _ => exact relWhole_checkableA (.when hc ht he)
  | contains hc hn _ _ => exact relWhole_checkableA (.contains hc hn)
  | rest ht h1 h2 h3 _ _ _ _ => exact relWhole_checkableA (.rest ht h1 h2 h3)
  | selectKey hp hr hd _ _ _ => exact relWhole_checkableA (.selectKey hp hr hd)
  | selectLit hp hr hd _ _ _ => exact relWhole_checkableA (.selectLit hp hr hd)
  | _ => exact relWhole_checkableA (by constructor)

theorem ntArgs_checkableA {f : Fn} {args : List Val} (ha : ∀ a, a ∈ args → a.CheckableA)
    (iha : ∀ a, a ∈ args → a.neutral.CheckableA) : ∀ a, a ∈ ntArgs f args → a.CheckableA := by
  intro a hm
  unfold ntArgs at hm
  split at hm
  · rename_i d t
    split at hm
    · simp only [List.mem_cons, List.mem_nil_iff, or_false] at hm
      rcases hm with rfl | rfl
      · exact ha _ (by simp)
      · exact relBlank_checkableA (iha t (by simp))
    · exact ha a hm
  · exact ha a hm

theorem neutral_checkableA {v : Val} (h : v.CheckableA) : v.neutral.CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ =>
    refine .map (fun k o w hm => ?_) (ntSpread_checkableA hs)
    obtain ⟨v, hv, rfl⟩ := mem_ntFields.mp hm
    exact ihf k o v hv
  | @list items spread closed _ hs ihi _ =>
    refine .list (fun w hm => ?_) (ntSpread_checkableA hs)
    obtain ⟨v, hv, rfl⟩ := mem_ntItems.mp hm
    exact ihi v hv
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | len hc _ => exact .len hc
  | or ha _ => exact .or ha
  | pref hx _ => exact .pref hx
  | nof hn hcs _ _ => exact .nof hn hcs
  | call ha iha => exact .call (ntArgs_checkableA ha iha)
  | must hc _ => exact .must hc
  | when hc ht he _ _ _ => exact .when hc ht he
  | contains hc hn _ _ => exact .contains hc hn
  | rest ht h1 h2 h3 _ _ _ _ => exact .rest ht h1 h2 h3
  | selectKey hp hr hd _ _ _ => exact .selectKey hp hr hd
  | selectLit hp hr hd _ _ _ => exact .selectLit hp hr hd
  | _ => constructor

theorem memberSpread_checkableA {v s : Val} (h : v.CheckableA) (hs : v.memberSpread = some s) : s.CheckableA := by
  unfold Val.memberSpread at hs
  split at hs
  · split at hs
    · injection hs with hs
      subst hs
      cases h with
      | map _ h => exact h _ rfl
    · exact nomatch hs
  · split at hs
    · injection hs with hs
      subst hs
      cases h with
      | list _ h => exact h _ rfl
    · exact nomatch hs
  · exact nomatch hs

theorem genTemplate_checkableA {v u : Val} (h : v.CheckableA) (hg : v.genTemplate = some u) : u.CheckableA := by
  unfold Val.genTemplate at hg
  split at hg
  · split at hg
    · injection hg with hg
      subst hg
      cases h with
      | call ha => exact relPart_checkableA (ha _ (by simp))
    · exact nomatch hg
  · split at hg
    · injection hg with hg
      subst hg
      cases h with
      | call ha => exact relPart_checkableA (ha _ (by simp))
    · exact nomatch hg
  · exact nomatch hg

/-- A step that reads a name's bodies where it stands leaves terms the
checker can read, where the schema and the bodies are such terms. -/
theorem landStepD_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA)
    {i : Val × List Seg} (hi : i.1.CheckableA) :
    (∀ u, u ∈ (ds.landStepD S i).1 → u.CheckableA) ∧ (∀ j, j ∈ (ds.landStepD S i).2 → j.1.CheckableA) := by
  unfold Decls.landStepD
  split
  · refine ⟨fun _ h => (nomatch h), fun j hj => ?_⟩
    simp only [List.mem_map, List.mem_filter] at hj
    obtain ⟨d, ⟨hd, -⟩, rfl⟩ := hj
    exact hb d hd
  · exact landStep_checkableA hS hi

theorem landingD_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    ∀ (n : ℕ) (items : List (Val × List Seg)), (∀ i, i ∈ items → i.1.CheckableA) →
      ∀ u, u ∈ ds.landingD S n items → u.CheckableA
  | 0, _, _, _, h => by simp [Decls.landingD] at h
  | _ + 1, [], _, _, h => by simp [Decls.landingD] at h
  | n + 1, i :: rest, hi, u, h => by
    have hs := landStepD_checkableA hb hS (hi i List.mem_cons_self)
    simp only [Decls.landingD, List.mem_append] at h
    rcases h with h | h
    · exact hs.1 u h
    · refine landingD_checkableA hb hS n _ (fun j hj => ?_) u h
      rw [List.mem_append] at hj
      rcases hj with hj | hj
      · exact hs.2 j hj
      · exact hi j (List.mem_cons_of_mem _ hj)

theorem instancesAt_checkableA {ds : Decls} {P root : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hP : P.CheckableA) (base p : List Seg) : ∀ u, u ∈ ds.instancesAt P root base p → u.CheckableA := by
  intro u hu
  simp only [Decls.instancesAt, List.mem_flatMap, List.mem_append, List.mem_filterMap] at hu
  obtain ⟨w, hw, hu⟩ := hu
  have hw' := landingD_checkableA hb hP _ [(P, p)] (fun i hi => by
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hi
    subst hi
    exact hP) w hw
  rcases hu with ⟨s, hs, t, -, ht⟩ | ⟨g, hg, t, -, ht⟩
  · exact putW_checkableA (neutral_checkableA (placed_checkableA
      ((memberSpread_checkableA hw' (Option.mem_toList.mp hs)).atKey _) _)) _ ht
  · exact putW_checkableA (neutral_checkableA (placed_checkableA
      (genTemplate_checkableA hw' (Option.mem_toList.mp hg)) _)) _ ht

theorem membersRead_checkableA {ds : Decls} {P : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hP : P.CheckableA) (root : Val) (base : List Seg) : (ds.membersRead P root base).CheckableA := by
  unfold Decls.membersRead
  split
  · refine foldl_meet_checkableA _ (neutral_checkableA hP) fun u hu => ?_
    obtain ⟨p, -, hu⟩ := List.mem_flatMap.mp hu
    exact instancesAt_checkableA hb hP base p u hu
  · exact hP

section
variable {ds : Decls} {root : Val} {base : List Seg}

theorem arFields_checkableA : ∀ (fs : List (String × Bool × Val)) (pos : List Seg),
    (∀ k o v, (k, o, v) ∈ fs → ∀ pos, (ds.armsRead root base pos v).CheckableA) →
    ∀ k o w, (k, o, w) ∈ ds.arFields root base pos fs → w.CheckableA
  | [], _, _, _, _, _, h => nomatch h
  | (k', o', v') :: fs, pos, ih, k, o, w, h => by
    simp only [Decls.arFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, -, rfl⟩ | h
    · exact ih k' o' v' List.mem_cons_self _
    · exact arFields_checkableA fs pos (fun k o v hv => ih k o v (List.mem_cons_of_mem _ hv)) k o w h

theorem arElems_checkableA : ∀ (items : List Val) (pos : List Seg) (i : ℕ),
    (∀ v, v ∈ items → ∀ pos, (ds.armsRead root base pos v).CheckableA) →
    ∀ w, w ∈ ds.arElems root base pos i items → w.CheckableA
  | [], _, _, _, _, h => nomatch h
  | v :: vs, pos, i, ih, w, h => by
    simp only [Decls.arElems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ih v List.mem_cons_self _
    · exact arElems_checkableA vs pos (i + 1) (fun v hv => ih v (List.mem_cons_of_mem _ hv)) w h

theorem arPairs_checkableA (hb : ∀ d, d ∈ ds → d.2.CheckableA) : ∀ (arms : List (Val × Val)) (pos : List Seg),
    (∀ p r, (p, r) ∈ arms → p.CheckableA) →
    (∀ p r, (p, r) ∈ arms → ∀ pos, (ds.armsRead root base pos r).CheckableA) →
    (∀ p r, (p, r) ∈ ds.arPairs root base pos arms → p.CheckableA) ∧
      (∀ p r, (p, r) ∈ ds.arPairs root base pos arms → r.CheckableA)
  | [], _, _, _ => ⟨fun _ _ h => (nomatch h), fun _ _ h => (nomatch h)⟩
  | (p', r') :: ps, pos, hp, ih => by
    have rest := arPairs_checkableA hb ps pos (fun p r hm => hp p r (List.mem_cons_of_mem _ hm))
      (fun p r hm => ih p r (List.mem_cons_of_mem _ hm))
    simp only [Decls.arPairs, List.mem_cons, Prod.mk.injEq]
    refine ⟨fun p r h => ?_, fun p r h => ?_⟩
    · rcases h with ⟨rfl, -⟩ | h
      · exact hp _ _ List.mem_cons_self
      · exact rest.1 p r h
    · rcases h with ⟨-, rfl⟩ | h
      · exact membersRead_checkableA hb (ih p' r' List.mem_cons_self _) _ _
      · exact rest.2 p r h

theorem arResult_checkableA (hb : ∀ d, d ∈ ds → d.2.CheckableA) (pos : List Seg) {d : Option Val}
    (ih : ∀ e, d = some e → ∀ pos, (ds.armsRead root base pos e).CheckableA) :
    ∀ e, ds.arResult root base pos d = some e → e.CheckableA := by
  intro e h
  cases d with
  | none => exact nomatch h
  | some e' =>
    simp only [Decls.arResult, Option.some.injEq] at h
    subst h
    exact membersRead_checkableA hb (ih e' rfl _) _ _

/-- A term with each selection's results read where the selection stands
is one the checker can read. -/
theorem armsRead_checkableA (hb : ∀ d, d ∈ ds → d.2.CheckableA) {v : Val} (h : v.CheckableA) :
    ∀ pos, (ds.armsRead root base pos v).CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ =>
    intro pos
    exact .map (arFields_checkableA fs pos ihf) hs
  | @list items spread closed _ hs ihi _ =>
    intro pos
    exact .list (arElems_checkableA items pos 0 ihi) hs
  | meet _ _ iha ihb => exact fun pos => .meet (iha pos) (ihb pos)
  | ride _ ih => exact fun pos => .ride (ih pos)
  | link _ ht ih _ => exact fun pos => .link (ih pos) ht
  | len hc _ => exact fun _ => .len hc
  | or ha _ => exact fun _ => .or ha
  | pref hx _ => exact fun _ => .pref hx
  | nof hn hcs _ _ => exact fun _ => .nof hn hcs
  | call ha _ => exact fun _ => .call ha
  | must hc _ => exact fun _ => .must hc
  | when hc ht he _ _ _ => exact fun _ => .when hc ht he
  | contains hc hn _ _ => exact fun _ => .contains hc hn
  | rest ht h1 h2 h3 _ _ _ _ => exact fun _ => .rest ht h1 h2 h3
  | @selectKey arms d hp _ _ _ ihr ihd =>
    intro pos
    have hpr := arPairs_checkableA hb arms pos hp ihr
    exact .selectKey hpr.1 hpr.2 (arResult_checkableA hb pos ihd)
  | @selectLit s arms d hp _ _ _ ihr ihd =>
    intro pos
    have hpr := arPairs_checkableA hb arms pos hp ihr
    exact .selectLit hpr.1 hpr.2 (arResult_checkableA hb pos ihd)
  | _ => exact fun _ => by constructor
end

/-- A body read at its own place is a term the checker can read. -/
theorem ownRead_checkableA {ds : Decls} {d : String × Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hd : d.2.CheckableA) : (ds.ownRead d).CheckableA :=
  membersRead_checkableA hb (armsRead_checkableA hb hd _) _ _

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
  | .node :: _, _, _, _, h => by simp [Val.at] at h
  | .lands _ :: _, _, _, _, h => by simp [Val.at] at h
  | .own _ :: p, v, w, hv, h => by
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

/-- The term at a written path in a term the checker can read is one it
can read. -/
theorem oneArm_checkableA : ∀ {v : Val}, v.CheckableA → v.oneArm.CheckableA
  | .or [(_, a)], .or ha => by
    simp only [Val.oneArm]
    exact oneArm_checkableA (ha _ a List.mem_cons_self)
  | .ride _ _ _, .ride h => by simp only [Val.oneArm]; exact oneArm_checkableA h
  | .link _ _, .link h _ => by simp only [Val.oneArm]; exact oneArm_checkableA h
  | .or [], h | .or (_ :: _ :: _), h => by simp only [Val.oneArm]; exact h
  | .integer, h | .float, h | .biginteger, h | .bigdecimal, h | .number, h | .string, h
  | .anyString, h | .boolean, h | .mapKind, h | .listKind, h | .pathKind, h | .lit _, h
  | .min _, h | .max _, h | .above _, h | .beneath _, h | .neq _, h | .mulof _, h | .len _, h
  | .unique _, h | .re _, h | .format _, h | .grammar _, h | .any, h | .nil, h | .absent, h
  | .nothing, h | .map _ _ _, h | .list _ _ _, h | .pref _ _, h | .meet _ _, h | .alias _, h
  | .path _, h | .addr _, h | .nof _ _, h | .must _ _, h | .when _ _ _, h | .contains _ _, h
  | .rest _ _, h | .select _ _ _, h | .filter _ _, h | .call _ _, h | .key, h | .keyUp _, h
  | .hole, h => by simp only [Val.oneArm]; exact h

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
        exact atW_checkableA p (at_checkableA [t] (oneArm_checkableA hv) hu) h
      · exact absurd h (by simp)
    · exact absurd h (by simp)

theorem Decls.pathAt_checkableA {ds : Decls} {root w : Val} {p : List Seg} (hr : root.CheckableA)
    (h : ds.pathAt root p = some w) : w.CheckableA := by
  unfold Decls.pathAt at h
  cases hq : p.mapM ds.bindSeg with
  | none => rw [hq] at h; exact absurd h (by simp)
  | some q => rw [hq] at h; exact atW_checkableA q hr h

theorem foldl_meetBodies_checkableA :
    ∀ (bs : Decls) {acc : Val}, acc.CheckableA → (∀ d, d ∈ bs → d.2.CheckableA) →
      (bs.foldl (fun acc d => .meet acc d.2) acc).CheckableA
  | [], _, h, _ => h
  | b :: bs, _, h, hb =>
    foldl_meetBodies_checkableA bs (.meet h (hb b List.mem_cons_self)) fun d hd => hb d (List.mem_cons_of_mem _ hd)

theorem Decls.bodyAt_checkableA {ds : Decls} {w : Val} {p : List Seg}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (h : ds.bodyAt p = some w) : w.CheckableA := by
  unfold Decls.bodyAt at h
  split at h
  · split at h
    · exact absurd h (by simp)
    · exact Decls.pathAt_checkableA (normaliseD_checkableA hb (readU_checkableA hb
        (foldl_meetBodies_checkableA _ .any fun d hd => hb d (List.mem_filter.mp hd).1))) h
  · exact absurd h (by simp)

theorem Decls.pathIn_checkableA {ds : Decls} {roots bs : List Val} {w : Val} {p : List Seg}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hr : ∀ root, root ∈ roots → root.CheckableA) (hbs : ∀ root, root ∈ bs → root.CheckableA)
    (h : ds.pathIn roots p bs = some w) : w.CheckableA := by
  unfold Decls.pathIn at h
  cases hf : roots.findSome? (fun root => ds.pathAt root p) with
  | none =>
    rw [hf, Option.none_or] at h
    split at h
    · cases hg : bs.findSome? (fun root => ds.pathAt root p) with
      | none =>
        rw [hg, Option.none_or] at h
        exact Decls.bodyAt_checkableA hb h
      | some u =>
        rw [hg, Option.some_or, Option.some.injEq] at h
        obtain ⟨root, hm, hw⟩ := List.exists_of_findSome?_eq_some hg
        exact h ▸ Decls.pathAt_checkableA (hbs root hm) hw
    · exact absurd h (by simp)
  | some u =>
    rw [hf, Option.some_or, Option.some.injEq] at h
    obtain ⟨root, hm, hw⟩ := List.exists_of_findSome?_eq_some hf
    exact h ▸ Decls.pathAt_checkableA (hr root hm) hw

theorem Decls.ofPaths_checkableA {ds : Decls} {roots bs : List Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hr : ∀ root, root ∈ roots → root.CheckableA) (hbs : ∀ root, root ∈ bs → root.CheckableA)
    (ps : List (List Seg)) : ∀ d, d ∈ ds.ofPaths roots ps bs → d.2.CheckableA := by
  intro d hd
  simp only [Decls.ofPaths, List.mem_filterMap] at hd
  obtain ⟨p, -, hp⟩ := hd
  cases hw : ds.pathIn roots p bs with
  | none => rw [hw] at hp; exact absurd hp (by simp)
  | some w =>
    rw [hw] at hp
    simp only [Option.map_some, Option.some.injEq] at hp
    rw [← hp]
    exact pathsToAliases_checkableA (Decls.pathIn_checkableA hb hr hbs hw)

theorem Decls.withPathsFrom_bodies_checkableA {ds : Decls} {S : Val} {roots bs : List Val}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hr : ∀ root, root ∈ roots → root.CheckableA)
    (hbs : ∀ root, root ∈ bs → root.CheckableA) :
    ∀ d, d ∈ (ds.withPathsFrom S roots bs).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.withPathsFrom, List.mem_append, List.mem_map] at hd
  rcases hd with ⟨d', hd', rfl⟩ | hd
  · exact pathsToAliases_checkableA (hb d' hd')
  · exact Decls.ofPaths_checkableA hb hr hbs _ d hd

/-! ## Reading the links keeps a term checkable -/

mutual
theorem Val.atTarget_checkableA (T : List Seg) : ∀ {v : Val}, v.CheckableA → (v.atTarget T).CheckableA
  | .path p, _ => by
    match p with
    | .lands c :: q =>
      simp only [Val.atTarget]
      split
      · exact .path
      · exact .nil
    | [] | .key _ :: _ | .idx _ :: _ | .var _ :: _ | .up _ :: _ | .node :: _ | .own _ :: _ =>
      simp only [Val.atTarget]; exact .path
  | .len _, .len h => .len (Val.atTarget_checkableA T h)
  | .map _ _ _, .map hf hs => .map (atFields_checkableA T hf) (atSpread_checkableA T hs)
  | .list _ _ _, .list hi hs => .list (atItems_checkableA T hi) (atSpread_checkableA T hs)
  | .or _, .or ha => .or (atArms_checkableA T ha)
  | .pref _ _, .pref h => .pref (Val.atTarget_checkableA T h)
  | .meet _ _, .meet ha hb => .meet (Val.atTarget_checkableA T ha) (Val.atTarget_checkableA T hb)
  | .nof _ _, .nof hn hc => .nof (Val.atTarget_checkableA T hn) (atItems_checkableA T hc)
  | .must _ _, .must h => .must (Val.atTarget_checkableA T h)
  | .when _ _ _, .when hc ht he =>
    .when (Val.atTarget_checkableA T hc) (Val.atTarget_checkableA T ht) (atSpread_checkableA T he)
  | .contains _ _, .contains hc hn => .contains (Val.atTarget_checkableA T hc) (Val.atTarget_checkableA T hn)
  | .rest _ _, .rest ht h1 h2 h3 => .rest (Val.atTarget_checkableA T ht) (atCovers_checkableA T h1 h2 h3).1
      (atCovers_checkableA T h1 h2 h3).2.1 (atCovers_checkableA T h1 h2 h3).2.2
  | .select _ _ _, .selectKey hp hr hd => by
    simp only [Val.atTarget]
    exact .selectKey (atPairs_checkableA T hp hr).1 (atPairs_checkableA T hp hr).2 (atSpread_checkableA T hd)
  | .select _ _ _, .selectLit hp hr hd => by
    simp only [Val.atTarget]
    exact .selectLit (atPairs_checkableA T hp hr).1 (atPairs_checkableA T hp hr).2 (atSpread_checkableA T hd)
  | .call f _, .call ha => by
    simp only [Val.atTarget]
    split
    · exact .call ha
    · exact .call (atItems_checkableA T ha)
  | .ride _ _ _, .ride h => .ride (Val.atTarget_checkableA T h)
  | .link _ _, .link hv ht => .link (Val.atTarget_checkableA T hv) ht
  | .integer, h | .float, h | .biginteger, h | .bigdecimal, h | .number, h | .string, h
  | .anyString, h | .boolean, h | .mapKind, h | .listKind, h | .pathKind, h | .lit _, h
  | .addr _, h | .min _, h | .max _, h | .above _, h | .beneath _, h | .neq _, h
  | .mulof _, h | .unique _, h | .grammar _, h | .any, h | .absent, h | .hole, h
  | .nil, h | .nothing, h | .alias _, h | .key, h | .keyUp _, h => h

theorem atFields_checkableA (T : List Seg) : ∀ {fs : List (String × Bool × Val)},
    (∀ k o v, (k, o, v) ∈ fs → v.CheckableA) → ∀ k o v, (k, o, v) ∈ atFields T fs → v.CheckableA
  | [], _, _, _, _, h => nomatch h
  | (k', o', v') :: fs, hf, k, o, v, h => by
    simp only [atFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact Val.atTarget_checkableA T (hf _ _ _ List.mem_cons_self)
    · exact atFields_checkableA T (fun k o v hm => hf k o v (List.mem_cons_of_mem _ hm)) k o v h

theorem atItems_checkableA (T : List Seg) : ∀ {vs : List Val},
    (∀ v, v ∈ vs → v.CheckableA) → ∀ v, v ∈ atItems T vs → v.CheckableA
  | [], _, _, h => nomatch h
  | v' :: vs, hv, v, h => by
    simp only [atItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact Val.atTarget_checkableA T (hv v' List.mem_cons_self)
    · exact atItems_checkableA T (fun v hm => hv v (List.mem_cons_of_mem _ hm)) v h

theorem atSpread_checkableA (T : List Seg) : ∀ {s : Option Val},
    (∀ s', s = some s' → s'.CheckableA) → ∀ s', atSpread T s = some s' → s'.CheckableA
  | none, _, _, h => nomatch h
  | some s, hs, s', h => by
    simp only [atSpread, Option.some.injEq] at h
    rw [← h]; exact Val.atTarget_checkableA T (hs s rfl)

theorem atArms_checkableA (T : List Seg) : ∀ {arms : List (ℕ × Val)},
    (∀ r a, (r, a) ∈ arms → a.CheckableA) → ∀ r a, (r, a) ∈ atArms T arms → a.CheckableA
  | [], _, _, _, h => nomatch h
  | (r', a') :: arms, ha, r, a, h => by
    simp only [atArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact Val.atTarget_checkableA T (ha _ _ List.mem_cons_self)
    · exact atArms_checkableA T (fun r a hm => ha r a (List.mem_cons_of_mem _ hm)) r a h

theorem atPairs_checkableA (T : List Seg) : ∀ {ps : List (Val × Val)},
    (∀ p r, (p, r) ∈ ps → p.CheckableA) → (∀ p r, (p, r) ∈ ps → r.CheckableA) →
    (∀ p r, (p, r) ∈ atPairs T ps → p.CheckableA) ∧ (∀ p r, (p, r) ∈ atPairs T ps → r.CheckableA)
  | [], _, _ => ⟨fun _ _ h => (nomatch h), fun _ _ h => (nomatch h)⟩
  | (p', r') :: ps, hp, hr => by
    have ih := atPairs_checkableA T (ps := ps) (fun p r hm => hp p r (List.mem_cons_of_mem _ hm))
      (fun p r hm => hr p r (List.mem_cons_of_mem _ hm))
    refine ⟨fun p r h => ?_, fun p r h => ?_⟩ <;>
      simp only [atPairs, List.mem_cons, Prod.mk.injEq] at h <;> rcases h with ⟨rfl, rfl⟩ | h
    · exact Val.atTarget_checkableA T (hp _ _ List.mem_cons_self)
    · exact ih.1 p r h
    · exact Val.atTarget_checkableA T (hr _ _ List.mem_cons_self)
    · exact ih.2 p r h

theorem atCovers_checkableA (T : List Seg) : ∀ {cs : List Cover},
    (∀ c, c ∈ cs → ∀ v, c.1 = some v → v.CheckableA) →
    (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → v.CheckableA) →
    (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → v.CheckableA) →
    (∀ c, c ∈ atCovers T cs → ∀ v, c.1 = some v → v.CheckableA) ∧
    (∀ c, c ∈ atCovers T cs → ∀ v, c.2.1 = some v → v.CheckableA) ∧
    (∀ c, c ∈ atCovers T cs → ∀ v, c.2.2 = some v → v.CheckableA)
  | [], _, _, _ => ⟨fun _ h => (nomatch h), fun _ h => (nomatch h), fun _ h => (nomatch h)⟩
  | (c1, c2, c3) :: cs, h1, h2, h3 => by
    have ih := atCovers_checkableA T (cs := cs) (fun c hm => h1 c (List.mem_cons_of_mem _ hm))
      (fun c hm => h2 c (List.mem_cons_of_mem _ hm)) (fun c hm => h3 c (List.mem_cons_of_mem _ hm))
    refine ⟨fun c h => ?_, fun c h => ?_, fun c h => ?_⟩ <;>
      simp only [atCovers, List.mem_cons] at h <;> rcases h with rfl | h
    · exact atSpread_checkableA T (h1 _ List.mem_cons_self)
    · exact ih.1 c h
    · exact atSpread_checkableA T (h2 _ List.mem_cons_self)
    · exact ih.2.1 c h
    · exact atSpread_checkableA T (h3 _ List.mem_cons_self)
    · exact ih.2.2 c h
end

theorem referFlow_checkableA {ds : Decls} {roots : List Val} {miss acc t : Val} {pos : List Seg}
    {a : Addr} (hm : miss.CheckableA) (hacc : acc.CheckableA) (ht : t.CheckableA) :
    (referFlow ds roots miss pos t acc a).CheckableA := by
  unfold referFlow
  split
  next u hu =>
    cases hq : a.from pos with
    | none => rw [hq] at hu; exact absurd hu (by simp)
    | some p =>
      rw [hq] at hu
      simp only [Option.bind_some] at hu
      obtain ⟨root, -, hr⟩ := List.exists_of_findSome?_eq_some hu
      exact .meet hacc (putW_checkableA (Val.atTarget_checkableA p ht) p hr)
  next =>
    split
    · exact hacc
    · exact .meet hacc hm

theorem foldl_referFlow_checkableA {ds : Decls} {roots : List Val} {miss t : Val} {pos : List Seg}
    (hm : miss.CheckableA) (ht : t.CheckableA) :
    ∀ (as : List Addr) {acc : Val}, acc.CheckableA →
      (as.foldl (referFlow ds roots miss pos t) acc).CheckableA
  | [], _, h => h
  | _ :: as, _, h => foldl_referFlow_checkableA hm ht as (referFlow_checkableA hm h ht)

theorem referStep_checkableA {ds : Decls} {roots : List Val} {miss acc : Val} {home : List Seg}
    {e : List Seg × Val × Val} (hm : miss.CheckableA) (hacc : acc.CheckableA)
    (he : e.2.1.CheckableA) : (referStep ds roots miss home acc e).CheckableA :=
  foldl_referFlow_checkableA hm he.unmark _ hacc

theorem foldl_referStep_checkableA {ds : Decls} {roots : List Val} {miss : Val} {home : List Seg}
    (hm : miss.CheckableA) :
    ∀ (es : List (List Seg × Val × Val)) {acc : Val}, acc.CheckableA → (∀ e, e ∈ es → e.2.1.CheckableA) →
      (es.foldl (referStep ds roots miss home) acc).CheckableA
  | [], _, h, _ => h
  | e :: es, _, h, he =>
    foldl_referStep_checkableA hm es (referStep_checkableA hm h (he e List.mem_cons_self))
      fun e' h' => he e' (List.mem_cons_of_mem _ h')

theorem mem_linksFields {pos : List Seg} {e : List Seg × Val × Val} :
    ∀ {fs : List (String × Bool × Val)}, e ∈ linksFields pos fs →
      ∃ k o v, (k, o, v) ∈ fs ∧ e ∈ v.links (pos ++ [.key k])
  | [], h => by simp [linksFields] at h
  | (k, o, v) :: fs, h => by
    simp only [linksFields, List.mem_append] at h
    rcases h with h | h
    · exact ⟨k, o, v, List.mem_cons_self, h⟩
    · obtain ⟨k', o', v', hm, h'⟩ := mem_linksFields h
      exact ⟨k', o', v', List.mem_cons_of_mem _ hm, h'⟩

theorem mem_linksItems {pos : List Seg} {e : List Seg × Val × Val} :
    ∀ {i : ℕ} {vs : List Val}, e ∈ linksItems pos i vs → ∃ j v, v ∈ vs ∧ e ∈ v.links (pos ++ [.idx j])
  | _, [], h => by simp [linksItems] at h
  | i, v :: vs, h => by
    simp only [linksItems, List.mem_append] at h
    rcases h with h | h
    · exact ⟨i, v, List.mem_cons_self, h⟩
    · obtain ⟨j, w, hm, h'⟩ := mem_linksItems h
      exact ⟨j, w, List.mem_cons_of_mem _ hm, h'⟩

theorem mem_linksArms {pos : List Seg} {all : List (ℕ × Val)} {e : List Seg × Val × Val} :
    ∀ {arms : List (ℕ × Val)}, e ∈ linksArms pos all arms → ∃ r a, (r, a) ∈ arms ∧ e ∈ a.links pos
  | [], h => by simp [linksArms] at h
  | (r, a) :: rest, h => by
    simp only [linksArms, List.mem_append] at h
    rcases h with h | h
    · split at h
      · exact ⟨r, a, List.mem_cons_self, h⟩
      · simp at h
    · obtain ⟨r', a', hm, h'⟩ := mem_linksArms h
      exact ⟨r', a', List.mem_cons_of_mem _ hm, h'⟩

/-- Each template a normal form the checker can read holds, it can
read too. -/
theorem Val.links_checkableA {v : Val} (h : v.CheckableA) :
    ∀ (pos : List Seg) e, e ∈ v.links pos → e.2.1.CheckableA := by
  induction h with
  | map _ _ ihf _ =>
    intro pos e he
    simp only [Val.links] at he
    obtain ⟨k, o, w, hm, h'⟩ := mem_linksFields he
    exact ihf k o w hm _ e h'
  | list _ _ ihi _ =>
    intro pos e he
    simp only [Val.links] at he
    obtain ⟨j, w, hm, h'⟩ := mem_linksItems he
    exact ihi w hm _ e h'
  | ride _ ih =>
    intro pos e he
    simp only [Val.links] at he
    exact ih pos e he
  | @link v t _ ht ihv _ =>
    intro pos e he
    simp only [Val.links, List.mem_append, List.mem_map] at he
    rcases he with ⟨w, -, rfl⟩ | he
    · exact ht
    · exact ihv pos e he
  | meet _ _ iha ihb =>
    intro pos e he
    simp only [Val.links, List.mem_append] at he
    exact he.elim (iha pos e) (ihb pos e)
  | or _ ih =>
    intro pos e he
    simp only [Val.links] at he
    obtain ⟨r, a, hm, h'⟩ := mem_linksArms he
    exact ih r a hm pos e h'
  | _ => intro pos e he; simp [Val.links] at he

theorem Decls.nfLinks_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {root : Val}
    (hr : root.CheckableA) (home : List Seg) : ∀ e, e ∈ ds.nfLinks root home → e.2.1.CheckableA := by
  intro e he
  simp only [Decls.nfLinks, List.mem_map] at he
  obtain ⟨e', he', rfl⟩ := he
  exact resolveD_checkableA hb (Val.links_checkableA hr [] e' he') fun _ h => nomatch h

theorem ownFlow_checkableA {R acc t : Val} {pos : List Seg} {a : Addr}
    (hacc : acc.CheckableA) (ht : t.CheckableA) : (ownFlow R pos t acc a).CheckableA := by
  unfold ownFlow
  split
  next u hu =>
    cases hq : a.from pos with
    | none => rw [hq] at hu; exact absurd hu (by simp)
    | some p =>
      rw [hq] at hu
      simp only [Option.bind_some] at hu
      exact .meet hacc (putW_checkableA (Val.atTarget_checkableA p ht) p hu)
  next => exact hacc

theorem foldl_ownFlow_checkableA {R t : Val} {pos : List Seg} (ht : t.CheckableA) :
    ∀ (as : List Addr) {acc : Val}, acc.CheckableA → (as.foldl (ownFlow R pos t) acc).CheckableA
  | [], _, h => h
  | _ :: as, _, h => foldl_ownFlow_checkableA ht as (ownFlow_checkableA h ht)

theorem foldl_ownStep_checkableA {R : Val} :
    ∀ (es : List (List Seg × Val × Val)) {acc : Val}, acc.CheckableA → (∀ e, e ∈ es → e.2.1.CheckableA) →
      (es.foldl (ownStep R) acc).CheckableA
  | [], _, h, _ => h
  | e :: es, _, h, he =>
    foldl_ownStep_checkableA es (foldl_ownFlow_checkableA (he e List.mem_cons_self).unmark _ h)
      fun e' h' => he e' (List.mem_cons_of_mem _ h')

theorem Decls.ownLinked_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {B : Val}
    (hB : B.CheckableA) : (ds.ownLinked B).CheckableA :=
  foldl_ownStep_checkableA _ hB
    (Decls.nfLinks_checkableA hb (normaliseD_checkableA hb (readU_checkableA hb hB)) [])

theorem Decls.ownLinkedN_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {B : Val}
    (hB : B.CheckableA) : ∀ n, (ds.ownLinkedN B n).CheckableA
  | 0 => hB
  | n + 1 => Decls.ownLinked_checkableA hb (Decls.ownLinkedN_checkableA hb hB n)

theorem Decls.ownPlace_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (n : String) :
    (ds.ownPlace n).CheckableA := by
  have hB : (Val.map [("%" ++ n, false, (ds.filter (·.1 == n)).foldl (fun acc d => .meet acc d.2) .any)]
      none false).CheckableA := by
    refine .map (fun _ _ _ hv => ?_) (fun _ h => nomatch h)
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hv
    rw [hv.2.2]
    exact foldl_meetBodies_checkableA _ .any fun d hd => hb d (List.mem_filter.mp hd).1
  exact normaliseD_checkableA hb (readU_checkableA hb (Decls.ownLinkedN_checkableA hb hB _))

theorem Decls.bodyRoots_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (ns : List String) :
    ∀ root, root ∈ ds.bodyRoots ns → root.CheckableA := by
  intro root h
  simp only [Decls.bodyRoots, List.mem_map] at h
  obtain ⟨n, -, rfl⟩ := h
  exact Decls.ownPlace_checkableA hb n

/-- A document's declarations with each recursive name's calls made are
terms the checker can read. -/
theorem Decls.callsMade_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ d, d ∈ ds.callsMade → d.2.CheckableA := by
  intro d hd
  simp only [Decls.callsMade, List.mem_map] at hd
  obtain ⟨d', hd', rfl⟩ := hd
  split
  · exact readU_checkableA hb (hb d' hd')
  · exact hb d' hd'

/-- Every round's root, and every place a round reads, is one the
checker can read, where `r` reads a document the checker can read to
one. -/
theorem Decls.rounds_checkableA {r : Decls → Val → Val}
    (hr : ∀ {d : Decls} {T : Val}, (∀ x, x ∈ d → x.2.CheckableA) → T.CheckableA → (r d T).CheckableA)
    {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    ∀ n, (∀ root, root ∈ (ds.rounds S r n).1 → root.CheckableA) ∧
      ∀ root, root ∈ (ds.rounds S r n).2 → root.CheckableA
  | 0 => ⟨fun root h => by
      simp only [Decls.rounds, List.mem_singleton] at h
      rw [h]
      exact hr hb hS,
    Decls.bodyRoots_checkableA hb _⟩
  | n + 1 =>
    have ih := Decls.rounds_checkableA hr hb hS n
    have hd := Decls.withPathsFrom_bodies_checkableA (S := S) hb ih.1 ih.2
    ⟨fun root h => by
      simp only [Decls.rounds, List.mem_append, List.mem_singleton] at h
      rcases h with h | h
      · exact ih.1 root h
      · rw [h]
        exact hr hd (pathsToAliases_checkableA hS),
    fun root h => by
      simp only [Decls.rounds, List.mem_append] at h
      rcases h with h | h
      · exact ih.2 root h
      · exact Decls.bodyRoots_checkableA hd _ root h⟩

theorem Decls.roundsS_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : (∀ root, root ∈ (ds.roundsS S).1 → root.CheckableA) ∧
      ∀ root, root ∈ (ds.roundsS S).2 → root.CheckableA :=
  Decls.rounds_checkableA (fun hd hT => normaliseD_checkableA (Decls.callsMade_checkableA hd)
    (readU_checkableA (Decls.callsMade_checkableA hd) hT)) hb hS _

theorem Decls.roundsD_checkableA {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : (∀ root, root ∈ (ds.roundsD S j).1 → root.CheckableA) ∧
      ∀ root, root ∈ (ds.roundsD S j).2 → root.CheckableA :=
  Decls.rounds_checkableA
    (fun hd hT => normaliseD_checkableA (Decls.callsMade_checkableA hd)
      (meetD_checkableA (Decls.callsMade_checkableA hd) (readU_checkableA (Decls.callsMade_checkableA hd) hT)
        (Data.term_checkableA j)))
    hb hS _

theorem Decls.rootsS_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : ∀ root, root ∈ ds.rootsS S → root.CheckableA :=
  (Decls.roundsS_checkableA hb hS).1

theorem Decls.rootsD_checkableA {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : ∀ root, root ∈ ds.rootsD S j → root.CheckableA :=
  (Decls.roundsD_checkableA hb hS).1

theorem Decls.bodyRoot_checkableA {dp : Decls} (hdp : ∀ x, x ∈ dp → x.2.CheckableA)
    {d : String × Val} (hd : d.2.CheckableA) : (dp.bodyRoot d).CheckableA :=
  normaliseD_checkableA hdp (readU_checkableA hdp (pathsToAliases_checkableA hd))

theorem getLastD_any_checkableA {rs : List Val} (h : ∀ r, r ∈ rs → r.CheckableA) :
    (rs.getLast?.getD .any).CheckableA := by
  cases hl : rs.getLast? with
  | none => exact .any
  | some r => exact h r (List.mem_of_getLast? hl)

theorem foldl_bodyLinks_checkableA {ds dp : Decls} {roots : List Val} {miss : Val}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hdp : ∀ x, x ∈ dp → x.2.CheckableA)
    (hm : miss.CheckableA) :
    ∀ (bs : Decls) {acc : Val}, acc.CheckableA → (∀ d, d ∈ bs → d.2.CheckableA) →
      (bs.foldl (fun acc d => (ds.nfLinks (dp.bodyRoot d) [.own d.1]).foldl
        (referStep ds roots miss [.own d.1]) acc) acc).CheckableA
  | [], _, h, _ => h
  | d :: bs, _, h, hd =>
    foldl_bodyLinks_checkableA hb hdp hm bs
      (foldl_referStep_checkableA hm _ h
        (Decls.nfLinks_checkableA hb (Decls.bodyRoot_checkableA hdp (hd d List.mem_cons_self)) _))
      fun d' h' => hd d' (List.mem_cons_of_mem _ h')

/-- A reader of a document's roots whose every root the checker can read,
where it can read the document and its bodies. -/
abbrev RootsReadable (r : Decls → Val → List Val) : Prop :=
  ∀ {d : Decls} {T : Val}, (∀ x, x ∈ d → x.2.CheckableA) → T.CheckableA → ∀ root, root ∈ r d T → root.CheckableA

theorem rootsS_readable : RootsReadable Decls.rootsS := fun hb hT => Decls.rootsS_checkableA hb hT

theorem rootsD_readable (j : Data) : RootsReadable fun d T => d.rootsD T j :=
  fun hb hT => Decls.rootsD_checkableA hb hT

/-- A schema the checker can read, under bodies it can read, reads with
the templates of the links a pass finds targets for met into them,
whatever tree the pass reads, so long as the checker can read it. -/
theorem Decls.linkReader_readable {ds : Decls} {S : Val} {j : Data} : RootsReadable (ds.linkReader S j) := by
  unfold Decls.linkReader
  split
  · exact rootsD_readable j
  · exact rootsS_readable

theorem referPass_checkableA {ds : Decls} {r : Decls → Val → List Val} {S L miss : Val}
    (hr : RootsReadable r) (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) (hL : L.CheckableA)
    (hm : miss.CheckableA) : (ds.referPass r S L miss).CheckableA := by
  have hro := hr hb hL
  have hdp := Decls.withPathsFrom_bodies_checkableA (S := L) (bs := []) hb hro (fun _ h => nomatch h)
  exact foldl_bodyLinks_checkableA hb hdp hm ds
    (foldl_referStep_checkableA hm _ hS (Decls.nfLinks_checkableA hb (getLastD_any_checkableA hro) _)) hb

theorem referPasses_checkableA {ds : Decls} {r : Decls → Val → List Val} {S : Val} (hr : RootsReadable r)
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) : ∀ n, (ds.referPasses r S n).CheckableA
  | 0 => hS
  | n + 1 =>
    referPass_checkableA hr hb (referPasses_checkableA hr hb hS n) (referPasses_checkableA hr hb hS n) .any

theorem withRefers_checkableA {ds : Decls} {r : Decls → Val → List Val} {S : Val} (hr : RootsReadable r)
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) : (ds.withRefers r S).CheckableA := by
  dsimp only [Decls.withRefers]
  split
  · exact .meet (referPass_checkableA hr hb (referPasses_checkableA hr hb hS _)
      (referPasses_checkableA hr hb hS _) .nil) .nil
  · exact referPass_checkableA hr hb (referPasses_checkableA hr hb hS _) (referPasses_checkableA hr hb hS _) .nil

section
variable {f : String → Bool} {g : String → Val}

theorem ufFields_checkableA : ∀ (fs : List (String × Bool × Val)),
    (∀ k o v, (k, o, v) ∈ fs → (v.unfoldAt f g).CheckableA) →
    ∀ k o w, (k, o, w) ∈ ufFields f g fs → w.CheckableA
  | [], _, _, _, _, h => nomatch h
  | (k', o', v') :: fs, ih, k, o, w, h => by
    simp only [ufFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, -, rfl⟩ | h
    · exact ih k' o' v' List.mem_cons_self
    · exact ufFields_checkableA fs (fun k o v hv => ih k o v (List.mem_cons_of_mem _ hv)) k o w h

theorem ufItems_checkableA : ∀ (items : List Val), (∀ v, v ∈ items → (v.unfoldAt f g).CheckableA) →
    ∀ w, w ∈ ufItems f g items → w.CheckableA
  | [], _, _, h => nomatch h
  | v :: vs, ih, w, h => by
    simp only [ufItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ih v List.mem_cons_self
    · exact ufItems_checkableA vs (fun v hv => ih v (List.mem_cons_of_mem _ hv)) w h

/-- A term with uses of names read as terms the checker can read is one
it can read. -/
theorem unfoldAt_checkableA (hg : ∀ n, f n = true → (g n).CheckableA) {v : Val} (h : v.CheckableA) :
    (v.unfoldAt f g).CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ => exact .map (ufFields_checkableA fs ihf) hs
  | @list items spread closed _ hs ihi _ => exact .list (ufItems_checkableA items ihi) hs
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | @alias n =>
    simp only [Val.unfoldAt]
    split
    · rename_i hn
      exact hg n hn
    · exact .alias
  | len hc _ => exact .len hc
  | or ha _ => exact .or ha
  | pref hx _ => exact .pref hx
  | nof hn hcs _ _ => exact .nof hn hcs
  | call ha _ => exact .call ha
  | must hc _ => exact .must hc
  | when hc ht he _ _ _ => exact .when hc ht he
  | contains hc hn _ _ => exact .contains hc hn
  | rest ht h1 h2 h3 _ _ _ _ => exact .rest ht h1 h2 h3
  | selectKey hp hr hd _ _ _ => exact .selectKey hp hr hd
  | selectLit hp hr hd _ _ _ => exact .selectLit hp hr hd
  | _ => constructor
end

section
variable {pre : String}

theorem amFields_checkableA : ∀ (fs : List (String × Bool × Val)),
    (∀ k o v, (k, o, v) ∈ fs → (v.armed pre).CheckableA) →
    ∀ k o w, (k, o, w) ∈ amFields pre fs → w.CheckableA
  | [], _, _, _, _, h => nomatch h
  | (k', o', v') :: fs, ih, k, o, w, h => by
    simp only [amFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, -, rfl⟩ | h
    · exact ih k' o' v' List.mem_cons_self
    · exact amFields_checkableA fs (fun k o v hv => ih k o v (List.mem_cons_of_mem _ hv)) k o w h

theorem amItems_checkableA : ∀ (items : List Val), (∀ v, v ∈ items → (v.armed pre).CheckableA) →
    ∀ w, w ∈ amItems pre items → w.CheckableA
  | [], _, _, h => nomatch h
  | v :: vs, ih, w, h => by
    simp only [amItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ih v List.mem_cons_self
    · exact amItems_checkableA vs (fun v hv => ih v (List.mem_cons_of_mem _ hv)) w h

theorem amSpread_checkableA {sp : Option Val} (ih : ∀ s, sp = some s → (s.armed pre).CheckableA) :
    ∀ s, amSpread pre sp = some s → s.CheckableA := by
  intro s h
  cases sp with
  | none => exact nomatch h
  | some t =>
    simp only [amSpread, Option.some.injEq] at h
    subst h
    exact ih t rfl

theorem amArms_checkableA : ∀ (arms : List (ℕ × Val)), (∀ r a, (r, a) ∈ arms → (a.armed pre).CheckableA) →
    ∀ r a, (r, a) ∈ amArms pre arms → a.CheckableA
  | [], _, _, _, h => nomatch h
  | (r', a') :: as, ih, r, a, h => by
    simp only [amArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, rfl⟩ | h
    · exact ih r' a' List.mem_cons_self
    · exact amArms_checkableA as (fun r a hm => ih r a (List.mem_cons_of_mem _ hm)) r a h

theorem amPairs_checkableA : ∀ (arms : List (Val × Val)),
    (∀ p r, (p, r) ∈ arms → (p.armed pre).CheckableA) → (∀ p r, (p, r) ∈ arms → (r.armed pre).CheckableA) →
    (∀ p r, (p, r) ∈ amPairs pre arms → p.CheckableA) ∧ (∀ p r, (p, r) ∈ amPairs pre arms → r.CheckableA)
  | [], _, _ => ⟨fun _ _ h => (nomatch h), fun _ _ h => (nomatch h)⟩
  | (p', r') :: ps, ihp, ihr => by
    have rest := amPairs_checkableA ps (fun p r hm => ihp p r (List.mem_cons_of_mem _ hm))
      (fun p r hm => ihr p r (List.mem_cons_of_mem _ hm))
    simp only [amPairs, List.mem_cons, Prod.mk.injEq]
    refine ⟨fun p r h => ?_, fun p r h => ?_⟩
    · rcases h with ⟨rfl, -⟩ | h
      · exact ihp p' r' List.mem_cons_self
      · exact rest.1 p r h
    · rcases h with ⟨-, rfl⟩ | h
      · exact ihr p' r' List.mem_cons_self
      · exact rest.2 p r h

theorem amCovers_checkableA : ∀ (cs : List Cover),
    (∀ c, c ∈ cs → ∀ v, c.1 = some v → (v.armed pre).CheckableA) →
    (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → (v.armed pre).CheckableA) →
    (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → (v.armed pre).CheckableA) →
    (∀ c, c ∈ amCovers pre cs → ∀ v, c.1 = some v → v.CheckableA) ∧
      (∀ c, c ∈ amCovers pre cs → ∀ v, c.2.1 = some v → v.CheckableA) ∧
      (∀ c, c ∈ amCovers pre cs → ∀ v, c.2.2 = some v → v.CheckableA)
  | [], _, _, _ => ⟨fun _ h => (nomatch h), fun _ h => (nomatch h), fun _ h => (nomatch h)⟩
  | (x, y, z) :: cs, h1, h2, h3 => by
    have rest := amCovers_checkableA cs (fun c hc => h1 c (List.mem_cons_of_mem _ hc))
      (fun c hc => h2 c (List.mem_cons_of_mem _ hc)) (fun c hc => h3 c (List.mem_cons_of_mem _ hc))
    simp only [amCovers, List.mem_cons]
    refine ⟨fun c hc => ?_, fun c hc => ?_, fun c hc => ?_⟩ <;> rcases hc with rfl | hc
    · exact amSpread_checkableA (h1 _ List.mem_cons_self)
    · exact rest.1 c hc
    · exact amSpread_checkableA (h2 _ List.mem_cons_self)
    · exact rest.2.1 c hc
    · exact amSpread_checkableA (h3 _ List.mem_cons_self)
    · exact rest.2.2 c hc

/-- An arm's paths read under names of its own leave a term the checker
can read. -/
theorem armed_checkableA {v : Val} (h : v.CheckableA) : (v.armed pre).CheckableA := by
  induction h with
  | @map fs spread closed _ _ ihf ihs => exact .map (amFields_checkableA fs ihf) (amSpread_checkableA ihs)
  | @list items spread closed _ _ ihi ihs => exact .list (amItems_checkableA items ihi) (amSpread_checkableA ihs)
  | @or arms _ iha => exact .or (amArms_checkableA arms iha)
  | pref _ ih => exact .pref ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | @alias n =>
    simp only [Val.armed]
    split <;> exact .alias
  | len _ ih => exact .len ih
  | @nof n cs _ _ ihn ihcs => exact .nof ihn (amItems_checkableA cs ihcs)
  | @call f args _ iha => exact .call (amItems_checkableA args iha)
  | must _ ih => exact .must ih
  | when _ _ _ ihc iht ihe => exact .when ihc iht (amSpread_checkableA ihe)
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    have hc := amCovers_checkableA cs ih1 ih2 ih3
    exact .rest iht hc.1 hc.2.1 hc.2.2
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    have hp := amPairs_checkableA arms ihp ihr
    exact .selectKey hp.1 hp.2 (amSpread_checkableA ihd)
  | @selectLit s arms d _ _ _ ihp ihr ihd =>
    have hp := amPairs_checkableA arms ihp ihr
    exact .selectLit hp.1 hp.2 (amSpread_checkableA ihd)
  | _ => constructor
end

/-- A term with a term the checker can read in place of the one at an
address is one it can read. -/
theorem replaceAt_checkableA : ∀ (a : List ℕ) {v x : Val}, v.CheckableA → x.CheckableA →
    (v.replaceAt a x).CheckableA
  | [], _, _, _, hx => by simp only [Val.replaceAt]; exact hx
  | j :: a, v, x, hv, hx => by
    cases hv with
    | @map fs s c hf hs =>
      simp only [Val.replaceAt]
      split
      · rename_i k o w hj
        refine .map (fun k' o' w' hm => ?_) hs
        rcases List.mem_or_eq_of_mem_set hm with hm | hm
        · exact hf k' o' w' hm
        · simp only [Prod.mk.injEq] at hm
          obtain ⟨-, -, rfl⟩ := hm
          exact replaceAt_checkableA a (hf k o w (List.mem_of_getElem? hj)) hx
      · exact .map hf hs
    | @list items s c hi hs =>
      simp only [Val.replaceAt]
      split
      · rename_i w hj
        refine .list (fun w' hm => ?_) hs
        rcases List.mem_or_eq_of_mem_set hm with hm | rfl
        · exact hi w' hm
        · exact replaceAt_checkableA a (hi w (List.mem_of_getElem? hj)) hx
      · exact .list hi hs
    | meet hl hr =>
      cases j with
      | zero => exact .meet (replaceAt_checkableA a hl hx) hr
      | succ j => exact .meet hl (replaceAt_checkableA a hr hx)
    | ride h => cases j <;> exact .ride (replaceAt_checkableA a h hx)
    | link h ht => cases j <;> exact .link (replaceAt_checkableA a h hx) ht
    | len hc => cases j <;> exact .len hc
    | @or arms ha =>
      simp only [Val.replaceAt]
      split
      · rename_i rk b hj
        refine .or (fun rk' a' hm => ?_)
        rcases List.mem_or_eq_of_mem_set hm with hm | hm
        · exact ha rk' a' hm
        · simp only [Prod.mk.injEq] at hm
          obtain ⟨-, rfl⟩ := hm
          exact replaceAt_checkableA a (ha rk b (List.mem_of_getElem? hj)) hx
      · exact .or ha
    | pref hx' => cases j <;> exact .pref (replaceAt_checkableA a hx' hx)
    | nof hn hcs => cases j <;> exact .nof hn hcs
    | call ha => cases j <;> exact .call ha
    | must hc => cases j <;> exact .must hc
    | when hc ht he => cases j <;> exact .when hc ht he
    | contains hc hn => cases j <;> exact .contains hc hn
    | rest ht h1 h2 h3 => cases j <;> exact .rest ht h1 h2 h3
    | selectKey hp hr hd => cases j <;> exact .selectKey hp hr hd
    | selectLit hp hr hd => cases j <;> exact .selectLit hp hr hd
    | _ => cases j <;> constructor

/-- A term with a term the checker can read at an address, each
disjunction and preference on the way read as the arm it passes
through, is one the checker can read. -/
theorem chooseAt_checkableA : ∀ (a : List ℕ) {v x : Val}, v.CheckableA → x.CheckableA →
    (v.chooseAt a x).CheckableA
  | [], _, _, _, hx => by simp only [Val.chooseAt]; exact hx
  | j :: a, v, x, hv, hx => by
    cases hv with
    | @map fs s c hf hs =>
      simp only [Val.chooseAt]
      split
      · rename_i k o w hj
        refine .map (fun k' o' w' hm => ?_) hs
        rcases List.mem_or_eq_of_mem_set hm with hm | hm
        · exact hf k' o' w' hm
        · simp only [Prod.mk.injEq] at hm
          obtain ⟨-, -, rfl⟩ := hm
          exact chooseAt_checkableA a (hf k o w (List.mem_of_getElem? hj)) hx
      · exact .map hf hs
    | @list items s c hi hs =>
      simp only [Val.chooseAt]
      split
      · rename_i w hj
        refine .list (fun w' hm => ?_) hs
        rcases List.mem_or_eq_of_mem_set hm with hm | rfl
        · exact hi w' hm
        · exact chooseAt_checkableA a (hi w (List.mem_of_getElem? hj)) hx
      · exact .list hi hs
    | meet hl hr =>
      cases j with
      | zero => exact .meet (chooseAt_checkableA a hl hx) hr
      | succ j => exact .meet hl (chooseAt_checkableA a hr hx)
    | ride h => cases j <;> exact .ride (chooseAt_checkableA a h hx)
    | link h ht => cases j <;> exact .link (chooseAt_checkableA a h hx) ht
    | len hc => cases j <;> exact .len hc
    | @or arms ha =>
      simp only [Val.chooseAt]
      split
      · rename_i rk b hj
        exact chooseAt_checkableA a (ha rk b (List.mem_of_getElem? hj)) hx
      · exact .or ha
    | pref hx' => cases j <;> exact chooseAt_checkableA a hx' hx
    | nof hn hcs => cases j <;> exact .nof hn hcs
    | call ha => cases j <;> exact .call ha
    | must hc => cases j <;> exact .must hc
    | when hc ht he => cases j <;> exact .when hc ht he
    | contains hc hn => cases j <;> exact .contains hc hn
    | rest ht h1 h2 h3 => cases j <;> exact .rest ht h1 h2 h3
    | selectKey hp hr hd => cases j <;> exact .selectKey hp hr hd
    | selectLit hp hr hd => cases j <;> exact .selectLit hp hr hd
    | _ => cases j <;> constructor

/-- The term a term the checker can read holds at an address is one it
can read. -/
theorem termAt_checkableA : ∀ (a : List ℕ) {v w : Val}, v.CheckableA → v.termAt a = some w → w.CheckableA
  | [], _, _, hv, h => by
    simp only [Val.termAt, Option.some.injEq] at h
    exact h ▸ hv
  | j :: a, v, w, hv, h => by
    cases hv with
    | @map fs s c hf hs =>
      simp only [Val.termAt] at h
      cases hj : fs[j]? with
      | none => rw [hj] at h; exact nomatch h
      | some f =>
        rw [hj] at h
        obtain ⟨k, o, u⟩ := f
        exact termAt_checkableA a (hf k o u (List.mem_of_getElem? hj)) h
    | @list items s c hi hs =>
      simp only [Val.termAt] at h
      cases hj : items[j]? with
      | none => rw [hj] at h; exact nomatch h
      | some u =>
        rw [hj] at h
        exact termAt_checkableA a (hi u (List.mem_of_getElem? hj)) h
    | meet hl hr =>
      cases j with
      | zero => exact termAt_checkableA a hl (by simpa only [Val.termAt] using h)
      | succ j => exact termAt_checkableA a hr (by simpa only [Val.termAt] using h)
    | ride h' => cases j <;> exact termAt_checkableA a h' (by simpa only [Val.termAt] using h)
    | link h' _ => cases j <;> exact termAt_checkableA a h' (by simpa only [Val.termAt] using h)
    | @or arms ha =>
      simp only [Val.termAt] at h
      cases hj : arms[j]? with
      | none => rw [hj] at h; exact nomatch h
      | some p =>
        rw [hj] at h
        obtain ⟨rk, u⟩ := p
        exact termAt_checkableA a (ha rk u (List.mem_of_getElem? hj)) h
    | pref hx' => cases j <;> exact termAt_checkableA a hx' (by simpa only [Val.termAt] using h)
    | _ => cases j <;> simp [Val.termAt] at h

mutual
/-- Each disjunction and lone preference a term the checker can read
holds where `Val.orNodes` finds it is a term the checker can read. -/
theorem orNodes_checkableA : ∀ {v : Val}, v.CheckableA → ∀ (pos : List Seg) (addr : List ℕ) n,
    n ∈ v.orNodes pos addr → n.2.2.CheckableA
  | .or _, .or ha, pos, addr, n, hn => by
    simp only [Val.orNodes, List.mem_append, List.mem_singleton] at hn
    rcases hn with hn | rfl
    · exact onArms_checkableA ha pos addr 0 n hn
    · exact .or ha
  | .pref _ _, .pref hx, pos, addr, n, hn => by
    simp only [Val.orNodes, List.mem_append, List.mem_singleton] at hn
    rcases hn with hn | rfl
    · exact orNodes_checkableA hx pos _ n hn
    · exact .pref hx
  | .map fs _ _, .map hf _, pos, addr, n, hn => onFields_checkableA hf pos addr 0 n hn
  | .list items _ _, .list hi _, pos, addr, n, hn => onItems_checkableA hi pos addr 0 n hn
  | .meet _ _, .meet hl hr, pos, addr, n, hn => by
    simp only [Val.orNodes, List.mem_append] at hn
    rcases hn with hn | hn
    · exact orNodes_checkableA hl pos _ n hn
    · exact orNodes_checkableA hr pos _ n hn
  | .ride _ _ _, .ride h, pos, addr, n, hn => orNodes_checkableA h pos _ n hn
  | .link _ _, .link h _, pos, addr, n, hn => orNodes_checkableA h pos _ n hn
  | .len _, _, _, _, _, hn
  | .nof _ _, _, _, _, _, hn | .call _ _, _, _, _, _, hn
  | .must _ _, _, _, _, _, hn | .when _ _ _, _, _, _, _, hn
  | .contains _ _, _, _, _, _, hn | .rest _ _, _, _, _, _, hn
  | .select _ _ _, _, _, _, _, hn | .alias _, _, _, _, _, hn
  | .path _, _, _, _, _, hn => by simp only [Val.orNodes, List.not_mem_nil] at hn
  | .integer, _, _, _, _, hn | .float, _, _, _, _, hn
  | .biginteger, _, _, _, _, hn | .bigdecimal, _, _, _, _, hn
  | .number, _, _, _, _, hn | .string, _, _, _, _, hn
  | .anyString, _, _, _, _, hn | .boolean, _, _, _, _, hn
  | .mapKind, _, _, _, _, hn | .listKind, _, _, _, _, hn
  | .pathKind, _, _, _, _, hn | .lit _, _, _, _, _, hn
  | .addr _, _, _, _, _, hn | .min _, _, _, _, _, hn
  | .max _, _, _, _, _, hn | .above _, _, _, _, _, hn
  | .beneath _, _, _, _, _, hn | .neq _, _, _, _, _, hn
  | .mulof _, _, _, _, _, hn | .unique _, _, _, _, _, hn
  | .grammar _, _, _, _, _, hn | .any, _, _, _, _, hn
  | .absent, _, _, _, _, hn | .hole, _, _, _, _, hn
  | .nil, _, _, _, _, hn | .nothing, _, _, _, _, hn
  | .key, _, _, _, _, hn | .keyUp _, _, _, _, _, hn =>
    by simp only [Val.orNodes, List.not_mem_nil] at hn

theorem onFields_checkableA : ∀ {fs : List (String × Bool × Val)}, (∀ k o v, (k, o, v) ∈ fs → v.CheckableA) →
    ∀ (pos : List Seg) (addr : List ℕ) (j : ℕ) n, n ∈ onFields pos addr j fs → n.2.2.CheckableA
  | [], _, _, _, _, _, hn => by simp only [onFields, List.not_mem_nil] at hn
  | (k, o, v) :: fs, hf, pos, addr, j, n, hn => by
    simp only [onFields, List.mem_append] at hn
    rcases hn with hn | hn
    · exact orNodes_checkableA (hf k o v List.mem_cons_self) _ _ n hn
    · exact onFields_checkableA (fun k o v hv => hf k o v (List.mem_cons_of_mem _ hv)) pos addr (j + 1) n hn

theorem onItems_checkableA : ∀ {items : List Val}, (∀ v, v ∈ items → v.CheckableA) →
    ∀ (pos : List Seg) (addr : List ℕ) (j : ℕ) n, n ∈ onItems pos addr j items → n.2.2.CheckableA
  | [], _, _, _, _, _, hn => by simp only [onItems, List.not_mem_nil] at hn
  | v :: vs, hi, pos, addr, j, n, hn => by
    simp only [onItems, List.mem_append] at hn
    rcases hn with hn | hn
    · exact orNodes_checkableA (hi v List.mem_cons_self) _ _ n hn
    · exact onItems_checkableA (fun v hv => hi v (List.mem_cons_of_mem _ hv)) pos addr (j + 1) n hn

theorem onArms_checkableA : ∀ {arms : List (ℕ × Val)}, (∀ r a, (r, a) ∈ arms → a.CheckableA) →
    ∀ (pos : List Seg) (addr : List ℕ) (j : ℕ) n, n ∈ onArms pos addr j arms → n.2.2.CheckableA
  | [], _, _, _, _, _, hn => by simp only [onArms, List.not_mem_nil] at hn
  | (r, a) :: as, ha, pos, addr, j, n, hn => by
    simp only [onArms, List.mem_append] at hn
    rcases hn with hn | hn
    · exact orNodes_checkableA (ha r a List.mem_cons_self) _ _ n hn
    · exact onArms_checkableA (fun r' a' h => ha r' a' (List.mem_cons_of_mem _ h)) pos addr (j + 1) n hn
end

/-- The arms of a disjunction or a lone preference the checker can read
are terms it can read. -/
theorem nodeArms_checkableA {v : Val} (h : v.CheckableA) : ∀ rk a, (rk, a) ∈ v.nodeArms → a.CheckableA := by
  intro rk a hm
  cases h with
  | or ha => exact ha rk a hm
  | pref hx =>
    simp only [Val.nodeArms, List.mem_singleton, Prod.mk.injEq] at hm
    exact hm.2 ▸ hx
  | _ => simp [Val.nodeArms] at hm

/-- An arm read where it holds is a term the checker can read. -/
theorem Decls.armChosen_checkableA {L1 : Decls} {r : Decls → Val → List Val} {doc : Val → Decls × Val}
    {pre : String} {pos : List Seg} {root a : Val} {parent : Bool} (hr : RootsReadable r)
    (hL : ∀ d, d ∈ L1 → d.2.CheckableA)
    (hdoc : ∀ x, x.CheckableA → (∀ d, d ∈ (doc x).1 → d.2.CheckableA) ∧ (doc x).2.CheckableA)
    (ha : a.CheckableA) : (L1.armChosen r doc pre pos root a parent).1.CheckableA := by
  have ha' := membersRead_checkableA (P := L1.armsRead root pos [] (expandF L1 (a.size + L1.bodiesSize + 1) a)) hL
    (armsRead_checkableA hL (expandF_checkableA hL _ _ ha) _) root pos
  have hd := hdoc _ ha'
  unfold Decls.armChosen
  dsimp only
  split
  · split
    · exact armed_checkableA (expand_checkableA (Decls.ofPaths_checkableA (bs := []) hd.1 (hr hd.1 hd.2) (fun _ h => nomatch h) _)
        (pathsToAliases_checkableA ha')).super
    · exact armed_checkableA (pathsToAliases_checkableA ha')
  · exact .nil

/-- The declarations an arm's paths make where it holds are terms the
checker can read. -/
theorem Decls.armChosen_decls_checkableA {L1 : Decls} {r : Decls → Val → List Val} {doc : Val → Decls × Val}
    {pre : String} {pos : List Seg} {root a : Val} {parent : Bool} (hr : RootsReadable r)
    (hL : ∀ d, d ∈ L1 → d.2.CheckableA)
    (hdoc : ∀ x, x.CheckableA → (∀ d, d ∈ (doc x).1 → d.2.CheckableA) ∧ (doc x).2.CheckableA)
    (ha : a.CheckableA) : ∀ d, d ∈ (L1.armChosen r doc pre pos root a parent).2 → d.2.CheckableA := by
  have ha' := membersRead_checkableA (P := L1.armsRead root pos [] (expandF L1 (a.size + L1.bodiesSize + 1) a)) hL
    (armsRead_checkableA hL (expandF_checkableA hL _ _ ha) _) root pos
  have hd := hdoc _ ha'
  unfold Decls.armChosen
  dsimp only
  split
  · split
    · intro d h
      simp only [List.mem_map] at h
      obtain ⟨d', hd', rfl⟩ := h
      exact armed_checkableA (Decls.ofPaths_checkableA (bs := []) hd.1 (hr hd.1 hd.2) (fun _ h => nomatch h) _ d' hd').super
    · intro d h
      simp only [List.mem_map] at h
      obtain ⟨d', hd', rfl⟩ := h
      exact armed_checkableA (Decls.ofPaths_checkableA (bs := []) hd.1 (hr hd.1 hd.2) (fun _ h => nomatch h) _ d' hd')
  · intro d h
    exact nomatch h

theorem Decls.armsAt_checkableA {L1 : Decls} {r : Decls → Val → List Val} {doc : List ℕ → Val → Decls × Val}
    {tag : String} {n : List ℕ × List Seg × Val}
    {root : List ℕ × List Seg × Val → Val → Val} (hr : RootsReadable r)
    (hL : ∀ d, d ∈ L1 → d.2.CheckableA)
    (hdoc : ∀ a x, x.CheckableA → (∀ d, d ∈ (doc a x).1 → d.2.CheckableA) ∧ (doc a x).2.CheckableA) :
    ∀ (i : ℕ) (as : List (ℕ × Val)), (∀ rk a, (rk, a) ∈ as → a.CheckableA) →
    (∀ rk a, (rk, a) ∈ (L1.armsAt r doc tag n root i as).1 → a.CheckableA) ∧
      ∀ d, d ∈ (L1.armsAt r doc tag n root i as).2 → d.2.CheckableA
  | _, [], _ => ⟨fun _ _ h => (nomatch h), fun _ h => (nomatch h)⟩
  | i, (rk, a) :: as, ha => by
    have rest := Decls.armsAt_checkableA (tag := tag) (n := n) (root := root) hr hL hdoc (i + 1) as
      (fun rk' a' hm => ha rk' a' (List.mem_cons_of_mem _ hm))
    have h0 := ha rk a List.mem_cons_self
    simp only [Decls.armsAt, List.mem_cons, Prod.mk.injEq, List.mem_append]
    refine ⟨fun r' a' h => ?_, fun d h => ?_⟩
    · rcases h with ⟨-, rfl⟩ | h
      · exact Decls.armChosen_checkableA hr hL (hdoc n.1) h0
      · exact rest.1 r' a' h
    · rcases h with h | h
      · exact Decls.armChosen_decls_checkableA hr hL (hdoc n.1) h0 d h
      · exact rest.2 d h

/-- A disjunction or a lone preference read with each arm where it holds
is a term the checker can read, and so is each declaration it makes. -/
theorem Decls.nodeChosen_checkableA {L1 : Decls} {r : Decls → Val → List Val}
    {doc : List ℕ → Val → Decls × Val} {tag : String} {n : List ℕ × List Seg × Val}
    {root : List ℕ × List Seg × Val → Val → Val} {xS : Val} (hr : RootsReadable r)
    (hL : ∀ d, d ∈ L1 → d.2.CheckableA)
    (hdoc : ∀ a x, x.CheckableA → (∀ d, d ∈ (doc a x).1 → d.2.CheckableA) ∧ (doc a x).2.CheckableA)
    (hn : n.2.2.CheckableA) (hxS : xS.CheckableA) :
    (L1.nodeChosen r doc tag n root xS).1.CheckableA ∧
      ∀ d, d ∈ (L1.nodeChosen r doc tag n root xS).2 → d.2.CheckableA := by
  unfold Decls.nodeChosen
  split
  · rename_i rk x hx
    rw [hx] at hn
    cases hn with
    | pref hx' =>
      refine ⟨.or fun rk' a' hm => ?_, fun d h => ?_⟩
      · simp only [List.mem_cons, Prod.mk.injEq, List.not_mem_nil, or_false] at hm
        rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩
        · exact Decls.armChosen_checkableA hr hL (hdoc n.1) hx'
        · exact Decls.armChosen_checkableA rootsS_readable hL (hdoc n.1) hxS
      · simp only [List.mem_append] at h
        rcases h with h | h
        · exact Decls.armChosen_decls_checkableA hr hL (hdoc n.1) hx' d h
        · exact Decls.armChosen_decls_checkableA rootsS_readable hL (hdoc n.1) hxS d h
  · have ha := Decls.armsAt_checkableA (tag := tag) (n := n) (root := root) hr hL hdoc 0 _
      (nodeArms_checkableA hn)
    exact ⟨.or ha.1, ha.2⟩

theorem nodeIn_checkableA {Q : Val} {n : List ℕ × List Seg × Val} (hQ : Q.CheckableA)
    (hn : n.2.2.CheckableA) : (nodeIn Q n).2.2.CheckableA := by
  unfold nodeIn
  dsimp only
  cases h : Q.termAt n.1 with
  | none => exact hn
  | some w => exact termAt_checkableA n.1 hQ h

theorem prefValue_checkableA {QS : Val} {n : List ℕ × List Seg × Val} (hQS : QS.CheckableA)
    (hn : n.2.2.CheckableA) : (prefValue QS n).CheckableA := by
  have h := nodeIn_checkableA hQS hn
  unfold prefValue
  revert h
  cases (nodeIn QS n).2.2 <;> intro h <;> first | exact h | (cases h; assumption)

theorem Decls.armsChosen_checkableA {L1 : Decls} {r : Decls → Val → List Val}
    {doc : List ℕ → Val → Decls × Val} {tag : ℕ → String}
    {root : List ℕ × List Seg × Val → Val → Val} (hr : RootsReadable r)
    (hL : ∀ d, d ∈ L1 → d.2.CheckableA)
    (hdoc : ∀ a x, x.CheckableA → (∀ d, d ∈ (doc a x).1 → d.2.CheckableA) ∧ (doc a x).2.CheckableA) :
    ∀ (k : ℕ) (ns : List (List ℕ × List Seg × Val)) (Q QS : Val),
    (∀ n, n ∈ ns → n.2.2.CheckableA) → Q.CheckableA → QS.CheckableA →
    (L1.armsChosen r doc tag root k ns Q QS).1.CheckableA ∧
      ∀ d, d ∈ (L1.armsChosen r doc tag root k ns Q QS).2 → d.2.CheckableA
  | _, [], _, _, _, hQ, _ => ⟨hQ, fun _ h => (nomatch h)⟩
  | k, n :: ns, Q, QS, hns, hQ, hQS => by
    have hn := hns n List.mem_cons_self
    have hx := prefValue_checkableA hQS hn
    have ha := Decls.nodeChosen_checkableA (tag := tag k) (n := nodeIn Q n) (root := root) hr hL hdoc
      (nodeIn_checkableA hQ hn) hx
    have hs : (if underPref ns n then
          L1.nodeChosen Decls.rootsS doc (tag k) (nodeIn QS n) root (prefValue QS n)
        else L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)).1.CheckableA ∧
        ∀ d, d ∈ (if underPref ns n then
          L1.nodeChosen Decls.rootsS doc (tag k) (nodeIn QS n) root (prefValue QS n)
        else L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)).2 → d.2.CheckableA := by
      split
      · exact Decls.nodeChosen_checkableA (tag := tag k) (n := nodeIn QS n) (root := root) rootsS_readable hL
          hdoc (nodeIn_checkableA hQS hn) hx
      · exact ha
    have rest := Decls.armsChosen_checkableA (tag := tag) (root := root) hr hL hdoc (k + 1) ns
      (Q.replaceAt n.1 (expand (L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)).2
        (L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)).1))
      (QS.replaceAt n.1 (expand (if underPref ns n then
          L1.nodeChosen Decls.rootsS doc (tag k) (nodeIn QS n) root (prefValue QS n)
        else L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)).2
        (if underPref ns n then
          L1.nodeChosen Decls.rootsS doc (tag k) (nodeIn QS n) root (prefValue QS n)
        else L1.nodeChosen r doc (tag k) (nodeIn Q n) root (prefValue QS n)).1))
      (fun n' hn' => hns n' (List.mem_cons_of_mem _ hn'))
      (replaceAt_checkableA _ hQ (expand_checkableA ha.2 ha.1))
      (replaceAt_checkableA _ hQS (expand_checkableA hs.2 hs.1))
    simp only [Decls.armsChosen, List.mem_append]
    exact ⟨rest.1, fun d h => h.elim (ha.2 d) (rest.2 d)⟩

theorem ownDoc_checkableA {n : String} {b : Val} (hb : b.CheckableA) : (ownDoc n b).CheckableA :=
  .map (fun k o v h => by
    simp only [List.mem_singleton, Prod.mk.injEq] at h
    obtain ⟨-, -, rfl⟩ := h
    exact hb) (fun _ h => nomatch h)

theorem splitOrs_checkableA {v : Val} (h : v.CheckableA) :
    (∀ as, as ∈ v.splitOrs.1 → ∀ p, p ∈ as → p.2.CheckableA) ∧
      ∀ c, c ∈ v.splitOrs.2 → c.CheckableA := by
  induction h with
  | meet _ _ iha ihb =>
    simp only [Val.splitOrs, List.mem_append]
    exact ⟨fun as h => h.elim (iha.1 as) (ihb.1 as), fun c h => h.elim (iha.2 c) (ihb.2 c)⟩
  | @or arms ha _ =>
    refine ⟨fun as h p hp => ?_, fun c h => ?_⟩
    · simp only [Val.splitOrs, List.mem_singleton] at h
      subst h
      exact ha p.1 p.2 hp
    · simp only [Val.splitOrs, List.not_mem_nil] at h
  | _ =>
    refine ⟨fun as h => ?_, fun c h => ?_⟩
    · simp only [Val.splitOrs, List.not_mem_nil] at h
    · simp only [Val.splitOrs, List.mem_singleton] at h
      subst h
      constructor <;> assumption

theorem prefArms_checkableA {c : Val} (h : c.CheckableA) : ∀ p, p ∈ c.prefArms → p.2.CheckableA := by
  cases c with
  | pref r x =>
    cases h with
    | pref hx =>
      intro p hp
      simp only [Val.prefArms, List.mem_cons, List.not_mem_nil, or_false] at hp
      rcases hp with rfl | rfl
      · exact hx
      · exact .pref hx
  | _ => intro p hp; rw [List.mem_singleton.mp hp]; exact h

theorem meetOrs_checkableA {v : Val} (h : v.CheckableA) : v.meetOrs.CheckableA := by
  have hs := splitOrs_checkableA h
  have hmeet : ∀ (cs : List Val) (acc : Val), acc.CheckableA → (∀ c, c ∈ cs → c.CheckableA) →
      (cs.foldl .meet acc).CheckableA := by
    intro cs
    induction cs with
    | nil => intro acc hacc _; exact hacc
    | cons c cs ih =>
      intro acc hacc hc
      exact ih _ (.meet hacc (hc c List.mem_cons_self)) fun c' h' => hc c' (List.mem_cons_of_mem _ h')
  have hfold : ∀ (more : List (List (ℕ × Val))) (acc : List (ℕ × Val)),
      (∀ p, p ∈ acc → p.2.CheckableA) → (∀ as', as' ∈ more → ∀ p, p ∈ as' → p.2.CheckableA) →
      ∀ p, p ∈ more.foldl orMeet acc → p.2.CheckableA := by
    intro more
    induction more with
    | nil => intro acc hacc _; exact hacc
    | cons c cs ih =>
      intro acc hacc hr
      exact ih (orMeet acc c) (orMeet_checkableA hacc (hr c List.mem_cons_self))
        fun as' h' => hr as' (List.mem_cons_of_mem _ h')
  unfold Val.meetOrs
  split
  · rename_i as more heq
    split
    · have hm : ∀ as', as' ∈ as :: more → ∀ p, p ∈ as' → p.2.CheckableA :=
        fun as' h' => hs.1 as' (heq ▸ h')
      refine .or fun r a h' => ?_
      simp only [List.mem_map, Prod.mk.injEq] at h'
      obtain ⟨p, hp, rfl, rfl⟩ := h'
      refine hmeet _ _ (hfold _ as (hm as List.mem_cons_self) (fun as' h'' => ?_) p hp)
        fun c hc => hs.2 c (List.mem_filter.mp hc).1
      rcases List.mem_append.mp h'' with h'' | h''
      · exact hm as' (List.mem_cons_of_mem _ h'')
      · obtain ⟨c, hc, rfl⟩ := List.mem_map.mp h''
        exact prefArms_checkableA (hs.2 c (List.mem_filter.mp hc).1)
    · exact h
  · exact h

mutual
theorem distributed_checkableA : ∀ {v : Val}, v.CheckableA → v.distributed.CheckableA := by
  intro v h
  induction h with
  | @map fs spread closed _ hs ihf _ => exact .map (dsFields_checkableA fs ihf) hs
  | @list items spread closed _ hs ihi _ => exact .list (dsItems_checkableA items ihi) hs
  | @or arms _ iha => exact .or (dsArms_checkableA arms iha)
  | pref _ ih => exact .pref ih
  | meet _ _ iha ihb => exact meetOrs_checkableA (.meet iha ihb)
  | ride _ ih => exact .ride ih
  | link _ ht ih _ => exact .link ih ht
  | _ => constructor <;> assumption

theorem dsFields_checkableA : ∀ (fs : List (String × Bool × Val)),
    (∀ k o v, (k, o, v) ∈ fs → v.distributed.CheckableA) →
    ∀ k o v, (k, o, v) ∈ dsFields fs → v.CheckableA
  | [], _, _, _, _, h => nomatch h
  | (k, o, v) :: fs, ih, k', o', v', h => by
    simp only [dsFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ih _ _ _ List.mem_cons_self
    · exact dsFields_checkableA fs (fun k o v h' => ih k o v (List.mem_cons_of_mem _ h')) k' o' v' h

theorem dsItems_checkableA : ∀ (items : List Val), (∀ v, v ∈ items → v.distributed.CheckableA) →
    ∀ v, v ∈ dsItems items → v.CheckableA
  | [], _, _, h => nomatch h
  | v :: vs, ih, v', h => by
    simp only [dsItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ih _ List.mem_cons_self
    · exact dsItems_checkableA vs (fun v h' => ih v (List.mem_cons_of_mem _ h')) v' h

theorem dsArms_checkableA : ∀ (arms : List (ℕ × Val)), (∀ r a, (r, a) ∈ arms → a.distributed.CheckableA) →
    ∀ r a, (r, a) ∈ dsArms arms → a.CheckableA
  | [], _, _, _, h => nomatch h
  | (r, a) :: as, ih, r', a', h => by
    simp only [dsArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ih _ _ List.mem_cons_self
    · exact dsArms_checkableA as (fun r a h' => ih r a (List.mem_cons_of_mem _ h')) r' a' h
end

/-- A document's declarations and schema read with each arm read where it
holds are terms the checker can read. -/
theorem Decls.readArms_checkableA {L1 ds' : Decls} {r : Decls → Val → List Val} {P : Val}
    {ns : List (List ℕ × List Seg × Val)} {root : List ℕ × List Seg × Val → Val → Val}
    {isBody : String → Bool} {drop : List String} (hr : RootsReadable r) (hds : ∀ d, d ∈ ds' → d.2.CheckableA)
    (hL : ∀ d, d ∈ L1 → d.2.CheckableA) (hP : P.CheckableA)
    (hns : ∀ n, n ∈ ns → n.2.2.CheckableA) :
    (L1.readArms ds' r P ns root isBody drop).2.CheckableA ∧
      ∀ d, d ∈ (L1.readArms ds' r P ns root isBody drop).1 → d.2.CheckableA := by
  have top := Decls.armsChosen_checkableA (doc := fun a x => (ds', P.chooseAt a x)) (tag := toString)
    (root := root) hr hL (fun a x hx => ⟨hds, chooseAt_checkableA a hP hx⟩) 0 ns P P hns hP hP
  have own : ∀ d, d ∈ ds' → _ := fun d hd => Decls.armsChosen_checkableA
    (doc := fun a x => (ds', ownDoc d.1 (d.2.chooseAt a x))) (tag := fun k => d.1 ++ "#" ++ toString k)
    (root := fun n a => L1.treeAt r (ownDoc d.1 (d.2.chooseAt n.1 a)) n.2.1) hr hL
    (fun a x hx => ⟨hds, ownDoc_checkableA (chooseAt_checkableA a (hds d hd) hx)⟩) 0
    (d.2.armNodes [.own d.1]) d.2 d.2
    (fun n hn => orNodes_checkableA (hds d hd) _ [] n (List.mem_filter.mp hn).1) (hds d hd) (hds d hd)
  unfold Decls.readArms
  dsimp only
  refine ⟨top.1, fun d hd => ?_⟩
  simp only [List.mem_append, List.mem_map, List.mem_flatMap, List.mem_filter] at hd
  rcases hd with ⟨⟨d', hd', rfl⟩, -⟩ | ⟨d', ⟨hd', -⟩, hm⟩ | hd
  · split
    · exact (own d' hd').1
    · exact hds d' hd'
  · exact (own d' hd').2 d hm
  · exact top.2 d hd

/-- A document the definition reads, and its declarations, each body
read at its own place, each other template left to admit any member and
each arm read where it holds, are terms the checker can read. -/
theorem Decls.prepared_readable {ds : Decls} {S : Val} {rl r : Decls → Val → List Val} {oj : Option Data}
    (hrl : RootsReadable rl) (hr : RootsReadable r) (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    (ds.prepared S rl r oj).2.CheckableA ∧ ∀ d, d ∈ (ds.prepared S rl r oj).1 → d.2.CheckableA := by
  have hL : ∀ d, d ∈ (ds.linked S rl oj).1 → d.2.CheckableA :=
    Decls.placed_bodies_checkableA (Decls.withRel_checkableA hb) hS
  have hL2 : (ds.linked S rl oj).2.CheckableA :=
    withRefers_checkableA hrl (Decls.placed_bodies_checkableA (Decls.withRel_checkableA hb) hS)
      (withMoves_checkableA (Decls.placed_checkableA hS))
  have hT : ∀ f : String → Bool,
      ((ds.linked S rl oj).2.unfoldAt f fun n => expandF (ds.linked S rl oj).1 1 (.alias n)).CheckableA :=
    fun _ => unfoldAt_checkableA (fun n _ => expandF_checkableA hL 1 (.alias n) .alias) hL2
  unfold Decls.prepared
  dsimp only
  refine Decls.readArms_checkableA hr ?_ hL
    (distributed_checkableA (membersRead_checkableA hL (armsRead_checkableA hL (hT _) _) _ _))
    fun n hn => orNodes_checkableA
      (distributed_checkableA (membersRead_checkableA hL (armsRead_checkableA hL (hT _) _) _ _)) [] [] n
      (List.mem_filter.mp hn).1
  intro d hd
  simp only [List.mem_map] at hd
  obtain ⟨d', hd', rfl⟩ := hd
  dsimp only
  split
  · exact distributed_checkableA (ownRead_checkableA hL (hL d' hd'))
  · split
    · refine neutral_checkableA ?_
      unfold Decls.copyArms
      cases (Decls.usePlaces _ _).lookup d'.1 with
      | none => exact hL d' hd'
      | some q => exact armsRead_checkableA hL (hL d' hd') q
    · exact hL d' hd'

theorem Decls.prepared_checkableA {ds : Decls} {S : Val} {rl r : Decls → Val → List Val} {oj : Option Data}
    (hrl : RootsReadable rl) (hr : RootsReadable r) (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    (ds.prepared S rl r oj).2.CheckableA :=
  (Decls.prepared_readable hrl hr hb hS).1

/-- A document's declarations as the definition reads them are terms
the checker can read. -/
theorem Decls.prepared_bodies_checkableA {ds : Decls} {S : Val} {rl r : Decls → Val → List Val}
    {oj : Option Data} (hrl : RootsReadable rl) (hr : RootsReadable r) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) : ∀ d, d ∈ (ds.prepared S rl r oj).1 → d.2.CheckableA :=
  (Decls.prepared_readable hrl hr hb hS).2

/-- `vetA` computes `VetA` wherever the checker can read the two
documents the verdict hands `vet`, the schema's reading and the data's,
each with its bodies, as it can a document whose `filter` reads its
source to the members it keeps. -/
theorem vetA_iff_of {m : Mode} {ds ds' : Decls} {S S' : Val} {j : Data}
    (hbS : ∀ d, d ∈ (ds.withPathsS S).1 → d.2.CheckableA)
    (hRS : ((ds.withPathsS S).1.readR (ds.withPathsS S).2).CheckableA)
    (hbP : ∀ d, d ∈ (ds'.withPaths S' j).1 → d.2.CheckableA)
    (hRP : ((ds'.withPaths S' j).1.readR (ds'.withPaths S' j).2).CheckableA) (v : Verdict) :
    vetA m ds S ds' S' j = v ↔ VetA m ds S ds' S' j v := by
  have hvS := vet_iff (m := m) (ds := (ds.withPathsS S).1) (S := (ds.withPathsS S).2) (j := j) hbS hRS
  have hvP := vet_iff (m := m) (ds := (ds'.withPaths S' j).1) (S := (ds'.withPaths S' j).2) (j := j) hbP hRP
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
      cases hp : vet m (ds'.withPaths S' j).1 (ds'.withPaths S' j).2 j <;> cases v <;>
        simp only [VetA, hR, hE, ← hvP, hp, not_true_eq_false, not_false_eq_true,
          or_true, or_false, and_false, and_true, reduceCtorEq]
  · rw [if_neg hr]
    have hR : ¬ ds.Resolves S := fun h => hr (Decls.resolvesB_iff.mpr h)
    cases v <;> simp only [VetA, hR, not_false_eq_true, true_or, false_and, reduceCtorEq]

/-- `vetA` computes `VetA` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetA_iff {m : Mode} {ds ds' : Decls} {S S' : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (hb' : ∀ d, d ∈ ds' → d.2.CheckableA) (hS' : S'.CheckableA) (v : Verdict) :
    vetA m ds S ds' S' j = v ↔ VetA m ds S ds' S' j v :=
  have hbS := Decls.callsMade_checkableA (Decls.withPathsFrom_bodies_checkableA (S := S) hb
    (Decls.roundsS_checkableA hb hS).1 (Decls.roundsS_checkableA hb hS).2)
  have hbP := Decls.callsMade_checkableA (Decls.withPathsFrom_bodies_checkableA (S := S') hb'
    (Decls.roundsD_checkableA (j := j) hb' hS').1 (Decls.roundsD_checkableA (j := j) hb' hS').2)
  vetA_iff_of hbS (readR_checkableA hbS (pathsToAliases_checkableA hS)) hbP
    (readR_checkableA hbP (pathsToAliases_checkableA hS')) v

/-- Whether the checker can read the two documents `vetA` hands `vet`,
each with its bodies, computed. -/
def Decls.readsAB (ds : Decls) (S : Val) (ds' : Decls) (S' : Val) (j : Data) : Bool :=
  (ds.withPathsS S).1.all (·.2.checkableAB) && ((ds.withPathsS S).1.readR (ds.withPathsS S).2).checkableAB &&
    (ds'.withPaths S' j).1.all (·.2.checkableAB) && ((ds'.withPaths S' j).1.readR (ds'.withPaths S' j).2).checkableAB

theorem vetA_iff_reads {m : Mode} {ds ds' : Decls} {S S' : Val} {j : Data} (h : ds.readsAB S ds' S' j = true)
    (v : Verdict) : vetA m ds S ds' S' j = v ↔ VetA m ds S ds' S' j v := by
  simp only [Decls.readsAB, Bool.and_eq_true, List.all_eq_true] at h
  obtain ⟨⟨⟨hbS, hRS⟩, hbP⟩, hRP⟩ := h
  exact vetA_iff_of (fun d hd => (Val.checkableAB_iff _).mp (hbS d hd)) ((Val.checkableAB_iff _).mp hRS)
    (fun d hd => (Val.checkableAB_iff _).mp (hbP d hd)) ((Val.checkableAB_iff _).mp hRP) v

/-- `vetL` computes `VetL` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetL_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetL m ds S j = v ↔ VetL m ds S j v :=
  vetA_iff (ds := (ds.preparedS S).1) (S := (ds.preparedS S).2) (ds' := (ds.preparedD S j).1)
    (S' := (ds.preparedD S j).2)
    (Decls.prepared_bodies_checkableA rootsS_readable rootsS_readable hb hS)
    (Decls.prepared_checkableA rootsS_readable rootsS_readable hb hS)
    (Decls.prepared_bodies_checkableA Decls.linkReader_readable (rootsD_readable j) hb hS)
    (Decls.prepared_checkableA Decls.linkReader_readable (rootsD_readable j) hb hS) v

/-- `vetP` computes `VetP` on every document whose bodies, sources and
schema read no pattern and no format. -/
theorem vetP_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetP m ds S j = v ↔ VetP m ds S j v := by
  unfold vetP VetP
  by_cases hl : ds.loadsLeft S = true
  · rw [if_pos hl, if_pos hl]
    exact eq_comm
  · rw [if_neg hl, if_neg hl]
    exact vetL_iff (Decls.loaded_bodies_checkableA hb) (Decls.loaded_checkableA hb hS) v

/-- Whether a document leaves no load unmade and the checker can read
the two documents its verdict hands `vet`, computed: what a document
whose `filter` the checker can't read before the reading needs. -/
def Decls.readsPB (ds : Decls) (S : Val) (j : Data) : Bool :=
  !ds.loadsLeft S && ((ds.loaded S).1.preparedS (ds.loaded S).2).1.readsAB
    ((ds.loaded S).1.preparedS (ds.loaded S).2).2 ((ds.loaded S).1.preparedD (ds.loaded S).2 j).1
    ((ds.loaded S).1.preparedD (ds.loaded S).2 j).2 j

/-- `vetP` computes `VetP` on every document `Decls.readsPB` reads. -/
theorem vetP_iff_reads {m : Mode} {ds : Decls} {S : Val} {j : Data} (h : ds.readsPB S j = true)
    (v : Verdict) : vetP m ds S j = v ↔ VetP m ds S j v := by
  simp only [Decls.readsPB, Bool.and_eq_true, Bool.not_eq_true'] at h
  unfold vetP VetP
  rw [if_neg (by simp [h.1]), if_neg (by simp [h.1])]
  exact vetA_iff_reads h.2 v

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

/-- What a document with paths whose sources are read in generates: the
document prepared before any data (`Decls.preparedS`), the relation
kind declared, its relative paths placed, the sources its moves read
hidden, its links' templates met into their targets and its spreads
read at each member of the schema's own tree, what the document whose
paths are absolute generates. -/
def OutputL (ds : Decls) (root : Data) (S : Val) (j : Data) : Prop :=
  OutputA (ds.preparedS S).1 root (ds.preparedS S).2 j

/-- What a document with paths whose sources are read in generates,
computed. -/
def outputL (ds : Decls) (S : Val) : Option Data :=
  outputA (ds.preparedS S).1 (ds.preparedS S).2

/-- What a document with paths generates: what the document with its
sources read in generates (`Decls.loaded`, `OutputL`), where it holds
no load the reading couldn't make. -/
def OutputP (ds : Decls) (root : Data) (S : Val) (j : Data) : Prop :=
  ds.loadsLeft S = false ∧ OutputL (ds.loaded S).1 root (ds.loaded S).2 j

/-- What a document with paths generates, computed. -/
def outputP (ds : Decls) (S : Val) : Option Data :=
  if ds.loadsLeft S then none else outputL (ds.loaded S).1 (ds.loaded S).2

/-- `outputL` computes `OutputL` where the reading of the placed
document keeps the alias-cycle rule and the checker can read its bodies
and its normal form. -/
theorem outputL_iff {ds : Decls} {S : Val} {root : Data}
    (hg : ((ds.preparedS S).1.withPathsS (ds.preparedS S).2).1.Guarded)
    (hb : ∀ d, d ∈ ((ds.preparedS S).1.withPathsS (ds.preparedS S).2).1 → d.2.CheckableA)
    (h : (normaliseD ((ds.preparedS S).1.withPathsS (ds.preparedS S).2).1
      (((ds.preparedS S).1.withPathsS (ds.preparedS S).2).1.readR
        ((ds.preparedS S).1.withPathsS (ds.preparedS S).2).2)).CheckableA)
    (j : Data) : outputL ds S = some j ↔ OutputL ds root S j :=
  outputA_iff hg hb h j

/-- `outputP` computes `OutputP` where `outputL` computes `OutputL` on
the document with its sources read in. -/
theorem outputP_iff {ds : Decls} {S : Val} {root : Data} {j : Data}
    (h : outputL (ds.loaded S).1 (ds.loaded S).2 = some j ↔ OutputL (ds.loaded S).1 root (ds.loaded S).2 j) :
    outputP ds S = some j ↔ OutputP ds root S j := by
  unfold outputP OutputP
  by_cases hl : ds.loadsLeft S = true
  · rw [if_pos hl]
    exact ⟨fun h' => (nomatch h'), fun ⟨h1, _⟩ => by rw [hl] at h1; exact nomatch h1⟩
  · rw [if_neg hl]
    exact ⟨fun h' => ⟨by simpa using hl, h.mp h'⟩, fun h' => h.mpr h'.2⟩

end Aontu

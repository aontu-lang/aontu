import Aontu.Paths

/-!
# The graph atoms

`acyclic()` and `inverse(k)` ride the value they meet and change nothing
in it (`Rider.acyclic`, `Rider.inverse`, `callTerm`). What they ask is
of the whole document: of the edges its relations write, which no meet
can hold, since one more edge makes an acyclic graph cyclic. So they
judge the document generation writes, and a document that waits or is
already refused isn't judged (rulings 72 and 73 of the design note's
§7).

- An **edge** is an address a relation holds: it starts from the node
  that holds the relation's field, it is of the relation that field's
  key names, and it ends at the node the address names (`edgeOf`,
  `Val.edges`). A node is known by the text of its place, as an address
  spells it (`placeText`).
- A **declaration** is an atom with the key it is met at, where that
  key is a name (`Val.graphDecls`). It holds for every edge of that
  key, wherever the edge is written.
- Edges and declarations are read from the normal form generation
  writes from, within the arms of a disjunction the rank rule picks
  (`picked`), as a link's template is read (`Val.links`): a default's
  edges are edges and an atom in a default declares, and an arm
  generation doesn't take brings neither.
- `acyclic()` asks that no node of its relation reach itself
  (`Cyclic`), and `inverse(k)` that each edge of its relation be
  mirrored by one of `k`, from its end back to its start (`Holds`).
- The verdict, `vetG`, is `vetP`'s, and `invalid` where `vetP` answers
  `valid`, the document generates, and its graph breaks an atom. And
  such a document generates nothing (`outputG`).
-/

namespace Aontu

/-! ## Places as an address spells them -/

/-- A step as an address spells it: a key as it is written, and a list
position by its digits. -/
def Seg.step : Seg → String
  | .key k => k
  | .idx i => toString i
  | _ => ""

/-- A place as an address spells it, `$` and each step after a dot, as
`Addr.text` spells an address from the root: the name both ports know a
node by. -/
def placeText (p : List Seg) : String := "$" ++ String.join (p.map fun s => "." ++ s.step)

/-- Whether a step is a list position as an address spells one: digits
and nothing else, so a key written in digits reads as a position, as
both ports read it. -/
def Seg.indexLike (s : Seg) : Bool := !s.step.isEmpty && s.step.all Char.isDigit

/-- The field a place belongs to: the place with the list positions at
its end left off, as the place that holds the field and the field's
key, and none where no key is left. -/
def fieldOf (p : List Seg) : Option (List Seg × String) :=
  match p.reverse.dropWhile Seg.indexLike with
  | [] => none
  | s :: rest => some (rest.reverse, s.step)

/-! ## The edges a document writes -/

mutual
/-- The addresses at a term's leaves, each with the place it stands at:
`Val.addrs` with places, through a list's elements, a map's members,
meets, riders and a disjunction of one arm. -/
def Val.addrsAt (pos : List Seg) : Val → List (List Seg × Addr)
  | .addr a => [(pos, a)]
  | .list items _ _ => addrsAtItems pos 0 items
  | .map fs _ _ => addrsAtFields pos fs
  | .meet a b => a.addrsAt pos ++ b.addrsAt pos
  | .ride _ v _ => v.addrsAt pos
  | .link v _ => v.addrsAt pos
  | .or arms => addrsAtArms pos arms
  | _ => []

def addrsAtArms (pos : List Seg) : List (ℕ × Val) → List (List Seg × Addr)
  | [(_, x)] => x.addrsAt pos
  | _ => []

def addrsAtItems (pos : List Seg) : ℕ → List Val → List (List Seg × Addr)
  | _, [] => []
  | i, v :: vs => v.addrsAt (pos ++ [.idx i]) ++ addrsAtItems pos (i + 1) vs

def addrsAtFields (pos : List Seg) : List (String × Bool × Val) → List (List Seg × Addr)
  | [] => []
  | (k, _, v) :: fs => v.addrsAt (pos ++ [.key k]) ++ addrsAtFields pos fs
end

/-- An edge of a relation: the node it starts from, the relation's key,
and the node it ends at, each node by the text of its place. -/
structure Edge where
  src : String
  key : String
  dst : String
  deriving DecidableEq

/-- The edge an address makes, its link standing at `pos` and the
address at `leaf`. Its relation is the field `relate()` stands at where
that field's key is a name, and the nearest field above the address
where it isn't, as for a relation that is an element of a list; it
starts from the place that holds that field; and it ends at the place
the address names from where the link stands (`Addr.from`). None where
no field is left, or the address climbs past the top. -/
def edgeOf (pos leaf : List Seg) (a : Addr) : Option Edge :=
  let named := match pos.getLast? with
    | some (.key n) => isRelName n
    | _ => false
  (fieldOf (if named then pos else leaf)).bind fun f =>
    (a.from pos).map fun t => ⟨placeText f.1, f.2, placeText t⟩

/-- The edges a normal form writes: one for each address of each link
it holds (`Val.links`), hidden or not, within the arms of a disjunction
the rank rule picks. -/
def Val.edges (N : Val) : List Edge :=
  (N.links []).flatMap fun e => (e.2.2.addrsAt e.1).filterMap fun l => edgeOf e.1 l.1 l.2

/-! ## What the atoms declare -/

mutual
/-- The graph atoms a normal form holds below `pos`, each with the place
it rides at: a member's under its key and an element's under its
position, through riders, links and meets, and within each arm of a
disjunction the rank rule picks, as its links are read (`Val.links`).
A spread's template holds no place, so an atom in one declares at the
members it reaches. -/
def Val.atoms (pos : List Seg) : Val → List (List Seg × Rider)
  | .map fs _ _ => atomsFields pos fs
  | .list items _ _ => atomsItems pos 0 items
  | .ride .acyclic v _ => (pos, .acyclic) :: v.atoms pos
  | .ride (.inverse k) v _ => (pos, .inverse k) :: v.atoms pos
  | .ride _ v _ => v.atoms pos
  | .link v _ => v.atoms pos
  | .meet a b => a.atoms pos ++ b.atoms pos
  | .or arms => atomsArms pos arms arms
  | _ => []

def atomsFields (pos : List Seg) : List (String × Bool × Val) → List (List Seg × Rider)
  | [] => []
  | (k, _, v) :: fs => v.atoms (pos ++ [.key k]) ++ atomsFields pos fs

def atomsItems (pos : List Seg) : ℕ → List Val → List (List Seg × Rider)
  | _, [] => []
  | i, v :: vs => v.atoms (pos ++ [.idx i]) ++ atomsItems pos (i + 1) vs

def atomsArms (pos : List Seg) (all : List (ℕ × Val)) : List (ℕ × Val) → List (List Seg × Rider)
  | [] => []
  | (r, a) :: rest => (if picked all (r, a) then a.atoms pos else []) ++ atomsArms pos all rest
end

/-- What a normal form's graph atoms declare: each atom with the key it
is met at, where that key is a name (`isRelName`), so an atom at the
top, at a list's position or under a key no relation can be named by
declares nothing. A declaration holds for the relation its key names
wherever an edge of it is written, not for the one field it rides. -/
def Val.graphDecls (N : Val) : List (String × Rider) :=
  (N.atoms []).filterMap fun e =>
    match e.1.getLast? with
    | some (.key n) => if isRelName n then some (n, e.2) else none
    | _ => none

/-! ## Cycles -/

/-- The nodes one edge from `a`. -/
def stepsFrom (es : List (String × String)) (a : String) : List String :=
  (es.filter fun e => decide (e.1 = a)).map (·.2)

theorem mem_stepsFrom {es : List (String × String)} {a b : String} :
    b ∈ stepsFrom es a ↔ (a, b) ∈ es := by
  simp only [stepsFrom, List.mem_map, List.mem_filter, decide_eq_true_eq]
  constructor
  · rintro ⟨e, ⟨he, h1⟩, h2⟩
    cases e
    cases h1
    cases h2
    exact he
  · exact fun h => ⟨(a, b), ⟨h, rfl⟩, rfl⟩

/-- A graph holds a cycle: a node that reaches itself, by one edge or
more. -/
def Cyclic (es : List (String × String)) : Prop :=
  ∃ a, Relation.TransGen (fun a b => (a, b) ∈ es) a a

/-- The nodes reached from `a`, computed: the closure of its successors
(`close`), in one more round than there are edges, which is more than
there are nodes to reach. -/
def reachFrom (es : List (String × String)) (a : String) : List String :=
  close (stepsFrom es) ((es.map (·.2)).length + 1) (addNew [] (stepsFrom es a))

/-- `reachFrom` holds exactly the nodes reached from `a`. -/
theorem mem_reachFrom {es : List (String × String)} {a x : String} :
    x ∈ reachFrom es a ↔ Relation.TransGen (fun a b => (a, b) ∈ es) a x := by
  have hsucc : ∀ c y, y ∈ stepsFrom es c → y ∈ es.map (·.2) := fun c y h =>
    List.mem_map.mpr ⟨(c, y), mem_stepsFrom.mp h, rfl⟩
  constructor
  · intro h
    refine transGen_mono (fun _ _ h => mem_stepsFrom.mp h) ?_
    rcases mem_close h with h | ⟨c, hc, hcx⟩
    · exact .single ((mem_addNew.mp h).resolve_left List.not_mem_nil)
    · exact .trans (.single ((mem_addNew.mp hc).resolve_left List.not_mem_nil)) hcx
  · intro h
    refine mem_of_transGen (S := reachFrom es a) ?_ ?_
      (transGen_mono (fun _ _ h => mem_stepsFrom.mpr h) h)
    · intro y hy
      exact sub_close (mem_addNew.mpr (.inr hy))
    · intro b hb y hy
      exact close_closed hsucc _ _ (nodup_addNew List.nodup_nil)
        (fun z hz => hsucc a z ((mem_addNew.mp hz).resolve_left List.not_mem_nil))
        (Nat.lt_of_lt_of_le (Nat.lt_succ_self _) (Nat.le_add_left _ _)) b hb y hy

/-- Whether a graph holds a cycle, computed: whether a node an edge
starts from reaches itself. -/
def cyclicB (es : List (String × String)) : Bool :=
  es.any fun e => decide (e.1 ∈ reachFrom es e.1)

/-- `cyclicB` computes `Cyclic`. -/
theorem cyclicB_iff {es : List (String × String)} : cyclicB es = true ↔ Cyclic es := by
  simp only [cyclicB, List.any_eq_true, decide_eq_true_eq]
  constructor
  · rintro ⟨e, -, h⟩
    exact ⟨e.1, mem_reachFrom.mp h⟩
  · rintro ⟨a, h⟩
    obtain ⟨c, hc⟩ := transGen_first h
    exact ⟨(a, c), hc, mem_reachFrom.mpr h⟩

/-! ## What the atoms ask -/

/-- The edges of the relation a key names, each as its two nodes. -/
def pairsOf (es : List Edge) (n : String) : List (String × String) :=
  (es.filter fun e => decide (e.key = n)).map fun e => (e.src, e.dst)

/-- What one declaration asks of a document's edges. `acyclic()` asks
that the relation its key names hold no cycle. `inverse(k)` asks that
each edge of that relation be mirrored: an edge of `k` from its end to
its start. -/
def Holds (es : List Edge) : String × Rider → Prop
  | (n, .acyclic) => ¬ Cyclic (pairsOf es n)
  | (n, .inverse k) => ∀ e, e ∈ es → e.key = n → (⟨e.dst, k, e.src⟩ : Edge) ∈ es
  | _ => True

/-- Whether a declaration holds, computed. -/
def holdsB (es : List Edge) : String × Rider → Bool
  | (n, .acyclic) => !cyclicB (pairsOf es n)
  | (n, .inverse k) => es.all fun e => !decide (e.key = n) || decide ((⟨e.dst, k, e.src⟩ : Edge) ∈ es)
  | _ => true

/-- `holdsB` computes `Holds`. -/
theorem holdsB_iff {es : List Edge} : ∀ {d : String × Rider}, holdsB es d = true ↔ Holds es d
  | (n, .acyclic) => by
    simp only [holdsB, Holds, Bool.not_eq_true']
    constructor
    · intro h hc
      rw [cyclicB_iff.mpr hc] at h
      exact Bool.noConfusion h
    · intro h
      cases hb : cyclicB (pairsOf es n)
      · rfl
      · exact absurd (cyclicB_iff.mp hb) h
  | (n, .inverse k) => by
    simp only [holdsB, Holds, List.all_eq_true, Bool.or_eq_true, Bool.not_eq_true',
      decide_eq_false_iff_not, decide_eq_true_eq]
    constructor
    · intro h e he hk
      exact (h e he).resolve_left (fun hn => hn hk)
    · intro h e he
      cases hd : decide (e.key = n)
      · exact .inl (of_decide_eq_false hd)
      · exact .inr (h e he (of_decide_eq_true hd))
  | (_, .metadata) | (_, .deprecate) | (_, .ident) | (_, .type) | (_, .hide) | (_, .opened)
  | (_, .lifts) | (_, .seals) | (_, .move _) | (_, .void) | (_, .parent) | (_, .gen) => by
    simp only [holdsB, Holds]

/-- A normal form's graph keeps what its atoms ask: each declaration
holds of its edges. -/
def Val.GraphOk (N : Val) : Prop := ∀ d, d ∈ N.graphDecls → Holds N.edges d

/-- Whether a normal form's graph keeps what its atoms ask, computed. -/
def Val.graphOk (N : Val) : Bool := N.graphDecls.all (holdsB N.edges)

/-- `Val.graphOk` computes `Val.GraphOk`. -/
theorem Val.graphOk_iff {N : Val} : N.graphOk = true ↔ N.GraphOk := by
  simp only [Val.graphOk, Val.GraphOk, List.all_eq_true]
  exact ⟨fun h d hd => holdsB_iff.mp (h d hd), fun h d hd => holdsB_iff.mpr (h d hd)⟩

/-- A normal form that declares nothing keeps what its atoms ask. -/
theorem Val.graphOk_of_no_decls {N : Val} (h : N.graphDecls = []) : N.graphOk = true := by
  simp only [Val.graphOk, h, List.all_nil]

/-! ## The verdict with the atoms -/

/-- The document a verdict with paths ends on beside data: its sources
read in, its links and spreads read beside the data, and its paths read
as names from the data too, as `vetP` reads it. -/
def Decls.readD (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ((ds.loaded S).1.preparedD (ds.loaded S).2 j).1.withPaths
    ((ds.loaded S).1.preparedD (ds.loaded S).2 j).2 j

/-- The normal form generation writes a document from beside data,
where it generates: the one `vet` hands `genD`, hidden members and all,
since a hidden edge is an edge. None where the document doesn't
generate, so a document that waits has no graph to judge (ruling 73). -/
def Decls.genForm (ds : Decls) (S : Val) (j : Data) : Option Val :=
  let F := ds.readD S j
  let N := (normaliseD F.1 (F.1.readJ F.2 j)).staged F.1
  if (genD F.1 N.visible).isSome then some N else none

/-- The graph a document writes beside data breaks an atom: it
generates, and the normal form it generates from doesn't keep what its
atoms ask. -/
def Decls.GraphBroken (ds : Decls) (S : Val) (j : Data) : Prop :=
  ∃ N, ds.genForm S j = some N ∧ ¬ N.GraphOk

/-- Whether the graph a document writes breaks an atom, computed. -/
def Decls.graphBroken (ds : Decls) (S : Val) (j : Data) : Bool :=
  match ds.genForm S j with
  | some N => !N.graphOk
  | none => false

/-- `Decls.graphBroken` computes `Decls.GraphBroken`. -/
theorem Decls.graphBroken_iff {ds : Decls} {S : Val} {j : Data} :
    ds.graphBroken S j = true ↔ ds.GraphBroken S j := by
  unfold Decls.graphBroken Decls.GraphBroken
  cases ds.genForm S j with
  | none => exact ⟨fun h => Bool.noConfusion h, fun h => h.elim fun _ hN => Option.noConfusion hN.1⟩
  | some N =>
    show (!N.graphOk) = true ↔ ∃ N', some N = some N' ∧ ¬ N'.GraphOk
    constructor
    · intro h
      refine ⟨N, rfl, fun hok => ?_⟩
      rw [Val.graphOk_iff.mpr hok] at h
      exact Bool.noConfusion h
    · rintro ⟨N', hN, hbad⟩
      cases hN
      cases hg : N.graphOk
      · rfl
      · exact absurd (Val.graphOk_iff.mp hg) hbad

/-- The verdict of a document, its graph atoms judged. It is `invalid`
where `VetP` answers `valid`, the document generates, and the graph it
writes breaks an atom: a refusal at generation, in every mode, since
the fill has nothing to do with it and `--partial` passes only what
waits. Everywhere else it is `VetP`'s. -/
def VetG (m : Mode) (ds : Decls) (S : Val) (j : Data) (v : Verdict) : Prop :=
  (VetP m ds S j .valid ∧ ds.GraphBroken S j ∧ v = .invalid) ∨
    (¬ (VetP m ds S j .valid ∧ ds.GraphBroken S j) ∧ VetP m ds S j v)

/-- The verdict with the atoms, computed. -/
def vetG (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if vetP m ds S j = .valid ∧ ds.graphBroken S j = true then .invalid else vetP m ds S j

/-- `vetG` computes `VetG` on every document `vetP` computes `VetP` on. -/
theorem vetG_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetG m ds S j = v ↔ VetG m ds S j v := by
  have hP : ∀ w, vetP m ds S j = w ↔ VetP m ds S j w := vetP_iff hb hS
  unfold vetG VetG
  by_cases hc : vetP m ds S j = .valid ∧ ds.graphBroken S j = true
  · rw [if_pos hc]
    have hc' : VetP m ds S j .valid ∧ ds.GraphBroken S j :=
      ⟨(hP _).mp hc.1, Decls.graphBroken_iff.mp hc.2⟩
    exact ⟨fun h => .inl ⟨hc'.1, hc'.2, h.symm⟩,
      fun h => h.elim (fun h => h.2.2.symm) (fun h => absurd hc' h.1)⟩
  · rw [if_neg hc]
    have hc' : ¬ (VetP m ds S j .valid ∧ ds.GraphBroken S j) :=
      fun h => hc ⟨(hP _).mpr h.1, Decls.graphBroken_iff.mpr h.2⟩
    exact ⟨fun h => .inr ⟨hc', (hP v).mp h⟩,
      fun h => h.elim (fun h => absurd ⟨h.1, h.2.1⟩ hc') (fun h => (hP v).mpr h.2)⟩

/-- Where the normal form a document generates from declares nothing,
the verdict with the atoms is `vetP`'s. -/
theorem vetG_eq_vetP {m : Mode} {ds : Decls} {S : Val} {j : Data}
    (h : ∀ N, ds.genForm S j = some N → N.graphDecls = []) : vetG m ds S j = vetP m ds S j := by
  have hb : ds.graphBroken S j = false := by
    unfold Decls.graphBroken
    cases hw : ds.genForm S j with
    | none => rfl
    | some N => simp only [Val.graphOk_of_no_decls (h N hw), Bool.not_true]
  unfold vetG
  rw [if_neg (fun hc => Bool.noConfusion (hb ▸ hc.2))]

/-! ## The output with the atoms -/

/-- The normal form generation writes a document from with no data: the
one `OutputP` hands `genD`, hidden members and all. -/
def Decls.genFormS (ds : Decls) (S : Val) : Val :=
  let P := (ds.loaded S).1.preparedS (ds.loaded S).2
  let F := P.1.withPathsS P.2
  normaliseD F.1 (F.1.readR F.2)

/-- What a document generates, its graph atoms judged: what `OutputP`
gives, where the graph it writes keeps what its atoms ask. Where the
graph breaks one the document generates nothing, the refusal both ports
give at generation. -/
def OutputG (ds : Decls) (root : Data) (S : Val) (j : Data) : Prop :=
  OutputP ds root S j ∧ (ds.genFormS S).GraphOk

/-- What a document generates with the atoms judged, computed. -/
def outputG (ds : Decls) (S : Val) : Option Data :=
  if (ds.genFormS S).graphOk then outputP ds S else none

/-- `outputG` computes `OutputG` wherever `outputP` computes `OutputP`. -/
theorem outputG_iff {ds : Decls} {S : Val} {root : Data} {j : Data}
    (h : outputP ds S = some j ↔ OutputP ds root S j) :
    outputG ds S = some j ↔ OutputG ds root S j := by
  unfold outputG OutputG
  cases hg : (ds.genFormS S).graphOk with
  | true =>
    rw [if_pos rfl]
    exact ⟨fun h' => ⟨h.mp h', Val.graphOk_iff.mp hg⟩, fun h' => h.mpr h'.1⟩
  | false =>
    rw [if_neg Bool.false_ne_true]
    exact ⟨fun h' => Option.noConfusion h', fun h' => by
      rw [Val.graphOk_iff.mpr h'.2] at hg
      exact Bool.noConfusion hg⟩

end Aontu

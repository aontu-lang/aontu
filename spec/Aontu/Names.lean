import Aontu.Admits

/-!
# The names

A document declares aliases, `%T = v`, and refers to them, `%T`. This
module reads the graph the declarations make: which names a value
refers to, which names refer back to themselves, and which do so with
no key and no element between, which the alias-cycle rule refuses. The
relations come first; `close` computes the closure the relations
quantify over, and the `_iff` theorems admit it.
-/

namespace Aontu

/-- The declarations of a document: `%T = v` is the pair `("T", v)`, in
the order written. A name declared twice is declared as the meet of its
declarations. -/
abbrev Decls := List (String × Val)

/-- A declaration's body as a reference reads it: an `ident()` at its
top, or on a term of its top meet, left behind, and one inside it kept.
That is the one place an identity stands (decision 14 of the design
note's §7). -/
def Val.unident : Val → Val
  | .ride .ident v _ => v
  | .meet a b => .meet a.unident b.unident
  | v => v

mutual
/-- A term with its marks cleared, `type()` and `hide()`, at every depth:
what a reference copies, as a mark belongs to the place it is written
at (decision 10 of the design note's §7). -/
def Val.unmark : Val → Val
  | .len c => .len c.unmark
  | .map fs spread closed => .map (unmarkFields fs) (unmarkSpread spread) closed
  | .list items spread closed => .list (unmarkItems items) (unmarkSpread spread) closed
  | .or arms => .or (unmarkArms arms)
  | .pref r x => .pref r x.unmark
  | .meet a b => .meet a.unmark b.unmark
  | .nof n cs => .nof n.unmark (unmarkItems cs)
  | .must c m => .must c.unmark m
  | .when c t e => .when c.unmark t.unmark (unmarkSpread e)
  | .contains c n => .contains c.unmark n.unmark
  | .rest t cs => .rest t.unmark (unmarkCovers cs)
  | .select s arms d => .select s.unmark (unmarkPairs arms) (unmarkSpread d)
  | .filter s c => .filter s.unmark c.unmark
  | .call f args => .call f (unmarkItems args)
  | .ride .type v _ => v.unmark
  | .ride .hide v _ => v.unmark
  | .ride k v r => .ride k v.unmark r
  | v => v

def unmarkFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.unmark) :: unmarkFields fs

def unmarkItems : List Val → List Val
  | [] => []
  | v :: vs => v.unmark :: unmarkItems vs

def unmarkSpread : Option Val → Option Val
  | none => none
  | some s => some s.unmark

def unmarkArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.unmark) :: unmarkArms as

def unmarkPairs : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.unmark, r.unmark) :: unmarkPairs ps

def unmarkCovers : List (Option Val × Option Val × Option Val) → List (Option Val × Option Val × Option Val)
  | [] => []
  | (a, b, c) :: cs => (unmarkSpread a, unmarkSpread b, unmarkSpread c) :: unmarkCovers cs
end

namespace Decls

/-- The bodies declared for a name, in the order written. -/
def bodies (ds : Decls) (n : String) : List Val := (ds.filter fun d => d.1 == n).map (·.2)

/-- The environment the declarations make: a name's value is the meet
of its bodies, and an undeclared name has none. A reference copies the
value without the identity a body declares (`Val.unident`) and without
its marks (`Val.unmark`). -/
def env (ds : Decls) : Env := fun n =>
  match ds.bodies n with
  | [] => none
  | v :: vs => some (vs.foldl .meet v).unident.unmark

/-- The names declared, in the order written, a name declared twice
listed twice. -/
def names (ds : Decls) : List String := ds.map (·.1)

/-- Whether a name is a definition: a body declared for it carries
`type()` at its own position. -/
def typed (ds : Decls) (n : String) : Bool := (ds.bodies n).any (·.hasMark .type)

end Decls

mutual
/-- The names a value refers to, at any depth. -/
def Val.refs : Val → List String
  | .alias n => [n]
  | .len c => c.refs
  | .map fs spread _ => refsFields fs ++ refsSpread spread
  | .list items spread _ => refsItems items ++ refsSpread spread
  | .or arms => refsArms arms
  | .pref _ x => x.refs
  | .meet a b => a.refs ++ b.refs
  | .nof n cs => n.refs ++ refsItems cs
  | .must c _ => c.refs
  | .when c t e => c.refs ++ t.refs ++ refsSpread e
  | .contains c n => c.refs ++ n.refs
  | .rest t cs => t.refs ++ refsCovers cs
  | .select s arms d => s.refs ++ refsPairs arms ++ refsSpread d
  | .filter s c => s.refs ++ c.refs
  | .call _ args => refsItems args
  | .ride _ v _ => v.refs
  | _ => []

def refsPairs : List (Val × Val) → List String
  | [] => []
  | (p, r) :: ps => p.refs ++ r.refs ++ refsPairs ps

def refsCovers : List Cover → List String
  | [] => []
  | (c, k, m) :: cs => refsSpread c ++ refsSpread k ++ refsSpread m ++ refsCovers cs

def refsFields : List (String × Bool × Val) → List String
  | [] => []
  | (_, _, v) :: fs => v.refs ++ refsFields fs

def refsItems : List Val → List String
  | [] => []
  | v :: vs => v.refs ++ refsItems vs

def refsSpread : Option Val → List String
  | none => []
  | some s => s.refs

def refsArms : List (ℕ × Val) → List String
  | [] => []
  | (_, a) :: arms => a.refs ++ refsArms arms
end

mutual
/-- The names a value refers to with no key and no element between:
through `&`, `|`, `*` and `len`, and through the count and the
branches of a trial, which hold the whole of a value, and never through
a container's members or spread, nor through the term `contains` tries
on each member, nor through a cover's `keys` or `members` or the term
`rest` holds the rest to, though through a cover's `if`, tried on the
whole, and through every argument of `match` and `filter`, which select
by a value. -/
def Val.unguardedRefs : Val → List String
  | .alias n => [n]
  | .len c => c.unguardedRefs
  | .or arms => unguardedArms arms
  | .pref _ x => x.unguardedRefs
  | .meet a b => a.unguardedRefs ++ b.unguardedRefs
  | .nof n cs => n.unguardedRefs ++ unguardedItems cs
  | .must c _ => c.unguardedRefs
  | .when c t e => c.unguardedRefs ++ t.unguardedRefs ++ unguardedSpread e
  | .contains _ n => n.unguardedRefs
  | .rest _ cs => unguardedCovers cs
  | .select s arms d => s.unguardedRefs ++ unguardedPairs arms ++ unguardedSpread d
  | .filter s c => s.unguardedRefs ++ c.unguardedRefs
  | .call _ args => unguardedItems args
  | .ride _ v _ => v.unguardedRefs
  | _ => []

def unguardedPairs : List (Val × Val) → List String
  | [] => []
  | (p, r) :: ps => p.unguardedRefs ++ r.unguardedRefs ++ unguardedPairs ps

def unguardedCovers : List Cover → List String
  | [] => []
  | (c, _, _) :: cs => unguardedSpread c ++ unguardedCovers cs

def unguardedArms : List (ℕ × Val) → List String
  | [] => []
  | (_, a) :: arms => a.unguardedRefs ++ unguardedArms arms

def unguardedItems : List Val → List String
  | [] => []
  | v :: vs => v.unguardedRefs ++ unguardedItems vs

def unguardedSpread : Option Val → List String
  | none => []
  | some s => s.unguardedRefs
end

namespace Decls

/-- `a` refers to `b`: `b` stands somewhere in a body declared for `a`. -/
def Refers (ds : Decls) (a b : String) : Prop := ∃ v, v ∈ ds.bodies a ∧ b ∈ v.refs

/-- `a` refers to `b` with no key and no element between. -/
def RefersUnguarded (ds : Decls) (a b : String) : Prop :=
  ∃ v, v ∈ ds.bodies a ∧ b ∈ v.unguardedRefs

/-- A recursive name refers to itself, through any number of
declarations: `%N = {n: integer, next?: %N}` declares one, and so do
`%A = {b?: %B}` and `%B = {a?: %A}` each other. -/
def Recursive (ds : Decls) (n : String) : Prop := Relation.TransGen ds.Refers n n

/-- The alias-cycle rule: no name refers to itself with no key and no
element between, so that every recursion consumes data. `%U = %U`,
`%T = %T & integer` and `%T = %T | 1` break it; `%N = {n: integer,
next?: %N}` keeps it. -/
def Guarded (ds : Decls) : Prop := ∀ n, ¬ Relation.TransGen ds.RefersUnguarded n n

/-- Every name a value and the declarations refer to is declared. -/
def Declares (ds : Decls) (v : Val) : Prop :=
  (∀ n, n ∈ v.refs → ds.bodies n ≠ []) ∧ ∀ d, d ∈ ds → ∀ n, n ∈ d.2.refs → ds.bodies n ≠ []

/-- The names a name refers to, computed. -/
def succ (ds : Decls) (a : String) : List String := (ds.bodies a).flatMap Val.refs

/-- The names a name refers to with no key and no element between,
computed. -/
def succUnguarded (ds : Decls) (a : String) : List String :=
  (ds.bodies a).flatMap Val.unguardedRefs

/-- Every name a document mentions, declared or referred to. -/
def mentioned (ds : Decls) : List String := ds.flatMap fun d => d.1 :: d.2.refs

end Decls

/-! ## The closure, computed

`close succ k seen` adds to `seen` every name `succ` reaches from it,
round by round, and stops when a round adds nothing. The names it holds
are the transitive closure, `mem_close`, and `close_closed` says that
with more rounds than there are names, it holds every successor of what
it holds, by which no round can add a name that is not already there. -/

/-- `seen` with the names of `xs` it lacks, each once. -/
def addNew (seen : List String) : List String → List String
  | [] => seen
  | x :: xs => addNew (if seen.contains x then seen else x :: seen) xs

/-- One round: `seen` with every name reached from a name seen. -/
def closeStep (succ : String → List String) (seen : List String) : List String :=
  addNew seen (seen.flatMap succ)

/-- The closure of `seen` under `succ`, in at most `k` rounds. -/
def close (succ : String → List String) : ℕ → List String → List String
  | 0, seen => seen
  | k + 1, seen =>
    if closeStep succ seen = seen then seen else close succ k (closeStep succ seen)

theorem mem_addNew {x : String} : ∀ {seen xs : List String},
    x ∈ addNew seen xs ↔ x ∈ seen ∨ x ∈ xs := by
  intro seen xs
  induction xs generalizing seen with
  | nil => simp [addNew]
  | cons y ys ih =>
    simp only [addNew]
    split
    · rename_i h
      rw [ih]
      simp only [List.mem_cons]
      constructor
      · rintro (h' | h')
        · exact .inl h'
        · exact .inr (.inr h')
      · rintro (h' | h' | h')
        · exact .inl h'
        · exact .inl (h' ▸ List.contains_iff_mem.mp h)
        · exact .inr h'
    · rw [ih]
      simp only [List.mem_cons]
      constructor
      · rintro ((h' | h') | h')
        · exact .inr (.inl h')
        · exact .inl h'
        · exact .inr (.inr h')
      · rintro (h' | h' | h')
        · exact .inl (.inr h')
        · exact .inl (.inl h')
        · exact .inr h'

theorem nodup_addNew : ∀ {seen xs : List String}, seen.Nodup → (addNew seen xs).Nodup := by
  intro seen xs h
  induction xs generalizing seen with
  | nil => exact h
  | cons y ys ih =>
    simp only [addNew]
    split
    · exact ih h
    · rename_i hc
      exact ih (List.nodup_cons.mpr ⟨fun hm => hc (List.contains_iff_mem.mpr hm), h⟩)

theorem length_addNew_ge : ∀ {seen xs : List String}, seen.length ≤ (addNew seen xs).length := by
  intro seen xs
  induction xs generalizing seen with
  | nil => exact Nat.le_refl _
  | cons y ys ih =>
    simp only [addNew]
    split
    · exact ih
    · have h := ih (seen := y :: seen)
      simp only [List.length_cons] at h
      exact Nat.le_of_succ_le h

theorem length_addNew_gt {seen xs : List String} {x : String} (hx : x ∈ xs) (hs : x ∉ seen) :
    seen.length < (addNew seen xs).length := by
  induction xs generalizing seen with
  | nil => exact absurd hx (List.not_mem_nil)
  | cons y ys ih =>
    simp only [addNew]
    split
    · rename_i hc
      rcases List.mem_cons.mp hx with rfl | hx'
      · exact absurd (List.contains_iff_mem.mp hc) hs
      · exact ih hx' hs
    · have h := length_addNew_ge (seen := y :: seen) (xs := ys)
      simp only [List.length_cons] at h
      exact h

theorem addNew_eq_of_sub : ∀ {seen xs : List String}, (∀ y, y ∈ xs → y ∈ seen) →
    addNew seen xs = seen := by
  intro seen xs h
  induction xs generalizing seen with
  | nil => rfl
  | cons y ys ih =>
    simp only [addNew]
    have hy : seen.contains y = true := List.contains_iff_mem.mpr (h y (List.mem_cons_self))
    rw [hy]
    simp only [↓reduceIte]
    exact ih fun z hz => h z (List.mem_cons_of_mem y hz)

/-- A round that changes the list adds a name it lacked. -/
theorem exists_new_of_ne : ∀ {seen xs : List String}, addNew seen xs ≠ seen →
    ∃ y, y ∈ xs ∧ y ∉ seen := by
  intro seen xs h
  induction xs generalizing seen with
  | nil => exact absurd rfl h
  | cons y ys ih =>
    simp only [addNew] at h
    cases hc : seen.contains y with
    | true =>
      rw [hc] at h
      simp only [↓reduceIte] at h
      obtain ⟨z, hz, hzs⟩ := ih h
      exact ⟨z, List.mem_cons_of_mem y hz, hzs⟩
    | false =>
      exact ⟨y, List.mem_cons_self, fun hm => by
        have := List.contains_iff_mem.mpr hm
        rw [hc] at this
        exact Bool.false_ne_true this⟩

/-- Dropping a name a list holds shortens it. -/
theorem length_filter_ne_lt {u : List String} {x : String} (hx : x ∈ u) :
    (u.filter fun y => y != x).length < u.length := by
  induction u with
  | nil => exact absurd hx (List.not_mem_nil)
  | cons y u ih =>
    simp only [List.filter_cons]
    cases hyx : (y != x) with
    | false =>
      simp only [Bool.false_eq_true, ↓reduceIte, List.length_cons]
      exact Nat.lt_succ_of_le (List.length_filter_le _ _)
    | true =>
      simp only [↓reduceIte, List.length_cons]
      exact Nat.succ_lt_succ (ih (List.mem_of_ne_of_mem (Ne.symm (bne_iff_ne.mp hyx)) hx))

/-- The pigeonhole: a list without repeats, all of whose names are in
`u`, is no longer than `u`. -/
theorem length_le_of_nodup {l u : List String} (hn : l.Nodup) (hu : ∀ x, x ∈ l → x ∈ u) :
    l.length ≤ u.length := by
  induction l generalizing u with
  | nil => exact Nat.zero_le _
  | cons x l ih =>
    have hx : x ∈ u := hu x (List.mem_cons_self)
    obtain ⟨hxl, hl⟩ := List.nodup_cons.mp hn
    have h := ih hl (u := u.filter fun y => y != x) fun y hy =>
      List.mem_filter.mpr ⟨hu y (List.mem_cons_of_mem x hy), bne_iff_ne.mpr fun h => hxl (h ▸ hy)⟩
    simp only [List.length_cons]
    exact Nat.succ_le_of_lt (Nat.lt_of_le_of_lt h (length_filter_ne_lt hx))

theorem mem_closeStep {succ : String → List String} {seen : List String} {x : String} :
    x ∈ closeStep succ seen ↔ x ∈ seen ∨ ∃ a, a ∈ seen ∧ x ∈ succ a := by
  simp only [closeStep, mem_addNew, List.mem_flatMap]

theorem sub_close {succ : String → List String} :
    ∀ {k : ℕ} {seen : List String} {x : String}, x ∈ seen → x ∈ close succ k seen := by
  intro k
  induction k with
  | zero => intro seen x h; exact h
  | succ k ih =>
    intro seen x h
    simp only [close]
    split
    · exact h
    · exact ih (mem_closeStep.mpr (.inl h))

/-- With more rounds than there are names in `u`, which holds `seen` and
every successor, the closure holds every successor of what it holds. -/
theorem close_closed {succ : String → List String} {u : List String}
    (hsucc : ∀ a x, x ∈ succ a → x ∈ u) :
    ∀ (k : ℕ) (seen : List String), seen.Nodup → (∀ x, x ∈ seen → x ∈ u) →
      u.length < seen.length + k →
      ∀ a, a ∈ close succ k seen → ∀ x, x ∈ succ a → x ∈ close succ k seen := by
  intro k
  induction k with
  | zero =>
    intro seen hn hu hk
    exact absurd (Nat.lt_of_lt_of_le hk (length_le_of_nodup hn hu)) (Nat.lt_irrefl _)
  | succ k ih =>
    intro seen hn hu hk a ha x hx
    simp only [close] at ha ⊢
    split
    · rename_i heq
      rw [if_pos heq] at ha
      exact heq ▸ mem_closeStep.mpr (.inr ⟨a, ha, hx⟩)
    · rename_i hne
      rw [if_neg hne] at ha
      obtain ⟨y, hy, hys⟩ := exists_new_of_ne hne
      have hgrow : seen.length < (closeStep succ seen).length := length_addNew_gt hy hys
      exact ih (closeStep succ seen) (nodup_addNew hn)
        (fun z hz => by
          rcases mem_closeStep.mp hz with hz | ⟨b, -, hb⟩
          · exact hu z hz
          · exact hsucc b z hb)
        (by
          have h2 : seen.length + 1 + k ≤ (closeStep succ seen).length + k :=
            Nat.add_le_add_right hgrow k
          rw [Nat.add_assoc, Nat.add_comm 1 k] at h2
          exact Nat.lt_of_lt_of_le hk h2) a ha x hx

/-- Every name the closure holds is reached from a name seen, or seen. -/
theorem mem_close {succ : String → List String} :
    ∀ {k : ℕ} {seen : List String} {x : String}, x ∈ close succ k seen →
      x ∈ seen ∨ ∃ a, a ∈ seen ∧ Relation.TransGen (fun a b => b ∈ succ a) a x := by
  intro k
  induction k with
  | zero => intro seen x h; exact .inl h
  | succ k ih =>
    intro seen x h
    simp only [close] at h
    split at h
    · exact .inl h
    · rcases ih h with h' | ⟨a, ha, hax⟩
      · rcases mem_closeStep.mp h' with h' | ⟨a, ha, hx⟩
        · exact .inl h'
        · exact .inr ⟨a, ha, .single hx⟩
      · rcases mem_closeStep.mp ha with ha | ⟨b, hb, hba⟩
        · exact .inr ⟨a, ha, hax⟩
        · exact .inr ⟨b, hb, .trans (.single hba) hax⟩

/-- What a closed set reaches, it holds: a step that lands in it never
leaves. -/
theorem mem_of_transGen {R : String → String → Prop} {S : List String} {a x : String}
    (hfirst : ∀ y, R a y → y ∈ S) (hclosed : ∀ b, b ∈ S → ∀ y, R b y → y ∈ S)
    (h : Relation.TransGen R a x) : x ∈ S := by
  induction h with
  | single h => exact hfirst _ h
  | tail _ h ih => exact hclosed _ ih _ h

theorem transGen_mono {R R' : String → String → Prop} (h : ∀ a b, R a b → R' a b) {a x : String}
    (hr : Relation.TransGen R a x) : Relation.TransGen R' a x := by
  induction hr with
  | single hab => exact .single (h _ _ hab)
  | tail _ hbc ih => exact .tail ih (h _ _ hbc)

theorem transGen_first {R : String → String → Prop} {a x : String}
    (hr : Relation.TransGen R a x) : ∃ c, R a c := by
  induction hr with
  | single hab => exact ⟨_, hab⟩
  | tail _ _ ih => exact ih

/-- Clearing the marks keeps the names a body reaches. -/
theorem Val.unguardedRefs_unmark (v : Val) : v.unmark.unguardedRefs = v.unguardedRefs := by
  induction v using Val.unmark.induct
    (motive_2 := fun ps => unguardedPairs (unmarkPairs ps) = unguardedPairs ps)
    (motive_3 := fun cs => unguardedCovers (unmarkCovers cs) = unguardedCovers cs)
    (motive_4 := fun s => unguardedSpread (unmarkSpread s) = unguardedSpread s)
    (motive_5 := fun arms => unguardedArms (unmarkArms arms) = unguardedArms arms)
    (motive_6 := fun vs => unguardedItems (unmarkItems vs) = unguardedItems vs)
    (motive_7 := fun _ => True)
  case case17 k v r h1 h2 ih =>
    cases k with
    | type => exact absurd rfl h1
    | hide => exact absurd rfl h2
    | _ => simp only [Val.unmark, Val.unguardedRefs, ih]
  case case18 =>
    rename_i v h1 h2 h3 h4 h5 h6 h7 h8 h9 h10 h11 h12 h13 h14 h15 h16 h17
    rw [Val.unmark.eq_18 v h1 h2 h3 h4 h5 h6 h7 h8 h9 h10 h11 h12 h13 h14 h15 h16 h17]
  all_goals first
    | trivial
    | simp_all only [Val.unmark, unmarkItems, unmarkArms, unmarkPairs, unmarkCovers,
        Val.unguardedRefs, unguardedItems, unguardedPairs, unguardedCovers, unguardedArms]

/-- Leaving an identity behind keeps the names a body reaches. -/
theorem Val.unguardedRefs_unident (v : Val) : v.unident.unguardedRefs = v.unguardedRefs := by
  induction v using Val.unident.induct with
  | case1 v r => simp only [Val.unident, Val.unguardedRefs]
  | case2 a b iha ihb => simp only [Val.unident, Val.unguardedRefs, iha, ihb]
  | case3 v h1 h2 => rw [Val.unident.eq_3 v h1 h2]

mutual
theorem unguardedRefs_sub_refs : ∀ (v : Val) (n : String), n ∈ v.unguardedRefs → n ∈ v.refs
  | .alias _, _, h => h
  | .len c, n, h => unguardedRefs_sub_refs c n h
  | .or arms, n, h => unguardedArms_sub_refsArms arms n h
  | .pref _ x, n, h => unguardedRefs_sub_refs x n h
  | .ride _ v _, n, h => unguardedRefs_sub_refs v n h
  | .meet a b, n, h => by
    simp only [Val.unguardedRefs, List.mem_append] at h
    simp only [Val.refs, List.mem_append]
    exact h.elim (fun h => .inl (unguardedRefs_sub_refs a n h))
      (fun h => .inr (unguardedRefs_sub_refs b n h))
  | .nof c cs, n, h => by
    simp only [Val.unguardedRefs, List.mem_append] at h
    simp only [Val.refs, List.mem_append]
    exact h.elim (fun h => .inl (unguardedRefs_sub_refs c n h))
      (fun h => .inr (unguardedItems_sub_refsItems cs n h))
  | .must c _, n, h => unguardedRefs_sub_refs c n h
  | .when c t e, n, h => by
    simp only [Val.unguardedRefs, List.mem_append] at h
    simp only [Val.refs, List.mem_append]
    rcases h with (h | h) | h
    · exact .inl (.inl (unguardedRefs_sub_refs c n h))
    · exact .inl (.inr (unguardedRefs_sub_refs t n h))
    · exact .inr (unguardedSpread_sub_refsSpread e n h)
  | .contains c m, n, h => by
    simp only [Val.unguardedRefs] at h
    simp only [Val.refs, List.mem_append]
    exact .inr (unguardedRefs_sub_refs m n h)
  | .rest t cs, n, h => by
    simp only [Val.unguardedRefs] at h
    simp only [Val.refs, List.mem_append]
    exact .inr (unguardedCovers_sub_refsCovers cs n h)
  | .select s arms d, n, h => by
    simp only [Val.unguardedRefs, List.mem_append] at h
    simp only [Val.refs, List.mem_append]
    rcases h with (h | h) | h
    · exact .inl (.inl (unguardedRefs_sub_refs s n h))
    · exact .inl (.inr (unguardedPairs_sub_refsPairs arms n h))
    · exact .inr (unguardedSpread_sub_refsSpread d n h)
  | .filter s c, n, h => by
    simp only [Val.unguardedRefs, List.mem_append] at h
    simp only [Val.refs, List.mem_append]
    exact h.elim (fun h => .inl (unguardedRefs_sub_refs s n h)) (fun h => .inr (unguardedRefs_sub_refs c n h))
  | .call _ args, n, h => unguardedItems_sub_refsItems args n h
  | .integer, _, h | .float, _, h | .biginteger, _, h | .bigdecimal, _, h | .number, _, h
  | .string, _, h | .anyString, _, h | .boolean, _, h | .lit _, _, h | .min _, _, h
  | .max _, _, h | .above _, _, h | .beneath _, _, h | .neq _, _, h | .mulof _, _, h
  | .unique _, _, h | .re _, _, h | .format _, _, h | .any, _, h | .nil, _, h
  | .map _ _ _, _, h | .list _ _ _, _, h | .path _, _, h => nomatch h

theorem unguardedSpread_sub_refsSpread : ∀ (s : Option Val) (n : String),
    n ∈ unguardedSpread s → n ∈ refsSpread s
  | none, _, h => nomatch h
  | some s, n, h => unguardedRefs_sub_refs s n h

theorem unguardedPairs_sub_refsPairs : ∀ (ps : List (Val × Val)) (n : String),
    n ∈ unguardedPairs ps → n ∈ refsPairs ps
  | [], _, h => nomatch h
  | (p, r) :: ps, n, h => by
    simp only [unguardedPairs, List.mem_append] at h
    simp only [refsPairs, List.mem_append]
    rcases h with (h | h) | h
    · exact .inl (.inl (unguardedRefs_sub_refs p n h))
    · exact .inl (.inr (unguardedRefs_sub_refs r n h))
    · exact .inr (unguardedPairs_sub_refsPairs ps n h)

theorem unguardedCovers_sub_refsCovers : ∀ (cs : List Cover) (n : String),
    n ∈ unguardedCovers cs → n ∈ refsCovers cs
  | [], _, h => nomatch h
  | (c, k, m) :: cs, n, h => by
    simp only [unguardedCovers, List.mem_append] at h
    simp only [refsCovers, List.mem_append]
    rcases h with h | h
    · exact .inl (.inl (.inl (unguardedSpread_sub_refsSpread c n h)))
    · exact .inr (unguardedCovers_sub_refsCovers cs n h)

theorem unguardedArms_sub_refsArms : ∀ (arms : List (ℕ × Val)) (n : String),
    n ∈ unguardedArms arms → n ∈ refsArms arms
  | [], _, h => nomatch h
  | (_, a) :: arms, n, h => by
    simp only [unguardedArms, List.mem_append] at h
    simp only [refsArms, List.mem_append]
    exact h.elim (fun h => .inl (unguardedRefs_sub_refs a n h))
      (fun h => .inr (unguardedArms_sub_refsArms arms n h))

theorem unguardedItems_sub_refsItems : ∀ (vs : List Val) (n : String),
    n ∈ unguardedItems vs → n ∈ refsItems vs
  | [], _, h => nomatch h
  | v :: vs, n, h => by
    simp only [unguardedItems, List.mem_append] at h
    simp only [refsItems, List.mem_append]
    exact h.elim (fun h => .inl (unguardedRefs_sub_refs v n h))
      (fun h => .inr (unguardedItems_sub_refsItems vs n h))
end

namespace Decls

theorem mem_succ_iff {ds : Decls} {a b : String} : b ∈ ds.succ a ↔ ds.Refers a b := by
  simp only [succ, List.mem_flatMap, Refers]

theorem mem_succUnguarded_iff {ds : Decls} {a b : String} :
    b ∈ ds.succUnguarded a ↔ ds.RefersUnguarded a b := by
  simp only [succUnguarded, List.mem_flatMap, RefersUnguarded]

theorem mem_bodies {ds : Decls} {a : String} {v : Val} (h : v ∈ ds.bodies a) : (a, v) ∈ ds := by
  simp only [bodies, List.mem_map, List.mem_filter, beq_iff_eq] at h
  obtain ⟨⟨a', v'⟩, ⟨hmem, rfl⟩, rfl⟩ := h
  exact hmem

theorem mem_names {ds : Decls} {a : String} {v : Val} (h : (a, v) ∈ ds) : a ∈ ds.names :=
  List.mem_map_of_mem (f := (·.1)) h

theorem succ_mentioned {ds : Decls} {a x : String} (h : x ∈ ds.succ a) : x ∈ ds.mentioned := by
  obtain ⟨v, hv, hx⟩ := List.mem_flatMap.mp h
  simp only [mentioned, List.mem_flatMap]
  exact ⟨(a, v), mem_bodies hv, List.mem_cons_of_mem _ hx⟩

theorem succUnguarded_mentioned {ds : Decls} {a x : String} (h : x ∈ ds.succUnguarded a) :
    x ∈ ds.mentioned := by
  obtain ⟨v, hv, hx⟩ := List.mem_flatMap.mp h
  simp only [mentioned, List.mem_flatMap]
  exact ⟨(a, v), mem_bodies hv, List.mem_cons_of_mem _ (unguardedRefs_sub_refs v x hx)⟩

/-- The names reached from `n` through `succ`, computed: the closure of
its successors, in one more round than there are names mentioned. -/
def reach (ds : Decls) (succ : String → List String) (n : String) : List String :=
  close succ (ds.mentioned.length + 1) (addNew [] (succ n))

/-- Whether a name is recursive, computed. -/
def recursiveB (ds : Decls) (n : String) : Bool := (ds.reach ds.succ n).contains n

/-- Whether a name refers to itself with no key and no element between,
computed. -/
def unguardedB (ds : Decls) (n : String) : Bool := (ds.reach ds.succUnguarded n).contains n

/-- Whether the declarations keep the alias-cycle rule, computed. -/
def guardedB (ds : Decls) : Bool := ds.names.all fun n => !ds.unguardedB n

/-- Whether every name a value and the declarations refer to is
declared, computed. -/
def declaresB (ds : Decls) (v : Val) : Bool :=
  (v.refs.all fun n => !(ds.bodies n).isEmpty) &&
    ds.all fun d => d.2.refs.all fun n => !(ds.bodies n).isEmpty

/-- `reach` holds exactly the names reached from `n`, for a `succ` that
stays among the names mentioned. -/
theorem mem_reach_iff {ds : Decls} {succ : String → List String}
    (hsucc : ∀ a x, x ∈ succ a → x ∈ ds.mentioned) {n x : String} :
    x ∈ ds.reach succ n ↔ Relation.TransGen (fun a b => b ∈ succ a) n x := by
  constructor
  · intro h
    rcases mem_close h with h | ⟨a, ha, hax⟩
    · exact .single ((mem_addNew.mp h).resolve_left (List.not_mem_nil))
    · exact .trans (.single ((mem_addNew.mp ha).resolve_left (List.not_mem_nil))) hax
  · intro h
    refine mem_of_transGen (S := ds.reach succ n) ?_ ?_ h
    · intro y hy
      exact sub_close (mem_addNew.mpr (.inr hy))
    · intro b hb y hy
      exact close_closed hsucc _ _ (nodup_addNew List.nodup_nil)
        (fun z hz => hsucc n z ((mem_addNew.mp hz).resolve_left (List.not_mem_nil)))
        (Nat.lt_of_lt_of_le (Nat.lt_succ_self _) (Nat.le_add_left _ _)) b hb y hy

theorem recursiveB_iff {ds : Decls} {n : String} : ds.recursiveB n = true ↔ ds.Recursive n := by
  simp only [recursiveB, List.contains_iff_mem, Recursive]
  rw [mem_reach_iff (fun _ _ h => succ_mentioned h)]
  exact ⟨transGen_mono (fun _ _ h => mem_succ_iff.mp h),
    transGen_mono (fun _ _ h => mem_succ_iff.mpr h)⟩

theorem unguardedB_iff {ds : Decls} {n : String} :
    ds.unguardedB n = true ↔ Relation.TransGen ds.RefersUnguarded n n := by
  simp only [unguardedB, List.contains_iff_mem]
  rw [mem_reach_iff (fun _ _ h => succUnguarded_mentioned h)]
  exact ⟨transGen_mono (fun _ _ h => mem_succUnguarded_iff.mp h),
    transGen_mono (fun _ _ h => mem_succUnguarded_iff.mpr h)⟩

theorem guardedB_iff {ds : Decls} : ds.guardedB = true ↔ ds.Guarded := by
  simp only [guardedB, List.all_eq_true, Bool.not_eq_true', Guarded]
  constructor
  · intro h n hn
    obtain ⟨c, v, hv, -⟩ := transGen_first hn
    have hfalse := h n (mem_names (mem_bodies hv))
    rw [unguardedB_iff.mpr hn] at hfalse
    exact nomatch hfalse
  · intro h n _
    cases hb : ds.unguardedB n with
    | false => rfl
    | true => exact absurd (unguardedB_iff.mp hb) (h n)

theorem isEmpty_false_iff {l : List Val} : l.isEmpty = false ↔ l ≠ [] := by
  cases l <;> simp [List.isEmpty]

theorem declaresB_iff {ds : Decls} {v : Val} : ds.declaresB v = true ↔ ds.Declares v := by
  simp only [declaresB, Bool.and_eq_true, List.all_eq_true, Bool.not_eq_true', isEmpty_false_iff,
    Declares]

end Decls

/-- A name declared as itself alone judges nothing, so it admits nothing
and refuses nothing: a derivation of either would have to begin with
another, so none is finite. -/
theorem alias_self_judges_nothing {env : Env} {root : Data} {b : Bool} {n : String} {j : Data}
    (h : env n = some (.alias n)) : ¬ Judge env root b (.alias n) j := by
  suffices ∀ v, Judge env root b v j → v ≠ .alias n from fun ha => this _ ha rfl
  intro v ha
  induction ha with
  | alias he _ ih =>
    intro hv
    cases hv
    rw [h] at he
    cases he
    exact ih rfl
  | aliasNone he =>
    intro hv
    cases hv
    rw [h] at he
    cases he
  | _ => intro hv; cases hv

/-- A name declared as itself alone admits nothing. -/
theorem alias_self_admits_nothing {env : Env} {root : Data} {n : String} {j : Data}
    (h : env n = some (.alias n)) : ¬ Admits env root (.alias n) j :=
  alias_self_judges_nothing h

theorem Decls.alias_self_admits_nothing {root : Data} {n : String} {j : Data} :
    ¬ Admits (Decls.env [(n, .alias n)]) root (.alias n) j :=
  Aontu.alias_self_admits_nothing (by simp [Decls.env, Decls.bodies, Val.unident, Val.unmark])

/-! ## The paths a term writes -/

mutual
/-- The paths a term writes. -/
def Val.paths : Val → List (List Seg)
  | .path p => [p]
  | .len c => c.paths
  | .map fs spread _ => pathsFields fs ++ pathsSpread spread
  | .list items spread _ => pathsItems items ++ pathsSpread spread
  | .or arms => pathsArms arms
  | .pref _ x => x.paths
  | .meet a b => a.paths ++ b.paths
  | .nof n cs => n.paths ++ pathsItems cs
  | .must c _ => c.paths
  | .when c t e => c.paths ++ t.paths ++ pathsSpread e
  | .contains c n => c.paths ++ n.paths
  | .rest t cs => t.paths ++ pathsCovers cs
  | .select s arms d => s.paths ++ pathsPairs arms ++ pathsSpread d
  | .filter s c => s.paths ++ c.paths
  | .call _ args => pathsItems args
  | .ride _ v _ => v.paths
  | _ => []

def pathsPairs : List (Val × Val) → List (List Seg)
  | [] => []
  | (p, r) :: ps => p.paths ++ r.paths ++ pathsPairs ps

def pathsCovers : List Cover → List (List Seg)
  | [] => []
  | (c, k, m) :: cs => pathsSpread c ++ pathsSpread k ++ pathsSpread m ++ pathsCovers cs

def pathsFields : List (String × Bool × Val) → List (List Seg)
  | [] => []
  | (_, _, v) :: fs => v.paths ++ pathsFields fs

def pathsItems : List Val → List (List Seg)
  | [] => []
  | v :: vs => v.paths ++ pathsItems vs

def pathsSpread : Option Val → List (List Seg)
  | none => []
  | some s => s.paths

def pathsArms : List (ℕ × Val) → List (List Seg)
  | [] => []
  | (_, a) :: as => a.paths ++ pathsArms as
end

/-- The paths the bodies write. -/
def Decls.paths (ds : Decls) : List (List Seg) := ds.foldl (fun acc d => acc ++ d.2.paths) []

end Aontu

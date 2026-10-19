import Aontu.Output
import Aontu.Alias

/-!
# The verdicts

What `aontu vet` answers about a schema and a document of data: `valid`,
`invalid`, `incomplete` or `error`, each defined from `Admits` and
`Output`. A schema whose normal form holds a `nil` anywhere but in a
spread, or a preference clash, two preferred arms of one rank that
single out different values, does not stand on its own: `error`,
whatever the data. Otherwise the meet of the schema with the data as a
term is dead, and the data is refused outright: `invalid`. Otherwise
the meet singles out a value, the data filled by the schema's defaults:
`valid` in the default mode, and without the fill only where the data
as written is an instance. What remains, a meet alive that singles out
nothing, or a fill the data lacks, is `incomplete`, which `--partial`
turns to `valid`. `vet` computes the verdict beside `vet_iff`, and the
theorems hold the verdicts to the two relations: without the fill,
`valid` is `Instance`; with it, the filled value is an instance of the
schema; and `invalid` refuses the data as an instance. A document reads
as its expansion under its declarations, and one that refers to a name
it does not declare, or whose names break the alias-cycle rule, is an
`error` before anything else is asked.
-/

namespace Aontu

/-- The four answers of `vet`. -/
inductive Verdict where
  | valid
  | invalid
  | incomplete
  | error
  deriving DecidableEq, Repr

/-- The modes of `vet`: whether the schema fills the data, the default,
and whether what is left unresolved passes, which is `--partial`,
`lax` here since Lean keeps the word. -/
structure Mode where
  fill : Bool := true
  lax : Bool := false

/-! ## The data as a term -/

mutual
/-- A document of data as the term it is: each scalar its literal, a
map its members as required keys, open, and a list its elements, open. -/
def Data.term : Data → Val
  | .num x => .lit (.num x)
  | .str s => .lit (.str s)
  | .bool b => .lit (.bool b)
  | .null => .lit .null
  | .map fs => .map (termMembers fs) none false
  | .list xs => .list (termElems xs) none false

def termMembers : List (String × Data) → List (String × Bool × Val)
  | [] => []
  | (k, x) :: fs => (k, false, x.term) :: termMembers fs

def termElems : List Data → List Val
  | [] => []
  | x :: xs => x.term :: termElems xs
end

/-! ## Selecting: `match` and `filter`

A `match` holds a value to the result of the first arm whose pattern
admits the value its scrutinee generates, and a `filter` to the members
of the container its source generates that its condition admits. Each
selects by a value the document has settled, so each is made once the
document is read, before the meet, and a document reads as its
expansion with its selections made. -/

/-- The result the arms select for the value `x`: the first whose
pattern admits it, the default where none does, and `nil`, which no
value satisfies, where there is no default: no match and no default is
an error of the document, not an empty answer. -/
def selectArm (ds : Decls) (x : Data) : List (Val × Val) → Option Val → Val
  | [], d => d.getD .nil
  | (p, r) :: arms, d => if checkR ds p x then r else selectArm ds x arms d

mutual
/-- A term with its selections made: each `match` whose scrutinee
generates a value is the result its arms select for it, and each
`filter` whose source generates a container is the members its
condition admits, as a term, or `nil` where the source generates a
scalar, which has no members. One whose scrutinee or source generates
nothing stays, and generates nothing. -/
def resolveD (ds : Decls) : Val → Val
  | .select s arms d =>
    let s' := resolveD ds s
    let arms' := resolvePairs ds arms
    let d' := resolveSpread ds d
    match genD ds s' with
    | some x => selectArm ds x arms' d'
    | none => .select s' arms' d'
  | .filter s c =>
    let s' := resolveD ds s
    let c' := resolveD ds c
    match genD ds s' with
    | some (.map fs) => (Data.map (fs.filter fun m => checkR ds c' m.2)).term
    | some (.list xs) => (Data.list (xs.filter fun x => checkR ds c' x)).term
    | some _ => .nil
    | none => .filter s' c'
  | .len c => .len (resolveD ds c)
  | .map fs spread closed => .map (resolveFields ds fs) (resolveSpread ds spread) closed
  | .list items spread closed => .list (resolveItems ds items) (resolveSpread ds spread) closed
  | .or arms => .or (resolveArms ds arms)
  | .pref r x => .pref r (resolveD ds x)
  | .meet a b => .meet (resolveD ds a) (resolveD ds b)
  | .nof n cs => .nof (resolveD ds n) (resolveItems ds cs)
  | .must c m => .must (resolveD ds c) m
  | .when c t e => .when (resolveD ds c) (resolveD ds t) (resolveSpread ds e)
  | .contains c n => .contains (resolveD ds c) (resolveD ds n)
  | .rest t cs => .rest (resolveD ds t) (resolveCovers ds cs)
  | v => v

def resolveFields (ds : Decls) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, resolveD ds v) :: resolveFields ds fs

def resolveItems (ds : Decls) : List Val → List Val
  | [] => []
  | v :: vs => resolveD ds v :: resolveItems ds vs

def resolveSpread (ds : Decls) : Option Val → Option Val
  | none => none
  | some s => some (resolveD ds s)

def resolveArms (ds : Decls) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, resolveD ds a) :: resolveArms ds arms

def resolvePairs (ds : Decls) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (resolveD ds p, resolveD ds r) :: resolvePairs ds ps

def resolveCovers (ds : Decls) : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (resolveSpread ds c, resolveSpread ds k, resolveSpread ds m) :: resolveCovers ds cs
end

/-- How a document reads: its term expanded, with its selections made. -/
def Decls.readR (ds : Decls) (S : Val) : Val := resolveD ds (ds.read S)

theorem resolveFields_eq {ds : Decls} : ∀ {fs : List (String × Bool × Val)},
    (∀ k o v, (k, o, v) ∈ fs → resolveD ds v = v) → resolveFields ds fs = fs
  | [], _ => rfl
  | (k, o, v) :: fs, h => by
    simp only [resolveFields]
    rw [h k o v (List.mem_cons_self _ _),
      resolveFields_eq fun k' o' v' hm => h k' o' v' (List.mem_cons_of_mem _ hm)]

theorem resolveItems_eq {ds : Decls} : ∀ {vs : List Val},
    (∀ v, v ∈ vs → resolveD ds v = v) → resolveItems ds vs = vs
  | [], _ => rfl
  | v :: vs, h => by
    simp only [resolveItems]
    rw [h v (List.mem_cons_self _ _), resolveItems_eq fun v' hm => h v' (List.mem_cons_of_mem _ hm)]

theorem resolveSpread_eq {ds : Decls} : ∀ {sp : Option Val},
    (∀ s, sp = some s → resolveD ds s = s) → resolveSpread ds sp = sp
  | none, _ => rfl
  | some s, h => by simp only [resolveSpread]; rw [h s rfl]

theorem resolveArms_eq {ds : Decls} : ∀ {arms : List (ℕ × Val)},
    (∀ r a, (r, a) ∈ arms → resolveD ds a = a) → resolveArms ds arms = arms
  | [], _ => rfl
  | (r, a) :: arms, h => by
    simp only [resolveArms]
    rw [h r a (List.mem_cons_self _ _), resolveArms_eq fun r' a' hm => h r' a' (List.mem_cons_of_mem _ hm)]

theorem resolveCovers_eq {ds : Decls} : ∀ {cs : List Cover},
    (∀ c, c ∈ cs → (∀ v, c.1 = some v → resolveD ds v = v) ∧ (∀ v, c.2.1 = some v → resolveD ds v = v) ∧
      (∀ v, c.2.2 = some v → resolveD ds v = v)) →
    resolveCovers ds cs = cs
  | [], _ => rfl
  | (c, k, m) :: cs, h => by
    simp only [resolveCovers]
    obtain ⟨h1, h2, h3⟩ := h (c, k, m) (List.mem_cons_self _ _)
    rw [resolveSpread_eq h1, resolveSpread_eq h2, resolveSpread_eq h3,
      resolveCovers_eq fun c' hm => h c' (List.mem_cons_of_mem _ hm)]

/-- A term the checker can read holds no `match` and no `filter`, so its
selections are already made. -/
theorem resolveD_eq {ds : Decls} {v : Val} (h : v.CheckableA) : resolveD ds v = v := by
  induction h with
  | len _ ih => simp only [resolveD]; rw [ih]
  | @map fs spread closed _ _ ihf ihs => simp only [resolveD]; rw [resolveFields_eq ihf, resolveSpread_eq ihs]
  | @list items spread closed _ _ ihi ihs => simp only [resolveD]; rw [resolveItems_eq ihi, resolveSpread_eq ihs]
  | or _ ih => simp only [resolveD]; rw [resolveArms_eq ih]
  | pref _ ih => simp only [resolveD]; rw [ih]
  | meet _ _ iha ihb => simp only [resolveD]; rw [iha, ihb]
  | nof _ _ ihn ihcs => simp only [resolveD]; rw [ihn, resolveItems_eq ihcs]
  | must _ ih => simp only [resolveD]; rw [ih]
  | when _ _ _ ihc iht ihe => simp only [resolveD]; rw [ihc, iht, resolveSpread_eq ihe]
  | contains _ _ ihc ihn => simp only [resolveD]; rw [ihc, ihn]
  | rest _ _ _ _ iht ih1 ih2 ih3 =>
    simp only [resolveD]
    rw [iht, resolveCovers_eq fun c hc => ⟨ih1 c hc, ih2 c hc, ih3 c hc⟩]
  | _ => rfl

/-- A document whose schema the checker can read reads as its expansion. -/
theorem readR_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    (ds.readR S).CheckableA := by
  unfold Decls.readR
  rw [resolveD_eq (expand_checkableA hb hS)]
  exact expand_checkableA hb hS

/-- The first pattern the scrutinee's value satisfies selects its result. -/
theorem selectArm_first {ds : Decls} {x : Data} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    (h : checkR ds p x = true) : selectArm ds x ((p, r) :: arms) d = r := by
  simp [selectArm, h]

/-- A pattern the value does not satisfy is passed over. -/
theorem selectArm_next {ds : Decls} {x : Data} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    (h : checkR ds p x = false) : selectArm ds x ((p, r) :: arms) d = selectArm ds x arms d := by
  simp [selectArm, h]

/-- The default answers where no pattern is satisfied, and where there is
none the selection is `nil`: an error, not an empty answer. -/
theorem selectArm_default {ds : Decls} {x : Data} {d : Option Val} : selectArm ds x [] d = d.getD .nil := rfl

/-- A `filter` over a list keeps the elements its condition admits, in
their order. -/
theorem resolveD_filter_list {ds : Decls} {s c : Val} {xs : List Data}
    (h : genD ds (resolveD ds s) = some (.list xs)) :
    resolveD ds (.filter s c) = (Data.list (xs.filter fun x => checkR ds (resolveD ds c) x)).term := by
  simp [resolveD, h]

/-- A `filter` over a scalar, which has no members, is `nil`: an error. -/
theorem resolveD_filter_scalar {ds : Decls} {s c : Val} {x : Scalar}
    (h : genD ds (resolveD ds s) = some x.data) : resolveD ds (.filter s c) = .nil := by
  cases x <;> simp [resolveD, h, Scalar.data]

/-! ## Ill-formed terms -/

/-- Whether the arms the rank rule picks single out two different
values: a preference clash, where a positive rank is picked. -/
def clash (arms : List (ℕ × Val)) : Bool :=
  match pickRank arms with
  | none => false
  | some _ =>
    match (arms.filter (picked arms)).filterMap fun p => gen p.2 with
    | [] => false
    | x :: rest => rest.any fun y => decide (y ≠ x)

mutual
/-- Whether a term in normal form does not stand: a `nil` anywhere but
in a spread, which the engines read only against a member, or a
preference clash. -/
def Val.illFormed : Val → Bool
  | .nil => true
  | .map fs _ _ => illFields fs
  | .list items _ _ => illItems items
  | .or arms => clash arms || illArms arms
  | .pref _ x => x.illFormed
  | .meet a b => a.illFormed || b.illFormed
  | _ => false

def illFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.illFormed || illFields fs

def illItems : List Val → Bool
  | [] => false
  | v :: vs => v.illFormed || illItems vs

def illArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.illFormed || illArms arms
end

/-! ## The value a document gives with its trials unread

Both ports try a container when no member can still arrive, so a trial
or a size refuses a container at generation, after the fills, where a
scalar it refuses at the meet. The definition reads that moment as the
value the normal form would single out with every trial and size unread,
each `nof`, `must`, `len` and `unique` as `any`, and asks whether the
normal form, read whole, refuses it. -/

mutual
/-- A term with its trials and sizes unread: each `nof`, `must`, `len`
and `unique` as `any`. -/
def Val.untried : Val → Val
  | .nof _ _ | .must _ _ | .when _ _ _ | .contains _ _ | .rest _ _ | .select _ _ _ | .filter _ _ | .len _
  | .unique _ => .any
  | .map fs spread closed => .map (untriedFields fs) (untriedSpread spread) closed
  | .list items spread closed => .list (untriedItems items) (untriedSpread spread) closed
  | .or arms => .or (untriedArms arms)
  | .pref r x => .pref r x.untried
  | .meet a b => .meet a.untried b.untried
  | v => v

def untriedFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.untried) :: untriedFields fs

def untriedItems : List Val → List Val
  | [] => []
  | v :: vs => v.untried :: untriedItems vs

def untriedSpread : Option Val → Option Val
  | none => none
  | some s => some s.untried

def untriedArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.untried) :: untriedArms as
end

theorem mem_untriedFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ untriedFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.untried := by
  induction fs with
  | nil => simp [untriedFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [untriedFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_untriedItems {items : List Val} {w : Val} :
    w ∈ untriedItems items ↔ ∃ v, v ∈ items ∧ w = v.untried := by
  induction items with
  | nil => simp [untriedItems]
  | cons v vs ih =>
    simp only [untriedItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨v', hm, rfl⟩)
      · exact ⟨v, Or.inl rfl, rfl⟩
      · exact ⟨v', Or.inr hm, rfl⟩
    · rintro ⟨v', rfl | hm, rfl⟩
      · exact Or.inl rfl
      · exact Or.inr ⟨v', hm, rfl⟩

theorem untriedSpread_eq {spread : Option Val} {t : Val} :
    untriedSpread spread = some t ↔ ∃ s, spread = some s ∧ t = s.untried := by
  cases spread <;> simp [untriedSpread, eq_comm]

theorem mem_untriedArms {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ untriedArms arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.untried := by
  induction arms with
  | nil => simp [untriedArms]
  | cons p arms ih =>
    obtain ⟨r', a'⟩ := p
    simp only [untriedArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

/-- A term the checker can read stays one with its trials unread. -/
theorem untried_checkableA {v : Val} (h : v.CheckableA) : v.untried.CheckableA := by
  induction h with
  | len _ _ | unique | nof _ _ _ _ | must _ _ | when _ _ _ _ _ _ | contains _ _ _ _ | rest _ _ _ _ _ _ _ _ =>
    exact .any
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_untriedFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := untriedSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_untriedItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := untriedSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_untriedArms.mp hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | _ => simp only [Val.untried]; constructor

/-- A refusal at generation: with its trials and sizes unread, the term
singles out a value that it, read whole, refuses. -/
def RefusedAt (ds : Decls) (root : Data) (v : Val) : Prop :=
  ∃ c, Gen ds.envE root v.untried c ∧ Refuses ds.envE root v c

/-- Whether a term refuses the value it gives with its trials unread,
computed. -/
def refusedAt (ds : Decls) (v : Val) : Bool :=
  match genD ds v.untried with
  | some c => !checkR ds v c
  | none => false

theorem refusedAt_iff {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    {v : Val} (hv : v.CheckableA) : refusedAt ds v = true ↔ RefusedAt ds root v := by
  have hgen : ∀ c, genD ds v.untried = some c ↔ Gen ds.envE root v.untried c :=
    fun c => genWith_iff (untried_checkableA hv) (fun _ j hw _ => checkR_iff hg hb hw j) c
  unfold refusedAt
  constructor
  · intro h
    split at h
    · rename_i c hc
      exact ⟨c, (hgen c).mp hc, (checkR_iff hg hb hv c).mp (by simpa using h)⟩
    · exact nomatch h
  · rintro ⟨c, hc, hr⟩
    rw [(hgen c).mpr hc]
    simp only
    rw [(checkR_iff hg hb hv c).mpr hr]
    rfl

/-! ## The verdict -/

instance (ds : Decls) (S : Val) : Decidable (ds.Declares S) := decidable_of_iff _ Decls.declaresB_iff

instance (ds : Decls) : Decidable ds.Guarded := decidable_of_iff _ Decls.guardedB_iff

/-- The verdict `vet` gives the data `j` against the schema `S` under
the declarations `ds` and the mode `m`, the schema read as its
expansion with its selections made: `error` where the document refers to a name it does not
declare, where its names break the alias-cycle rule, or where the
schema's normal form does not stand; `invalid` where the meet of the
schema with the data as a term is dead, or refuses, read whole, the
value it gives with its trials and sizes unread; `valid` where the meet
singles out a value, and without the fill where the data as written is
an instance too, or where `--partial` lets the unresolved pass; and
`incomplete` otherwise. -/
def Vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Declares S ∨ ¬ ds.Guarded ∨ (normaliseD ds (ds.readR S)).illFormed = true
  | .invalid =>
    ds.Declares S ∧ ds.Guarded ∧ (normaliseD ds (ds.readR S)).illFormed = false ∧
      ((normaliseD ds (meetD ds (ds.readR S) j.term)).dead = true ∨
        RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)))
  | .valid =>
    ds.Declares S ∧ ds.Guarded ∧ (normaliseD ds (ds.readR S)).illFormed = false ∧
      (normaliseD ds (meetD ds (ds.readR S) j.term)).dead = false ∧
      ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) ∧
      (m.lax = true ∨
        ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
          (m.fill = true ∨ Admits ds.envE j (ds.readR S) j))
  | .incomplete =>
    ds.Declares S ∧ ds.Guarded ∧ (normaliseD ds (ds.readR S)).illFormed = false ∧
      (normaliseD ds (meetD ds (ds.readR S) j.term)).dead = false ∧
      ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) ∧
      m.lax = false ∧
      ¬ ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
        (m.fill = true ∨ Admits ds.envE j (ds.readR S) j)

/-- The verdict, computed. -/
def vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if !(ds.declaresB S && ds.guardedB) then .error
  else if (normaliseD ds (ds.readR S)).illFormed then .error
  else if (normaliseD ds (meetD ds (ds.readR S) j.term)).dead then .invalid
  else if refusedAt ds (normaliseD ds (meetD ds (ds.readR S) j.term)) then .invalid
  else if m.lax then .valid
  else
    match outputD ds (meetD ds (ds.readR S) j.term) with
    | some _ => if m.fill || checkR ds (ds.readR S) j then .valid else .incomplete
    | none => .incomplete

section
variable {env : Env} {root : Data}

/-! ## The data is an instance of its own term -/

theorem termMembers_mem {fs : List (String × Data)} {k : String} {o : Bool} {v : Val} :
    (k, o, v) ∈ termMembers fs ↔ ∃ x, (k, x) ∈ fs ∧ o = false ∧ v = x.term := by
  induction fs with
  | nil => simp [termMembers]
  | cons f fs ih =>
    obtain ⟨k', x'⟩ := f
    rw [termMembers, List.mem_cons, ih]
    constructor
    · rintro (h | ⟨x, hm, rfl, rfl⟩)
      · simp only [Prod.mk.injEq] at h
        obtain ⟨rfl, rfl, rfl⟩ := h
        exact ⟨x', List.mem_cons_self _ _, rfl, rfl⟩
      · exact ⟨x, List.mem_cons_of_mem _ hm, rfl, rfl⟩
    · rintro ⟨x, hm, rfl, rfl⟩
      rcases List.mem_cons.mp hm with h | hm'
      · simp only [Prod.mk.injEq] at h
        obtain ⟨rfl, rfl⟩ := h
        exact .inl rfl
      · exact .inr ⟨x, hm', rfl, rfl⟩

theorem termElems_length : ∀ xs : List Data, (termElems xs).length = xs.length
  | [] => rfl
  | _ :: xs => by rw [termElems, List.length_cons, List.length_cons, termElems_length xs]

theorem termElems_getElem? : ∀ (xs : List Data) (i : ℕ), (termElems xs)[i]? = xs[i]?.map Data.term
  | [], _ => by simp [termElems]
  | x :: xs, 0 => by simp [termElems]
  | x :: xs, i + 1 => by
    rw [termElems, List.getElem?_cons_succ, List.getElem?_cons_succ]
    exact termElems_getElem? xs i

mutual
theorem term_admits_self : ∀ j : Data, j.WellFormed → Admits env root j.term j
  | .num _, _ => .num
  | .str _, _ => .str
  | .bool _, _ => .bool
  | .null, _ => .null
  | .map fs, h => by
    cases h with
    | map hn hw =>
      refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
      · intro k o v x hm hl
        obtain ⟨y, hmem, -, rfl⟩ := termMembers_mem.mp hm
        rw [lookup_eq_some_of_nodup hn hmem] at hl
        obtain rfl := Option.some.inj hl
        exact members_admit_self fs hw k y hmem
      · intro k o v hm hl
        obtain ⟨y, hmem, -, -⟩ := termMembers_mem.mp hm
        rw [lookup_eq_some_of_nodup hn hmem] at hl
        exact nomatch hl
  | .list xs, h => by
    cases h with
    | list hw =>
      refine .list (by rw [termElems_length]; exact Nat.le_refl _) (fun h => nomatch h) ?_
        (fun _ h => nomatch h)
      intro i v x hv hx
      rw [termElems_getElem?, hx] at hv
      obtain rfl := Option.some.inj hv
      exact elems_admit_self xs hw x (List.mem_of_getElem? hx)

theorem members_admit_self : ∀ fs : List (String × Data), (∀ k x, (k, x) ∈ fs → x.WellFormed) →
    ∀ k x, (k, x) ∈ fs → Admits env root x.term x
  | [], _, _, _, hm => absurd hm (List.not_mem_nil _)
  | (k', y) :: fs, hw, k, x, hm => by
    rcases List.mem_cons.mp hm with h | hm'
    · simp only [Prod.mk.injEq] at h
      obtain ⟨rfl, rfl⟩ := h
      exact term_admits_self _ (hw _ _ (List.mem_cons_self _ _))
    · exact members_admit_self fs (fun k x hm => hw k x (List.mem_cons_of_mem _ hm)) k x hm'

theorem elems_admit_self : ∀ xs : List Data, (∀ x, x ∈ xs → x.WellFormed) →
    ∀ x, x ∈ xs → Admits env root x.term x
  | [], _, _, hm => absurd hm (List.not_mem_nil _)
  | y :: xs, hw, x, hm => by
    rcases List.mem_cons.mp hm with rfl | hm'
    · exact term_admits_self _ (hw _ (List.mem_cons_self _ _))
    · exact elems_admit_self xs (fun x hm => hw x (List.mem_cons_of_mem _ hm)) x hm'
end

/-! ## The data as a term can be read -/

mutual
theorem Data.term_checkableA : ∀ j : Data, j.term.CheckableA
  | .num _ => .lit
  | .str _ => .lit
  | .bool _ => .lit
  | .null => .lit
  | .map fs => .map (termMembers_checkableA fs) (fun _ h => nomatch h)
  | .list xs => .list (termElems_checkableA xs) (fun _ h => nomatch h)

theorem termMembers_checkableA : ∀ fs : List (String × Data), ∀ k o v, (k, o, v) ∈ termMembers fs →
    v.CheckableA
  | [], _, _, _, h => absurd h (List.not_mem_nil _)
  | (_, x) :: fs, k, o, v, h => by
    rcases List.mem_cons.mp h with h | h
    · simp only [Prod.mk.injEq] at h
      obtain ⟨-, -, rfl⟩ := h
      exact Data.term_checkableA x
    · exact termMembers_checkableA fs k o v h

theorem termElems_checkableA : ∀ xs : List Data, ∀ v, v ∈ termElems xs → v.CheckableA
  | [], _, h => absurd h (List.not_mem_nil _)
  | x :: xs, v, h => by
    rcases List.mem_cons.mp h with rfl | h
    · exact Data.term_checkableA x
    · exact termElems_checkableA xs v h
end

/-! ## One verdict, and the computed one -/

/-- The four answers exclude one another. -/
theorem vet_unique {m : Mode} {ds : Decls} {S : Val} {j : Data} {v v' : Verdict}
    (h : Vet m ds S j v) (h' : Vet m ds S j v') : v = v' := by
  cases v <;> cases v' <;> simp only [Vet] at h h'
  case valid.valid | invalid.invalid | incomplete.incomplete | error.error => rfl
  case error.valid | error.invalid | error.incomplete =>
    rcases h with hD | hG | hi
    · exact absurd h'.1 hD
    · exact absurd h'.2.1 hG
    · exact absurd (h'.2.2.1.symm.trans hi) Bool.false_ne_true
  case valid.error | invalid.error | incomplete.error =>
    rcases h' with hD | hG | hi
    · exact absurd h.1 hD
    · exact absurd h.2.1 hG
    · exact absurd (h.2.2.1.symm.trans hi) Bool.false_ne_true
  case invalid.valid | invalid.incomplete =>
    rcases h.2.2.2 with hd | hr
    · exact absurd (h'.2.2.2.1.symm.trans hd) Bool.false_ne_true
    · exact absurd hr h'.2.2.2.2.1
  case valid.invalid | incomplete.invalid =>
    rcases h'.2.2.2 with hd | hr
    · exact absurd (h.2.2.2.1.symm.trans hd) Bool.false_ne_true
    · exact absurd hr h.2.2.2.2.1
  case valid.incomplete =>
    rcases h.2.2.2.2.2 with hp | hex
    · exact absurd (h'.2.2.2.2.2.1.symm.trans hp) Bool.false_ne_true
    · exact absurd hex h'.2.2.2.2.2.2
  case incomplete.valid =>
    rcases h'.2.2.2.2.2 with hp | hex
    · exact absurd (h.2.2.2.2.2.1.symm.trans hp) Bool.false_ne_true
    · exact absurd hex h.2.2.2.2.2.2

/-- The computed verdict is a verdict: `vet` answers as `Vet` says,
wherever the bodies, and the schema as read with its selections made,
hold no path, no pattern, no format and no selection a value has not
settled, which `decide` settles for any closed document. -/
theorem vet_sound {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) : Vet m ds S j (vet m ds S j) := by
  unfold vet
  cases hok : (ds.declaresB S && ds.guardedB) with
  | false =>
    simp only [Bool.not_false, ↓reduceIte]
    rcases Bool.and_eq_false_iff.mp hok with hd | hg
    · exact .inl fun h => Bool.false_ne_true (hd.symm.trans (Decls.declaresB_iff.mpr h))
    · exact .inr (.inl fun h => Bool.false_ne_true (hg.symm.trans (Decls.guardedB_iff.mpr h)))
  | true =>
    simp only [Bool.not_true, Bool.false_eq_true, ↓reduceIte]
    rw [Bool.and_eq_true] at hok
    obtain ⟨hdB, hgB⟩ := hok
    have hD := Decls.declaresB_iff.mp hdB
    have hG := Decls.guardedB_iff.mp hgB
    have hS' : (ds.readR S).CheckableA := hS
    have hM' := normaliseD_checkableA hb (meetD_checkableA hb hS' (Data.term_checkableA j))
    cases hi : (normaliseD ds (ds.readR S)).illFormed with
    | true => exact .inr (.inr hi)
    | false =>
      rw [if_neg Bool.false_ne_true]
      cases hd : (normaliseD ds (meetD ds (ds.readR S) j.term)).dead with
      | true => exact ⟨hD, hG, hi, .inl hd⟩
      | false =>
        rw [if_neg Bool.false_ne_true]
        cases hr : refusedAt ds (normaliseD ds (meetD ds (ds.readR S) j.term)) with
        | true => exact ⟨hD, hG, hi, .inr ((refusedAt_iff hG hb hM').mp hr)⟩
        | false =>
          rw [if_neg Bool.false_ne_true]
          have hnr : ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) := fun h => by
            rw [(refusedAt_iff hG hb hM').mpr h] at hr
            exact nomatch hr
          cases hp : m.lax with
          | true => exact ⟨hD, hG, hi, hd, hnr, .inl hp⟩
          | false =>
            rw [if_neg Bool.false_ne_true]
            cases ho : outputD ds (meetD ds (ds.readR S) j.term) with
            | some j' =>
              have hout : OutputD ds j (meetD ds (ds.readR S) j.term) j' :=
                (outputD_iff hG hb hM' j').mp ho
              cases hc : (m.fill || checkR ds (ds.readR S) j) with
              | true =>
                rw [if_pos rfl]
                refine ⟨hD, hG, hi, hd, hnr, .inr ⟨j', hout, ?_⟩⟩
                rcases Bool.or_eq_true_iff.mp hc with hf | hk
                · exact .inl hf
                · exact .inr ((checkR_iff hG hb hS' j).mp hk)
              | false =>
                rw [if_neg Bool.false_ne_true]
                refine ⟨hD, hG, hi, hd, hnr, hp, ?_⟩
                rintro ⟨j'', -, hf | hA⟩
                · rw [hf] at hc
                  exact nomatch hc
                · rw [(checkR_iff hG hb hS' j).mpr hA, Bool.or_true] at hc
                  exact nomatch hc
            | none =>
              refine ⟨hD, hG, hi, hd, hnr, hp, ?_⟩
              rintro ⟨j', hout, -⟩
              rw [(outputD_iff hG hb hM' j').mpr hout] at ho
              exact nomatch ho

/-- `vet` computes `Vet`. -/
theorem vet_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) (v : Verdict) : vet m ds S j = v ↔ Vet m ds S j v :=
  ⟨fun h => h ▸ vet_sound hb hS, fun h => vet_unique (vet_sound hb hS) h⟩

/-! ## What the verdicts say -/

/-- Without the fill, `valid` is `Instance`: the data as written is an
instance of the schema as read. -/
theorem vet_strict_valid_instance {m : Mode} {ds : Decls} {S : Val} {j : Data} (hf : m.fill = false)
    (hp : m.lax = false) (hj : j.WellFormed) (h : Vet m ds S j .valid) :
    Instance ds.envE (ds.readR S) j := by
  obtain ⟨-, -, -, -, -, hp' | ⟨_, -, hf' | hA⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · rw [hf] at hf'
    exact nomatch hf'
  · exact ⟨hj, hA⟩

/-- With the fill, `valid` singles out a value, the data filled, which
is an instance of the schema as read. -/
theorem vet_valid_filled {m : Mode} {ds : Decls} {S : Val} {j : Data} (hp : m.lax = false)
    (h : Vet m ds S j .valid) :
    ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧ Admits ds.envE j (ds.readR S) j' := by
  obtain ⟨-, -, -, -, -, hp' | ⟨j', hout, -⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · exact ⟨j', hout, ((admits_meetD _ _ _).mp (outputD_admits _ _ hout)).1⟩

/-- `invalid` refuses: the normal form of the schema met with the data
refuses the data as written, or, its trials and sizes unread, the value
it would single out. -/
theorem vet_invalid_refuses {m : Mode} {ds : Decls} {S : Val} {j : Data} (h : Vet m ds S j .invalid) :
    Refuses ds.envE j (normaliseD ds (meetD ds (ds.readR S) j.term)) j ∨
      RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) := by
  obtain ⟨-, -, -, hd | hr⟩ := h
  · exact .inl (dead_refuses _ hd j)
  · exact .inr hr

end

end Aontu

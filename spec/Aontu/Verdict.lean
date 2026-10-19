import Aontu.Output

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
schema; and `invalid` refuses the data as an instance.
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

/-! ## The verdict -/

/-- The verdict `vet` gives the data `j` against the schema `S` under
the mode `m`: `error` where the schema's normal form does not stand;
`invalid` where the meet of the schema with the data is dead; `valid`
where the meet singles out a value, and without the fill where the data
as written is an instance too, or where `--partial` lets the unresolved
pass; and `incomplete` otherwise. -/
def Vet (m : Mode) (env : Env) (S : Val) (j : Data) : Verdict → Prop
  | .error => (normalise S).illFormed = true
  | .invalid => (normalise S).illFormed = false ∧ (normalise (meet S j.term)).dead = true
  | .valid =>
    (normalise S).illFormed = false ∧ (normalise (meet S j.term)).dead = false ∧
      (m.lax = true ∨
        ∃ j', Output env j (meet S j.term) j' ∧ (m.fill = true ∨ Admits env j S j))
  | .incomplete =>
    (normalise S).illFormed = false ∧ (normalise (meet S j.term)).dead = false ∧
      m.lax = false ∧
      ¬ ∃ j', Output env j (meet S j.term) j' ∧ (m.fill = true ∨ Admits env j S j)

/-- The verdict, computed. -/
def vet (m : Mode) (S : Val) (j : Data) : Verdict :=
  if (normalise S).illFormed then .error
  else if (normalise (meet S j.term)).dead then .invalid
  else if m.lax then .valid
  else
    match output (meet S j.term) with
    | some _ => if m.fill || check S j then .valid else .incomplete
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

/-! ## One verdict, and the computed one -/

/-- The four answers exclude one another. -/
theorem vet_unique {m : Mode} {S : Val} {j : Data} {v v' : Verdict}
    (h : Vet m env S j v) (h' : Vet m env S j v') : v = v' := by
  cases v <;> cases v' <;> simp only [Vet] at h h'
  case valid.valid | invalid.invalid | incomplete.incomplete | error.error => rfl
  case error.valid | error.invalid | error.incomplete =>
    exact absurd (h'.1.symm.trans h) Bool.false_ne_true
  case valid.error | invalid.error | incomplete.error =>
    exact absurd (h.1.symm.trans h') Bool.false_ne_true
  case invalid.valid | invalid.incomplete =>
    exact absurd (h'.2.1.symm.trans h.2) Bool.false_ne_true
  case valid.invalid | incomplete.invalid =>
    exact absurd (h.2.1.symm.trans h'.2) Bool.false_ne_true
  case valid.incomplete =>
    rcases h.2.2 with hp | hex
    · exact absurd (h'.2.2.1.symm.trans hp) Bool.false_ne_true
    · exact absurd hex h'.2.2.2
  case incomplete.valid =>
    rcases h'.2.2 with hp | hex
    · exact absurd (h.2.2.1.symm.trans hp) Bool.false_ne_true
    · exact absurd hex h.2.2.2

/-- The computed verdict is a verdict: `vet` answers as `Vet` says,
wherever the schema and the meet are checkable, which `decide` settles
for any closed schema and document. -/
theorem vet_sound {m : Mode} {S : Val} {j : Data} (hS : S.Checkable)
    (hM : (normalise (meet S j.term)).Checkable) : Vet m env S j (vet m S j) := by
  unfold vet
  cases hi : (normalise S).illFormed with
  | true => exact hi
  | false =>
    rw [if_neg Bool.false_ne_true]
    cases hd : (normalise (meet S j.term)).dead with
    | true => exact ⟨hi, hd⟩
    | false =>
      rw [if_neg Bool.false_ne_true]
      cases hp : m.lax with
      | true => exact ⟨hi, hd, .inl hp⟩
      | false =>
        rw [if_neg Bool.false_ne_true]
        cases ho : output (meet S j.term) with
        | some j' =>
          have hout : Output env j (meet S j.term) j' := (output_iff hM j').mp ho
          cases hc : (m.fill || check S j) with
          | true =>
            rw [if_pos rfl]
            refine ⟨hi, hd, .inr ⟨j', hout, ?_⟩⟩
            rcases Bool.or_eq_true_iff.mp hc with hf | hk
            · exact .inl hf
            · exact .inr ((check_iff hS j).mp hk)
          | false =>
            rw [if_neg Bool.false_ne_true]
            refine ⟨hi, hd, hp, ?_⟩
            rintro ⟨j'', -, hf | hA⟩
            · rw [hf] at hc
              exact nomatch hc
            · rw [(check_iff hS j).mpr hA, Bool.or_true] at hc
              exact nomatch hc
        | none =>
          refine ⟨hi, hd, hp, ?_⟩
          rintro ⟨j', hout, -⟩
          rw [(output_iff hM j').mpr hout] at ho
          exact nomatch ho

/-- `vet` computes `Vet`. -/
theorem vet_iff {m : Mode} {S : Val} {j : Data} (hS : S.Checkable)
    (hM : (normalise (meet S j.term)).Checkable) (v : Verdict) :
    vet m S j = v ↔ Vet m env S j v :=
  ⟨fun h => h ▸ vet_sound hS hM, fun h => vet_unique (vet_sound hS hM) h⟩

/-! ## What the verdicts say -/

/-- Without the fill, `valid` is `Instance`: the data as written is an
instance of the schema. -/
theorem vet_strict_valid_instance {m : Mode} {S : Val} {j : Data} (hf : m.fill = false)
    (hp : m.lax = false) (hj : j.WellFormed) (h : Vet m env S j .valid) : Instance env S j := by
  obtain ⟨-, -, hp' | ⟨_, -, hf' | hA⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · rw [hf] at hf'
    exact nomatch hf'
  · exact ⟨hj, hA⟩

/-- With the fill, `valid` singles out a value, the data filled, which
is an instance of the schema. -/
theorem vet_valid_filled {m : Mode} {S : Val} {j : Data} (hp : m.lax = false)
    (h : Vet m env S j .valid) : ∃ j', Output env j (meet S j.term) j' ∧ Admits env j S j' := by
  obtain ⟨-, -, hp' | ⟨j', hout, -⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · exact ⟨j', hout, ((admits_meet _ _ _).mp (output_admits _ _ hout)).1⟩

/-- `invalid` refuses the data: it is no instance of the schema. -/
theorem vet_invalid_not_instance {m : Mode} {S : Val} {j : Data} (hj : j.WellFormed)
    (h : Vet m env S j .invalid) : ¬ Admits env j S j := by
  obtain ⟨-, hd⟩ := h
  intro hA
  exact dead_sound _ hd j ((admits_normalise _ _).mpr
    ((admits_meet _ _ _).mpr ⟨hA, term_admits_self j hj⟩))

end

end Aontu

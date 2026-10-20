import Aontu.Admits

/-!
# The trial schemas, as theorems

`nof(n, c₁, …)`, `must(c, m)` and `when(c, t, e)` are rules of `Judge`,
in `spec/Aontu/Admits.lean`: a trial reads the branches that refuse a
value as well as those that admit it, which the second answer of the
one relation gives it without a negation. What the decisions say of
them is proved here: `must(c, m)` asks what `nof(1, c)` asks (ADR-055);
`nof(0, c)` is the complement of `c`, which is how JSON Schema's `not`
crosses into aontu (ADR-049); a conditional holds a value to the
branch its condition picks, `when(c, nil)` refusing every value `c`
admits (ADR-050); `contains(c, n)` counts the members `c` admits, none
in an empty container, and refuses a scalar, which has no members
(ADR-051); and `rest(t, c₁, …)` admits a scalar, which has no members,
and with `nil` and no cover admits a container only where it has none
(ADR-058).
-/

namespace Aontu

section
variable {env : Env} {root : Data}

/-- The count of one branch: one where it admits, none where it does not. -/
theorem countP_singleton {α : Type} (f : α → Bool) (c : α) :
    [c].countP f = if f c then 1 else 0 := by
  simp [List.countP_cons]

/-- `must(c, m)` asks what `nof(1, c)` asks, whichever way the trial
comes out. -/
theorem judge_must_iff_nof {b : Bool} {c : Val} {m : String} {j : Data} :
    Judge env root b (.must c m) j ↔ Judge env root b (.nof (.lit (.num (.integer (.of 1)))) [c]) j := by
  constructor
  · intro h
    cases h with
    | must hc =>
      cases b with
      | false =>
        refine .nof (f := fun _ => false) (k := 0) (by decide) ?_ (by simp) (.litNot (by simp [Scalar.data, Integer.of]))
        intro c' hc'
        rw [List.mem_singleton] at hc'
        exact hc' ▸ hc
      | true =>
        refine .nof (f := fun _ => true) (k := 1) (by decide) ?_ (by simp) .num
        intro c' hc'
        rw [List.mem_singleton] at hc'
        exact hc' ▸ hc
  · intro h
    cases h with
    | @nof _ _ _ _ f k _ hf hcount hn =>
      have hc := hf c (List.mem_singleton_self c)
      rw [countP_singleton] at hcount
      cases hfc : f c
      · rw [hfc] at hc
        simp only [hfc, Bool.false_eq_true, ↓reduceIte] at hcount
        subst hcount
        cases judge_unique hn (.litNot (by simp [Scalar.data, Integer.of]))
        exact .must hc
      · rw [hfc] at hc
        simp only [hfc, ↓reduceIte] at hcount
        subst hcount
        cases judge_unique hn .num
        exact .must hc
    | @nofBig _ _ _ f k hf hcount hbig =>
      rw [countP_singleton] at hcount
      subst hcount
      exact absurd (by split <;> decide) hbig

/-- `nof(0, c)` is the complement of `c`, which is how JSON Schema's
`not` reads: it admits what `c` refuses and refuses what `c` admits. -/
theorem judge_nof_zero {b : Bool} {c : Val} {j : Data} :
    Judge env root b (.nof (.lit (.num (.integer (.of 0)))) [c]) j ↔ Judge env root (!b) c j := by
  constructor
  · intro h
    cases h with
    | @nof _ _ _ _ f k _ hf hcount hn =>
      have hc := hf c (List.mem_singleton_self c)
      rw [countP_singleton] at hcount
      cases hfc : f c
      · rw [hfc] at hc
        simp only [hfc, Bool.false_eq_true, ↓reduceIte] at hcount
        subst hcount
        cases judge_unique hn .num
        exact hc
      · rw [hfc] at hc
        simp only [hfc, ↓reduceIte] at hcount
        subst hcount
        cases judge_unique hn (.litNot (by simp [Scalar.data, Integer.of]))
        exact hc
    | @nofBig _ _ _ f k hf hcount hbig =>
      rw [countP_singleton] at hcount
      subst hcount
      exact absurd (by split <;> decide) hbig
  · intro h
    cases b with
    | true =>
      refine .nof (f := fun _ => false) (k := 0) (by decide) ?_ (by simp) .num
      intro c' hc'
      rw [List.mem_singleton] at hc'
      exact hc' ▸ h
    | false =>
      refine .nof (f := fun _ => true) (k := 1) (by decide) ?_ (by simp) (.litNot (by simp [Scalar.data, Integer.of]))
      intro c' hc'
      rw [List.mem_singleton] at hc'
      exact hc' ▸ h

/-- A conditional holds the value to the branch its condition picks:
where `c` admits it, `when(c, t, e)` judges it as `t` does; where `c`
refuses it, as `e` does, an `e` not written reading as `any`. -/
theorem judge_when_iff {b : Bool} {c t : Val} {e : Option Val} {j : Data} :
    Judge env root b (.when c t e) j ↔
      (Admits env root c j ∧ Judge env root b t j) ∨
        (Refuses env root c j ∧ Judge env root b (e.getD .any) j) := by
  constructor
  · intro h
    cases h with
    | whenThen hc ht => exact .inl ⟨hc, ht⟩
    | whenElse hc he => exact .inr ⟨hc, he⟩
    | whenPass hc => exact .inr ⟨hc, .any⟩
  · rintro (⟨hc, ht⟩ | ⟨hc, he⟩)
    · exact .whenThen hc ht
    · cases e with
      | some e' => exact .whenElse hc he
      | none =>
        cases judge_unique he .any
        exact .whenPass hc

/-- `when(c, nil)` refuses every value `c` admits: `nil` is the false
schema in a branch. -/
theorem when_nil_refuses {c : Val} {e : Option Val} {j : Data} (h : Admits env root c j) :
    Refuses env root (.when c .nil e) j :=
  .whenThen h .nil

/-- `contains(c, n)` over a list with no members judges as `n` judges
`0`: nothing is admitted where nothing is tried. -/
theorem judge_contains_empty {b : Bool} {c n : Val} :
    Judge env root b (.contains c n) (.list []) ↔ Judge env root b n (.num (.integer (.of 0))) := by
  constructor
  · intro h
    cases h with
    | contains _ hm _ hk hn =>
      simp only [Data.members, Option.some.injEq] at hm
      subst hm
      simp only [List.countP_nil] at hk
      subst hk
      exact hn
    | containsNone hm => exact nomatch hm
    | containsBig hm _ hk hbig =>
      simp only [Data.members, Option.some.injEq] at hm
      subst hm
      simp only [List.countP_nil] at hk
      subst hk
      exact absurd (by decide) hbig
  · intro h
    exact .contains (f := fun _ => false) (k := 0) (by decide) rfl (fun x hx => nomatch hx) rfl h

/-- A scalar has no members, so `contains` refuses it. -/
theorem contains_refuses_scalar {c n : Val} (s : Scalar) : Refuses env root (.contains c n) s.data :=
  .containsNone (by cases s <;> rfl)

/-- A scalar has no members, so `rest` admits it: nothing is left over. -/
theorem rest_admits_scalar {t : Val} {cs : List Cover} (s : Scalar) : Admits env root (.rest t cs) s.data :=
  .restNone (by cases s <;> rfl)

/-- `rest(nil)` with no cover admits a container exactly where it has no
members: nothing evaluates any, and `nil` holds none. -/
theorem rest_nil_closes {j : Data} {ns : List (String × Data)} (hm : j.named = some ns) :
    Admits env root (.rest .nil []) j ↔ ns = [] := by
  constructor
  · intro h
    cases h with
    | @rest _ _ _ _ _ _ _ _ ft hm' _ _ _ hft hb =>
      rw [hm] at hm'; cases hm'
      cases ns with
      | nil => rfl
      | cons m ms =>
        have hf : ft m.2 = false := judge_unique (hft m.1 m.2 (List.mem_cons_self)) .nil
        simp [evaluatedBy, hf] at hb
    | restNone hm' => rw [hm] at hm'; cases hm'
  · rintro rfl
    exact .rest (gc := fun _ => true) (gk := fun _ _ => false) (gm := fun _ _ => false) (ft := fun _ => false) hm
      (fun c hc => nomatch hc) (fun c hc => nomatch hc) (fun c hc => nomatch hc) (fun k x hx => nomatch hx) rfl

end

end Aontu

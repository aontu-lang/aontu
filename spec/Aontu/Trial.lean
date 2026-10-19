import Aontu.Admits

/-!
# The trial schemas, as theorems

`nof(n, c₁, …)`, `must(c, m)` and `when(c, t, e)` are rules of `Judge`,
in `spec/Aontu/Admits.lean`: a trial reads the branches that refuse a
value as well as those that admit it, which the second answer of the
one relation gives it without a negation. What the decisions say of
them is proved here: `must(c, m)` asks what `nof(1, c)` asks (ADR-055);
`nof(0, c)` is the complement of `c`, which is how JSON Schema's `not`
crosses into aontu (ADR-049); and a conditional holds a value to the
branch its condition picks, `when(c, nil)` refusing every value `c`
admits (ADR-050).
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

end

end Aontu

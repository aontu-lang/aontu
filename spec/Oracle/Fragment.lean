import Oracle.Base

/-! The oracle's cases: Fragment, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

def kindVals : List Val :=
  kindBases ++ kindBases.flatMap (fun v => [field true v, field false v]) ++
    kindBases.flatMap (fun k =>
      [.meet k (field false .integer), .meet k (.list [.integer] none false), .meet k .string]) ++
    [.meet .mapKind .listKind]

theorem kindVals_checkableB : ∀ v ∈ kindVals, v.checkableB = true := by decide

theorem kindVals_checkable : ∀ v ∈ kindVals, v.Checkable :=
  fun v hv => (Val.checkableB_iff v).1 (kindVals_checkableB v hv)

/-- Every row of the kinds is the definition's. -/
theorem kind_verdict_exact {v : Val} (hv : v ∈ kindVals) {j : Data} (hj : j ∈ instances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨instances_wellFormed j hj, (check_iff (kindVals_checkable v hv) j).mp h⟩,
    fun h => (check_iff (kindVals_checkable v hv) j).mpr h.2⟩

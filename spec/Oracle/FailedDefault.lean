import Oracle.Base

/-! The oracle's cases: a lone default whose own value fails, which both
ports report as a conflict where the default stands (#1042). -/

open Aontu
open Case

/-- A lone default whose own value is a conflict, beside data its parent
type admits: alone, twice preferred, in a map, met with its kind, as a
string, a disjunction of conflicts and a map that holds one, all
`error`; an arm that holds one, which drops, so the other arm answers;
a spread's template that holds one, which refuses each member; and a
default that only a meet refuses, which is no conflict. -/
def failedCases : List (Val × Data) :=
  let bad : Val := .meet (int 1) (int 2)
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  [(.pref 1 bad, j 1), (.pref 2 (.pref 1 bad), j 1), (mp [("a", .pref 1 bad)], .map [("a", j 1)]),
    (.meet (.pref 1 bad) .integer, j 1), (.pref 1 (.meet (str "a") (str "b")), .str "a"),
    (.pref 1 (.or [(0, bad), (0, .meet (int 3) (int 4))]), j 1),
    (.pref 1 (mp [("a", bad)]), .map [("a", j 1)]),
    (.meet (.pref 1 bad) (.pref 1 (int 3)), j 3),
    (.or [(0, mp [("a", .pref 1 bad)]), (0, int 3)], j 3),
    (.map [] (some (.pref 1 bad)) false, .map [("x", j 1)]),
    (.meet (.pref 1 (int 1)) (int 2), j 2)]

theorem failedCases_checkable : ∀ c ∈ failedCases, (vetDoc c).1.CheckableA := by decide

theorem failed_verdict_exact : ∀ c ∈ failedCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (failedCases_checkable c hc)) v

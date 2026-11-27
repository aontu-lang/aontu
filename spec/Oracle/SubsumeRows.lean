import Oracle.Subsume
import Oracle.SubsumeRowCases

/-! The oracle's cases: the rows of `test/spec/subsume.tsv` whose documents
the definition reads (`Oracle/SubsumeRowCases.lean`), each with the
answers its profile's contract allows, so that a golden the contract
refuses fails. -/

open Aontu
open Case

/-- The instances a row's pair is tried on: the specific side's generated
document, and that document with each of its own and the general side's
top keys left out or holding each instance the profiles try. -/
def rowInstances (g s : Decls × Val) : List Data :=
  let keys (v : Val) : List String := match v with
    | .map fs _ _ => fs.map (·.1)
    | _ => []
  let pool := profileInstances ++ subInstances
  match genD s.1 (s.1.readR s.2) with
  | some (.map fs) =>
    let ks := (keys s.2 ++ keys g.2).eraseDups
    .map fs :: ks.flatMap fun k =>
      let rest := fs.filter (·.1 != k)
      .map rest :: pool.map fun j => .map (rest ++ [(k, j)])
  | some d => [d]
  | none => []

/-- What a row's contract allows, the general first: `subsumes` where
the order holds and the profile's walk fails nowhere, `does_not_subsume`
where an instance tells the two apart or a position refutes what the
profile asks, and no row otherwise. A side with declarations is
compared through its names (`leCoD`), so only the `values` profile can
hold there; an instance refutes every profile. -/
def rowAnswer (pr : Profile) (g s : Decls × Val) : Option String :=
  let refutes := (rowInstances g s).any fun j =>
    j.wf && checkR s.1 (s.1.readR s.2) j && !(checkR g.1 (g.1.readR g.2) j)
  let (holds, fails) :=
    if g.1.isEmpty && s.1.isEmpty then
      let gv := Decls.readR [] g.2
      let sv := Decls.readR [] s.2
      let ns := normalise sv
      let ng := normalise gv
      let le := (leDecF .empty 64 sv gv).isSome
      let dHolds := le && defaultsAt ns ng && defaultsBelow ns ng
      let dFails := refutes || (segPaths ns).any (defaultsRefutesAt sv gv)
      match pr with
      | .values => (le, refutes)
      | .defaults => (dHolds, dFails)
      | .gen => (dHolds && marksAt ns ng && marksBelow ns ng,
          dFails || (markPaths ns).any (marksRefuteAt sv gv))
    else
      (pr == .values && (leCoD 64 g.1 g.2 s.1 s.2).isSome, refutes)
  if holds && fails then some "both"
  else if holds then some "[\"subsumes\",\"undecided\"]"
  else if fails then some "[\"does_not_subsume\",\"undecided\"]"
  else none

/-- A document's text: its declarations, one to a line, and its term. -/
def rowSrc (c : Decls × Val) : IO String := do
  let lines ← declLines c.1
  let some tsrc := c.2.cell | throw (IO.userError "a row's term has no text")
  pure ("\\n".intercalate (lines ++ [tsrc]))

/-- The rows: each `subsume.tsv` row the definition decides, under its
own name with `def-` in front, its documents as the definition read
them. -/
def subsumeRowRows : IO Unit := do
  for (name, pr, g, s) in subsumeRowCases do
    if let some want := rowAnswer pr g s then
      if want == "both" then throw (IO.userError s!"a row both holds and fails: {name}")
      let pname := match pr with | .values => "values" | .defaults => "defaults" | .gen => "gen"
      IO.println ("def-" ++ name ++ "\tsubsumption\t" ++ (← rowSrc g) ++ "\t" ++ (← rowSrc s)
        ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"" ++ pname ++ "\"}}")

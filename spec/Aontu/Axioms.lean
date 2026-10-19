import Aontu.Order
import Aontu.Names
import Aontu.Trial
import Aontu.Check
import Aontu.Meet
import Aontu.Output
import Aontu.Alias
import Aontu.Verdict
import Aontu.Paths

/-!
# The axioms

Every named theorem of the definition rests on `propext` and
`Quot.sound` alone, and never on `Classical.choice`: each proof is
constructive. The build fails here if one of these comes to rest on
more, since `#guard_msgs` holds what `#print axioms` reports to the
line each comment states.
-/

/-- info: 'Aontu.check_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.check_iff

/-- info: 'Aontu.checkSuper_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkSuper_iff

/-- info: 'Aontu.Data.same_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.Data.same_iff

/-- info: 'Aontu.vetP_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.vetP_iff

/-- info: 'Aontu.judge_unique' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.judge_unique

/-- info: 'Aontu.checkWith_judge' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkWith_judge

/-- info: 'Aontu.checkR_judge' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkR_judge

/-- info: 'Aontu.judge_must_iff_nof' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.judge_must_iff_nof

/-- info: 'Aontu.judge_nof_zero' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.judge_nof_zero

/-- info: 'Aontu.Data.wf_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.Data.wf_iff

/-- info: 'Aontu.distinct_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.distinct_iff

/-- info: 'Aontu.admits_meet' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_meet

/-- info: 'Aontu.admits_normalise' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_normalise

/-- info: 'Aontu.admits_meetStep' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_meetStep

/-- info: 'Aontu.admits_meetMap' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_meetMap

/-- info: 'Aontu.admits_meetList' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_meetList

/-- info: 'Aontu.merge_exact' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.merge_exact

/-- info: 'Aontu.no_meet_with_string_admits_empty' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.no_meet_with_string_admits_empty

/-- info: 'Aontu.above_le_min' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.above_le_min

/-- info: 'Aontu.beneath_le_max' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.beneath_le_max

/-- info: 'Aontu.never_no_when_le' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.never_no_when_le

/-- info: 'Aontu.output_admits' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.output_admits

/-- info: 'Aontu.output_unique' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.output_unique

/-- info: 'Aontu.gen_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.gen_iff

/-- info: 'Aontu.vet_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.vet_iff

/-- info: 'Aontu.vet_strict_valid_instance' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.vet_strict_valid_instance

/-- info: 'Aontu.vet_valid_filled' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.vet_valid_filled

/-- info: 'Aontu.vet_invalid_not_instance' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.vet_invalid_not_instance

/-- info: 'Aontu.Decls.recursiveB_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.Decls.recursiveB_iff

/-- info: 'Aontu.Decls.guardedB_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.Decls.guardedB_iff

/-- info: 'Aontu.Decls.declaresB_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.Decls.declaresB_iff

/-- info: 'Aontu.alias_self_admits_nothing' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.alias_self_admits_nothing

/-- info: 'Aontu.admits_meetD' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_meetD

/-- info: 'Aontu.admits_normaliseD' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_normaliseD

/-- info: 'Aontu.outputD_admits' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.outputD_admits

/-- info: 'Aontu.outputD_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.outputD_iff

/-- info: 'Aontu.checkWith_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkWith_iff

/-- info: 'Aontu.checkR_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkR_iff

/-- info: 'Aontu.genWith_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.genWith_iff

/-- info: 'Aontu.normaliseD_checkableA' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.normaliseD_checkableA

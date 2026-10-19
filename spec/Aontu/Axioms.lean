import Aontu.Order
import Aontu.Trial
import Aontu.Check
import Aontu.Meet

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

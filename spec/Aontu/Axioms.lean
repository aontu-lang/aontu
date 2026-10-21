import Aontu.Order
import Aontu.Names
import Aontu.Trial
import Aontu.Check
import Aontu.Meet
import Aontu.Output
import Aontu.Alias
import Aontu.Verdict
import Aontu.Paths
import Aontu.Subsume

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

/-- info: 'Aontu.checkWithKey_judge' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkWithKey_judge

/-- info: 'Aontu.checkR_judge' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.checkR_judge

/-- info: 'Aontu.judge_must_iff_nof' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.judge_must_iff_nof

/-- info: 'Aontu.judge_nof_zero' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.judge_nof_zero

/-- info: 'Aontu.judge_when_iff' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.judge_when_iff

/-- info: 'Aontu.when_nil_refuses' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.when_nil_refuses

/-- info: 'Aontu.judge_contains_empty' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.judge_contains_empty

/-- info: 'Aontu.contains_refuses_scalar' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.contains_refuses_scalar

/-- info: 'Aontu.rest_admits_scalar' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.rest_admits_scalar

/-- info: 'Aontu.rest_nil_closes' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.rest_nil_closes

/-- info: 'Aontu.readR_checkableA' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.readR_checkableA

/-- info: 'Aontu.selectArm_first' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.selectArm_first

/-- info: 'Aontu.selectArm_next' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.selectArm_next

/-- info: 'Aontu.selectArm_default' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.selectArm_default

/-- info: 'Aontu.resolveD_filter_list' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.resolveD_filter_list

/-- info: 'Aontu.resolveD_filter_scalar' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.resolveD_filter_scalar

/-- info: 'Aontu.Data.wf_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.Data.wf_iff

/-- info: 'Aontu.distinct_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.distinct_iff

/-- info: 'Aontu.admits_meet' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_meet

/-- info: 'Aontu.admits_selectNow' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.admits_selectNow

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

/-- info: 'Aontu.hide_not_genLe' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.hide_not_genLe

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

/-- info: 'Aontu.vet_invalid_refuses' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.vet_invalid_refuses

/-- info: 'Aontu.dead_refuses' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.dead_refuses

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

/-- info: 'Aontu.le_nil_iff' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.le_nil_iff

/-- info: 'Aontu.leaf_le_leaf_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.leaf_le_leaf_iff

/-- info: 'Aontu.lit_le_lit_iff' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.lit_le_lit_iff

/-- info: 'Aontu.re_not_le_string' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.re_not_le_string

/-- info: 'Aontu.or_le_iff' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.or_le_iff

/-- info: 'Aontu.pref_le_or' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.pref_le_or

/-- info: 'Aontu.or_le_pref' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.or_le_pref

/-- info: 'Aontu.values_correct_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.values_correct_iff

/-- info: 'Aontu.defaults_sees_the_default' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.defaults_sees_the_default

/-- info: 'Aontu.DefaultsLe.of_lit' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.DefaultsLe.of_lit

/-- info: 'Aontu.defaults_sees_through_riders' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.defaults_sees_through_riders

/-- info: 'Aontu.leDecF_sound' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.leDecF_sound

/-- info: 'Aontu.not_le_of_witness' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.not_le_of_witness

/-- info: 'Aontu.judge_root' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.judge_root

/-- info: 'Aontu.admits_of_le' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.admits_of_le

/-- info: 'Aontu.map_le' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.map_le

/-- info: 'Aontu.list_le' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.list_le

/-- info: 'Aontu.map_le_spread' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.map_le_spread

/-- info: 'Aontu.list_le_spread' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.list_le_spread

/-- info: 'Aontu.map_le_mapKind' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.map_le_mapKind

/-- info: 'Aontu.list_le_listKind' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.list_le_listKind

/-- info: 'Aontu.mapKind_le_open_map' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.mapKind_le_open_map

/-- info: 'Aontu.listKind_le_open_list' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.listKind_le_open_list

/-- info: 'Aontu.ride_le_iff' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.ride_le_iff

/-- info: 'Aontu.le_ride_iff' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.le_ride_iff

/-- info: 'Aontu.mulof_le_mulof' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.mulof_le_mulof

/-- info: 'Aontu.leD_of_le' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.leD_of_le

/-- info: 'Aontu.alias_le_unroll' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.alias_le_unroll

/-- info: 'Aontu.not_leD_of_witness' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.not_leD_of_witness

/-- info: 'Aontu.not_le_map_required' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.not_le_map_required

/-- info: 'Aontu.min_le_min_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.min_le_min_iff

/-- info: 'Aontu.min_le_above_iff' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms Aontu.min_le_above_iff

/-- info: 'Aontu.lit_le_min_iff' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.lit_le_min_iff

/-- info: 'Aontu.min_str_le_min_iff' depends on axioms: [propext] -/
#guard_msgs in
#print axioms Aontu.min_str_le_min_iff

/-- info: 'Aontu.neq_le_neq' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.neq_le_neq

/-- info: 'Aontu.len_le_len' does not depend on any axioms -/
#guard_msgs in
#print axioms Aontu.len_le_len

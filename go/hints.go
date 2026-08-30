/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strings"

// hints maps unification error codes to human-readable explanations.
// Since the #29 message-parity work the non-parameterised entries are
// VERBATIM copies of ts/src/hints.ts (worked examples included) --
// regenerate from there when the TS table changes, do not hand-edit.
// The parameterised entries at the end are ALSO verbatim TS text:
// their {placeholders} are interpolated from NilVal.details by
// strinject at render time (go/val.go), exactly as TS getHint does.
// decimal_syntax stays Go-only (TS never raises it).
var hints = map[string]string{
	"scalar_value":      "Literal scalar values of the same kind can only unify if they are\nexactly equal.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  a & a   -> a    # Does unify (equal Strings);\n  1 & 2   -> nil  # Does not unify (unequal Integers);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).",
	"scalar_kind":       "Literal scalar values of different kinds cannot unify.\n \nExamples:\n  1 & 1   -> 1    # Does unify (equal Integers);\n  1 & a   -> nil  # Does not unify (Kinds: Integer & String);\n  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float).",
	"nil_gen":           "The nil value was present after unification, and nil cannot be\ngenerated because nil is not a literal value.",
	"no_gen":            "This value was present after unification, and cannot be generated\nbecause it is not a literal value.",
	"disjunct_no_gen":   "More than one alternative of this disjunction is still admitted, so\nthere is no single value to generate. Supply a value that selects\none alternative, or write a preference (*) to say which one holds\nwhen nothing else does.",
	"mapval_required":   "This map value is required.",
	"mapval_no_gen":     "This value was present after unification, and cannot be generated\nbecause it is not a literal value.",
	"listval_required":  "This list element is required.",
	"listval_no_gen":    "This list element was present after unification, and cannot be generated\nbecause it is not a literal value.",
	"unknown_function":  "This function name is not recognized.",
	"literal_nil":       "A literal nil cannot unify with any other value.",
	"unify_cycle":       "Circular reference detected during unification.",
	"pref_implicit_bag": "A preference marks a VALUE, and a bare key is not one. Without\nbraces the `*` took the whole implicit map as its operand, so the\ndocument became a preferred map rather than a map with a preferred\nentry. Brace the bag, or move the `*` onto the value it marks.\n \nExamples:\n  *a: 1        -> nil       # No braces: the `*` takes the whole map;\n  a: *1        -> *1        # ... the `*` belongs on the value;\n  *{a: 1}      -> *{\"a\":1}  # ... or brace the bag to prefer it whole;\n  *{x:1}|*{y:2} -> *{\"x\":1}|*{\"y\":2}  # which is what disjunction needs.",
	"constraint":        "This value does not satisfy the constraint. A constraint is the\nmeet of bound atoms (min, max, above, below) and exclusions (neq)\nover one domain; the expected form shown is the normalised\nresidual the value must satisfy.\n \nExamples:\n  min(0) & 3                    -> 3    # Admitted (3 >= 0);\n  min(0) & 0d5                  -> 0d5  # Bounds are leaf-agnostic;\n  max(65535) & 99999            -> nil  # Above the bound;\n  min(5) & max(3)               -> nil  # Empty at composition time;\n  integer & above(1) & below(2) -> nil  # No integer in the gap;\n  neq(1) & 1.0                  -> 1.0  # neq excludes leaf AND value.\n  re(\"^a\") & \"abc\"              -> \"abc\" # Patterns are unanchored.",
	"must": "This value fails an evaluate-only check written with must().\n" +
		"The author's message is: {message}" +
		"\n \n" +
		"must(c, msg) is Band B of the constraint algebra: the value must\n" +
		"unify with c, but the check itself is OPAQUE to the algebra -- it\n" +
		"never participates in emptiness or subsumption, and it never\n" +
		"contributes to the value. It is the honest channel for a domain\n" +
		"rule the algebra cannot reason about, which is why it carries a\n" +
		"message of its own." +
		"\n \nExamples:\n" +
		"  must(\"gold\"|\"silver\",\"tier\") & \"gold\" -> \"gold\"  # Admitted;\n" +
		"  must(\"gold\"|\"silver\",\"tier\") & \"lead\" -> nil    # ... reported\n" +
		"                                                   #     with \"tier\";\n" +
		"  min(0) & must(integer,\"whole\") & 3    -> 3      # Bands compose.",

	"constraint_pattern":       "This re() pattern is outside the supported subset. It uses\n{reason}.\n \nre() accepts classical regular expressions over Unicode code\npoints, with one meaning in both implementations:\n \n  literals     a  \\.  \\*  \\xHH        (escape . \\ + * ? ( ) [ ] { } | ^ $ /)\n  classes      [abc]  [^abc]  [a-z]\n  abbreviations \\d \\D \\w \\W \\s \\S  and  .\n  repetition   *  +  ?  {n}  {n,}  {n,m}   (lazy: *? +? ??)\n  grouping     (...)  (?:...)      alternation  a|b\n  anchors      ^  $  \\A  \\z  \\b  \\B\n \nAontu DEFINES the abbreviations rather than inheriting either\nhost regex engine, so they mean the same in both ports:\n  \\d [0-9]   \\w [0-9A-Za-z_]   \\s [ \\t\\n\\r\\f\\v]   . [^\\n]\nNote \\s is these six ASCII characters only -- not U+00A0.\n \nNOT accepted, because no rewriting can make the two engines\nagree:\n  backreferences (\\1, \\k<n>) and lookaround ((?=) (?!) (?<=))\n  named groups, inline flags, and any (?...) but (?:\n  POSIX classes [[:alpha:]], \\p{...}, \\x{...}, \\u\n  a quantifier on a group containing a quantifier or an\n    alternation -- (a+)+ backtracks exponentially in one port,\n    so write [ab]+ rather than (?:a|b)+\n \nExamples:\n  re(\"^[a-z][a-z0-9-]*$\")  # Fine;\n  re(\"^\\d{3}-\\d{4}$\")      # Fine;\n  re(\"(?:ab)+\")            # Fine (non-capturing group);\n  re(\"(?=x)y\")             # Refused (lookahead);\n  re(\"(a+)+\")              # Refused (nested quantifier).",
	"conjunct":                 "This conjunction (& operator) could not be completed as some terms\ncould not be resolved.",
	"no_path":                  "The path reference could not be found.\n \nExamples:\n  a:1 b:$.a  -> a:1,b:1  # $.a is a valid path reference as a is a key of root ($).\n  a:$.b      -> nil      # $.b is not a valid path reference as there is no key b in root ($).\n",
	"parse_bad_src":            "Invalid source provided for parsing. The source must be a non-empty string.",
	"merge_conflict":           "A version-control conflict marker was found in the source. The\nfile still holds an unresolved merge: resolve it and remove the\n`<<<<<<<`, `=======` and `>>>>>>>` lines before unifying.\n \nExamples:\n  <<<<<<< HEAD  -> nil  # A conflict marker, not a `<` operation;\n  =======       -> nil  # ... nor a chain of `=` characters;\n  >>>>>>> other -> nil  # ... nor a `>` operation.",
	"include_denied":           "An @\"...\" include was refused by the active trust profile\n(docs/trust.md). The document asked to read a source the evaluation's\ninclude capability does not allow: widen the capability if the read is\nintended, or remove the include if it is not.\n \nExamples:\n  a:@\"in-root.aon\"    -> {..}  # Inside the confinement root: allowed;\n  a:@\"../secret.aon\"  -> nil   # ... but escaping the root is denied;\n  a:@\"/etc/hostname\"  -> nil   # ... and so is an absolute path outside it.",
	"include_extension":        "An @\"...\" include named a file the engine does not read. THE\nEXTENSION DECIDES which of two things a file is: `.aon` and\n`.aontu` are Aontu source, with the whole language in them, and\n`.json`, `.jsonld`, `.jsonc`, `.json5`, `.jsonic`, `.jsc`, `.toml`,\n`.yaml`, `.yml` and `.ini` are configuration DATA, read by that\nformat's own parser. Anything else -- and a name with no extension\n-- is refused rather than guessed at: a guess produces a document\nthat looks right and is not.\n \nExamples:\n  a:@\"model.aon\"    -> {..}  # Aontu source;\n  a:@\"server.toml\"  -> {..}  # ... config data, read as TOML;\n  a:@\"notes.txt\"    -> nil   # ... but text is not a document;\n  a:@\"data\"         -> nil   # ... and neither is an unnamed kind.",
	"pack_data":                "The first argument to pack() is not a bag. `pack` makes one child\nper child of its DATA, so the data has to have children: a list of\nnames, or a map whose keys are the names.\n \nExamples:\n  pack([a,b], {x:1})     -> {..}  # A list of names;\n  pack({a:1,b:2}, {x:1}) -> {..}  # ... or a map, keyed by its keys;\n  pack(1, {x:1})         -> nil   # ... but a scalar has no children.",
	"pack_key":                 "A list packed by pack() holds something that is not a string. The\nelements of a packed list ARE the generated keys, and only a string\nis a key — an element keyed by its position would churn every\ngenerated child the moment the list was reordered.\n \nExamples:\n  pack([a,b], {x:1})   -> {..}  # Names;\n  pack([\"a b\"], {x:1}) -> {..}  # ... a quoted name is still a name;\n  pack([1,2], {x:1})   -> nil   # ... but a number is not one.",
	"each_data":                "The first argument to each() is not a bag. `each` makes one list\nelement per child of its DATA, so the data has to have children: a\nlist, or a map whose values become the elements in sorted-key order.\n \nExamples:\n  each([1,2])       -> [..]  # A list, in source order;\n  each({b:2,a:1})   -> [..]  # ... a map, in sorted-key order;\n  each(1)           -> nil   # ... but a scalar has no children.",
	"filter_data":              "The first argument to filter() is not a bag. `filter` keeps the\nchildren of its DATA that already satisfy a condition, so the data\nhas to have children: a list, or a map.\n \nExamples:\n  filter([1,x], integer)      -> [..]  # A list;\n  filter({a:1,b:x}, integer)  -> {..}  # ... or a map, keys kept;\n  filter(1, integer)          -> nil   # ... but a scalar has none.",
	"match_none":               "No pattern matched, and there is no default. `match` tries each\npattern in the order written and takes the first the value unifies\nwith; the value {value} unified with none of {tried}. Add a trailing\ndefault — the argument after the last pair — if the rest was meant\nto be allowed.\n \nExamples:\n  match(1, integer, ok)             -> \"ok\"   # The first pattern matches;\n  match(x, integer, ok, other)      -> \"other\"  # ... or the default does;\n  match(x, integer, ok)             -> nil    # ... but nothing here does.",
	"place_pair":               "Two placeholders met, and neither has a value to fill the other.\n`_` is a HOLE: it is filled by whatever the call is unified with, so\na call holding one needs a peer that does not. Give one side a\nvalue.\n \nExamples:\n  upper(_) & hello        -> \"HELLO\"  # The peer fills the hole;\n  _ + 2 & 1               -> 3        # ... whatever the call is;\n  upper(_) & lower(_)     -> nil      # ... but two holes fill nothing.",
	"pipe_target":              "The right-hand side of a `|>` is not a function. A pipe puts the\nvalue on its left in as the FIRST argument of the call on its\nright, so the right side has to be one: a call, or the bare name of\na built-in.\n \nExamples:\n  hello |> upper        -> \"HELLO\"  # A bare name is the call;\n  $.names |> pack({})   -> {..}     # ... or a call with more arguments;\n  1 |> 2                -> nil      # ... but a value is not a function.",
	"module_path":              "A module import is domain-shaped and carries a major, but its\npath cannot be a directory on every platform the toolchain runs on --\nso it is refused before anything is built from it. An element may not\nbe empty, may not begin or end with `.` (which is what forbids `..`),\nand may not be a reserved device name. These are Go's module-path\nrules, for Go's reason: a module path becomes a real directory.\n \nExamples:\n  @\"corp.example/s@1\"        -> {..} # An ordinary path is fine;\n  @\"corp.example/../s@1\"     -> nil  # ... `..` would escape the store;\n  @\"corp.example/nul@1\"      -> nil  # ... and Windows has no such file.",
	"module_missing":           "A module import names a module that is not in this project. A\nmodule is resolved from LOCAL stores only -- `aon_vendor/` beside the\nproject's mod.aon, then the user cache -- because evaluation never\ntouches the network. Fetching is a separate step, and the message\nnames it.\n \nExamples:\n  @\"corp.example/s@1\"        -> nil  # Not fetched: run aontu mod get;\n  @\"./local.aon\"             -> {..} # ... a local path is not a module;\n  @\"corp.example/s@1#aon1-…\" -> {..} # ... and a pin does not fetch it either.",
	"module_integrity":         "A module resolved locally does not have the MEANING it was pinned\nto. The pin is a canon-hash -- the hash of the module unified\nstandalone -- so it survives comments, formatting and refactoring and\nbreaks on any semantic change in the module's transitive closure.\nVerification is always local: the registry's annotation is advisory.\n \nExamples:\n  @\"corp.example/s@1\"        -> {..} # No pin, no check;\n  @\"corp.example/s@1#aon1-x\" -> nil  # ... a pin that disagrees refuses;\n  aontu hash <file>                  # ... and this is what it should be.",
	"module_depth":             "Module verification nested too deep. A pinned module is checked by\nEVALUATING it, and that evaluation resolves the module's own imports\n-- so a vendor tree that leads back to itself would recurse until the\nhost ran out of stack. The bound makes that a stated refusal rather\nthan a crash whose verdict depends on the machine.\n \nExamples:\n  @\"corp.example/s@1\"   -> {..}  # Ordinary nesting is far below it;\n  aontu mod vendor              # ... rebuild a vendor tree that loops;\n  aontu hash <file>             # ... and check what it hashes to.",
	"recursion_unexpanded":     "A schema refers to itself here, and no data reached this position\nto expand it against. Guard the recursion -- an optional key\n(next?:) drops when nothing arrives, and a preferred alternative\n(*null | $.Node) generates -- or supply the data.\n \nExamples:\n  Node: {v: integer, next?: $.Node}\n  t: $.Node & {v: 1}            -> {..}  # next? drops;\n  Node: {v: integer, next: $.Node}\n  t: $.Node & {v: 1}            -> nil   # ... required refuses.",
	"recursion_budget":         "A recursive schema expanded past the evaluation depth budget\nwithout meeting concrete data. Expansion is driven by the data --\nfinite data always terminates -- so a chain this deep means two\ndefinitions feeding each other, or data deeper than the budget\n(docs/trust.md raises it deliberately).",
	"list_length":              "A literal list alternative in a disjunction admits only a list of\nits own length -- a spread (&:) makes it variadic. Outside a\ndisjunction two statements of one list still merge elementwise.\n \nExamples:\n  x: [] | [&: integer]\n  x: [1, 2]      -> [1,2]  # The variadic arm;\n  x: []          -> []     # ... or exactly empty;\n  y: [a] | [b]\n  y: [a, extra]  -> nil    # ... a literal arm is its length.",
	"relation_cycle":            "This relation declared acyclic(), and its edges form a cycle. The\nverdict lands at generation, where every edge is known; the error\npoints at an edge on the cycle and names the nodes it runs\nthrough, closing back on the first.\n \nExamples:\n  dependsOn: rel() & acyclic()\n  a: {dependsOn: [\"$.b\"]}\n  b: {dependsOn: [\"$.a\"]}   -> nil   # $.a -> $.b -> $.a;\n  b: {dependsOn: []}        -> {..}  # ... one edge fewer passes.",
	"relation_inverse_missing": "This relation declared inverse(name), and an edge has no mirroring\nedge under that name: A relates to B, and B does not name A back.\nThe declaration asks for the mirror to be WRITTEN, and never writes\nit for the author -- generation is refused until the document says\nboth directions.\n \nExamples:\n  a: {dependsOn: rel() & inverse(dependedOnBy) & [b]}\n  b: {dependedOnBy: rel() & [a]}  -> {..}  # Mirrored;\n  b: {dependedOnBy: rel() & []}   -> nil   # ... and this is not.",
	"inverse_name":              "The argument to inverse() is not a relation name. The mirroring\npredicate is a D-1 name -- a letter or `_`, then letters, digits,\n`_` or `-` -- spelled bare or quoted.\n \nExamples:\n  inverse(dependedOnBy)  -> inverse  # A name;\n  inverse(\"dep-on\")     -> inverse  # ... quoted when hyphenated;\n  inverse(1)             -> nil      # ... a number is not a name.",
	"rel_address":               "A rel() field holds tree addresses: one string, a list of strings,\nor a map whose string leaves are addresses. This value can never be\none.\n \nExamples:\n  dependsOn: rel() & [\"$.ledger\"]  -> {..}  # A list of addresses;\n  hostedOn: rel() & \"$.bastion\"    -> {..}  # ... or one;\n  dependsOn: rel() & [7]           -> nil   # ... but 7 is not an address.",
	"rel_unresolved":            "The address names no node in this evaluation. Every position in the\ndocument is addressable; nothing outside it is.\n \nExamples:\n  p: {}\n  q: rel() & \"$.p\"       -> {..}  # $.p is a node;\n  q: rel() & \"$.nosuch\"  -> nil   # ... $.nosuch is not.",
	"refer_address":             "A refer() was given something that is not a tree address. An address\nis a path: `$.a.b` from the document root, or `.b` from the link's own\nsibling scope — and only a STRING can be one.\n \nExamples:\n  refer() & \"$.services.auth\"  -> ...   # From the root;\n  refer() & \".auth\"            -> ...   # ... or beside the link;\n  refer() & \"services.auth\"    -> nil   # ... but a path needs its anchor;\n  refer() & 1                  -> nil   # ... and a number is not one.",
	"refer_unresolved":          "A refer() address names no node in this evaluation. Within one\nevaluation the document-set is fixed, so a link to nothing is an error\nrather than something to resolve later: check the spelling, or add the\nnode it was meant to reach. A relative address that climbs off the top\nof the tree lands here too.\n \nExamples:\n  a:{p:1} b:refer()&\"$.a\"    -> \"$.a\"    # $.a is a node;\n  a:{p:1} b:refer()&\"$.a.p\"  -> \"$.a.p\"  # ... and so is a node inside it;\n  b:refer()&\"$.nope\"         -> nil      # ... but nothing is here.",
	"func_arity":               "This function was called with the wrong number of arguments:\n{func} takes {want}, but was given {got}.\n \nExamples:\n  upper(\"a\")     -> \"A\"  # One argument, which is what upper takes;\n  upper(\"a\",\"b\") -> nil  # ... so two is a mistake in the source;\n  key()          -> \"\"   # key takes none, or one level count;\n  neq(1,2,3)     -> neq  # ... and neq takes one or more exclusions.",
	"elided_value":             "A key or element was written with no value after the colon. An\nelided value is a mistake in the source rather than a null: write\n`null` if that is what was meant, or supply the value.\n \nExamples:\n  a:null  -> null  # An explicit null, which is a value;\n  a:      -> nil   # ... but nothing at all is not;\n  a: b:1  -> {..}  # A colon chain is not an elision;\n  [1,]    -> [1]   # ... nor is a trailing comma.",
	"unify_no_src":             "No source provided for unification. Cannot unify without source values.",
	"unify_no_res":             "Unification produced no result. The values could not be unified.",
	"unite":                    "Failed to unite two values. The values are incompatible and cannot be unified.",
	"internal":                 "Internal error during unification. This indicates an unexpected error in the unification process.",
	"decimal_budget":           "This exact decimal exceeds the exactness budget: at most 4096\ncoefficient digits and an absolute scale of at most 4096. The\nbudget applies to computed results as well as to literals.\nAontu never rounds, so a value beyond the budget is refused\nrather than approximated.\n \nExamples:\n  0d1e1000000000    -> nil  # Scale far beyond the budget;\n  0d1e4000+0d1e-4000 -> nil  # An exact sum too wide to hold;\n  0d1e-1            -> 0d0.1  # Well within it.",
	"scalar-type":              "Scalar kinds only unify when one contains the other. `number` is\nthe supertype of the numeric leaves (integer, float, biginteger,\nbigdecimal), so meeting it with a leaf gives that leaf; two distinct\nleaves describe disjoint sets of values and so have no common lower\nbound.\n \nExamples:\n  number & integer -> integer  # Does unify (integer is a number);\n  number & number  -> number   # Does unify (same kind);\n  float & integer  -> nil      # Does not unify (disjoint leaves).",
	"no_scalar_unify":          "Cannot unify scalar values. The scalar values have incompatible types.\n \nExamples:\n  number & 1    -> 1    # Does unify (1 is a number);\n  integer & 1   -> 1    # Does unify (1 is an integer);\n  float & 1     -> nil  # Does not unify (1 is an integer, not a float);\n  integer & 1.5 -> nil  # Does not unify (1.5 is a float, not an integer).",
	"not-scalar-type":          "Expected a scalar type but got a non-scalar type.",
	"map":                      "Type mismatch: expected a map value but got a different type.",
	"list":                     "Type mismatch: expected a list value but got a different type.",
	"arg":                      "Missing required argument. A function requires an argument but none was provided.",
	"invalid-arg":              "Invalid argument provided. The argument does not match the expected type or format.",
	"key_level":                "The argument to key() is a LEVEL: how many steps up the path to look, where 0 is the key of the value itself and the default 1 is its parent. It must therefore be an integer -- `key(2)`, or `key(0d2)` for the exact leaf. A float, a decimal, a string, a boolean, a map or a list is not a level. A level beyond the top of the path is not an error; it yields the empty string.",
	"no_first_arg":             "Missing first argument. The function requires a first argument but none was provided.",
	"unknown_var":              "Unknown variable reference. The variable has not been defined.",
	"invalid_var_kind":         "Invalid variable kind. The variable type does not match the expected kind.",
	"path_cycle":               "Path cycle detected. The path contains a circular reference.",
	"ref":                      "Reference resolution failed. Unable to resolve the reference to a value.",
	"closed":                   "Cannot add to closed structure. The map or list is closed and does not accept new keys/elements.",
	"required_listelem":        "Required list element is missing. A non-optional list element has no value.",
	"empty":                    "Empty disjunction. The disjunction has no valid alternatives.",
	"empty-dist":               "Empty disjunction distribution. All alternatives in the disjunction are invalid.",
	// ADR-011 R2: two DEFAULTS of equal rank that cannot agree. The
	// fix is a rank, so the hint names it.
	"pref_rank_clash": "Two defaults of the same rank disagree." +
		" Rank one of them (`**x`) to say which is the weaker layer," +
		" or give them the same value.",
	"max_depth": "Input nesting is too deep to process safely.",
	"func":      "Function operation failed. See the specific function name for details.",
	"make":      "Failed to create a new value. The make operation could not construct the value.",
	"resolve":   "Failed to resolve a value. The resolution process could not find or compute the value.",
	"operate":   "Operation failed. The operation could not be performed on the given values.",
	"op":        "Operator operation failed. See the specific operator name for details.",
	"close":     "Failed to close structure. The structure could not be closed.",
	"func:":     "Function error: ",
	"op:":       "Operator error: ",
	"var[":      "Variable type error: ",
	"ref[":      "Reference error: ",
	"op[":       "Operator value error: ",

	// -- Parameterised entries: VERBATIM TS text, {placeholders}
	// interpolated from NilVal.details by strinject at render time
	// (go/val.go), exactly as TS getHint does. --

	"lossy_integer_literal":   "This integer literal, {src}, is not exactly representable in\nbinary64, so storing it would silently round it to a DIFFERENT\nnumber. Aontu refuses rather than corrupts: write it as a `0d`\nliteral to get the exact integer.\nThe rule is exactness, not magnitude -- a literal far outside the\nint64 window is still a value when it lands exactly on a binary64.\n \nExamples:\n  9007199254740992   -> 9007199254740992    # 2^53, exact;\n  9007199254740993   -> nil                 # 2^53+1 is not;\n  0d9007199254740993 -> 0d9007199254740993  # ... the exact escape;\n  0x7fffffffffffffff -> nil    # 2^63-1 rounds up to 2^63;\n  100000000000000000000 -> 1e20 # 10^20 is huge and exact.",
	"exact_float_mix":         "Aontu cannot mix an exact number with a binary float.\nHere the operands are {left} and {right}, in that order.\nA big type never silently becomes a binary float, in either\noperand order -- binary64 cannot hold every exact value, so the\npromotion would throw away the exactness the `0d` leaves exist to\nguarantee. Write both operands in the same family (`0d1.0` for the\nfloat, or a plain integer for the big).\n \nExamples:\n  0d2 + 0d0.5 -> 0d2.5  # Exact with exact (widest leaf wins);\n  1 + 0d0.5   -> 0d1.5  # integer is on the exact ladder;\n  1 + 2.0     -> 3.0    # ... and float still mixes with integer;\n  1.0 + 0d2   -> nil    # float with biginteger;\n  0d0.5 + 1.0 -> nil    # ... and the same the other way round.",
	"pick_key":                "A child of this bag has no key `{key}` to pick. Projection\nrefuses rather than skipping: a shorter list would make the\naggregate over it total a DIFFERENT set of records than the one\nthe author named, which is the failure an aggregate exists to\nprevent. Give every child the key, or filter the bag first.\n \nExamples:\n  pick([{a:1},{a:2}], a)   -> [1,2]  # Every child has it;\n  pick([{a:1},{b:2}], a)   -> nil    # ... the second does not;\n  pick([[9],[8]], 0)       -> [9,8]  # A list child takes an index.",
	"aggregate_data":          "This aggregate needs a BAG to fold: a list or a map. `sum`,\n`least` and `greatest` walk the children of the value they are\ngiven, so a scalar, a kind or an unresolved reference is not\nsomething they can total.\n \nExamples:\n  sum([1,2,3])       -> 6    # A list;\n  sum({a:1,b:2})     -> 3    # ... or a map, by sorted key;\n  sum(3)             -> nil  # A scalar is not a bag;\n  x:[1,2] sum($.x)   -> 3    # A reference to one is fine.",
	"join_member":             "A member of this bag is not text and never will be: `{member}`.\n`join` folds with `+` seeded with the empty string, and `+` with a\nstring on the left RESIDUATES on a map, a list or a null rather\nthan refusing — so folding blindly would report the failure at\ngeneration, naming the whole call instead of the member. It is\nrefused here, where the member can still be named. A member that\nis merely UNRESOLVED is a different thing: the call stays\nresidual and generation reports it as ordinary incompleteness.\n \nExamples:\n  join([1,2], \"-\")        -> \"1-2\"  # Numbers render as digits;\n  join([true], \",\")       -> \"true\" # ... so do booleans;\n  join([{a:1}], \",\")      -> nil    # A map is not text;\n  join([null], \",\")       -> nil    # ... and neither is null;\n  join(pick($.r, n), \",\") -> \"a,b\"  # Project first.",
	"aggregate_empty":         "There is no least or greatest element of an EMPTY bag. Addition\nhas an identity, so `sum([])` is 0; comparison has none, and\nanswering with a zero or an infinity would be inventing a value\nthe data does not contain. Guard the bag, or give it a floor with\na written element.\n \nExamples:\n  sum([])            -> 0    # Zero IS the empty sum;\n  least([])          -> nil  # ... but nothing is the least of none;\n  least([0])         -> 0    # A written floor answers.",
	"divide_by_zero":          "Division by zero. `div`, `mod` and `rem` refuse a zero divisor in\nevery numeric leaf, including binary floats: Aontu is a JSON\nsuperset with no notation for an infinity, so there is no value\nthe operation could answer with. A definition that divides by zero\nis wrong, and this says so where it is written rather than\nsomewhere downstream.\n \nExamples:\n  div(7, 0)     -> nil  # No answer exists;\n  mod(7, 0)     -> nil  # ... nor for the modulus;\n  div(7.0, 0.0) -> nil  # ... and a float would say Infinity.",
	"inexact_divide":          "Exact decimal division is not closed: one third has no finite\ndecimal form, so `div`, `mod` and `rem` refuse a `0d` operand\nrather than round one. Two ways out. Scale to integers and divide\nthose -- which is the convention money should be carried in\nanyway, minor units as an integer -- or use binary floats if an\napproximation is acceptable here.\n \nExamples:\n  div(0d10.0, 0d4.0) -> nil    # Refused, though this one terminates;\n  div(0d10, 0d4)     -> 0d2    # A biginteger is not a decimal;\n  div(1000, 4)       -> 250    # Integer cents, exact;\n  div(10.0, 4.0)     -> 2.5    # ... or binary64, approximate;\n  mul(0d10.0, 0d4.0) -> 0d40.0 # Multiplication IS exact and stays.",
	"float_overflow":          "This result is not a finite binary64 number, so it is not a value\nAontu can carry. There is no notation for an infinity or a NaN in\na JSON superset, and no JSON a generator could emit for one, so\nthe operation is refused where it is written rather than escaping\nas an internal error or an unserialisable value.\nUse the exact leaves (`0d`) if the magnitude is real rather than\nan accident.\n \nExamples:\n  1.0e308 + 1.0e308 -> nil  # Overflows binary64;\n  mul(1.0e200, 1.0e200) -> nil  # ... and so does this;\n  0d1e308 + 0d1e308 -> 0d2e308  # Exact, and well inside budget.",
	"inexact_integer_sum":     "The `integer` leaf holds a value only when it is integral, within\nthe int64 range, and exactly representable in binary64. This\nresult is not: {sum}.\nAontu computes integers exactly and refuses to store a rounded\nanswer -- write `0d<digits>` for an exact integer beyond that\nwindow.\n \nExamples:\n  4503599627370496 + 4503599627370496 -> 9007199254740992  # Exact;\n  4503599627370496 + 4503599627370497 -> nil    # 2^53+1 is not;\n  0d4503599627370496 + 0d4503599627370497 -> 0d9007199254740993.",
	"mapval_spread_required":  "The value for key {key} is required (defined in spread).",
	"listval_spread_required": "The value for key {key} is required (defined in spread).",

	// budget_passes mirrors the TS text ({limit}/{paths} injected); the
	// "evaluation budget" substring is pinned per-port
	// (TestBudgetPassesHint) until a shared row exists (issue #26).
	"budget_passes": "The evaluation budget of {limit} fixpoint passes was spent before\nthe model converged; still refining: {paths}.\nThis is the evaluator giving up, not a contradiction in the model:\nraising the budget helps only a model that is still converging --\na genuine cycle never converges at any budget.",

	// Go-only: TS never raises decimal_syntax.
	"decimal_syntax": "This 0d literal is not a valid exact number.",
}

// codeClasses assigns every error code a CLASS: conflict | incomplete |
// reference | parse | budget | internal. The contract lives in
// test/spec/errcodes.tsv (mode `errcode`): the spec suite executes one
// row per code against this table and asserts SET EQUALITY between the
// file and these keys, in both implementations (ts/src/hints.ts mirrors
// this map exactly). Codes are append-only and never renamed; a class
// change is a breaking change. Class rulings (why decimal_budget and
// lossy_integer_literal are conflict, not budget; why unknown_function
// is reference) are documented in the tsv header.
var codeClasses = map[string]string{
	// parse -- the source text is malformed or unusable
	"parse":             "parse",
	"syntax":            "parse",
	"parse_unknown":     "parse",
	"parse_bad_src":     "parse",
	"merge_conflict":    "parse",
	"include_denied":    "parse",
	"include_extension": "parse",

	// G3 -- the subsumption query's report vocabulary (class compat):
	// the compat_* codes are its findings, the sub_* codes its
	// undecided reasons. Report-layer codes: no NilVal ever carries
	// one, so they have no hint text.
	"compat_narrowed":           "compat",
	"compat_required_added":     "compat",
	"compat_default_changed":    "compat",
	"compat_marks_changed":      "compat",
	"sub_unresolved":            "compat",
	"sub_disjunct_distribution": "compat",
	"sub_path_dependent_spread": "compat",
	"sub_evaluate_only":         "compat",
	"sub_default_indeterminate": "compat",
	"deprecated":                "compat",
	"pref_not_instance":         "compat",
	// G8 phase 1 -- the generation combinators. All three are class
	// `parse`: what is wrong is the CALL as written (data that is not a
	// bag, a list element that is not a name), not any pair of values a
	// meet brought together.
	"pack_data": "parse",
	"pack_key":  "parse",
	"each_data": "parse",

	// G8 phase 2 -- selection. `filter_data` is class `parse` for the
	// same reason `pack_data` is: the CALL names something with no
	// children. `match_none` is class `conflict` -- the value and every
	// pattern written for it disagreed, which is an ordinary failed
	// meet, reported once for the whole form.
	"filter_data": "parse",
	"match_none":  "conflict",

	// G8 phase 3 -- the placeholder. Class `conflict`: two values met
	// and neither could answer for the other, which is what every
	// conflict is.
	"place_pair": "conflict",

	// G8 phase 4 -- the pipe. Class `parse`: a pipe is sugar resolved
	// while reading the source, so a pipe into something that is not a
	// call is wrong in the TEXT and no later pass can repair it.
	"pipe_target": "parse",

	// G6 phase 2 -- modules. `module_missing` and `module_integrity` are
	// class `parse`: a module import is resolved while the source is
	// READ, and neither an absent module nor one whose meaning
	// disagrees with its pin can be repaired by any later pass.
	// `module_depth` is class `budget`, for the reason unify_cycle is:
	// a bound was reached, and reaching it is not a statement about the
	// document.
	"module_path":      "parse",
	"module_missing":   "parse",
	"module_integrity": "parse",
	"module_depth":     "budget",
	// G4 phase 2 -- the checked link: a string that is not an entity
	// address (class parse, the text is wrong), and an address that
	// names nothing in this evaluation (class reference, the same class
	// as no_path, because it is the same kind of miss).
	"refer_address":    "parse",
	"rel_address":      "parse",
	"refer_unresolved": "reference",
	"rel_unresolved":   "reference",
	// G4 phase 5 -- the relation graph checks. Class conflict: the model
	// contradicts a property it declared for itself. Report-layer, so no
	// NilVal carries either -- both are global and non-monotone, and a
	// lattice citizen may not be falsified by more information.
	"relation_cycle":           "conflict",
	"relation_inverse_missing": "conflict",
	"inverse_name":             "parse",
	"list_length":              "conflict",
	"recursion_unexpanded":     "incomplete",
	"recursion_budget":         "budget",

	"patch_assignment":      "parse",
	"patch_not_editable":    "reference",
	"patch_ambiguous":       "reference",
	"patch_span_mismatch":   "internal",
	"func_arity":            "parse",
	"elided_value":          "parse",
	"unify_no_src":          "parse",
	"incomplete_expression": "parse",
	"pref_implicit_bag":     "parse",
	"alias_not_toplevel":    "parse",
	"alias_in_path":         "parse",
	"not_number":            "parse",
	"negative":              "parse",
	"decimal_syntax":        "parse",

	// conflict -- no common lower bound, or a value refused by a rule
	// (constraint covers the whole algebra family: membership failure,
	// empty meets at composition time, and domain/kind mixing.)
	"constraint":            "conflict",
	"constraint_pattern":    "conflict",
	"must":                  "conflict",
	"scalar_value":          "conflict",
	"scalar_kind":           "conflict",
	"no_scalar_unify":       "conflict",
	"scalar-type":           "conflict",
	"not-scalar-type":       "conflict",
	"map":                   "conflict",
	"list":                  "conflict",
	"closed":                "conflict",
	"literal_nil":           "conflict",
	"nil_gen":               "conflict",
	"unite":                 "conflict",
	"empty":                 "conflict",
	"empty-dist":            "conflict",
	"pref_rank_clash":       "conflict",
	"exact_float_mix":       "conflict",
	"inexact_integer_sum":   "conflict",
	"pick_key":              "conflict",
	"aggregate_data":        "conflict",
	"aggregate_empty":       "conflict",
	"join_member":           "conflict",
	"divide_by_zero":        "conflict",
	"inexact_divide":        "conflict",
	"float_overflow":        "conflict",
	"decimal_budget":        "conflict",
	"lossy_integer_literal": "conflict",
	"arg":                   "conflict",
	"invalid-arg":           "conflict",
	"no_first_arg":          "conflict",
	"key_level":             "conflict",
	"func":                  "conflict",
	"func:":                 "conflict",
	"op":                    "conflict",
	"op:":                   "conflict",
	"op[":                   "conflict",
	"make":                  "conflict",
	"resolve":               "conflict",
	"operate":               "conflict",
	"close":                 "conflict",

	// incomplete -- residue: the truth requires more than was supplied
	"no_gen":                  "incomplete",
	"disjunct_no_gen":         "incomplete",
	"conjunct":                "incomplete",
	"mapval_no_gen":           "incomplete",
	"mapval_required":         "incomplete",
	"mapval_spread_required":  "incomplete",
	"listval_no_gen":          "incomplete",
	"listval_required":        "incomplete",
	"listval_spread_required": "incomplete",
	"required_listelem":       "incomplete",

	// reference -- a name or path that does not resolve
	// (path_cycle is a PROVEN structural cycle -- a defect of the
	// model, not a spent evaluation bound: raising a budget never
	// fixes it, so it is class reference, not budget; G5's ruling.)
	"no_path":               "reference",
	"path_cycle":            "reference",
	"ref":                   "reference",
	"ref[":                  "reference",
	"var":                   "reference",
	"var[":                  "reference",
	"unknown_var":           "reference",
	"invalid_var_kind":      "reference",
	"unknown_function":      "reference",
	"multisource_not_found": "reference",

	// budget -- an evaluation bound was exceeded
	"unify_cycle":   "budget",
	"max_depth":     "budget",
	"budget_passes": "budget",

	// internal -- the engine reached a state it should not reach
	"internal":     "internal",
	"unify_no_res": "internal",
	"unknown_op":   "internal",
}

// codePrefixes are the dynamic-prefix families: the engine appends a
// name or value to these (e.g. `func:upper`, `op[+]`), so class lookup
// falls back to the registered prefix.
var codePrefixes = []string{"func:", "op:", "op[", "var[", "ref["}

// codeClass is the class of an error code: an exact registry entry,
// else the registered dynamic prefix it extends, else `internal` -- an
// unregistered code is an engine defect, not a user error. A why-less
// nil classifies as its eventual gen-time code, nil_gen (mirrors the
// NilVal.class getter in ts/src/val/NilVal.ts).
func codeClass(code string) string {
	if code == "" {
		code = "nil_gen"
	}
	if cls, ok := codeClasses[code]; ok {
		return cls
	}
	for _, prefix := range codePrefixes {
		if strings.HasPrefix(code, prefix) {
			return codeClasses[prefix]
		}
	}
	return "internal"
}

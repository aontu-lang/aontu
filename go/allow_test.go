/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const allowRoles = `
roles: {
  admin: { allow: ["$"] }
  dev: {
    allow: ["$.services", "$.deploy.*.replicas"]
    deny: ["$.services.*.tier"]
  }
  product: { allow: ["$.features", "$.services.*.description"] }
  qa: { allow: ["$.tests"] }
}
`

// One decision, with the fields a machine reader destructures.
func allowDecision(t *testing.T, role, path string, src ...string) AllowDecision {
	t.Helper()
	model := allowRoles
	if 0 < len(src) {
		model = src[0]
	}
	r := New().Allow(model, role, []string{path}, nil)
	if 1 != len(r.Paths) {
		t.Fatalf("%s %s: paths %v (verdict %s, findings %v)",
			role, path, r.Paths, r.Verdict, r.Findings)
	}
	return r.Paths[0]
}

// One error report: the verdict, and the single finding.
func allowFailure(t *testing.T, src string) VetFinding {
	t.Helper()
	r := New().Allow(src, "dev", []string{"$.a"}, nil)
	if "error" != r.Verdict || 0 != len(r.Paths) || 1 != len(r.Findings) {
		t.Fatalf("%q: verdict %s, paths %v, findings %v",
			src, r.Verdict, r.Paths, r.Findings)
	}
	return r.Findings[0]
}

func allowWant(t *testing.T, got, want AllowDecision) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestAllowTheDefaultAnchorIsTheRolesMap(t *testing.T) {
	if "$.roles" != AllowAt {
		t.Fatal(AllowAt)
	}
}

func TestAllowAnAllowEntryCoversItselfAndEverythingBelow(t *testing.T) {
	allowWant(t, allowDecision(t, "product", "$.features"), AllowDecision{
		Path: "$.features", Allowed: true, Reason: "allow",
		By: "$.roles.product.allow.0", Pattern: "$.features",
	})
	allowWant(t, allowDecision(t, "product", "$.features.search.enabled"), AllowDecision{
		Path: "$.features.search.enabled", Allowed: true, Reason: "allow",
		By: "$.roles.product.allow.0", Pattern: "$.features",
	})
	allowWant(t, allowDecision(t, "dev", "$.services.auth.replicas"), AllowDecision{
		Path: "$.services.auth.replicas", Allowed: true, Reason: "allow",
		By: "$.roles.dev.allow.0", Pattern: "$.services",
	})
	// The whole document is covered only by an entry that names it.
	if !allowDecision(t, "admin", "$").Allowed {
		t.Fatal("admin at the root")
	}
	allowWant(t, allowDecision(t, "qa", "$"), AllowDecision{
		Path: "$", Allowed: false, Reason: "uncovered",
	})
}

func TestAllowAStarSegmentMatchesAnyOneKey(t *testing.T) {
	allowWant(t, allowDecision(t, "dev", "$.deploy.eu1.replicas"), AllowDecision{
		Path: "$.deploy.eu1.replicas", Allowed: true, Reason: "allow",
		By: "$.roles.dev.allow.1", Pattern: "$.deploy.*.replicas",
	})
	for path, want := range map[string]bool{
		"$.deploy.eu1":              false,
		"$.deploy":                  false,
		"$.deploy.eu1.replicas.max": true,
	} {
		if want != allowDecision(t, "dev", path).Allowed {
			t.Fatalf("%s: want %v", path, want)
		}
	}
	if !allowDecision(t, "product", "$.services.auth.description").Allowed {
		t.Fatal("description under a star")
	}

	src := `roles: r: { allow: ["$.services.*"] }`
	for path, want := range map[string]string{
		"$.services":        "uncovered",
		"$.services.auth":   "allow",
		"$.services.auth.x": "allow",
	} {
		if got := allowDecision(t, "r", path, src).Reason; want != got {
			t.Fatalf("%s: %s, want %s", path, got, want)
		}
	}
}

func TestAllowADenyEntryRefusesEveryPathThatIntersectsIt(t *testing.T) {
	// At the denied node.
	allowWant(t, allowDecision(t, "dev", "$.services.auth.tier"), AllowDecision{
		Path: "$.services.auth.tier", Allowed: false, Reason: "deny",
		By: "$.roles.dev.deny.0", Pattern: "$.services.*.tier",
	})
	// Below it, and every map above it.
	for _, path := range []string{
		"$.services.auth.tier.name", "$.services.auth", "$.services", "$"} {
		if got := allowDecision(t, "dev", path).Reason; "deny" != got {
			t.Fatalf("%s: %s", path, got)
		}
	}
	// Beside it: a sibling of the denied node is untouched.
	if got := allowDecision(t, "dev", "$.services.auth.replicas").Reason; "allow" != got {
		t.Fatal(got)
	}

	one := `roles: r: { deny: ["$.a"] }`
	if "deny" != allowDecision(t, "r", "$.a", one).Reason ||
		"uncovered" != allowDecision(t, "r", "$.b", one).Reason {
		t.Fatal("a deny-only role")
	}
	rootDeny := `roles: r: { allow: ["$"] deny: ["$"] }`
	if "deny" != allowDecision(t, "r", "$.a.b", rootDeny).Reason ||
		"deny" != allowDecision(t, "r", "$", rootDeny).Reason {
		t.Fatal("a root deny")
	}
}

func TestAllowDenyWinsOverAllowWhateverTheOrder(t *testing.T) {
	src := `roles: r: { deny: ["$.a.b"] allow: ["$.a"] }`
	if "deny" != allowDecision(t, "r", "$.a.b", src).Reason ||
		"allow" != allowDecision(t, "r", "$.a.c", src).Reason {
		t.Fatal("order")
	}
}

func TestAllowAPathNothingCoversIsRefusedUncovered(t *testing.T) {
	allowWant(t, allowDecision(t, "qa", "$.services.auth"), AllowDecision{
		Path: "$.services.auth", Allowed: false, Reason: "uncovered",
	})
	if "uncovered" != allowDecision(t, "r", "$.a", `roles: r: {}`).Reason {
		t.Fatal("a role with no lists")
	}
}

func TestAllowTheVerdictIsAllowedOnlyWhenEveryPathIs(t *testing.T) {
	both := New().Allow(allowRoles, "dev",
		[]string{"$.services.auth.replicas", "$.deploy.eu1.replicas"}, nil)
	if "allowed" != both.Verdict || 0 != len(both.Findings) ||
		!both.Paths[0].Allowed || !both.Paths[1].Allowed {
		t.Fatalf("%+v", both)
	}

	mixed := New().Allow(allowRoles, "dev",
		[]string{"$.services.auth.replicas", "$.tests"}, nil)
	if "refused" != mixed.Verdict ||
		"allow" != mixed.Paths[0].Reason || "uncovered" != mixed.Paths[1].Reason {
		t.Fatalf("%+v", mixed)
	}

	// Nothing asked is nothing allowed.
	none := New().Allow(allowRoles, "admin", nil, nil)
	if "refused" != none.Verdict || 0 != len(none.Paths) {
		t.Fatalf("%+v", none)
	}
}

func TestAllowAskedPathsAreNormalisedTheWayAReferenceReadsThem(t *testing.T) {
	for asked, want := range map[string]string{
		"services.auth":    "$.services.auth",
		"$.services.auth.": "$.services.auth",
	} {
		if got := allowDecision(t, "dev", asked).Path; want != got {
			t.Fatalf("%q: %s", asked, got)
		}
	}
	for _, asked := range []string{"", "$."} {
		if got := allowDecision(t, "admin", asked).Path; "$" != got {
			t.Fatalf("%q: %s", asked, got)
		}
	}
	// An empty segment inside an entry is dropped as a reference drops it.
	src := `roles: r: { allow: ["$.a..b"] }`
	if "allow" != allowDecision(t, "r", "$.a.b.c", src).Reason {
		t.Fatal("empty segment")
	}
}

func TestAllowAnEntryStartsAtTheRootAndDoesNotEndInADot(t *testing.T) {
	for _, bad := range []string{`""`, `"."`, `"a.b"`, `"$."`, `"$.a."`} {
		f := allowFailure(t, `roles: dev: { allow: [`+bad+`] }`)
		if "constraint" != f.Code || "$" != f.Path {
			t.Fatalf("%s: %s at %s", bad, f.Code, f.Path)
		}
	}
	// The same shape holds the deny list.
	if "constraint" != allowFailure(t, `roles: dev: { allow: ["$"] deny: ["x"] }`).Code {
		t.Fatal("deny shape")
	}
	// The root is spelled `$`, and a star is an ordinary segment.
	if "allow" != allowDecision(t, "r", "$.x", `roles: r: { allow: ["$"] }`).Reason ||
		"allow" != allowDecision(t, "r", "$.x.y", `roles: r: { allow: ["$.*"] }`).Reason {
		t.Fatal("root and star")
	}
}

func TestAllowAnUndeclaredRoleIsRefusedWithTheNearestName(t *testing.T) {
	r := New().Allow(allowRoles, "de", []string{"$.services", "$.tests"}, nil)
	if "refused" != r.Verdict || "de" != r.Role {
		t.Fatalf("%+v", r)
	}
	if !reflect.DeepEqual(r.Paths, []AllowDecision{
		{Path: "$.services", Allowed: false, Reason: "no_role"},
		{Path: "$.tests", Allowed: false, Reason: "no_role"},
	}) {
		t.Fatalf("%+v", r.Paths)
	}
	note := "did you mean dev?"
	if !reflect.DeepEqual(r.Findings, []VetFinding{{
		Code:     "no_path",
		Class:    "reference",
		Severity: "error",
		Path:     "$.roles.de",
		Message:  "The role de is not declared at $.roles in this document.",
		Sites:    []VetSite{},
		Note:     &note,
	}}) {
		t.Fatalf("%+v", r.Findings)
	}

	// No neighbour close enough: no note.
	far := New().Allow(allowRoles, "operations", []string{"$.a"}, nil)
	if nil != far.Findings[0].Note {
		t.Fatalf("%+v", far.Findings)
	}
}

func TestAllowARoleIsOneKeyLookedUpAsWritten(t *testing.T) {
	// A dotted name is a key, not a path into a role.
	dotted := `roles: { "a.b": { allow: ["$.a"] } a: { b: { allow: ["$"] } } }`
	if "$.roles.a.b.allow.0" != allowDecision(t, "a.b", "$.a.y", dotted).By ||
		"uncovered" != allowDecision(t, "a.b", "$.z", dotted).Reason {
		t.Fatal("dotted role")
	}
	for _, role := range []string{"", "dev.allow", "admin.allow.0", "__proto__", "constructor"} {
		r := New().Allow(allowRoles, role, []string{"$.a"}, nil)
		if "refused" != r.Verdict || "no_role" != r.Paths[0].Reason ||
			"no_path" != r.Findings[0].Code {
			t.Fatalf("%q: %+v", role, r)
		}
	}
}

func TestAllowTheListsAreReadFromTheTreeHiddenOrNot(t *testing.T) {
	hiddenDeny := `roles: dev: { allow: ["$"] deny: hide(["$.a"]) }`
	if "deny" != allowDecision(t, "dev", "$.a", hiddenDeny).Reason ||
		"allow" != allowDecision(t, "dev", "$.b", hiddenDeny).Reason {
		t.Fatal("hidden deny")
	}
	// A hidden or typed role, and a hidden allow list, answer as written.
	for _, src := range []string{
		`roles: dev: hide({ allow: ["$"] })`,
		`roles: dev: type({ allow: ["$"] })`,
		`roles: dev: { allow: hide(["$"]) }`,
		`roles: dev: { allow: [hide("$")] }`,
	} {
		if "allow" != allowDecision(t, "dev", "$.x", src).Reason {
			t.Fatal(src)
		}
	}
	byRef := "common: [\"$.c\"]\nroles: dev: { allow: [$.common.0] }"
	if "$.roles.dev.allow.0" != allowDecision(t, "dev", "$.c.x", byRef).By {
		t.Fatal("by reference")
	}
	pref := `roles: dev: { allow: [*"$.p" | string] }`
	if "$.p" != allowDecision(t, "dev", "$.p", pref).Pattern {
		t.Fatal("a preferred entry")
	}
}

func TestAllowAnEntryThatIsNotAConcreteStringIsAnError(t *testing.T) {
	kind := allowFailure(t, `roles: dev: { allow: [string] }`)
	if "no_gen" != kind.Code || "$.roles.dev.allow.0" != kind.Path ||
		"incomplete" != kind.Class ||
		"[aontu/no_gen]: Cannot resolve value at path $.roles.dev.allow.0" != kind.Message ||
		0 != len(kind.Sites) {
		t.Fatalf("%+v", kind)
	}
	// A hidden kind is no more concrete for being hidden, and the
	// second entry is where the deny list fails.
	if "no_gen" != allowFailure(t, `roles: dev: { allow: [hide(string)] }`).Code {
		t.Fatal("hidden kind")
	}
	deny := allowFailure(t, `roles: dev: { allow: ["$"] deny: ["$.a", string] }`)
	if "no_gen" != deny.Code || "$.roles.dev.deny.1" != deny.Path {
		t.Fatalf("%+v", deny)
	}
}

func TestAllowAModelThatDoesNotStandUpIsAnError(t *testing.T) {
	// The shape is aontu, so a malformed role is the engine's refusal,
	// with the engine's code: a string where the list should be.
	bad := allowFailure(t, `roles: dev: { allow: "$.a" }`)
	if "scalar_kind" != bad.Code || "$" != bad.Path {
		t.Fatalf("%+v", bad)
	}
	if "scalar_kind" != allowFailure(t, `roles: 1`).Code {
		t.Fatal("roles: 1")
	}
	// A conflict anywhere in the model, roles or not, and a model that
	// does not parse.
	for _, src := range []string{
		"roles: dev: { allow: [\"$\"] }\nx: 1\nx: 2",
		`roles: dev: { allow: ["$"] } /* open`,
	} {
		if "error" != New().Allow(src, "dev", []string{"$.a"}, nil).Verdict {
			t.Fatal(src)
		}
	}
	// The empty model declares no role.
	empty := New().Allow("", "dev", []string{"$.a"}, nil)
	if "refused" != empty.Verdict || "no_path" != empty.Findings[0].Code {
		t.Fatalf("%+v", empty)
	}
}

func TestAllowTheShapeMeetsTheModelWhateverItsLastLine(t *testing.T) {
	for _, src := range []string{
		"roles: {\n  dev: { allow: [\"$.a\"] }\n",
		"roles: dev: { allow: [\"$.a\"] }\nfoo:",
		"roles: dev: { allow: [\"$.a\"] }\nfoo: {} &",
		"roles: dev: { allow: [\"$.a\"] } # all",
	} {
		if "$.roles.dev.allow.0" != allowDecision(t, "dev", "$.a.b", src).By {
			t.Fatal(src)
		}
	}
	for _, src := range []string{
		"roles: {\n  dev: { allow: \"$.a\" }\n",
		"roles: dev: { allow: \"$.a\" }\nfoo:",
		"roles: dev: { allow: \"$.a\" }\nfoo: {} &",
	} {
		if "error" != New().Allow(src, "dev", []string{"$.a"}, nil).Verdict {
			t.Fatal(src)
		}
	}
}

func TestAllowAtMovesTheRolesMap(t *testing.T) {
	src := `policy: { roles: { dev: { allow: ["$.a"] } } }`
	r := New().Allow(src, "dev", []string{"$.a.b"}, &AllowOptions{At: "$.policy.roles"})
	if "allowed" != r.Verdict || "$.policy.roles.dev.allow.0" != r.Paths[0].By {
		t.Fatalf("%+v", r)
	}

	// The roles map may be the document itself, and the shape is then
	// a top-level spread: every top-level key is a role.
	top := New().Allow(`dev: { allow: ["$.a"] deny: ["$.a.x"] }`, "dev",
		[]string{"$.a.b", "$.a.x"}, &AllowOptions{At: "$"})
	if "refused" != top.Verdict ||
		"$.dev.allow.0" != top.Paths[0].By || "$.dev.deny.0" != top.Paths[1].By {
		t.Fatalf("%+v", top)
	}

	// Unknown role under a moved anchor names the anchor.
	miss := New().Allow(src, "qa", []string{"$.a"}, &AllowOptions{At: "$.policy.roles"})
	if "$.policy.roles.qa" != miss.Findings[0].Path {
		t.Fatalf("%+v", miss.Findings)
	}

	// An anchor the model holds as something other than a map.
	if "error" != New().Allow(`policy: roles: 1`, "dev", []string{"$.a"},
		&AllowOptions{At: "$.policy.roles"}).Verdict {
		t.Fatal("a scalar anchor")
	}
}

func TestAllowAClosedVocabularyNeedNotDeclareDeny(t *testing.T) {
	// A closed role drops the template's optional deny it does not
	// declare, and so denies nothing.
	if "allow" != allowDecision(t, "dev", "$.x", `roles: dev: close({ allow: ["$"] })`).Reason {
		t.Fatal("closed without deny")
	}
	declared := `roles: dev: close({ allow: ["$"] deny?: [&: string] })`
	if "allow" != allowDecision(t, "dev", "$.x", declared).Reason {
		t.Fatal("closed with deny declared")
	}
	denied := `roles: dev: close({ allow: ["$"] deny: ["$.x"] })`
	if "deny" != allowDecision(t, "dev", "$.x", denied).Reason {
		t.Fatal("closed with deny written")
	}
}

func TestAllowRelativeLoadsResolveFromTheModelsOwnDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "dev.aontu"),
		[]byte(`roles: dev: { allow: ["$.services"] }`), 0o600); nil != err {
		t.Fatal(err)
	}
	src := "@\"./dev.aontu\"\nroles: qa: { allow: [\"$.tests\"] }"
	a := NewWithBase(dir)
	a.File = filepath.Join(dir, "roles.aontu")
	if r := a.Allow(src, "dev", []string{"$.services.auth"}, nil); "allowed" != r.Verdict {
		t.Fatalf("%+v", r)
	}

	// Denied the load, the included role is not there to answer.
	shut := NewWithBase(dir)
	shut.File = a.File
	shut.Trust = &TrustOptions{IncludeNone: true}
	denied := shut.Allow(src, "dev", []string{"$.services.auth"}, nil)
	if "error" != denied.Verdict || "include_denied" != denied.Findings[0].Code {
		t.Fatalf("%+v", denied)
	}
}

func TestAllowOneValue(t *testing.T) {
	for value, want := range map[string]bool{
		`"on"`:                true,
		`"a=b"`:               true,
		`{ a: 1 }`:            true,
		`string`:              true,
		`3 secrets: key: "x"`: false,
		"3\nsecrets: 1":       false,
		`"unterminated`:       false,
		`@"./other.aontu"`:    false,
	} {
		if got := OneValue(value); want != got {
			t.Fatalf("%q: %v", value, got)
		}
	}
	if !strings.HasPrefix(allowShapeSource("$"), "&: ") {
		t.Fatal(allowShapeSource("$"))
	}
}

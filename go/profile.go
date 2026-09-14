/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

const profileVocabulary = `@"aontu:profile"`

// LoadProfile is a language declared as data, vetted, or the findings
// that refuse it. Mirrors loadProfile in ts/src/profile.ts.
func (a *Aontu) LoadProfile(src string) (map[string]any, []VetFinding) {
	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return nil, []VetFinding{parseFinding(a.File, VetRoleData, perr)}
	}
	root, ctx, _ := a.unifyCtx(parsed, nil, src)
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return nil, []VetFinding{failureFinding(ctx, a.File, src, root)}
	}
	report := Vet(profileVocabulary, Hcanon(root), nil)
	if "valid" != report.Verdict {
		return nil, report.Findings
	}
	// The meet: the vocabulary requires lang, so a value the vet
	// admitted has a Lang.
	m, _ := root.(*MapVal)
	nsv, _ := m.peg["aontu"].(*MapVal)
	instance, gerr := New().Generate(
		profileVocabulary + "\naontu: Lang: " + Hcanon(nsv.peg["Lang"]))
	if nil != gerr { //coverage:ignore vet passed, so the meet generates
		return nil, []VetFinding{{
			Code: "render_profile", Class: "parse", Severity: "error",
			Path: "$", Message: gerr.Error(), Sites: []VetSite{}}}
	}
	inst, _ := instance.(map[string]any)
	ins, _ := inst["aontu"].(map[string]any)
	profile, _ := ins["Lang"].(map[string]any)
	return profile, nil
}

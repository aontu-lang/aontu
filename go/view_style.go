/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu


// The closed role set. `label` is unstyled: an entity's own name is
// the figure's content, not a mark about it.
const (
	roleLabel      = "label"
	roleMuted      = "muted"
	roleRule       = "rule"
	roleDirect     = "direct"
	roleClosure    = "closure"
	roleUnmirrored = "unmirrored"
	roleUpward     = "upward"
	roleRepeat     = "repeat"
	roleBar        = "bar"
	roleHole       = "hole"
)

var viewSGR = map[string]string{
	roleLabel: "", roleMuted: "2", roleRule: "2", roleDirect: "1",
	roleClosure: "36", roleUnmirrored: "33", roleUpward: "31",
	roleRepeat: "2", roleBar: "36", roleHole: "2",
}

var viewStyles = []string{"auto", "none", "ansi", "css"}

// viewStyleCarrier names the one profile each mechanism belongs to.
var viewStyleCarrier = map[string]string{"ansi": "text", "css": "svg"}

// viewPainter wraps a run of text in its role's mechanism. It NEVER
// changes the run's length in characters, so every width the
// renderers computed from the unpainted strings still holds.
type viewPainter struct{ ansi bool }

func newPainter(style string) viewPainter { return viewPainter{ansi: "ansi" == style} }

func (p viewPainter) paint(role, text string) string {
	if !p.ansi || "" == viewSGR[role] || "" == text {
		return text
	}
	return "\x1b[" + viewSGR[role] + "m" + text + "\x1b[0m"
}

func viewStyleOf(style, as string) string {
	if "" != style {
		return style
	}
	if "svg" == as {
		return "css"
	}
	return "none"
}

// viewStyleRefusal: each style is one profile's mechanism, and `none`
// is every profile's.
func viewStyleRefusal(given, as string) *VetFinding {
	style := viewStyleOf(given, as)
	carrier, mechanism := viewStyleCarrier[style]
	if mechanism && carrier != as {
		f := viewFinding("view_style_profile", "reference", "$",
			"The "+as+" profile cannot carry --style "+style+".",
			style+" is the "+carrier+" profile's mechanism")
		return &f
	}
	if !mechanism && "none" != style {
		f := viewFinding("view_style_unknown", "reference", "$",
			style+" is not a style.", "styles: auto, none, ansi, css")
		return &f
	}
	return nil
}

func ViewDefaultProfile(kind string) string {
	if ps, ok := viewProfiles[kind]; ok && 0 < len(ps) {
		return ps[0]
	}
	return ""
}

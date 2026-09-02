/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// STYLING (VIEWS.0.md, "7. Styling"), which amends that note's colour
// boundary. Mirrors the style section of ts/src/view.ts function for
// function.
//
// Every mark a figure makes already has a reason the extractor
// established -- a cell is `direct` because the edge is declared, an
// arrow is `upward` because it runs against the bands -- and the SVG
// profile has published those reasons as classes since it landed,
// because an SVG cannot be drawn without saying what each shape is.
// This declares the same vocabulary for the text profile and adds the
// one thing missing: a way to turn it on at the call.
//
// NEITHER MECHANISM STATES A COLOUR, which is what keeps the boundary
// intact. SGR 31 does not mean red; it means the colour the reader's
// terminal calls red, which the reader chose. A CSS class states
// nothing at all, and the stylesheet reads `var(--av-closure, ...)` so
// a host page's palette wins. A hex triple is the thing that cannot
// follow a theme, and it stays refused -- no truecolour escape, no
// 256-colour escape, no `classDef`.

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

// The text profile's mechanism: the eight named colours, bold and dim,
// and nothing else.
var viewSGR = map[string]string{
	roleLabel: "", roleMuted: "2", roleRule: "2", roleDirect: "1",
	roleClosure: "36", roleUnmirrored: "33", roleUpward: "31",
	roleRepeat: "2", roleBar: "36", roleHole: "2",
}

// viewStyles is what the CLI accepts. `auto` is here and NOT a value
// the library takes: resolving it means knowing whether stdout is a
// terminal, which is the CLI's to know and the library's never -- the
// same division err.go already draws for the error frames.
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

// viewStyleOf is the style a figure gets when the caller named none.
// An SVG carries its stylesheet, which is what makes it standalone and
// what every pinned golden holds; everything else carries no
// mechanism, since a library cannot see whether its output is a
// terminal.
func viewStyleOf(style, as string) string {
	if "" != style {
		return style
	}
	if "svg" == as {
		return "css"
	}
	return "none"
}

// ColorActive reports whether ANSI escapes are wanted: the CLI's
// SetColor override where it made one, and NO_COLOR otherwise. The
// view command needs it to resolve `--style auto`, which is the same
// question the error frames ask -- exported so cmd/aontu can ask it
// too, since the package boundary is between them and err.ts has no
// such boundary in the TypeScript port.
func ColorActive() bool { return colorActive() }

// viewDefaultProfile is the profile a kind draws into when none is
// asked for. The CLI needs it to resolve `--style auto` BEFORE the
// library runs, since the mechanism is the profile's.
func viewDefaultProfile(kind string) string {
	if ps, ok := viewProfiles[kind]; ok && 0 < len(ps) {
		return ps[0]
	}
	return ""
}

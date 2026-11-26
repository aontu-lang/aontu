/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strings"

var templateMarkers = map[string]string{
	"c":        "//-",
	"cc":       "//-",
	"cpp":      "//-",
	"cs":       "//-",
	"css":      "/*-",
	"go":       "//-",
	"h":        "//-",
	"hs":       "---",
	"java":     "//-",
	"js":       "//-",
	"jsx":      "//-",
	"kt":       "//-",
	"lua":      "---",
	"markdown": "<!---",
	"md":       "<!---",
	"php":      "//-",
	"pl":       "#-",
	"py":       "#-",
	"rb":       "#-",
	"rs":       "//-",
	"scala":    "//-",
	"sh":       "#-",
	"sql":      "---",
	"swift":    "//-",
	"toml":     "#-",
	"ts":       "//-",
	"tsx":      "//-",
	"yaml":     "#-",
	"yml":      "#-",
}

// DefaultMarker is the marker for a file whose extension names no
// token: the C-family line comment.
const DefaultMarker = "//-"

// templateImpliedClose is the closer a block opener implies, longest
// opener first. A marker outside this table names its closer itself.
var templateImpliedClose = [][2]string{
	{"<!--", "-->"},
	{"/*", "*/"},
}

func templateExtension(path string) string {
	slash := strings.LastIndexAny(path, "/\\")
	dot := strings.LastIndex(path, ".")
	if dot > slash {
		return strings.ToLower(path[dot+1:])
	}
	return ""
}

// MarkerFor is the marker for a file, by its extension, or the
// C-family default. The extension decides, exactly as it decides what
// an include is.
func MarkerFor(path string) string {
	if m, has := templateMarkers[templateExtension(path)]; has {
		return m
	}
	return DefaultMarker
}

// MarkerFromProfiles is the marker a supplied profile declares for a
// file's extension, which is what reaches a language the table has no
// entry for by FILENAME rather than by a flag on every call.
func MarkerFromProfiles(profiles []map[string]any, path string) string {
	ext := templateExtension(path)
	if "" == ext {
		return ""
	}
	for _, profile := range profiles {
		tmpl, ok := profile["template"].(map[string]any)
		if !ok {
			continue
		}
		exts, ok := tmpl["ext"].([]any)
		if !ok {
			continue
		}
		found := false
		for _, e := range exts {
			if s, ok := e.(string); ok && s == ext {
				found = true
			}
		}
		if !found {
			continue
		}
		marker, _ := tmpl["marker"].(string)
		if closer, ok := tmpl["close"].(string); ok && "" != closer {
			return marker + " " + closer
		}
		return marker
	}
	return ""
}

// templateForm is the opener, and the closer of a block form. A
// comment opener holds no space, so a marker may carry its own closer
// after one -- which is what a language outside templateImpliedClose
// writes. An empty closer is the line form.
type templateForm struct {
	open  string
	close string
}

func templateMarkerForm(marker string) templateForm {
	if cut := strings.Index(marker, " "); 0 <= cut {
		return templateForm{marker[:cut], templateTrim(marker[cut+1:])}
	}
	for _, pair := range templateImpliedClose {
		if strings.HasPrefix(marker, pair[0]) {
			return templateForm{marker, pair[1]}
		}
	}
	return templateForm{marker, ""}
}

func templateIndent(line string) int {
	i := 0
	for i < len(line) && (' ' == line[i] || '\t' == line[i]) {
		i++
	}
	return i
}

// templateTrimEnd is the line without its trailing spaces and tabs.
func templateTrimEnd(line string) string {
	end := len(line)
	for 0 < end && (' ' == line[end-1] || '\t' == line[end-1]) {
		end--
	}
	return line[:end]
}

// templateTrim is the line without its indentation or its trailing
// spaces and tabs.
func templateTrim(line string) string {
	trimmed := templateTrimEnd(line)
	return trimmed[templateIndent(trimmed):]
}

// templateLine is one line of a template, read: its indentation,
// whether it is a marker, and the text it carries.
type templateLine struct {
	marker bool
	indent string
	text   string
}

func templateRead(line string, form templateForm) templateLine {
	indent := line[:templateIndent(line)]
	rest := line[len(indent):]
	if !strings.HasPrefix(rest, form.open) {
		return templateLine{marker: false, indent: "", text: line}
	}
	body := rest[len(form.open):]
	if "" != form.close {
		end := strings.LastIndex(body, form.close)
		if 0 > end {
			return templateLine{marker: false, indent: "", text: line}
		}
		body = templateTrimEnd(body[:end])
	}
	body = strings.TrimPrefix(body, " ")
	return templateLine{marker: true, indent: indent, text: body}
}

func templateQuote(text string) string {
	escaped := strings.ReplaceAll(text, "\\", "\\\\")
	if strings.Contains(text, "`") {
		return `"` + strings.ReplaceAll(escaped, `"`, `\"`) + `"`
	}
	return "`" + escaped + "`"
}

func templateUnquote(text string) (string, bool) {
	t := templateTrim(text)
	if 2 > len(t) {
		return "", false
	}
	quote := t[0]
	if ('`' != quote && '"' != quote) || t[len(t)-1] != quote {
		return "", false
	}
	inner := t[1 : len(t)-1]
	var out strings.Builder
	for i := 0; i < len(inner); i++ {
		c := inner[i]
		if quote == c {
			return "", false
		}
		if '\\' != c {
			out.WriteByte(c)
			continue
		}
		i++
		if len(inner) <= i {
			return "", false
		}
		n := inner[i]
		if '\\' == n || ('"' == n && '"' == quote) {
			out.WriteByte(n)
			continue
		}
		return "", false
	}
	return out.String(), true
}

func templateSplit(src string) ([]string, bool) {
	lines := strings.Split(src, "\n")
	tail := 1 < len(lines) && "" == lines[len(lines)-1]
	if tail {
		lines = lines[:len(lines)-1]
	}
	return lines, tail
}

func templateJoin(lines []string, tail bool) string {
	out := strings.Join(lines, "\n")
	if tail {
		out += "\n"
	}
	return out
}

func DesugarTemplate(src string, marker string) string {
	if "" == marker {
		marker = DefaultMarker
	}
	form := templateMarkerForm(marker)
	lines, tail := templateSplit(src)
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		read := templateRead(line, form)
		if read.marker {
			out = append(out, read.indent+read.text)
		} else {
			out = append(out, templateQuote(read.text))
		}
	}
	return templateJoin(out, tail)
}

// ResugarTemplate turns the canonical document back into a template
// file. Every line is a marker line unless it is a body element that
// survives the fixpoint -- rebuild the target line, desugar the
// rebuild, and take it only if that answers the canonical line back.
func ResugarTemplate(src string, marker string) string {
	if "" == marker {
		marker = DefaultMarker
	}
	form := templateMarkerForm(marker)
	lines, tail := templateSplit(src)
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if target, ok := templateUnquote(line); ok &&
			DesugarTemplate(target, marker) == templateTrim(line) {
			out = append(out, target)
			continue
		}
		// THE MARKER STANDS AT THE LEFT MARGIN and the line's
		// indentation is written after it, so the aontu's own shape is
		// on the page. The one space is the marker's, which the reading
		// takes back.
		text := templateTrimEnd(line)
		closer := ""
		if "" != form.close {
			closer = " " + form.close
		}
		if "" == text {
			out = append(out, form.open+closer)
		} else {
			out = append(out, form.open+" "+text+closer)
		}
	}
	return templateJoin(out, tail)
}

func TemplateOutputs(src string, marker string) []bool {
	form := templateMarkerForm(marker)
	lines, _ := templateSplit(src)
	out := make([]bool, len(lines))
	for k, line := range lines {
		out[k] = !templateRead(line, form).marker
	}
	return out
}

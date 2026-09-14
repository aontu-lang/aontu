/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const templateGen = "//- n: [\nexport const N = 1\n//- ]\n"

const templateCanon = "n: [\n`export const N = 1`\n]\n"

func templateRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"template"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func templateDir(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, text := range files {
		if err := os.WriteFile(
			filepath.Join(dir, name), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestTemplatePrintsTheCanonicalFormAndResugarsIt(t *testing.T) {
	dir := templateDir(t, map[string]string{
		"gen.ts": templateGen, "canon.aon": templateCanon})

	// THE DEFAULT DIRECTION is desugar: the aontu the marked lines
	// mean, with every other line quoted as one string.
	out, errw, code := templateRun(filepath.Join(dir, "gen.ts"))
	if 0 != code || templateCanon != out || "" != errw {
		t.Fatalf("desugar: code %d out %q err %q", code, out, errw)
	}

	// --resugar is the other one, and the file it reads is aontu.
	out, _, code = templateRun("--resugar", filepath.Join(dir, "canon.aon"))
	if 0 != code || templateGen != out {
		t.Fatalf("resugar: code %d out %q", code, out)
	}

	// The marker comes from the extension, and --marker names one the
	// table does not know.
	hash := templateDir(t, map[string]string{
		"gen.rb": "#- n: [\nputs 1\n#- ]\n"})
	out, _, code = templateRun(filepath.Join(hash, "gen.rb"))
	if 0 != code || "n: [\n`puts 1`\n]\n" != out {
		t.Fatalf("hash marker: code %d out %q", code, out)
	}
	odd := templateDir(t, map[string]string{
		"gen.zz": ";;- n: [\nx\n;;- ]\n"})
	out, _, code = templateRun("--marker", ";;-", filepath.Join(odd, "gen.zz"))
	if 0 != code || "n: [\n`x`\n]\n" != out {
		t.Fatalf("--marker: code %d out %q", code, out)
	}

	bare := templateDir(t, map[string]string{"gen": templateGen})
	out, _, code = templateRun(filepath.Join(bare, "gen"))
	if 0 != code || templateCanon != out {
		t.Fatalf("no extension: code %d out %q", code, out)
	}
}

func TestTemplateCheckIsTheRoundTrip(t *testing.T) {
	dir := templateDir(t, map[string]string{"gen.ts": templateGen})
	out, errw, code := templateRun("--check", filepath.Join(dir, "gen.ts"))
	if 0 != code || "" != out || "" != errw {
		t.Fatalf("clean: code %d out %q err %q", code, out, errw)
	}

	bad := templateDir(t, map[string]string{
		"gen.ts": "//- n: [\n  //- {\n//- ]\n"})
	_, errw, code = templateRun("--check", filepath.Join(bad, "gen.ts"))
	if 1 != code ||
		!strings.Contains(errw, "gen.ts:2 is not what the round trip answers") ||
		!strings.Contains(errw, `have: "  //- {"`) ||
		!strings.Contains(errw, `want: "//-   {"`) {
		t.Fatalf("drift: code %d err %q", code, errw)
	}
}

func TestTemplateUsageErrorsExit2(t *testing.T) {
	dir := templateDir(t, map[string]string{"gen.ts": templateGen})
	file := filepath.Join(dir, "gen.ts")

	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{"--resugar", "--check", file}, "one of --resugar or --check"},
		{[]string{}, "template needs one file"},
		{[]string{file, file}, "template needs one file"},
		{[]string{"--marker"}, "--marker needs a token"},
		{[]string{"--bogus", file}, "unknown template option --bogus"},
		{[]string{filepath.Join(dir, "missing.ts")}, "cannot read"},
	} {
		out, errw, code := templateRun(tc.args...)
		if 2 != code || "" != out || !strings.Contains(errw, tc.want) {
			t.Fatalf("%v: code %d out %q err %q", tc.args, code, out, errw)
		}
	}

	out, _, code := templateRun("--help")
	if 0 != code || !strings.Contains(out, "aontu template") {
		t.Fatalf("--help: code %d out %q", code, out)
	}
}

func TestFmtFormatsAGeneratorThroughTheTemplateSurface(t *testing.T) {
	// A FILE THAT IS NOT `.aon` IS A GENERATOR, as it is for template:
	// the aontu its marker lines carry is formatted, the marker stands at the
	// left margin with the aontu indented after it, and every line of
	// output is held on a line of its own -- `puts 1` here, which the
	// packing budget would otherwise put inside the list.
	dir := templateDir(t, map[string]string{
		"gen.rb": "#- n: [\nputs 1\n#- ]\n"})
	file := filepath.Join(dir, "gen.rb")
	out, errw, code := fmtRun("", file)
	if 0 != code || "#- n: [\nputs 1\n#- ]\n" != out || "" != errw {
		t.Fatalf("generator: code %d out %q err %q", code, out, errw)
	}

	// The aontu is indented AFTER the marker, and -w writes it back.
	deep := templateDir(t, map[string]string{
		"g.rb": "#- a: [\n#- { b: [\nx\n#- ] }\n#- ]\n"})
	dfile := filepath.Join(deep, "g.rb")
	if out, _, code = fmtRun("", "-w", dfile); 0 != code || "" != out {
		t.Fatalf("write: code %d out %q", code, out)
	}
	if raw, _ := os.ReadFile(dfile); "#- a: [\n#-   b: [\nx\n#-   ]\n#- ]\n" != string(raw) {
		t.Fatalf("written: %q", raw)
	}

	// --marker reaches fmt too, for a language the table has not met.
	zz := templateDir(t, map[string]string{"g.zz": ";;- a: [\nx\n;;- ]\n"})
	out, _, code = fmtRun("", "--marker", ";;-", filepath.Join(zz, "g.zz"))
	if 0 != code || ";;- a: [\nx\n;;- ]\n" != out {
		t.Fatalf("--marker: code %d out %q", code, out)
	}
	if _, errw, code = fmtRun("", "--marker"); 2 != code ||
		!strings.Contains(errw, "--marker needs a token") {
		t.Fatalf("--marker alone: code %d err %q", code, errw)
	}

	// A FILE WITH NO MARKER LINE IS ANOTHER LANGUAGE'S, and is refused by
	// name: FMT.0.md §9's boundary, which the marker is the evidence for.
	data := templateDir(t, map[string]string{"d.json": "{\"a\":1}\n"})
	dj := filepath.Join(data, "d.json")
	out, errw, code = fmtRun("", dj)
	if 2 != code || "" != out ||
		!strings.Contains(errw, "is not aontu source (.aon, .aontu)") ||
		!strings.Contains(errw, "carries no //- marker line") {
		t.Fatalf("refusal: code %d out %q err %q", code, out, errw)
	}
	if raw, _ := os.ReadFile(dj); "{\"a\":1}\n" != string(raw) {
		t.Fatalf("the refusal wrote the file: %q", raw)
	}

	// `.aontu` is aontu source, and is formatted as one.
	ok := templateDir(t, map[string]string{"d.aontu": "a:{b:1}\n"})
	out, _, code = fmtRun("", filepath.Join(ok, "d.aontu"))
	if 0 != code || "a: b: 1\n" != out {
		t.Fatalf("aontu source: code %d out %q", code, out)
	}
}

const templateOcamlProfile = `@"aontu:profile"

aontu: Lang: lang: "ocaml"
aontu: Lang: indent: { unit:" " width:2 }
aontu: Lang: template: { marker:"(*-" close:"*)" ext:["ml" "mli"] }
`

func TestTemplateTakesItsMarkerFromAProfile(t *testing.T) {
	dir := templateDir(t, map[string]string{
		"ocaml.aon": templateOcamlProfile,
		"gen.ml":    "(*- n: [ *)\nlet a = 1\n(*- ] *)\n",
		"plain.aon": "@\"aontu:profile\"\n\naontu: Lang: lang: \"plain\"\n",
		"note.md":   "<!--- n: [ -->\n# T\n<!--- ] -->\n",
	})
	profile := filepath.Join(dir, "ocaml.aon")
	unit := filepath.Join(dir, "gen.ml")

	// A CLOSER AFTER A SPACE reaches a block comment the table has
	// never seen, and the round trip holds.
	out, _, code := templateRun("--profile", profile, unit)
	if 0 != code || "n: [\n`let a = 1`\n]\n" != out {
		t.Fatalf("profile marker: %d %q", code, out)
	}
	if _, _, code = templateRun("--check", "--profile", profile, unit); 0 != code {
		t.Fatalf("profile round trip: %d", code)
	}

	// A profile claiming no extension of this file leaves the table's
	// answer in place, and the extension alone answers for markdown.
	out, _, _ = templateRun("--profile", filepath.Join(dir, "plain.aon"), unit)
	if "`(*- n: [ *)`\n`let a = 1`\n`(*- ] *)`\n" != out {
		t.Fatalf("unclaimed extension: %q", out)
	}
	out, _, _ = templateRun(filepath.Join(dir, "note.md"))
	if "n: [\n`# T`\n]\n" != out {
		t.Fatalf("markdown: %q", out)
	}

	_, errw, code := templateRun("--profile")
	if 2 != code || !strings.Contains(errw, "--profile needs a file") {
		t.Fatalf("bare --profile: %d %q", code, errw)
	}
	_, errw, code = templateRun("--profile", filepath.Join(dir, "no.aon"), unit)
	if 2 != code || !strings.Contains(errw, "cannot read") {
		t.Fatalf("missing profile: %d %q", code, errw)
	}
	if _, _, code = templateRun("--trust", "nonsense", unit); 2 != code {
		t.Fatalf("bad trust: %d", code)
	}
}

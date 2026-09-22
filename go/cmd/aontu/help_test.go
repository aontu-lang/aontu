/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	aontu "github.com/aontu-lang/aontu/go"
)

func helpRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"help"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

// cliRun drives the bare command (no verb), which is where the
// mistyped-verb diagnosis lives.
func cliRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func repoFile(t *testing.T, rel string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", rel))
	if nil != err {
		t.Fatalf("cannot read %s: %v", rel, err)
	}
	return strings.ReplaceAll(strings.ReplaceAll(
		string(raw), "\r\n", "\n"), "\r", "\n")
}

// THE ASSERTION THE WHOLE PHASE RESTS ON. The embedded corpus is a
// generated copy (ts/scripts/helpdoc.cjs, `make helpdoc`), and a
// generated copy that nothing compares is a second source of truth
// waiting to drift. Regenerate rather than hand-edit; this fails the
// moment docs/skill/ moves without it.
func TestHelpdocCorpusIsIdenticalWithItsSources(t *testing.T) {
	index := helpTopics()
	if 0 == len(index) {
		t.Fatal("no help topics: is go/cmd/aontu/helpdoc/index.tsv staged?")
	}
	for _, topic := range index {
		want := repoFile(t, topic.Source)
		got := helpTopicText(topic)
		if want != got {
			t.Errorf("help topic %s is stale against %s"+
				" (run `make helpdoc`): %d embedded bytes, %d source bytes",
				topic.Topic, topic.Source, len(got), len(want))
		}
	}
}

// The one construct the phase exists for. An agent that cannot learn
// `&:` offline cannot write a schema that constrains anything, and
// will get `verdict: valid` over data that violates it.
func TestHelpLanguageTeachesTheMapTemplate(t *testing.T) {
	out, _, code := helpRun("language")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	if !strings.Contains(out, "&:") {
		t.Error("the grammar card does not mention the map template `&:`")
	}
	if !strings.Contains(out, "TEMPLATE") {
		t.Error("the grammar card does not name the template construct")
	}
}

func TestHelpTasksBridgesTheCallersVocabulary(t *testing.T) {
	out, _, code := helpRun("tasks")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	// The word the caller arrives with. It occurs nowhere in helpText,
	// which is the measurement that opened G11.
	for _, want := range []string{"ontology", "aontu vet", "&:"} {
		if !strings.Contains(out, want) {
			t.Errorf("help tasks does not mention %q", want)
		}
	}
}

func TestHelpIndexListsEveryTopic(t *testing.T) {
	out, _, code := helpRun()
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	for _, topic := range helpTopics() {
		if !strings.Contains(out, topic.Topic) {
			t.Errorf("the index omits topic %s", topic.Topic)
		}
		if !strings.Contains(out, topic.Summary) {
			t.Errorf("the index omits the summary for %s", topic.Topic)
		}
	}
}

func TestHelpIndexJSON(t *testing.T) {
	out, _, code := helpRun("--format", "json")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Aontu struct {
			Verb    string `json:"verb"`
			Version string `json:"version"`
		} `json:"aontu"`
		Topics []struct {
			Source  string `json:"source"`
			Summary string `json:"summary"`
			Topic   string `json:"topic"`
		} `json:"topics"`
	}
	if err := json.Unmarshal([]byte(out), &report); nil != err {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	if "help" != report.Aontu.Verb || aontu.VERSION != report.Aontu.Version {
		t.Errorf("bad producer: %+v", report.Aontu)
	}
	if len(helpTopics()) != len(report.Topics) {
		t.Errorf("want %d topics, got %d", len(helpTopics()), len(report.Topics))
	}
	// The staged file name is an artefact of //go:embed, not contract.
	if strings.Contains(out, `"file"`) {
		t.Error("the JSON leaks the staged file name")
	}
}

func TestHelpTopicJSONCarriesTheText(t *testing.T) {
	out, _, code := helpRun("language", "--format", "json")
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Text  string `json:"text"`
		Topic string `json:"topic"`
	}
	if err := json.Unmarshal([]byte(out), &report); nil != err {
		t.Fatalf("not JSON: %v", err)
	}
	if "language" != report.Topic || !strings.Contains(report.Text, "&:") {
		t.Errorf("bad topic report: %+v", report.Topic)
	}
}

// AN UNKNOWN TOPIC NAMES THE ALTERNATIVES. The caller who typed it has
// no other way to find out what exists.
func TestHelpUnknownTopicListsTheTopics(t *testing.T) {
	out, errw, code := helpRun("langauge")
	if 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if "" != out {
		t.Errorf("a refusal wrote to stdout: %q", out)
	}
	for _, want := range []string{"langauge", "language", "examples"} {
		if !strings.Contains(errw, want) {
			t.Errorf("the refusal omits %q: %s", want, errw)
		}
	}
}

func TestHelpUsageRefusals(t *testing.T) {
	for _, tc := range []struct {
		name, want string
		args       []string
	}{
		{"two topics", "one topic", []string{"a", "b"}},
		{"bad format", "text or json", []string{"--format", "xml"}},
		{"format at end", "text or json", []string{"--format"}},
		{"unknown option", "unknown help option", []string{"--bogus"}},
	} {
		_, errw, code := helpRun(tc.args...)
		if 2 != code {
			t.Errorf("%s: want 2, got %d", tc.name, code)
		}
		if !strings.Contains(errw, tc.want) {
			t.Errorf("%s: want %q in %q", tc.name, tc.want, errw)
		}
	}
}

func TestHelpVerbTakesTheToolHelp(t *testing.T) {
	out, _, code := helpRun("--help")
	if 0 != code || !strings.Contains(out, "Usage: aontu") {
		t.Errorf("want the tool help, got %d: %.60s", code, out)
	}
}

func TestBareWordIsDiagnosedAsAMistypedVerb(t *testing.T) {
	for _, tc := range []struct{ arg, near string }{
		{"vett", "vet"},
		{"gett", "get"},
		{"explian", "explain"},
		{"relation", "relations"},
		{"hepl", "help"},
	} {
		_, errw, code := cliRun(tc.arg)
		if 2 != code {
			t.Errorf("%s: want 2, got %d", tc.arg, code)
		}
		if !strings.Contains(errw, "not a verb this port knows") {
			t.Errorf("%s: no verb diagnosis: %s", tc.arg, errw)
		}
		if !strings.Contains(errw, "did you mean `aontu "+tc.near+"`") {
			t.Errorf("%s: want the suggestion %s, got %s", tc.arg, tc.near, errw)
		}
	}
}

// A bare word with no near verb still gets the diagnosis, without a
// suggestion: naming an unrelated verb with confidence is worse than
// naming none.
func TestBareWordWithNoNearVerbSuggestsNothing(t *testing.T) {
	_, errw, code := cliRun("ontology")
	if 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if !strings.Contains(errw, "not a verb this port knows") {
		t.Errorf("no verb diagnosis: %s", errw)
	}
	if strings.Contains(errw, "did you mean") {
		t.Errorf("suggested something for an unrelated word: %s", errw)
	}
}

// THE ESCAPE HATCH THE SUBCOMMAND DISPATCH ALREADY DOCUMENTS. A
// path-shaped argument was meant as a path and keeps the file
// diagnosis and its exit 1.
func TestPathShapedArgumentKeepsTheFileDiagnosis(t *testing.T) {
	for _, arg := range []string{"./help", "help.aontu", "/tmp/help", "sub/help"} {
		_, errw, code := cliRun(arg)
		if 1 != code {
			t.Errorf("%s: want 1, got %d", arg, code)
		}
		if !strings.Contains(errw, "cannot read "+arg) {
			t.Errorf("%s: want the file diagnosis, got %s", arg, errw)
		}
	}
}

// A file that EXISTS and is named like a verb is still read: the
// diagnosis is reached only when the read fails.
func TestAnExistingFileNamedLikeAVerbIsRead(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(dir, "vet"), []byte("a: 1\n"), 0o600); nil != err {
		t.Fatal(err)
	}
	cwd, _ := os.Getwd()
	defer os.Chdir(cwd)
	if err := os.Chdir(dir); nil != err {
		t.Fatal(err)
	}
	// `./vet`, because a bare `vet` is the VERB -- which is exactly the
	// escape hatch the dispatch documents.
	out, errw, code := cliRun("./vet")
	if 0 != code || !strings.Contains(out, `"a": 1`) {
		t.Errorf("want the evaluated file, got %d: %s %s", code, out, errw)
	}
}

func TestKnownVerbsAllDispatch(t *testing.T) {
	for _, verb := range knownVerbs {
		// `--help` is accepted by every verb and exits 0 without doing
		// any work, so it reaches the dispatch and nothing beyond it.
		_, errw, code := cliRun(verb, "--help")
		if strings.Contains(errw, "not a verb this port knows") {
			t.Errorf("%s is in knownVerbs but run() does not dispatch it", verb)
		}
		if 0 != code {
			t.Errorf("%s --help: want 0, got %d: %s", verb, code, errw)
		}
	}
}

func TestEveryDispatchedVerbIsInKnownVerbs(t *testing.T) {
	src, err := os.ReadFile("main.go")
	if nil != err {
		t.Fatalf("cannot read main.go: %v", err)
	}
	re := regexp.MustCompile(`"([a-z]+)" == args\[0\]`)
	known := map[string]bool{}
	for _, verb := range knownVerbs {
		known[verb] = true
	}
	found := 0
	for _, m := range re.FindAllStringSubmatch(string(src), -1) {
		found++
		if !known[m[1]] {
			t.Errorf("run() dispatches %q and knownVerbs omits it, so a"+
				" caller who mistypes it gets no suggestion", m[1])
		}
	}
	if 15 > found {
		t.Fatalf("only %d dispatch arms found; has run() changed shape?", found)
	}
}

func TestLooksLikeVerb(t *testing.T) {
	for _, arg := range []string{"help", "vet", "a"} {
		if !looksLikeVerb(arg) {
			t.Errorf("%q should look like a verb", arg)
		}
	}
	for _, arg := range []string{
		"", "./help", "help.aontu", "/tmp/help", "sub/help", "a\\b", "-x",
	} {
		if looksLikeVerb(arg) {
			t.Errorf("%q should not look like a verb", arg)
		}
	}
}

// The cap grows with the word and stops at three, so a short typo
// cannot reach an unrelated verb.
func TestNearestVerbRespectsTheCap(t *testing.T) {
	verbs := []string{"vet", "view", "why"}
	if got := nearestVerb("vett", verbs); "vet" != got {
		t.Errorf("want vet, got %q", got)
	}
	if got := nearestVerb("qqqqqqqqqq", verbs); "" != got {
		t.Errorf("want no suggestion, got %q", got)
	}
	// A TIE RESOLVES BY CODE-POINT ORDER in both ports, not by the
	// order the verb table happens to be written in: `xet` is one edit
	// from both `get` and `vet`, and `get` sorts first.
	if got := nearestVerb("xet", []string{"vet", "get"}); "get" != got {
		t.Errorf("want the code-point-first tie, got %q", got)
	}
}

func TestEditDistance(t *testing.T) {
	for _, tc := range []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"a", "", 1},
		{"", "ab", 2},
		{"vet", "vet", 0},
		{"vett", "vet", 1},
		{"explian", "explain", 1},
		{"abc", "acb", 1},
	} {
		if got := editDistance(tc.a, tc.b); tc.want != got {
			t.Errorf("editDistance(%q,%q) = %d, want %d",
				tc.a, tc.b, got, tc.want)
		}
	}
}

func TestHelpTextAdvertisesTheLanguageDoor(t *testing.T) {
	for _, want := range []string{
		"aontu help [topic]", "aontu explain <code>",
		"NEW TO THE LANGUAGE?", "&: inside a map is",
	} {
		if !strings.Contains(helpText, want) {
			t.Errorf("helpText omits %q", want)
		}
	}
}

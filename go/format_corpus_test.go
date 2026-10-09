/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// The format corpora of test/vectors/README.md, as
// ts/test/format-corpus.test.ts reads them: the counts of the cases that
// agree and of each kind of difference are required.

const formatVectors = "../test/vectors"

// formatStop is where the first of a format's grammars that refuses the
// text stops, or -1.
func formatStop(t *testing.T, name, text string) int {
	_, gs, _, _ := formatOf(name)
	for _, g := range gs {
		at, ok := recogniseFormat(g, text)
		if !ok {
			t.Fatalf("%s reached the step bound on %q", name, text)
		}
		if -1 != at {
			return at
		}
	}
	return -1
}

var corpusReserved = regexp.MustCompile(`\{[=,!@|]`)
var corpusPrefix = regexp.MustCompile(`\{[+#./;?&]?([^:}]+):[0-9]+\}`)

// corpusExpansionOnly: RFC 6570's grammar admits a reserved operator
// (section 2.2) and a prefix on a list or a map (section 2.4.1);
// expansion refuses both.
func corpusExpansionOnly(template string, variables map[string]any) string {
	if corpusReserved.MatchString(template) {
		return "a reserved operator"
	}
	if m := corpusPrefix.FindStringSubmatch(template); nil != m {
		switch variables[m[1]].(type) {
		case map[string]any, []any:
			return "a prefix on a list or a map"
		}
	}
	return "admitted, though invalid"
}

func TestFormatCorpusUriTemplate(t *testing.T) {
	counts := map[string]int{}
	for _, file := range []string{"spec-examples.json", "extended-tests.json", "negative-tests.json"} {
		text, err := os.ReadFile(filepath.Join(formatVectors, "uritemplate-test", file))
		if nil != err {
			t.Fatal(err)
		}
		var groups map[string]struct {
			Variables map[string]any `json:"variables"`
			Testcases [][]any        `json:"testcases"`
		}
		if err := json.Unmarshal(text, &groups); nil != err {
			t.Fatal(err)
		}
		for _, g := range groups {
			for _, c := range g.Testcases {
				template, _ := c[0].(string)
				valid := false != c[1]
				admitted := -1 == formatStop(t, "uri-template", template)
				k := "agrees"
				if valid != admitted && admitted {
					k = corpusExpansionOnly(template, g.Variables)
				} else if valid != admitted {
					k = "refused, though valid"
				}
				counts[file+": "+k]++
			}
		}
	}
	want := map[string]int{
		"spec-examples.json: agrees":                       64,
		"extended-tests.json: agrees":                      53,
		"negative-tests.json: agrees":                      31,
		"negative-tests.json: a reserved operator":         3,
		"negative-tests.json: a prefix on a list or a map": 2,
	}
	if !reflect.DeepEqual(counts, want) {
		t.Fatalf("uritemplate-test: %v, want %v", counts, want)
	}
}

var corpusEntity = regexp.MustCompile(`&#x([0-9A-Fa-f]+);`)

// corpusXMLText: the file writes a control character as its control
// picture.
func corpusXMLText(s string) string {
	s = corpusEntity.ReplaceAllStringFunc(s, func(m string) string {
		c, _ := strconv.ParseInt(m[3:len(m)-1], 16, 32)
		if 0x2400 <= c && c < 0x2420 {
			c -= 0x2400
		}
		return string(rune(c))
	})
	return strings.NewReplacer("&lt;", "<", "&gt;", ">", "&quot;", `"`, "&apos;", "'",
		"&amp;", "&").Replace(s)
}

var corpusTest = regexp.MustCompile(`(?s)<test id="[0-9]+">(.*?)</test>`)

// corpusIsemailValid are the categories whose addresses RFC 5321's
// Mailbox admits.
var corpusIsemailValid = []string{"ISEMAIL_VALID_CATEGORY", "ISEMAIL_DNSWARN", "ISEMAIL_RFC5321"}

func TestFormatCorpusIsemail(t *testing.T) {
	xml, err := os.ReadFile(filepath.Join(formatVectors, "isemail", "tests.xml"))
	if nil != err {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, m := range corpusTest.FindAllStringSubmatch(string(xml), -1) {
		field := func(tag string) string {
			f := regexp.MustCompile("<" + tag + ">([^<]*)</" + tag + ">").FindStringSubmatch(m[1])
			if nil == f {
				return ""
			}
			return corpusXMLText(f[1])
		}
		valid := slices.Contains(corpusIsemailValid, field("category"))
		for _, name := range []string{"email", "idn-email"} {
			admitted := -1 == formatStop(t, name, field("address"))
			k := "agrees"
			if valid != admitted && admitted && strings.HasSuffix(field("diagnosis"), "TOOLONG") {
				k = "a size limit"
			} else if valid != admitted {
				k = "unexplained"
			}
			counts[name+": "+k]++
		}
	}
	want := map[string]int{
		"email: agrees":           157,
		"email: a size limit":     7,
		"idn-email: agrees":       157,
		"idn-email: a size limit": 7,
	}
	if !reflect.DeepEqual(counts, want) {
		t.Fatalf("isemail: %v, want %v", counts, want)
	}
}

var corpusDNSLength = regexp.MustCompile(`^\[A4_[12](, A4_[12])*\]$`)

// corpusIdnaDifference names each kind of difference UTS 46's toASCII and
// idn-hostname may have.
func corpusIdnaDifference(cps []rune, at int, status string) string {
	past := func(i int) bool { return i < len(cps) && 0x7f < cps[i] }
	if -1 == at {
		if corpusDNSLength.MatchString(status) && slices.ContainsFunc(cps, func(c rune) bool { return 0x7f < c }) {
			return "the A-label form of a U-label too long"
		}
		return "admitted, though invalid"
	}
	if past(at) {
		return "a code point past IDNA2008, or mapped to several"
	}
	if at+1 < len(cps) && 0x338 == cps[at+1] {
		return "a character normalisation composes"
	}
	return "refused, though valid"
}

var corpusSurrogate = regexp.MustCompile(`\\u[Dd][89A-Fa-f]`)
var corpusEscape = regexp.MustCompile(`\\u[0-9A-Fa-f]{4}`)
var corpusALabel = regexp.MustCompile(`(?i)xn--`)

func TestFormatCorpusIdnaTestV2(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(formatVectors, "idna", "IdnaTestV2.txt"))
	if nil != err {
		t.Fatal(err)
	}
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	if !strings.Contains(text, "\n# Version: 18.0.0\n") {
		t.Fatal("IdnaTestV2.txt is not Unicode 18.0.0's")
	}
	counts := map[string]int{}
	for _, line := range strings.Split(text, "\n") {
		if "" == strings.TrimSpace(line) || strings.HasPrefix(line, "#") {
			continue
		}
		cols := strings.Split(line, ";")
		for i := range cols {
			cols[i] = strings.TrimSpace(cols[i])
		}
		if corpusSurrogate.MatchString(cols[0]) {
			counts["ill-formed, not read"]++
			continue
		}
		source := ""
		if `""` != cols[0] {
			source = corpusEscape.ReplaceAllStringFunc(cols[0], func(m string) string {
				c, _ := strconv.ParseInt(m[2:], 16, 32)
				return string(rune(c))
			})
		}
		if corpusALabel.MatchString(source) {
			counts["an A-label, not read"]++
			continue
		}
		status := cols[4]
		if "" == status {
			status = cols[2]
		}
		at := formatStop(t, "idn-hostname", source)
		if ("" == status || "[]" == status) == (-1 == at) {
			counts["agrees"]++
		} else {
			counts[corpusIdnaDifference([]rune(source), at, status)]++
		}
	}
	want := map[string]int{
		"ill-formed, not read": 2,
		"an A-label, not read": 2384,
		"agrees":               3840,
		"a code point past IDNA2008, or mapped to several": 102,
		"a character normalisation composes":               40,
		"the A-label form of a U-label too long":           28,
	}
	if !reflect.DeepEqual(counts, want) {
		t.Fatalf("IdnaTestV2: %v, want %v", counts, want)
	}
}

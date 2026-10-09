/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The official suite's annotation tests, mirroring
// ts/test/jsonschema-annotations.test.ts: the schema is imported, met
// with the instance, and the riders at each asserted location are read.

const annotationSkipBound = 41

var annotationKey = map[string]string{
	"title": "title", "description": "description", "$comment": "comment",
	"default": "default", "examples": "examples", "readOnly": "readOnly",
	"writeOnly": "writeOnly", "format": "format", "contentEncoding": "contentEncoding",
	"contentMediaType": "contentMediaType", "contentSchema": "contentSchema",
}

// for2020 reads a case's compatibility: a release alone is the earliest,
// `<=` the latest, `=` the one, and commas join them.
func for2020(spec string) bool {
	for _, c := range strings.Split(spec, ",") {
		if "" == c {
			continue
		}
		var ok bool
		switch {
		case strings.HasPrefix(c, "<="):
			n, _ := strconv.Atoi(c[2:])
			ok = 2020 <= n
		case strings.HasPrefix(c, "="):
			n, _ := strconv.Atoi(c[1:])
			ok = 2020 == n
		default:
			n, _ := strconv.Atoi(c)
			ok = n <= 2020
		}
		if !ok {
			return false
		}
	}
	return true
}

func canonJSON(t *testing.T, v any) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); nil != err {
		t.Fatal(err)
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// held is the values a met node holds: a conjunct still pending, such as
// a container beside a count tried at generation, holds each of its terms.
func held(v Val) []Val {
	if cj, ok := v.(*ConjunctVal); ok {
		out := []Val{}
		for _, t := range cj.peg {
			out = append(out, held(t)...)
		}
		return out
	}
	if nil == v {
		return nil
	}
	return []Val{v}
}

// annotationsAt is the values a keyword annotates a location of the met
// value with, as a set of canonical JSON, since a record holds each value
// once; none where the instance has no such location.
func annotationsAt(t *testing.T, met Val, instance any, location, keyword string) []string {
	nodes, inst := []Val{met}, instance
	for _, raw := range strings.Split(location, "/")[1:] {
		seg := strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
		switch in := inst.(type) {
		case map[string]any:
			v, ok := in[seg]
			if !ok {
				return []string{}
			}
			inst = v
		case []any:
			i, err := strconv.Atoi(seg)
			if nil != err || i < 0 || len(in) <= i {
				return []string{}
			}
			inst = in[i]
		default:
			return []string{}
		}
		next := []Val{}
		for _, n := range nodes {
			for _, h := range held(n) {
				switch b := h.(type) {
				case *MapVal:
					if c, ok := b.peg[seg]; ok {
						next = append(next, c)
					}
				case *ListVal:
					if i, err := strconv.Atoi(seg); nil == err && 0 <= i && i < len(b.peg) {
						next = append(next, b.peg[i])
					}
				}
			}
		}
		nodes = next
	}
	all := []Val{}
	for _, n := range nodes {
		all = append(all, held(n)...)
	}
	if "deprecated" == keyword {
		for _, n := range all {
			if nil != n.deprecRec() {
				return []string{"true"}
			}
		}
		return []string{}
	}
	seen := map[string]bool{}
	out := []string{}
	for _, n := range all {
		rec := n.metaRec()
		vals := []Val{}
		if key, ok := annotationKey[keyword]; ok {
			vals = rec[key]
		} else {
			for _, x := range rec["x"] {
				if m, ok := x.(*MapVal); ok && nil != m.peg[keyword] {
					vals = append(vals, m.peg[keyword])
				}
			}
		}
		for _, v := range vals {
			g, _ := v.Gen(&Ctx{collect: true})
			if j := canonJSON(t, g); !seen[j] {
				seen[j] = true
				out = append(out, j)
			}
		}
	}
	sort.Strings(out)
	return out
}

func TestJSONSchemaAnnotations(t *testing.T) {
	dir := filepath.Join(vectorsDir, "jsonschema", "annotations")
	skips := readSuiteSkips(t, dir)
	if annotationSkipBound < len(skips) {
		t.Fatalf("the annotation ledger holds %d rows, past its bound of %d", len(skips), annotationSkipBound)
	}
	problems := []string{}
	total, passed := 0, 0
	for _, file := range suiteFiles(t, filepath.Join(dir, "tests")) {
		raw, err := os.ReadFile(filepath.Join(dir, "tests", file))
		if nil != err {
			t.Fatal(err)
		}
		src := string(raw)
		doc, _ := parseSchemaJSON(src)
		for _, c := range jentryOf(doc, "suite").items {
			spec := ""
			if v := jentryOf(c, "compatibility"); nil != v {
				spec = v.s
			}
			if !for2020(spec) {
				continue
			}
			group := suiteMember(t, c, "description").s
			schemaNode := suiteMember(t, c, "schema")
			report := ImportJSONSchema(src[schemaNode.off:schemaNode.end], &ImportOptions{Path: file})
			for i, tc := range suiteMember(t, c, "tests").items {
				instNode := suiteMember(t, tc, "instance")
				instText := src[instNode.off:instNode.end]
				sval, serr := New().Parse(report.Aontu)
				da := New()
				da.ExactNumbers = true
				dval, derr := da.Parse(instText)
				var met Val
				held := nil == serr && nil == derr
				if held {
					pair := newConjunct([]Val{sval, dval})
					ctx := &Ctx{root: pair, collect: true}
					met = unifyRoot(pair, ctx)
					held = 0 == len(ctx.err) && !met.Nil()
				}
				var instance any
				if err := json.Unmarshal([]byte(instText), &instance); nil != err {
					t.Fatal(err)
				}
				for _, a := range suiteMember(t, tc, "assertions").items {
					total++
					location := suiteMember(t, a, "location").s
					keyword := suiteMember(t, a, "keyword").s
					shown := location
					if "" == shown {
						shown = "#"
					}
					name := fmt.Sprintf("test %d: %s %s", i, shown, keyword)
					want := []string{}
					for _, e := range suiteMember(t, a, "expected").entries {
						var v any
						if err := json.Unmarshal([]byte(src[e.val.off:e.val.end]), &v); nil != err {
							t.Fatal(err)
						}
						want = append(want, canonJSON(t, v))
					}
					want = uniqueSorted(want)
					got := []string{}
					if held {
						got = annotationsAt(t, met, instance, location, keyword)
					}
					skip := listedSkip(skips, file, group, name)
					if strings.Join(got, "\x00") == strings.Join(want, "\x00") {
						passed++
						if nil != skip {
							problems = append(problems, fmt.Sprintf(
								"%s | %s | %s: listed as a skip (%s) and passes; delete its row",
								file, group, name, skip.construct))
						}
					} else if nil == skip {
						problems = append(problems, fmt.Sprintf(
							"%s | %s | %s: wanted %v and got %v, with no skip listed",
							file, group, name, want, got))
					} else {
						skip.used = true
					}
				}
			}
		}
	}
	for _, s := range skips {
		if !s.used {
			problems = append(problems, fmt.Sprintf(
				"%s | %s | %s: listed as a skip (%s) and nothing under it fails; delete its row",
				s.file, s.group, s.test, s.construct))
		}
	}
	t.Logf("annotations: %d assertions, %d pass, %d ledger rows", total, passed, len(skips))
	if 0 < len(problems) {
		t.Fatal(strings.Join(problems, "\n"))
	}
}

func uniqueSorted(xs []string) []string {
	sort.Strings(xs)
	out := []string{}
	for i, x := range xs {
		if 0 == i || x != xs[i-1] {
			out = append(out, x)
		}
	}
	return out
}

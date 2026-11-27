/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The same files and the same expected text as ts/test/cli.test.ts.
var operandFiles = map[string]string{
	"schema.aontu": "name: string\nport: integer & min(1)\ntags: [&: string]\n",
	"d.yaml":       "name: web\nport: 8080\ntags:\n  - a\n  - b\n",
	"d.toml":       "name = \"web\"\nport = 8080\ntags = [\"a\", \"b\"]\n",
	"d.json":       "name: \"web\", port: 8080, tags: [\"a\", \"b\"]\n",
	"d.data":       "name: web\nport: 8080\ntags: [a, b]\n",
	"bad.toml":     "name = \"web\"\nport = 0\ntags = [\"a\", \"b\"]\n",
	"broken.yaml":  "a: [1\nb: 2\n",
	"broken.toml":  "a = [1\n",
	"p.toml":       "port = 1\n",
	"q.aontu":      "port: 1\n",
}

var operandCases = []struct {
	args []string
	code int
	text string
}{
	{[]string{"-c", "d.yaml"}, 0, "{\"name\":\"web\",\"port\":8080,\"tags\":[\"a\",\"b\"]}\n"},
	{[]string{"-c", "d.toml"}, 0, "{\"name\":\"web\",\"port\":8080,\"tags\":[\"a\",\"b\"]}\n"},
	{[]string{"-c", "d.json"}, 0, "{\"name\":\"web\",\"port\":8080,\"tags\":[\"a\",\"b\"]}\n"},
	{[]string{"-c", "d.data"}, 0, "{\"name\":\"web\",\"port\":8080,\"tags\":[\"a\",\"b\"]}\n"},
	{[]string{"vet", "schema.aontu", "d.yaml", "d.toml", "d.json", "d.data"}, 0, "verdict: valid\n"},
	{[]string{"vet", "schema.aontu", "bad.toml"}, 1,
		"verdict: invalid\n\n$.port: constraint [conflict]\n" +
			"  [aontu/constraint]: Cannot unify values at path $.port\n" +
			"  expected: integer&min(1)\n  actual:   0\n  data: bad.toml:-1:-1 (0)\n" +
			"  schema: schema.aontu:2:17 (integer&min(1))\n"},
	{[]string{"broken.yaml"}, 1,
		"[aontu/unexpected]: unexpected character(s): \n\n" +
			"The text is not valid Aontu syntax. The frame points at the\n" +
			"character the parser stopped on; the fault is usually just before\n" +
			"it, and commenting out the suspect lines with # isolates which.\n\n" +
			" unexpected character(s): \n  --> broken.yaml:3:1\n" +
			"  1 | a: [1\n  2 | b: 2\n  3 | \n      ^ unexpected character(s): \n" +
			"  4 | \n  5 | \n\n"},
	{[]string{"vet", "schema.aontu", "broken.toml"}, 1,
		"verdict: invalid\n\n$: syntax [parse]\n" +
			"  [aontu/unexpected]: unexpected character(s): \n" +
			"  data: broken.toml:2:1 (nil)\n"},
	{[]string{"hash", "d.yaml"}, 0, "aon1-6pedjVnb7z2Yp37UYQM7f2pvCrsd3VgmoCvu1Rxgrrc\n"},
	{[]string{"hash", "d.toml"}, 0, "aon1-6pedjVnb7z2Yp37UYQM7f2pvCrsd3VgmoCvu1Rxgrrc\n"},
	{[]string{"hash", "d.data"}, 0, "aon1-6pedjVnb7z2Yp37UYQM7f2pvCrsd3VgmoCvu1Rxgrrc\n"},
	{[]string{"view", "poset", "p.toml", "q.aontu"}, 0,
		"%% aontu subsumption poset  profile=defaults  documents=2  nodes=1\n" +
			"graph BT\n  n0[\"p.toml = q\"]\n"},
	{[]string{"view", "ladder", "--at", "$.port", "p.toml"}, 0,
		"graph TD\n  any((\"any\"))\n  c0[\"1<br/>literal | p.toml:-1:-1\"]\n" +
			"  val{{\"1\"}}\n  any --> c0\n  c0 --> val\n"},
}

func TestADataOperandIsReadByItsExtension(t *testing.T) {
	dir := t.TempDir()
	for name, src := range operandFiles {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Chdir(dir)
	for _, c := range operandCases {
		var out bytes.Buffer
		code := run(c.args, strings.NewReader(""), &out, &out, false)
		if c.code != code || c.text != out.String() {
			t.Errorf("%v: code %d, want %d\n%q\nwant\n%q", c.args, code, c.code, out.String(), c.text)
		}
	}
}

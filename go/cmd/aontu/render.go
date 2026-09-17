/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	aontu "github.com/aontu-lang/aontu/go"
	jostraca "github.com/jostraca/jostraca/go"
)

const renderHelp = "aontu render [--check] [--at <path>] [--format json] " +
	"[--marker <token>] [--profile <file>] <file|folder> <path> (try --help)"

func isDirectory(path string) bool {
	st, err := os.Stat(path)
	return nil == err && st.IsDir()
}

// A file the runtime declined to touch, its copy on disk carrying the
// protect marker, is in none of the lists it answers with: they hold
// what was DONE to a file, and nothing was. The run's own record names
// it. `since` drops what earlier runs left. Mirrors renderSkipped in
// ts/src/cli.ts.
func renderSkipped(folder string, since int64) []string {
	raw, err := os.ReadFile(filepath.Join(folder, ".jostraca", "jostraca.meta.log"))
	if nil != err {
		return []string{}
	}
	var meta struct {
		Files map[string]struct {
			Action string `json:"action"`
			When   int64  `json:"when"`
		} `json:"files"`
	}
	if err := json.Unmarshal(raw, &meta); nil != err {
		return []string{}
	}
	out := []string{}
	for path, f := range meta.Files {
		if "skip" == f.Action && since <= f.When {
			out = append(out, path)
		}
	}
	sort.Strings(out)
	return out
}

func renderJSON(v map[string]any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	return strings.TrimSuffix(buf.String(), "\n")
}

func hasMarkerLine(src, marker string) bool {
	for _, out := range aontu.TemplateOutputs(src, marker) {
		if !out {
			return true
		}
	}
	return false
}

func nonNil(s []string) []string {
	if nil == s {
		return []string{}
	}
	return s
}

// runRender hands the component tree a generator answers to jostraca,
// which writes the files below a path or holds them to it. Mirrors
// runRender in ts/src/cli.ts.
func runRender(argv []string, stdout, stderr io.Writer) int {
	argv, trust, trustOK := takeTrust(argv, stderr)
	if !trustOK {
		return 2
	}
	var rest []string
	var profileFiles []string
	format := "text"
	at := ""
	marker := ""
	check := false

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--check" == arg:
			check = true
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case "--at" == arg:
			i++
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: --at needs a path\n")
				return 2
			}
			at = argv[i]
		case "--marker" == arg:
			i++
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: --marker needs a token\n")
				return 2
			}
			marker = argv[i]
		case "--profile" == arg:
			i++
			if len(argv) <= i || "" == argv[i] {
				io.WriteString(stderr, "aontu: --profile needs a file\n")
				return 2
			}
			profileFiles = append(profileFiles, argv[i])
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown render option "+arg+" (try --help)\n")
			return 2
		default:
			rest = append(rest, arg)
		}
	}

	if 2 != len(rest) {
		io.WriteString(stderr,
			"aontu: render needs a file and a path\n"+renderHelp+"\n")
		return 2
	}
	file, dest := rest[0], rest[1]

	profiles, code := loadProfiles(profileFiles, trust, stderr)
	if 0 != code {
		return code
	}
	if "" == at {
		at = "$.out"
	}

	// A FOLDER IS A SET OF GENERATORS: every regular file directly in it,
	// dotfiles aside, in name order, written as one tree.
	entries, err := os.ReadDir(file)
	set := nil == err
	files := []string{file}
	if set {
		files = files[:0]
		for _, e := range entries {
			if e.Type().IsRegular() && !strings.HasPrefix(e.Name(), ".") {
				files = append(files, filepath.Join(file, e.Name()))
			}
		}
	}
	if 0 == len(files) {
		io.WriteString(stderr, "aontu: "+file+" holds no generator\n")
		return 2
	}

	trees := make([]any, 0, len(files))
	for _, f := range files {
		src, err := os.ReadFile(f)
		if nil != err {
			io.WriteString(stderr, "aontu: cannot read "+f+": "+err.Error()+"\n")
			return 2
		}
		text := string(src)
		if !strings.HasSuffix(f, ".aon") && !strings.HasSuffix(f, ".aontu") {
			mark := marker
			if "" == mark {
				mark = templateMarker(profiles, f)
			}
			if !hasMarkerLine(text, mark) {
				io.WriteString(stderr, "aontu: "+f+" carries no "+mark+
					" marker line, so there is no aontu in it to render\n")
				return 2
			}
			text = aontu.DesugarTemplate(text, mark)
		}
		report := aontuForFileTrust(f, trust).Get(
			text, at, &aontu.QueryOptions{View: aontu.QueryJSON})
		if !report.OK {
			for _, fd := range report.Findings {
				io.WriteString(stderr, renderFinding(fd)+"\n")
			}
			return 4
		}
		var tree any
		_ = json.Unmarshal([]byte(report.Out), &tree)
		// A `File` without a name is refused: the runtime ports disagree
		// about it.
		if node, ok := tree.(map[string]any); ok && "File" == node["cmp"] {
			props, _ := node["props"].(map[string]any)
			if _, named := props["name"].(string); !named {
				io.WriteString(stderr, "aontu: "+f+": the file at "+at+" has no name\n")
				return 4
			}
		}
		trees = append(trees, tree)
	}

	// ONE FILE GOES TO THE PATH ITSELF, unless the path is a directory; a
	// set is written below the path whatever its trees are.
	folder := dest
	tree := trees[0]
	if set {
		all := make([]any, 0, len(trees))
		for _, t := range trees {
			if list, ok := t.([]any); ok {
				all = append(all, list...)
			} else {
				all = append(all, t)
			}
		}
		tree = all
	} else if node, ok := tree.(map[string]any); ok && "File" == node["cmp"] &&
		!isDirectory(dest) {
		node["props"].(map[string]any)["name"] = filepath.Base(dest)
		folder = filepath.Dir(dest)
	}

	root, err := jostraca.CmpTree(tree, jostraca.CmpTreeOptions{Raw: true})
	if nil != err {
		io.WriteString(stderr, "aontu: "+file+": "+err.Error()+"\n")
		return 4
	}
	runtime := jostraca.New()

	if check {
		// jostraca's Check reads nothing under the folder `.`; the
		// absolute spelling names the same files.
		if "." == folder {
			folder, _ = filepath.Abs(folder)
		}
		res, err := runtime.Check(jostraca.Options{Folder: folder}, root)
		if nil != err {
			io.WriteString(stderr, "aontu: "+err.Error()+"\n")
			return 2
		}
		drift := make([]map[string]any, 0, len(res.Drift))
		for _, d := range res.Drift {
			drift = append(drift, map[string]any{"kind": string(d.Kind), "path": d.Path})
		}
		if "json" == format {
			verdict := "ok"
			if 0 < len(drift) {
				verdict = "drift"
			}
			io.WriteString(stdout, renderJSON(map[string]any{
				"aontu":   map[string]any{"version": aontu.VERSION, "verb": "render"},
				"verdict": verdict,
				"checked": nonNil(res.Checked),
				"drift":   drift,
			})+"\n")
		} else {
			for _, d := range res.Drift {
				io.WriteString(stdout, string(d.Kind)+": "+d.Path+"\n")
			}
		}
		if 0 < len(drift) {
			return 1
		}
		return 0
	}

	since := time.Now().UnixMilli()
	res, err := runtime.Generate(jostraca.Options{Folder: folder}, root)
	if nil != err {
		io.WriteString(stderr, "aontu: "+err.Error()+"\n")
		return 2
	}
	skipped := renderSkipped(folder, since)
	if "json" == format {
		io.WriteString(stdout, renderJSON(map[string]any{
			"aontu":   map[string]any{"version": aontu.VERSION, "verb": "render"},
			"verdict": "ok",
			"files": map[string]any{
				"preserved":  nonNil(res.Files.Preserved),
				"written":    nonNil(res.Files.Written),
				"presented":  nonNil(res.Files.Presented),
				"diffed":     nonNil(res.Files.Diffed),
				"merged":     nonNil(res.Files.Merged),
				"conflicted": nonNil(res.Files.Conflicted),
				"unchanged":  nonNil(res.Files.Unchanged),
				"skipped":    skipped,
			},
		})+"\n")
	} else {
		for _, path := range skipped {
			io.WriteString(stdout, "skipped: "+path+"\n")
		}
	}
	return 0
}

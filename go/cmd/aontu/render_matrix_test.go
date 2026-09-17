/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The render matrix: test/render/cases.json, held to the same
// expectations by ts/test/render-matrix.test.ts. A change to one port's
// render output fails the other port too.

type matrixStep struct {
	Args   []string          `json:"args"`
	Code   *int              `json:"code"`
	Out    *string           `json:"out"`
	Err    *string           `json:"err"`
	Edit   map[string]string `json:"edit"`
	Remove []string          `json:"remove"`
	Chmod  map[string]string `json:"chmod"`
}

type matrixCase struct {
	Name      string            `json:"name"`
	Posix     bool              `json:"posix"`
	Files     map[string]string `json:"files"`
	Steps     []matrixStep      `json:"steps"`
	After     map[string]string `json:"after"`
	AfterMode map[string]string `json:"afterMode"`
}

// The runtime's own record is excluded: its log carries the time of the
// run, and nothing else here does.
func matrixHeld(t *testing.T, dir string) []string {
	t.Helper()
	out := []string{}
	err := filepath.WalkDir(dir, func(at string, e os.DirEntry, err error) error {
		if nil != err {
			return err
		}
		if e.IsDir() {
			if ".jostraca" == e.Name() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(dir, at)
		if nil != err {
			return err
		}
		out = append(out, filepath.ToSlash(rel))
		return nil
	})
	if nil != err {
		t.Fatal(err)
	}
	sort.Strings(out)
	return out
}

var matrixVersion = regexp.MustCompile(`"version": "[^"]*"`)

func matrixNorm(text, dir string) string {
	slashed := strings.ReplaceAll(text, "\\", "/")
	slashed = strings.ReplaceAll(slashed, strings.ReplaceAll(dir, "\\", "/"), "{dir}")
	return matrixVersion.ReplaceAllString(slashed, `"version": "{version}"`)
}

func matrixWrite(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for rel, content := range files {
		at := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(at), 0o755); nil != err {
			t.Fatal(err)
		}
		if err := os.WriteFile(at, []byte(content), 0o600); nil != err {
			t.Fatal(err)
		}
	}
}

func TestRenderMatrix(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "test", "render", "cases.json"))
	if nil != err {
		t.Fatal(err)
	}
	var file struct {
		Cases []matrixCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); nil != err {
		t.Fatal(err)
	}
	if 0 == len(file.Cases) {
		t.Fatal("the render matrix is empty")
	}

	for _, c := range file.Cases {
		t.Run(c.Name, func(t *testing.T) {
			if c.Posix && "windows" == runtime.GOOS {
				t.Skip("permission bits mean nothing here")
			}
			dir, err := filepath.EvalSymlinks(t.TempDir())
			if nil != err {
				t.Fatal(err)
			}
			matrixWrite(t, dir, c.Files)

			for n, step := range c.Steps {
				if nil != step.Edit || nil != step.Remove || nil != step.Chmod {
					matrixWrite(t, dir, step.Edit)
					for _, rel := range step.Remove {
						if err := os.Remove(filepath.Join(dir, filepath.FromSlash(rel))); nil != err {
							t.Fatal(err)
						}
					}
					for rel, mode := range step.Chmod {
						bits, err := strconv.ParseUint(mode, 8, 32)
						if nil != err {
							t.Fatal(err)
						}
						if err := os.Chmod(filepath.Join(dir, filepath.FromSlash(rel)),
							os.FileMode(bits)); nil != err {
							t.Fatal(err)
						}
					}
					continue
				}
				args := make([]string, 0, len(step.Args))
				for _, a := range step.Args {
					args = append(args, strings.ReplaceAll(a, "{dir}", dir))
				}
				out, errw, code := renderRunCLI(args...)
				at := c.Name + " step " + string(rune('1'+n))
				if nil != step.Out && matrixNorm(out, dir) != *step.Out {
					t.Fatalf("%s stdout: %q, want %q", at, matrixNorm(out, dir), *step.Out)
				}
				if nil != step.Err && matrixNorm(errw, dir) != *step.Err {
					t.Fatalf("%s stderr: %q, want %q", at, matrixNorm(errw, dir), *step.Err)
				}
				if nil != step.Code && code != *step.Code {
					t.Fatalf("%s exit code: %d, want %d", at, code, *step.Code)
				}
			}

			held := []string{}
			for _, rel := range matrixHeld(t, dir) {
				if _, input := c.Files[rel]; !input {
					held = append(held, rel)
				}
			}
			want := make([]string, 0, len(c.After))
			for rel := range c.After {
				want = append(want, rel)
			}
			sort.Strings(want)
			if strings.Join(held, "\n") != strings.Join(want, "\n") {
				t.Fatalf("%s: the tree holds %v, want %v", c.Name, held, want)
			}

			for rel, want := range c.After {
				got := "<absent>"
				if b, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(rel))); nil == err {
					got = string(b)
				}
				if got != want {
					t.Fatalf("%s: %s is %q, want %q", c.Name, rel, got, want)
				}
			}

			for rel, want := range c.AfterMode {
				st, err := os.Stat(filepath.Join(dir, filepath.FromSlash(rel)))
				if nil != err {
					t.Fatal(err)
				}
				if got := strconv.FormatUint(uint64(st.Mode().Perm()), 8); got != want {
					t.Fatalf("%s: %s mode is %s, want %s", c.Name, rel, got, want)
				}
			}
		})
	}
}

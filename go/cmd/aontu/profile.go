/* Copyright (c) 2026 Richard Rodger, MIT License */


package main

import (
	"io"
	"os"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

type profileLoader func(*aontu.Aontu, string) (map[string]any, []aontu.VetFinding)

func loadProfile(a *aontu.Aontu, src string) (map[string]any, []aontu.VetFinding) {
	return a.LoadProfile(src)
}

// loadProfiles is the profiles named by --profile, vetted, or the exit
// code that says why not. A profile is a language declared as data:
// template and fmt match one to a file by the extensions its
// template.ext names. render passes its own loader, vocabulary and all.
func loadProfiles(
	profileFiles []string, trust trustArg, stderr io.Writer, load profileLoader,
) ([]map[string]any, int) {
	profiles := []map[string]any{}
	langs := map[string]string{}
	for _, pf := range profileFiles {
		text, perr := os.ReadFile(pf)
		if nil != perr {
			io.WriteString(stderr,
				"aontu: cannot read "+pf+": "+perr.Error()+"\n")
			return nil, 2
		}
		profile, findings := load(aontuForFileTrust(pf, trust), string(text))
		if nil != findings {
			lines := []string{}
			for _, f := range findings {
				lines = append(lines, renderFinding(f))
			}
			io.WriteString(stderr, strings.Join(lines, "\n")+"\n")
			return nil, 4
		}
		lang, _ := profile["lang"].(string)
		if prev, dup := langs[lang]; dup {
			io.WriteString(stderr,
				"aontu: two profiles claim "+lang+": "+prev+" and "+pf+"\n")
			return nil, 2
		}
		langs[lang] = pf
		profiles = append(profiles, profile)
	}
	return profiles, 0
}

// templateMarker is the marker a supplied profile declares for the
// file, else the one its extension names.
func templateMarker(profiles []map[string]any, path string) string {
	if m := aontu.MarkerFromProfiles(profiles, path); "" != m {
		return m
	}
	return aontu.MarkerFor(path)
}

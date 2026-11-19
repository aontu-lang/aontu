/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"io"
	"sort"
	"strings"

	aontu "github.com/aontu-lang/aontu/go"
)

//go:embed helpdoc
var helpdocFS embed.FS

const helpVerbHelp = "aontu help [topic] (try `aontu help` for the topics)"

type helpTopic struct {
	File    string `json:"-"`
	Source  string `json:"source"`
	Summary string `json:"summary"`
	Topic   string `json:"topic"`
}

// helpTopics reads the generated index. The order is the file's, which
// is the order the generator lists and the order both ports print: a
// Go map has no order to trust, and an index that reordered itself
// between ports would be a parity divergence in the first thing an
// agent reads.
func helpTopics() []helpTopic {
	// The index is embedded and generated, so a read failure or a short
	// row is a broken build rather than a run-time condition.
	raw, err := helpdocFS.ReadFile("helpdoc/index.tsv")
	if nil != err { //coverage:ignore the file is embedded; absence fails the build
		return nil
	}
	var out []helpTopic
	for _, line := range strings.Split(string(raw), "\n") {
		if "" == line || strings.HasPrefix(line, "#") {
			continue
		}
		col := strings.Split(line, "\t")
		if 4 != len(col) { //coverage:ignore the generator writes four columns
			continue
		}
		out = append(out, helpTopic{
			Topic: col[0], File: col[1], Summary: col[2], Source: col[3],
		})
	}
	return out
}

func helpTopicText(t helpTopic) string {
	raw, err := helpdocFS.ReadFile("helpdoc/" + t.File)
	if nil != err { //coverage:ignore every indexed file is embedded beside the index
		return ""
	}
	return string(raw)
}

func runHelp(argv []string, stdout, stderr io.Writer) int {
	format := "text"
	var topics []string

	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		switch {
		case "-h" == arg, "--help" == arg:
			io.WriteString(stdout, helpText)
			return 0
		case "--format" == arg:
			i++
			if len(argv) <= i || ("text" != argv[i] && "json" != argv[i]) {
				io.WriteString(stderr, "aontu: --format needs text or json\n")
				return 2
			}
			format = argv[i]
		case strings.HasPrefix(arg, "-"):
			io.WriteString(stderr,
				"aontu: unknown help option "+arg+" (try --help)\n")
			return 2
		default:
			topics = append(topics, arg)
		}
	}

	if 1 < len(topics) {
		io.WriteString(stderr,
			"aontu: help takes one topic\n"+helpVerbHelp+"\n")
		return 2
	}

	index := helpTopics()

	if 0 == len(topics) {
		io.WriteString(stdout, renderHelpIndex(index, format)+"\n")
		return 0
	}

	name := topics[0]
	for _, t := range index {
		if name == t.Topic {
			if "json" == format {
				io.WriteString(stdout, renderHelpTopicJSON(t)+"\n")
				return 0
			}
			io.WriteString(stdout, helpTopicText(t))
			return 0
		}
	}

	// AN UNKNOWN TOPIC IS A USAGE ERROR AND NAMES THE ALTERNATIVES,
	// because the caller who typed it has no other way to find out what
	// exists -- that is the whole condition this verb was added for.
	io.WriteString(stderr,
		"aontu: no help topic `"+name+"`\n"+
			"aontu: topics are "+strings.Join(topicNames(index), ", ")+"\n")
	return 2
}

func topicNames(index []helpTopic) []string {
	out := make([]string, 0, len(index))
	for _, t := range index {
		out = append(out, t.Topic)
	}
	return out
}

func renderHelpIndex(index []helpTopic, format string) string {
	if "json" == format {
		return renderHelpIndexJSON(index)
	}
	width := 0
	for _, t := range index {
		if width < len(t.Topic) {
			width = len(t.Topic)
		}
	}
	var b strings.Builder
	b.WriteString("aontu help <topic> — the language, offline.\n\n")
	for _, t := range index {
		b.WriteString("  " + t.Topic +
			strings.Repeat(" ", width-len(t.Topic)) + "  " + t.Summary + "\n")
	}
	b.WriteString("\n" +
		"`aontu --help` documents the verbs, their flags and their exit\n" +
		"codes. `aontu explain <code>` explains one error code.\n" +
		"Start at `aontu help tasks` if you know the job but not the verb.")
	return b.String()
}

// The machine-readable forms. Field order is LEXICOGRAPHIC, the
// canonical emitter's order (see vetReportJSON).
type helpIndexJSON struct {
	Aontu  subsumeProducerJSON `json:"aontu"`
	Topics []helpTopic         `json:"topics"`
}

type helpTopicJSON struct {
	Aontu   subsumeProducerJSON `json:"aontu"`
	Source  string              `json:"source"`
	Summary string              `json:"summary"`
	Text    string              `json:"text"`
	Topic   string              `json:"topic"`
}

func helpJSON(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	// Encode cannot fail here: every field is a string or a slice of
	// structs of strings.
	_ = enc.Encode(v)
	return strings.TrimSuffix(buf.String(), "\n")
}

func renderHelpIndexJSON(index []helpTopic) string {
	return helpJSON(helpIndexJSON{
		Aontu:  subsumeProducerJSON{Verb: "help", Version: aontu.VERSION},
		Topics: index,
	})
}

func renderHelpTopicJSON(t helpTopic) string {
	return helpJSON(helpTopicJSON{
		Aontu:   subsumeProducerJSON{Verb: "help", Version: aontu.VERSION},
		Source:  t.Source,
		Summary: t.Summary,
		Text:    helpTopicText(t),
		Topic:   t.Topic,
	})
}

// NEAREST-VERB SUGGESTION (G11 phase 2). Restricted Damerau-Levenshtein
// over the verb list, with a distance cap that scales with the word:
// an unbounded nearest match on a three-letter typo suggests something
// unrelated with confidence, which is worse than suggesting nothing.
func nearestVerb(word string, verbs []string) string {
	best, bestDist := "", 1<<30
	// The cap grows with the word and stops at three: one edit is a
	// convincing suggestion on any length, three is the most that can
	// be believed on a long one, and an UNCAPPED nearest match on a
	// three-letter typo names something unrelated with confidence.
	limit := 1 + len(word)/4
	if 3 < limit {
		limit = 3
	}
	// Sorted, so a tie resolves the same way in both ports rather than
	// by whatever order the verb table happens to be written in.
	sorted := append([]string(nil), verbs...)
	sort.Strings(sorted)
	for _, v := range sorted {
		d := editDistance(strings.ToLower(word), v)
		if d < bestDist {
			best, bestDist = v, d
		}
	}
	if bestDist > limit {
		return ""
	}
	return best
}

func editDistance(a, b string) int {
	ar, br := []rune(a), []rune(b)
	prev2 := make([]int, len(br)+1)
	prev := make([]int, len(br)+1)
	cur := make([]int, len(br)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ar); i++ {
		cur[0] = i
		for j := 1; j <= len(br); j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			m := prev[j] + 1
			if cur[j-1]+1 < m {
				m = cur[j-1] + 1
			}
			if prev[j-1]+cost < m {
				m = prev[j-1] + cost
			}
			if 1 < i && 1 < j && ar[i-1] == br[j-2] && ar[i-2] == br[j-1] &&
				prev2[j-2]+1 < m {
				m = prev2[j-2] + 1
			}
			cur[j] = m
		}
		copy(prev2, prev)
		copy(prev, cur)
	}
	return prev[len(br)]
}

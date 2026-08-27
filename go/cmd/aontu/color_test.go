/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The command's half of the colour gate (the review's finding F): the
// library honours NO_COLOR, and only the command can see whether its
// stderr is a terminal. The TypeScript twin is the `setColor(true ===
// process.stderr.isTTY ? undefined : false)` call in ts/src/cli.ts.

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	aontu "github.com/rjrodger/aontu/go"
)

func TestColorForDestination(t *testing.T) {
	// A character device is the one destination that gets to keep the
	// default: nil means "leave it to NO_COLOR".
	dev, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer dev.Close()
	if nil != colorFor(dev) {
		t.Fatal("a character device should defer to NO_COLOR")
	}

	// A redirect to a file is not a terminal, whatever the shell that
	// made it looked like.
	reg, err := os.Create(filepath.Join(t.TempDir(), "out.txt"))
	if err != nil {
		t.Fatal(err)
	}
	defer reg.Close()
	if on := colorFor(reg); nil == on || *on {
		t.Fatal("a regular file should force colour off")
	}

	// Neither is a pipe, nor the in-memory buffer every test in this
	// package hands run() -- which is why the suite's own output has
	// never carried escapes.
	if on := colorFor(&bytes.Buffer{}); nil == on || *on {
		t.Fatal("a non-file writer should force colour off")
	}

	// A closed file cannot answer, and an unanswerable destination is
	// treated as not-a-terminal rather than assumed to be one.
	closed, err := os.Create(filepath.Join(t.TempDir(), "closed.txt"))
	if err != nil {
		t.Fatal(err)
	}
	closed.Close()
	if on := colorFor(closed); nil == on || *on {
		t.Fatal("an unstattable file should force colour off")
	}
}

// run() applies the gate for every verb, and --jsonl hardens it: a
// JSONL answer is machine-read by definition, even in a session that
// happens to be attached to a terminal.
func TestRunGatesColor(t *testing.T) {
	defer aontu.SetColor(nil)

	on := true
	aontu.SetColor(&on)

	dir := t.TempDir()
	file := filepath.Join(dir, "conflict.aon")
	if err := os.WriteFile(file, []byte("a:1\na:2\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var stdout, stderr bytes.Buffer
	code := run([]string{file}, strings.NewReader(""), &stdout, &stderr, false)
	if 0 == code {
		t.Fatal("expected a conflict")
	}
	if strings.Contains(stderr.String()+stdout.String(), "\x1b[") {
		t.Fatalf("escapes reached a buffer:\n%s%s", stdout.String(), stderr.String())
	}

	// --jsonl forces it off even before the destination is consulted,
	// so a harness never has to strip escapes out of an answer string.
	aontu.SetColor(&on)
	stdout.Reset()
	stderr.Reset()
	run([]string{"--jsonl"},
		strings.NewReader(":load "+file+"\n"), &stdout, &stderr, true)
	if strings.Contains(stdout.String()+stderr.String(), "\x1b[") {
		t.Fatalf("escapes reached a jsonl answer:\n%s%s",
			stdout.String(), stderr.String())
	}
}

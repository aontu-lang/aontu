/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE GO SIDE OF THE DIFFERENTIAL SUITE (G10 phase 2). The vectors in
// ../test/vectors/tlog.json were produced by the PINNED upstream
// golang.org/x/mod/sumdb/tlog, and aontu-lang/mod's TypeScript port is
// held to them. This file holds THIS port to the same bytes.
//
// A fair question: go/tlog.go imports the very package that generated
// the vectors, so what does running them here prove? Three things the
// TypeScript side cannot prove on its own.
//
//  1. THE BOUNDARY. Everything reaching aontu is base64 text, and the
//     glue decodes it. A vector that passes in TypeScript and fails
//     here is a conversion bug, and conversion is where this file's
//     code actually lives.
//  2. THE PIN HOLDS IN THIS MODULE. aontu/go declares go 1.24.7 and CI
//     runs a 1.24 job; x/mod raised its own floor to 1.25.0 at v0.34.0.
//     These tests failing to COMPILE is how a careless dependency bump
//     announces itself.
//  3. THE TWO PORTS READ THE SAME FILE. The vectors are one artifact
//     copied into two repositories. Checking the copy here is what
//     stops it drifting into a second, agreeable set of numbers.
//
// And one part is not upstream at all: TlogParseTree is implemented
// rather than wrapped, because upstream's hardcodes go.sum's origin
// line. That function has no upstream to agree with, so its rows are
// the only ones here testing aontu's own code end to end.

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type tlogVectors struct {
	Upstream     string   `json:"upstream"`
	StoredHashes []string `json:"storedHashes"`

	RecordHash []struct {
		Data string `json:"data"`
		Hash string `json:"hash"`
	} `json:"recordHash"`

	NodeHash []struct {
		Left  string `json:"left"`
		Right string `json:"right"`
		Hash  string `json:"hash"`
	} `json:"nodeHash"`

	StoredHashIndex []struct {
		Level int   `json:"level"`
		N     int64 `json:"n"`
		Index int64 `json:"index"`
	} `json:"storedHashIndex"`

	StoredHashCount []struct {
		N     int64 `json:"n"`
		Count int64 `json:"count"`
	} `json:"storedHashCount"`

	TreeHash []struct {
		N    int64  `json:"n"`
		Root string `json:"root"`
	} `json:"treeHash"`

	CheckRecord []struct {
		Name  string   `json:"name"`
		T     int64    `json:"t"`
		Th    string   `json:"th"`
		N     int64    `json:"n"`
		H     string   `json:"h"`
		Proof []string `json:"proof"`
		Want  bool     `json:"want"`
	} `json:"checkRecord"`

	CheckTree []struct {
		Name  string   `json:"name"`
		T     int64    `json:"t"`
		Th    string   `json:"th"`
		N     int64    `json:"n"`
		H     string   `json:"h"`
		Proof []string `json:"proof"`
		Want  bool     `json:"want"`
	} `json:"checkTree"`

	TilePath []struct {
		H    int    `json:"h"`
		L    int    `json:"l"`
		N    int64  `json:"n"`
		W    int    `json:"w"`
		Path string `json:"path"`
	} `json:"tilePath"`

	TileForIndex []struct {
		H     int    `json:"h"`
		Index int64  `json:"index"`
		L     int    `json:"tileL"`
		N     int64  `json:"tileN"`
		W     int    `json:"tileW"`
		Path  string `json:"path"`
	} `json:"tileForIndex"`

	Note struct {
		VerifierKey string `json:"verifierKey"`
		Name        string `json:"name"`
		Signed      []struct {
			Name string `json:"name"`
			Text string `json:"text"`
			Msg  string `json:"msg"`
			Want bool   `json:"want"`
		} `json:"signed"`
		Trees []struct {
			Text   string `json:"text"`
			Origin string `json:"origin"`
			N      int64  `json:"n"`
			Hash   string `json:"hash"`
			Want   bool   `json:"want"`
		} `json:"trees"`
		Malformed []struct {
			Name string `json:"name"`
			Msg  string `json:"msg"`
		} `json:"malformed"`
	} `json:"note"`
}

func loadTlogVectors(t *testing.T) tlogVectors {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "test", "vectors", "tlog.json"))
	if nil != err {
		t.Fatal(err)
	}
	var v tlogVectors
	if err := json.Unmarshal(data, &v); nil != err {
		t.Fatal(err)
	}
	return v
}

// TestTlogVectorsAreUpstreams pins WHICH upstream produced this file.
// A vector set that does not say cannot be re-derived, and a stale one
// would be indistinguishable from a fresh one.
func TestTlogVectorsAreUpstreams(t *testing.T) {
	v := loadTlogVectors(t)
	if "golang.org/x/mod@v0.32.0 sumdb/tlog" != v.Upstream {
		t.Fatalf("vectors from %q; the pin moved without the file being regenerated",
			v.Upstream)
	}
	if 0 == len(v.StoredHashes) {
		t.Fatal("no stored hashes")
	}
}

func TestTlogHashing(t *testing.T) {
	v := loadTlogVectors(t)

	for _, c := range v.RecordHash {
		data, err := base64.StdEncoding.DecodeString(c.Data)
		if nil != err {
			t.Fatal(err)
		}
		if got := TlogRecordHash(data); c.Hash != got {
			t.Fatalf("recordHash(%q) = %s, want %s", c.Data, got, c.Hash)
		}
	}

	for _, c := range v.NodeHash {
		got, err := TlogNodeHash(c.Left, c.Right)
		if nil != err || c.Hash != got {
			t.Fatalf("nodeHash = %s (%v), want %s", got, err, c.Hash)
		}
	}

	// A hash that is not 32 bytes is refused at the boundary, where it
	// arrives, rather than deeper where the refusal is harder to place.
	for _, bad := range []string{"", "AAAA", base64.StdEncoding.EncodeToString(
		make([]byte, 33))} {
		if _, err := TlogNodeHash(bad, v.NodeHash[0].Right); nil == err {
			t.Fatalf("nodeHash accepted a malformed left hash %q", bad)
		}
		if _, err := TlogNodeHash(v.NodeHash[0].Left, bad); nil == err {
			t.Fatalf("nodeHash accepted a malformed right hash %q", bad)
		}
	}
}

func TestTlogStoredHashAddressing(t *testing.T) {
	v := loadTlogVectors(t)
	for _, c := range v.StoredHashIndex {
		if got := TlogStoredHashIndex(c.Level, c.N); c.Index != got {
			t.Fatalf("storedHashIndex(%d, %d) = %d, want %d",
				c.Level, c.N, got, c.Index)
		}
	}
	for _, c := range v.StoredHashCount {
		if got := TlogStoredHashCount(c.N); c.Count != got {
			t.Fatalf("storedHashCount(%d) = %d, want %d", c.N, got, c.Count)
		}
	}
}

func TestTlogTreeHash(t *testing.T) {
	v := loadTlogVectors(t)
	read := func(indexes []int64) ([]string, error) {
		out := make([]string, 0, len(indexes))
		for _, i := range indexes {
			out = append(out, v.StoredHashes[i])
		}
		return out, nil
	}

	for _, c := range v.TreeHash {
		got, err := TlogTreeHash(c.N, read)
		if nil != err || c.Root != got {
			t.Fatalf("treeHash(%d) = %s (%v), want %s", c.N, got, err, c.Root)
		}
	}

	// A reader that answers with a malformed hash must not be able to
	// make treeHash compute a root out of whatever it did send.
	if _, err := TlogTreeHash(13, func([]int64) ([]string, error) {
		return []string{"AAAA", "AAAA", "AAAA"}, nil
	}); nil == err {
		t.Fatal("treeHash accepted malformed stored hashes")
	}

	// And a reader that FAILS -- a tile fetch that 404s, which is the
	// ordinary way this goes wrong in a real client -- surfaces as an
	// error rather than a root computed from nothing.
	if _, err := TlogTreeHash(13, func([]int64) ([]string, error) {
		return nil, errors.New("tile fetch failed")
	}); nil == err {
		t.Fatal("treeHash accepted a reader that failed")
	}
}

// TestTlogCheckRecord and TestTlogCheckTree are the ones that matter.
// 214 of the 268 inclusion cases and 160 of the 200 consistency cases
// expect REJECTION -- a verifier that returned true unconditionally
// would pass every positive case and fail 374 others.
func TestTlogCheckRecord(t *testing.T) {
	v := loadTlogVectors(t)
	accepted, rejected := 0, 0
	for _, c := range v.CheckRecord {
		got := TlogCheckRecord(c.Proof, c.T, c.Th, c.N, c.H)
		if c.Want != got {
			t.Fatalf("checkRecord %s = %v, want %v", c.Name, got, c.Want)
		}
		if c.Want {
			accepted++
		} else {
			rejected++
		}
	}
	// The balance is itself the assertion: a suite that drifted to all
	// acceptances would stop testing the thing that matters.
	if 0 == accepted || accepted*2 >= rejected {
		t.Fatalf("vector balance: %d accept, %d reject", accepted, rejected)
	}
}

func TestTlogCheckTree(t *testing.T) {
	v := loadTlogVectors(t)
	accepted, rejected := 0, 0
	for _, c := range v.CheckTree {
		got := TlogCheckTree(c.Proof, c.T, c.Th, c.N, c.H)
		if c.Want != got {
			t.Fatalf("checkTree %s = %v, want %v", c.Name, got, c.Want)
		}
		if c.Want {
			accepted++
		} else {
			rejected++
		}
	}
	if 0 == accepted || accepted*2 >= rejected {
		t.Fatalf("vector balance: %d accept, %d reject", accepted, rejected)
	}
}

// TestTlogCheckRefusesMalformedInput pins the bool contract: a hash
// that does not decode is a proof that does not verify, not an
// exception. A caller cannot ignore this into an accept.
func TestTlogCheckRefusesMalformedInput(t *testing.T) {
	v := loadTlogVectors(t)
	ok := v.CheckRecord[0]
	if !ok.Want {
		t.Fatal("expected the first inclusion vector to be an accepting one")
	}

	if TlogCheckRecord(ok.Proof, ok.T, "AAAA", ok.N, ok.H) {
		t.Fatal("checkRecord accepted a malformed root")
	}
	if TlogCheckRecord(ok.Proof, ok.T, ok.Th, ok.N, "AAAA") {
		t.Fatal("checkRecord accepted a malformed leaf")
	}
	if TlogCheckRecord([]string{"AAAA"}, ok.T, ok.Th, ok.N, ok.H) {
		t.Fatal("checkRecord accepted a malformed proof")
	}
	// Out of bounds is a rejection, not a panic: the numbers came off
	// the wire.
	if TlogCheckRecord(nil, 3, ok.Th, 3, ok.H) {
		t.Fatal("checkRecord accepted a record outside the tree")
	}
	if TlogCheckTree(nil, 3, ok.Th, 4, ok.H) {
		t.Fatal("checkTree accepted a prefix larger than the tree")
	}
	if TlogCheckTree([]string{"AAAA"}, 3, ok.Th, 2, ok.H) {
		t.Fatal("checkTree accepted a malformed proof")
	}
	if TlogCheckTree(nil, 3, "AAAA", 2, ok.H) {
		t.Fatal("checkTree accepted a malformed new root")
	}
	if TlogCheckTree(nil, 3, ok.Th, 2, "AAAA") {
		t.Fatal("checkTree accepted a malformed old root")
	}
}

func TestTlogTiles(t *testing.T) {
	v := loadTlogVectors(t)

	for _, c := range v.TilePath {
		tile := TlogTile{H: c.H, L: c.L, N: c.N, W: c.W}
		if got := TlogTilePath(tile); c.Path != got {
			t.Fatalf("tilePath = %s, want %s", got, c.Path)
		}
		back, err := TlogParseTilePath(c.Path)
		if nil != err || back != tile {
			t.Fatalf("parseTilePath(%s) = %+v (%v), want %+v",
				c.Path, back, err, tile)
		}
	}

	for _, c := range v.TileForIndex {
		got, err := TlogTileForIndex(c.H, c.Index)
		want := TlogTile{H: c.H, L: c.L, N: c.N, W: c.W}
		if nil != err || got != want {
			t.Fatalf("tileForIndex(%d, %d) = %+v (%v), want %+v",
				c.H, c.Index, got, err, want)
		}
	}

	// A malformed path and an impossible height are refused.
	for _, bad := range []string{"", "tile", "tile/2/0/00", "tile/0/0/000"} {
		if _, err := TlogParseTilePath(bad); nil == err {
			t.Fatalf("parseTilePath accepted %q", bad)
		}
	}
	if _, err := TlogTileForIndex(0, 0); nil == err {
		t.Fatal("tileForIndex accepted height 0")
	}
	if _, err := TlogNewTiles(0, 0, 1); nil == err {
		t.Fatal("newTiles accepted height 0")
	}

	// Growth publishes tiles, and every one has a path that parses back
	// to itself -- otherwise a publisher writes objects no client can
	// name.
	tiles, err := TlogNewTiles(2, 0, 8)
	if nil != err || 0 == len(tiles) {
		t.Fatalf("newTiles(2, 0, 8) = %v (%v)", tiles, err)
	}
	for _, tile := range tiles {
		back, err := TlogParseTilePath(TlogTilePath(tile))
		if nil != err || back != tile {
			t.Fatalf("tile %+v does not round-trip through its path", tile)
		}
	}
	if empty, err := TlogNewTiles(2, 8, 8); nil != err || 0 != len(empty) {
		t.Fatalf("a tree that did not grow publishes nothing, got %v", empty)
	}

	// And a hash reads back out of its tile, including one above the
	// leaf level, which the tile does not store and must recompute.
	index := TlogStoredHashIndex(1, 0)
	tile, err := TlogTileForIndex(2, index)
	if nil != err {
		t.Fatal(err)
	}
	tile.W = 1 << tile.H
	data := make([]byte, 0, tile.W*TlogHashSize)
	for i := 0; i < tile.W; i++ {
		h, err := base64.StdEncoding.DecodeString(
			v.StoredHashes[TlogStoredHashIndex(tile.L*tile.H,
				tile.N*int64(1<<tile.H)+int64(i))])
		if nil != err {
			t.Fatal(err)
		}
		data = append(data, h...)
	}
	got, err := TlogHashFromTile(tile, data, index)
	if nil != err || v.StoredHashes[index] != got {
		t.Fatalf("hashFromTile = %s (%v), want %s",
			got, err, v.StoredHashes[index])
	}
	if _, err := TlogHashFromTile(tile, data[:TlogHashSize], index); nil == err {
		t.Fatal("hashFromTile accepted a tile too short for its width")
	}
}

func TestTlogNotes(t *testing.T) {
	v := loadTlogVectors(t)
	known := []string{v.Note.VerifierKey}

	for _, c := range v.Note.Signed {
		text, signed, err := TlogOpenNote(c.Msg, known)
		if c.Want {
			if nil != err || c.Text != text ||
				1 != len(signed) || v.Note.Name != signed[0] {
				t.Fatalf("openNote %s = %q %v (%v)", c.Name, text, signed, err)
			}
			continue
		}
		// A BAD signature by a KNOWN key is an error, not an empty
		// verified list: the difference between "nobody I know signed
		// this" and "someone I know signed something else".
		if nil == err {
			t.Fatalf("openNote accepted %s", c.Name)
		}
	}

	for _, c := range v.Note.Malformed {
		if _, _, err := TlogOpenNote(c.Msg, known); nil == err {
			t.Fatalf("openNote accepted malformed note %s", c.Name)
		}
	}

	// A note NOBODY KNOWN SIGNED IS AN ERROR, not an empty verified
	// list. Upstream draws this line and aontu follows it, against the
	// first draft of the TypeScript port, which opened such a note with
	// `verified: []` and left the caller to notice.
	//
	// Three reasons the error is right. It forces handling, where a
	// doc comment saying "check the list" does not. It keeps this file
	// a thin wrapper, which is its entire premise. And it costs the
	// witness story nothing: a checkpoint always carries the LOG's own
	// signature, which the client knows by construction, so a usable
	// note always has at least one verified signer -- the zero case
	// only arises for a note the client cannot act on anyway.
	//
	// Unknown signers ALONGSIDE a known one are still skipped, which is
	// what actually makes cosignatures additive; that is the case
	// above, not this one.
	if _, _, err := TlogOpenNote(v.Note.Signed[0].Msg, nil); nil == err {
		t.Fatal("a note no known key signed must be refused, not opened empty")
	}

	// A verifier key that does not parse is refused before any note is.
	if _, _, err := TlogOpenNote(v.Note.Signed[0].Msg,
		[]string{"not-a-key"}); nil == err {
		t.Fatal("openNote accepted a malformed verifier key")
	}
}

// TestTlogParseTree is the one family here testing code with no
// upstream to agree with: upstream's ParseTree hardcodes go.sum's
// origin line, so this is aontu's own (see go/tlog.go). The vectors
// still come from the generator, so both ports are held to the same
// answers about which spellings of a tree size are legal.
func TestTlogParseTree(t *testing.T) {
	v := loadTlogVectors(t)
	for _, c := range v.Note.Trees {
		n, hash, err := TlogParseTree(c.Text, c.Origin)
		if c.Want {
			if nil != err || c.N != n || c.Hash != hash {
				t.Fatalf("parseTree(%q) = %d %s (%v), want %d %s",
					c.Text, n, hash, err, c.N, c.Hash)
			}
			continue
		}
		if nil == err {
			t.Fatalf("parseTree accepted %q", c.Text)
		}
	}

	// Extra lines are IGNORED for forwards compatibility: that rule is
	// what lets a later version add lines without invalidating today's
	// clients.
	ok := v.Note.Trees[0]
	n, hash, err := TlogParseTree(ok.Text+"extra\nmore\n", ok.Origin)
	if nil != err || ok.N != n || ok.Hash != hash {
		t.Fatalf("extra checkpoint lines should be ignored: %d %s (%v)",
			n, hash, err)
	}

	// A body longer than the bound is refused rather than parsed.
	huge := ok.Text
	for len(huge) <= 1e6 {
		huge += "padding\n"
	}
	if _, _, err := TlogParseTree(huge, ok.Origin); nil == err {
		t.Fatal("parseTree accepted an oversized checkpoint")
	}

	// And a body with too few lines.
	if _, _, err := TlogParseTree(ok.Origin+"\n13\n", ok.Origin); nil == err {
		t.Fatal("parseTree accepted a truncated checkpoint")
	}

	// A body whose SIZE is well formed but whose ROOT is not. The
	// generated vectors cover bad sizes and a wrong origin; a bad hash
	// is aontu's own arm and is pinned here.
	for _, badRoot := range []string{"AAAA", "", "not base64!"} {
		if _, _, err := TlogParseTree(
			ok.Origin+"\n13\n"+badRoot+"\n", ok.Origin); nil == err {
			t.Fatalf("parseTree accepted the root %q", badRoot)
		}
	}
}

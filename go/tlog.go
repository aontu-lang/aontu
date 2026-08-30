/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE TRANSPARENCY-LOG CLIENT, GO SIDE (G10 phase 2,
// docs/capability-review/g10-transparency.md).
//
// THIS IS NOT A PORT, AND THAT IS THE DESIGN. The TypeScript side
// (aontu-lang/mod) translates golang.org/x/mod/sumdb/tlog because
// TypeScript has no such library; Go has the real one, written by the
// people who run Go's own checksum database, so this file IMPORTS it
// and adds only the boundary conversion aontu needs.
//
// The consequence is the point: the differential suite compares
// aontu's TypeScript against genuine upstream Go, not against a second
// reading of the same specification by the same author. Two ports of
// one document agree about the document's ambiguities; a port and its
// source do not.
//
// WHAT THE BOUNDARY IS. Upstream speaks `tlog.Hash` ([32]byte);
// everything that reaches aontu from a lockfile, a checkpoint or the
// wire is BASE64 TEXT. So these functions take and return strings, and
// the decode is one place rather than every call site. A malformed
// hash is refused here, where it arrives, rather than deeper where the
// refusal would be harder to attribute.
//
// ONLY THE VERIFYING HALF is exposed, matching the TypeScript side:
// no ProveRecord, no ProveTree, no signing. A client checks; a log
// proves. Upstream's provers remain importable by anything that
// genuinely needs them -- a log implementation -- and are simply not
// part of what aontu offers a consumer.

import (
	"encoding/base64"
	"errors"
	"strconv"
	"strings"

	"golang.org/x/mod/sumdb/note"
	"golang.org/x/mod/sumdb/tlog"
)

// TlogHashSize is the byte length of every hash in the log.
const TlogHashSize = tlog.HashSize

var errTlogHash = errors.New("tlog: malformed hash")

// tlogParseHash decodes one base64 hash, refusing anything that is not
// exactly HashSize bytes. Upstream's ParseHash does the same; this
// wrapper exists so the error is aontu's and reads the same as the
// TypeScript side's.
func tlogParseHash(s string) (tlog.Hash, error) {
	b, err := base64.StdEncoding.DecodeString(s)
	if nil != err || tlog.HashSize != len(b) {
		return tlog.Hash{}, errTlogHash
	}
	var h tlog.Hash
	copy(h[:], b)
	return h, nil
}

func tlogParseHashes(ss []string) ([]tlog.Hash, error) {
	out := make([]tlog.Hash, 0, len(ss))
	for _, s := range ss {
		h, err := tlogParseHash(s)
		if nil != err {
			return nil, err
		}
		out = append(out, h)
	}
	return out, nil
}

// TlogFormatHash is a hash as the wire and the lockfile spell it:
// STANDARD base64 with padding, which is what tlog.Hash.String does.
// Note that the canon-hash uses base64URL without padding -- two
// encodings live in this ecosystem, and confusing them produces a
// string that looks right and compares wrong.
func TlogFormatHash(h tlog.Hash) string {
	return h.String()
}

// TlogRecordHash is the leaf hash of a record: SHA-256(0x00 || data),
// RFC 6962 §2.1.
func TlogRecordHash(data []byte) string {
	return TlogFormatHash(tlog.RecordHash(data))
}

// TlogNodeHash is the hash of an interior node:
// SHA-256(0x01 || left || right).
func TlogNodeHash(left, right string) (string, error) {
	l, err := tlogParseHash(left)
	if nil != err {
		return "", err
	}
	r, err := tlogParseHash(right)
	if nil != err {
		return "", err
	}
	return TlogFormatHash(tlog.NodeHash(l, r)), nil
}

// TlogStoredHashIndex is the dense storage index of level L's n'th
// hash, and TlogStoredHashCount how many a tree of n records has.
// Exposed because a client that reads tiles needs to address them, and
// because the shared vectors pin them: this arithmetic is where a
// JavaScript port silently truncates to 32 bits, so both sides are
// held to the same answers past 2^31.
func TlogStoredHashIndex(level int, n int64) int64 {
	return tlog.StoredHashIndex(level, n)
}

func TlogStoredHashCount(n int64) int64 {
	return tlog.StoredHashCount(n)
}

// TlogTreeHash is the root of the tree with n records, reading stored
// hashes through the supplied function.
//
// The reader is a plain func rather than upstream's interface: aontu's
// callers supply a closure over a tile fetch or a test fixture, and an
// interface with one method is ceremony around that.
func TlogTreeHash(n int64, read func(indexes []int64) ([]string, error)) (
	string, error) {
	h, err := tlog.TreeHash(n, tlog.HashReaderFunc(
		func(indexes []int64) ([]tlog.Hash, error) {
			ss, err := read(indexes)
			if nil != err {
				return nil, err
			}
			return tlogParseHashes(ss)
		}))
	if nil != err {
		return "", err
	}
	return TlogFormatHash(h), nil
}

// TlogCheckRecord answers whether p proves that the tree of size t with
// root th has an n'th record whose leaf hash is h.
//
// BOOL, NOT ERROR, and deliberately against Go's grain. Upstream
// returns an error, and an error return invites `if err != nil` at the
// call site -- which is correct, but it also invites the call site that
// forgets, and a forgotten proof check reads as a passed one. A bool
// cannot be ignored into an accept. Every malformed input is `false`
// for the same reason: a hash that does not decode is not an
// exceptional condition, it is a proof that does not verify.
func TlogCheckRecord(p []string, t int64, th string, n int64, h string) bool {
	proof, err := tlogParseHashes(p)
	if nil != err {
		return false
	}
	root, err := tlogParseHash(th)
	if nil != err {
		return false
	}
	leaf, err := tlogParseHash(h)
	if nil != err {
		return false
	}
	if t < 0 || n < 0 || n >= t {
		return false
	}
	return nil == tlog.CheckRecord(proof, t, root, n, leaf)
}

// TlogCheckTree answers whether p proves that the tree of size t with
// root th contains, as a prefix, the tree of size n with root h. Bool
// for the reason TlogCheckRecord is.
func TlogCheckTree(p []string, t int64, th string, n int64, h string) bool {
	proof, err := tlogParseHashes(p)
	if nil != err {
		return false
	}
	newRoot, err := tlogParseHash(th)
	if nil != err {
		return false
	}
	oldRoot, err := tlogParseHash(h)
	if nil != err {
		return false
	}
	if t < 1 || n < 1 || n > t {
		return false
	}
	return nil == tlog.CheckTree(proof, t, newRoot, n, oldRoot)
}

// TlogTile is a tile's coordinates: height, level, number and width.
type TlogTile struct {
	H int
	L int
	N int64
	W int
}

func (t TlogTile) upstream() tlog.Tile {
	return tlog.Tile{H: t.H, L: t.L, N: t.N, W: t.W}
}

func tlogTileOf(t tlog.Tile) TlogTile {
	return TlogTile{H: t.H, L: t.L, N: t.N, W: t.W}
}

// TlogTileForIndex is the tile of height h holding a stored-hash index.
func TlogTileForIndex(h int, index int64) (TlogTile, error) {
	if h <= 0 {
		return TlogTile{}, errors.New("tlog: invalid tile height")
	}
	return tlogTileOf(tlog.TileForIndex(h, index)), nil
}

// TlogTilePath is the path a tile is served at, and TlogParseTilePath
// its inverse. The path encoding is part of the FORMAT, not of any one
// server: a client that computes a different path fetches a 404 and
// calls it a missing tile, so both ports are pinned to upstream's.
func TlogTilePath(t TlogTile) string {
	return t.upstream().Path()
}

func TlogParseTilePath(path string) (TlogTile, error) {
	t, err := tlog.ParseTilePath(path)
	if nil != err {
		return TlogTile{}, err
	}
	return tlogTileOf(t), nil
}

// TlogHashFromTile reads the hash at a stored-hash index out of a
// tile's bytes, recomputing it from the leaves below when the index
// names an interior node.
func TlogHashFromTile(t TlogTile, data []byte, index int64) (string, error) {
	h, err := tlog.HashFromTile(t.upstream(), data, index)
	if nil != err {
		return "", err
	}
	return TlogFormatHash(h), nil
}

// TlogNewTiles is the tiles that must be published when the tree grows
// from oldTreeSize to newTreeSize.
func TlogNewTiles(h int, oldTreeSize, newTreeSize int64) ([]TlogTile, error) {
	if h <= 0 {
		return nil, errors.New("tlog: invalid tile height")
	}
	out := []TlogTile{}
	for _, t := range tlog.NewTiles(h, oldTreeSize, newTreeSize) {
		out = append(out, tlogTileOf(t))
	}
	return out, nil
}

// TlogOpenNote verifies a signed note against the verifier keys the
// caller trusts, answering the NAMES of the keys whose signatures
// checked out.
//
// A LIST, NOT A BOOLEAN, matching the TypeScript side and for the same
// reason: the list may be empty -- a well-formed note none of whose
// signers are known -- and a caller that treats "opened" as "trusted"
// has skipped the check. The K-of-N witness policy G10 phase 6
// describes is a predicate over this list, which is why it is a list.
//
// An unknown signer is skipped rather than refused, so a note can
// gather cosignatures over time without breaking clients that predate
// them; a signature by a KNOWN key that does not verify is an error,
// because that is an attack rather than an unfamiliar witness.
func TlogOpenNote(msg string, verifierKeys []string) (
	text string, signedBy []string, err error) {
	vs := []note.Verifier{}
	for _, k := range verifierKeys {
		v, err := note.NewVerifier(k)
		if nil != err {
			return "", nil, err
		}
		vs = append(vs, v)
	}
	n, err := note.Open([]byte(msg), note.VerifierList(vs...))
	if nil != err {
		return "", nil, err
	}
	names := []string{}
	for _, s := range n.Sigs {
		names = append(names, s.Name)
	}
	return n.Text, names, nil
}

// TlogParseTree reads a checkpoint body -- an origin line, a decimal
// size, a base64 root -- answering the size and root it states.
//
// WHY THIS IS IMPLEMENTED RATHER THAN WRAPPED, in a file whose whole
// premise is that Go already has the real thing: upstream's
// tlog.ParseTree hardcodes the prefix "go.sum database tree\n" and
// refuses every other origin (probed: an "aontu.example/transparency"
// body returns "malformed tree note"). It parses GO'S checkpoint, not
// a checkpoint. A log with its own origin line -- which is what the
// C2SP checkpoint format is, and what aontu's log will be -- cannot
// use it at all.
//
// So this is the one place the Go side reimplements rather than
// imports, and it is written to match ts side's parseTree exactly,
// because the two must agree about which spellings of a tree size are
// legal.
//
// The origin is CHECKED, not merely skipped: a checkpoint from another
// log is a well-formed checkpoint, and accepting one under this log's
// name is how a client ends up verifying proofs against a tree that
// never contained its module.
func TlogParseTree(text string, origin string) (int64, string, error) {
	if 1e6 < len(text) {
		return 0, "", errTlogTree
	}
	lines := strings.Split(text, "\n")
	// Origin, size, root, and the terminating newline's empty field --
	// so four, and anything after them is IGNORED for forwards
	// compatibility, which is what lets a later version add lines
	// without invalidating today's clients.
	if 4 > len(lines) || origin != lines[0] {
		return 0, "", errTlogTree
	}

	n, err := strconv.ParseInt(lines[1], 10, 64)
	// The round-trip is the check that matters: it refuses "007", "+7"
	// and " 7", which parse as 7 and would give one tree size several
	// spellings -- and a checkpoint is compared as TEXT by witnesses and
	// gossip, so two spellings would be two checkpoints.
	if nil != err || 0 > n || lines[1] != strconv.FormatInt(n, 10) {
		return 0, "", errTlogTree
	}

	h, err := tlogParseHash(lines[2])
	if nil != err {
		return 0, "", errTlogTree
	}

	return n, TlogFormatHash(h), nil
}

var errTlogTree = errors.New("tlog: malformed tree note")

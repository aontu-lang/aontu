/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu


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

func TlogStoredHashIndex(level int, n int64) int64 {
	return tlog.StoredHashIndex(level, n)
}

func TlogStoredHashCount(n int64) int64 {
	return tlog.StoredHashCount(n)
}

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

func TlogParseTree(text string, origin string) (int64, string, error) {
	if 1e6 < len(text) {
		return 0, "", errTlogTree
	}
	lines := strings.Split(text, "\n")
	if 4 > len(lines) || origin != lines[0] {
		return 0, "", errTlogTree
	}

	n, err := strconv.ParseInt(lines[1], 10, 64)
	if nil != err || 0 > n || tlogMaxTreeSize < n ||
		lines[1] != strconv.FormatInt(n, 10) {
		return 0, "", errTlogTree
	}

	h, err := tlogParseHash(lines[2])
	if nil != err {
		return 0, "", errTlogTree
	}

	return n, TlogFormatHash(h), nil
}

var errTlogTree = errors.New("tlog: malformed tree note")

// tlogMaxTreeSize is the largest integer a TypeScript number holds
// exactly. A checkpoint past it is refused here as it is there, rather
// than accepted by one port alone.
const tlogMaxTreeSize = 1<<53 - 1

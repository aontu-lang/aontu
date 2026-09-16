/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash/crc32"
	"sort"
	"strconv"
)

// THE CANONICAL ARCHIVE (ADR-039 part 7): entries sorted by path,
// stored uncompressed, dated to the zip epoch, no attributes, extra
// fields or comments. One tree has one digest in both ports, which a
// compressor could not promise. The reader refuses anything the writer
// would not produce. Mirrors ts/src/pkg-zip.ts byte for byte.

type ZipEntry struct {
	Path string
	Data []byte
}

const (
	zipLocalSig    = 0x04034b50
	zipCentralSig  = 0x02014b50
	zipEndSig      = 0x06054b50
	zipDosEpochDay = 0x0021
)

func Sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

type zipWriter struct{ buf []byte }

func (w *zipWriter) u16(n int) {
	w.buf = binary.LittleEndian.AppendUint16(w.buf, uint16(n))
}

func (w *zipWriter) u32(n uint32) {
	w.buf = binary.LittleEndian.AppendUint32(w.buf, n)
}

func ZipCanonical(entries []ZipEntry) []byte {
	sorted := append([]ZipEntry{}, entries...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Path < sorted[j].Path })
	w := &zipWriter{}
	central := &zipWriter{}

	for _, e := range sorted {
		name := []byte(e.Path)
		crc := crc32.ChecksumIEEE(e.Data)
		offset := uint32(len(w.buf))
		size := uint32(len(e.Data))

		w.u32(zipLocalSig)
		w.u16(10)
		w.u16(0)
		w.u16(0)
		w.u16(0)
		w.u16(zipDosEpochDay)
		w.u32(crc)
		w.u32(size)
		w.u32(size)
		w.u16(len(name))
		w.u16(0)
		w.buf = append(w.buf, name...)
		w.buf = append(w.buf, e.Data...)

		central.u32(zipCentralSig)
		central.u16(10)
		central.u16(10)
		central.u16(0)
		central.u16(0)
		central.u16(0)
		central.u16(zipDosEpochDay)
		central.u32(crc)
		central.u32(size)
		central.u32(size)
		central.u16(len(name))
		central.u16(0)
		central.u16(0)
		central.u16(0)
		central.u16(0)
		central.u32(0)
		central.u32(offset)
		central.buf = append(central.buf, name...)
	}

	cdOffset := uint32(len(w.buf))
	w.buf = append(w.buf, central.buf...)
	w.u32(zipEndSig)
	w.u16(0)
	w.u16(0)
	w.u16(len(sorted))
	w.u16(len(sorted))
	w.u32(uint32(len(central.buf)))
	w.u32(cdOffset)
	w.u16(0)
	return w.buf
}

func zipU16(b []byte, at int) int {
	return int(binary.LittleEndian.Uint16(b[at:]))
}

func zipU32(b []byte, at int) int {
	return int(binary.LittleEndian.Uint32(b[at:]))
}

// UnzipCanonical reads a canonical archive, refusing any shape the
// writer above would not have produced: the digest was taken over the
// canonical bytes, so a non-canonical archive is a corrupted one
// whatever it unpacks to.
func UnzipCanonical(zip []byte) ([]ZipEntry, error) {
	bad := func(why string) ([]ZipEntry, error) {
		return nil, errors.New("archive is not canonical: " + why)
	}

	if len(zip) < 22 || zipEndSig != zipU32(zip, len(zip)-22) {
		return bad("no end record")
	}
	end := len(zip) - 22
	count := zipU16(zip, end+10)
	cdSize := zipU32(zip, end+12)
	cdOffset := zipU32(zip, end+16)
	if 0 != zipU16(zip, end+4) || 0 != zipU16(zip, end+6) ||
		count != zipU16(zip, end+8) || 0 != zipU16(zip, end+20) ||
		cdOffset+cdSize != end {
		return bad("end record")
	}

	out := []ZipEntry{}
	at := cdOffset
	prev := ""
	expectLocal := 0

	for i := 0; i < count; i++ {
		if at+46 > end || zipCentralSig != zipU32(zip, at) {
			return bad("central directory")
		}
		crc := zipU32(zip, at+16)
		csize := zipU32(zip, at+20)
		usize := zipU32(zip, at+24)
		nameLen := zipU16(zip, at+28)
		offset := zipU32(zip, at+42)
		if 10 != zipU16(zip, at+4) || 10 != zipU16(zip, at+6) ||
			0 != zipU16(zip, at+8) || 0 != zipU16(zip, at+10) ||
			0 != zipU16(zip, at+12) || zipDosEpochDay != zipU16(zip, at+14) ||
			csize != usize || 0 != zipU16(zip, at+30) || 0 != zipU16(zip, at+32) ||
			0 != zipU16(zip, at+34) || 0 != zipU16(zip, at+36) ||
			0 != zipU32(zip, at+38) || offset != expectLocal {
			return bad("entry " + strconv.Itoa(i))
		}
		if at+46+nameLen > end {
			return bad("central directory")
		}
		name := string(zip[at+46 : at+46+nameLen])
		if 0 < i && prev >= name {
			return bad("entries out of order at " + name)
		}
		prev = name
		at += 46 + nameLen

		if offset+30+nameLen > cdOffset || zipLocalSig != zipU32(zip, offset) ||
			10 != zipU16(zip, offset+4) || 0 != zipU16(zip, offset+6) ||
			0 != zipU16(zip, offset+8) || 0 != zipU16(zip, offset+10) ||
			zipDosEpochDay != zipU16(zip, offset+12) || crc != zipU32(zip, offset+14) ||
			usize != zipU32(zip, offset+18) || usize != zipU32(zip, offset+22) ||
			nameLen != zipU16(zip, offset+26) || 0 != zipU16(zip, offset+28) ||
			name != string(zip[offset+30:offset+30+nameLen]) {
			return bad("local header of " + name)
		}
		start := offset + 30 + nameLen
		if start+usize > cdOffset {
			return bad("data of " + name)
		}
		data := append([]byte{}, zip[start:start+usize]...)
		if uint32(crc) != crc32.ChecksumIEEE(data) {
			return bad("checksum of " + name)
		}
		out = append(out, ZipEntry{Path: name, Data: data})
		expectLocal = start + usize
	}

	if expectLocal != cdOffset {
		return bad("trailing bytes")
	}
	return out, nil
}

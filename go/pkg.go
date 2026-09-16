/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// LockEntry is one entry of the lockfile, and of a tidy report. Key is
// the lock key: a package path, or `alias:<name>` with Pkg naming the
// package. Field order is LEXICOGRAPHIC, the canonical emitter's order.
type LockEntry struct {
	// Archive is the canonical archive's digest: computable from any
	// tree.
	Archive string `json:"archive"`
	Canon   string `json:"canon"`
	Key     string `json:"key"`
	// Manifest is the signed manifest's digest, present only for a
	// package acquired from a repository.
	Manifest string `json:"manifest,omitempty"`
	Pkg      string `json:"pkg,omitempty"`
	V        string `json:"v"`
}

type PkgTidyReport struct {
	// Forbidden names the files the allowlist refuses, as `<key>: <file>`.
	Forbidden []string    `json:"forbidden"`
	Lock      []LockEntry `json:"lock"`
	Missing   []string    `json:"missing"`
	// Unevaluable names the packages present in a store which DO NOT
	// EVALUATE standalone, sorted. A pin is what a module MEANS, so
	// there is nothing to pin here and the lockfile is left alone.
	Unevaluable []string `json:"unevaluable"`
	Verdict     string   `json:"verdict"`
}

type PkgMismatch struct {
	Got  string `json:"got"`
	Key  string `json:"key"`
	Pin  string `json:"pin"`
	Want string `json:"want"`
}

type PkgVerifyReport struct {
	// Mismatched is what the lockfile pins against what the store now
	// holds or means, bytes before meaning, sorted by key.
	Mismatched []PkgMismatch `json:"mismatched"`
	Missing    []string      `json:"missing"`
	// Unlocked names the dependencies the project declares that the
	// lockfile does not name, sorted. A tidy is what fills them in.
	Unlocked []string `json:"unlocked"`
	Verdict  string   `json:"verdict"`
	Verified []string `json:"verified"`
}

type PkgVendorReport struct {
	Missing  []string `json:"missing"`
	Vendored []string `json:"vendored"`
	Verdict  string   `json:"verdict"`
}

type PkgRepin struct {
	From string `json:"from"`
	Key  string `json:"key"`
	To   string `json:"to"`
}

type PkgRefreezeReport struct {
	Missing     []string   `json:"missing"`
	Repinned    []PkgRepin `json:"repinned"`
	Unchanged   []string   `json:"unchanged"`
	Unevaluable []string   `json:"unevaluable"`
	Verdict     string     `json:"verdict"`
}

type PkgTreeNode struct {
	Deps []string `json:"deps"`
	Key  string   `json:"key"`
	V    string   `json:"v"`
}

type PkgTreeReport struct {
	Missing []string      `json:"missing"`
	Nodes   []PkgTreeNode `json:"nodes"`
	Root    string        `json:"root"`
	Verdict string        `json:"verdict"`
}

var digitsRe = regexp.MustCompile(`^\d+$`)

// params.archive: what a consumer refuses to unpack, and so what a
// publisher refuses to mint. Variables, so a test can lower them.
var (
	ArchiveLimitBytes     = 16777216
	ArchiveLimitUnpacked  = 67108864
	ArchiveLimitFiles     = 4096
	ArchiveLimitFileBytes = 8388608
)

func VersionCompare(a, b string) int {
	ap := strings.Split(a, ".")
	bp := strings.Split(b, ".")
	n := len(ap)
	if len(bp) > n {
		n = len(bp)
	}
	for i := 0; i < n; i++ {
		x, y := "0", "0"
		if i < len(ap) {
			x = ap[i]
		}
		if i < len(bp) {
			y = bp[i]
		}
		if x == y {
			continue
		}
		xn, yn := digitsRe.MatchString(x), digitsRe.MatchString(y)
		if xn && yn {
			xs, ys := strings.TrimLeft(x, "0"), strings.TrimLeft(y, "0")
			if "" == xs {
				xs = "0"
			}
			if "" == ys {
				ys = "0"
			}
			if xs == ys {
				continue
			}
			if len(xs) != len(ys) {
				if len(xs) < len(ys) {
					return -1
				}
				return 1
			}
			if xs < ys {
				return -1
			}
			return 1
		}
		if xn != yn {
			if xn {
				return -1
			}
			return 1
		}
		if x < y {
			return -1
		}
		return 1
	}
	return 0
}

// pkgEval is one standalone evaluation of a source: what it means,
// what its meaning hashes to, and its canonical form.
type pkgEval struct {
	gen   any
	hash  string
	canon string
	ok    bool
}

// PkgOptions mirrors PkgToolOptions in ts/src/pkg.ts. A nil Trust is
// the default `system` capability.
type PkgOptions struct {
	Cache   string
	Trust   *TrustOptions
	TextExt []string
}

func (o *PkgOptions) cache() string {
	if nil == o {
		return ""
	}
	return o.Cache
}

func evalPkg(src, path string, opts *PkgOptions) pkgEval {
	a := NewWithBase(filepath.Dir(path))
	a.File = path
	if nil != opts {
		a.Trust = opts.Trust
		a.TextExt = opts.TextExt
		a.ModCache = opts.Cache
	}
	v, err := a.Unify(src)
	gen, _ := v.Gen(&Ctx{collect: true})
	return pkgEval{
		gen: gen, hash: CanonHash(v), canon: v.Canon(),
		ok: nil == err && nil != v && !v.Nil(),
	}
}

// Dependency is one declared dependency: the minimum version, and for
// an alias the package it names.
type Dependency struct {
	Pkg string `json:"pkg,omitempty"`
	V   string `json:"v"`
}

// declaredDeps is the `dep` block a package file declares.
func declaredDeps(file string, opts *PkgOptions) map[string]Dependency {
	data, err := os.ReadFile(file)
	if nil != err {
		return map[string]Dependency{}
	}

	out := map[string]Dependency{}
	gen, ok := evalPkg(toValidSource(string(data)), file, opts).gen.(map[string]any)
	if !ok {
		return out
	}
	dep, ok := gen["dep"].(map[string]any)
	if !ok {
		return out
	}
	for key, val := range dep {
		entry, ok := val.(map[string]any)
		if !ok {
			continue
		}
		if v, ok := entry["v"].(string); ok && "" != v {
			pkg, _ := entry["pkg"].(string)
			out[key] = Dependency{V: v, Pkg: pkg}
		}
	}
	return out
}

// usableKey: a last element with an extension the include table knows
// is a local file to the resolver, whatever declares it, so it names
// no package.
func usableKey(key string) bool {
	ref, ok := parseModuleRef(key)
	if !ok || ref.Path != key {
		return false
	}
	if isAlias(key) {
		return true
	}
	ext := localFileExt(key)
	return "" == validateModulePath(key) && ("" == ext || "" == includeFormat(ext, nil))
}

// pkgStoreDir is the directory a package is in, in the local stores:
// the project's vendor tree first, then the cache under the hash the
// lockfile pins, then the cache under the hash the repository's
// manifest for that version pins, which the consumer's need not equal.
func pkgStoreDir(root, key, canon, pkg, cache, v string) string {
	stores := []string{moduleDir(filepath.Join(root, metaDir, vendorDir), key)}
	if "" != cache && "" != pkg {
		if "" != canon {
			stores = append(stores, cacheStoreDir(cache, canon, pkg))
		}
		if served := downloadedCanon(cache, pkg, v); "" != served && served != canon {
			stores = append(stores, cacheStoreDir(cache, served, pkg))
		}
	}
	for _, d := range stores {
		if _, err := os.Stat(filepath.Join(d, pkgFile)); nil == err {
			return d
		}
	}
	return ""
}

// downloadedCanon is the canon the repository's manifest pins for a
// version this client downloaded, or empty where none was.
func downloadedCanon(cache, pkg, v string) string {
	if "" == v {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(cacheDownloadDir(cache, pkg), v+".manifest"))
	if nil != err {
		return ""
	}
	var doc map[string]any
	if nil != json.Unmarshal(data, &doc) {
		return ""
	}
	mods, _ := doc["modules"].([]any)
	if 0 == len(mods) {
		return ""
	}
	mod, _ := mods[0].(map[string]any)
	canon, _ := mod["canon"].(string)
	return canon
}

func readLock(root string) map[string]LockEntry {
	data, err := os.ReadFile(filepath.Join(root, metaDir, lockFile))
	if nil != err {
		return map[string]LockEntry{}
	}

	var lock struct {
		Lock map[string]map[string]any `json:"lock"`
	}
	if err := json.Unmarshal([]byte(lockJSON(string(data))), &lock); nil != err {
		return map[string]LockEntry{}
	}

	out := map[string]LockEntry{}
	for key, e := range lock.Lock {
		str := func(k string) string {
			s, _ := e[k].(string)
			return s
		}
		out[key] = LockEntry{
			Key: key, V: str("v"), Canon: str("canon"), Archive: str("archive"),
			Manifest: str("manifest"), Pkg: str("pkg"),
		}
	}
	return out
}

// lockHeader is the generated-file header. A lockfile is
// machine-written, and the file says so where an editor will see it.
const lockHeader = "# pkg-lock.aon (generated by `aontu sync`; do not edit)\n"

// LockText is the lockfile TEXT: canonical Aontu, one line, keys
// sorted. Built as source and canonicalised by the ENGINE rather than
// printed by hand, so "canonical form" means what the language means by
// it and cannot drift from it.
func LockText(entries []LockEntry, opts *PkgOptions) string {
	parts := make([]string, 0, len(entries))
	for _, e := range entries {
		part := quote(e.Key) + ":{" +
			"\"archive\":" + quote(e.Archive) + "," +
			"\"canon\":" + quote(e.Canon) + ","
		if "" != e.Manifest {
			part += "\"manifest\":" + quote(e.Manifest) + ","
		}
		if "" != e.Pkg {
			part += "\"pkg\":" + quote(e.Pkg) + ","
		}
		part += "\"v\":" + quote(e.V) + "}"
		parts = append(parts, part)
	}
	return evalPkg("{\"lock\":{"+strings.Join(parts, ",")+"}}", lockFile, opts).canon
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// writeLock writes the lockfile, and a lock that cannot be written is
// an error the caller reports: a verdict of ok over no file is false.
func writeLock(root string, entries []LockEntry, opts *PkgOptions) error {
	if err := os.MkdirAll(filepath.Join(root, metaDir), 0o755); nil != err {
		return err
	}
	return os.WriteFile(filepath.Join(root, metaDir, lockFile),
		[]byte(lockHeader+LockText(entries, opts)+"\n"), 0o600)
}

// PackageSelf is what a package file says about ITSELF. Distinct from
// declaredDeps, which reads what it says about others.
type PackageSelf struct {
	Path    string
	Version string
	Main    string
	Publish string
	Moved   string
	Retract []string
}

func packageSelf(dir string, opts *PkgOptions) PackageSelf {
	self := PackageSelf{Main: "main.aon", Publish: "private", Retract: []string{}}
	file := filepath.Join(dir, pkgFile)
	data, err := os.ReadFile(file)
	if nil != err {
		return self
	}
	gen, ok := evalPkg(toValidSource(string(data)), file, opts).gen.(map[string]any)
	if !ok {
		return self
	}
	str := func(v any) string {
		s, _ := v.(string)
		return s
	}
	if pkg, ok := gen["pkg"].(map[string]any); ok {
		self.Path = str(pkg["path"])
		self.Version = str(pkg["version"])
		if m := str(pkg["main"]); "" != m {
			self.Main = m
		}
	}
	if "public" == str(gen["publish"]) {
		self.Publish = "public"
	}
	self.Moved = str(gen["moved"])
	if list, ok := gen["retract"].([]any); ok {
		for _, v := range list {
			if s, ok := v.(string); ok {
				self.Retract = append(self.Retract, s)
			}
		}
	}
	return self
}

// What a package may contain (REPOSITORY.0.md §9.4): an enumerated
// allowlist, refused by default. The data half is ADR-012's table.
var archiveAdmittedExt = map[string]bool{
	"aon": true, "aontu": true,
	"json": true, "jsonld": true, "jsonc": true, "json5": true, "jsonic": true,
	"jsc": true, "toml": true, "yaml": true, "yml": true, "ini": true,
	"md": true, "txt": true,
}

var archiveNamed = map[string]bool{"LICENSE": true, "NOTICE": true}

func ArchiveAdmits(rel string) bool {
	elems := strings.Split(rel, "/")
	for _, e := range elems {
		if strings.HasPrefix(e, ".") {
			return false
		}
	}
	name := elems[len(elems)-1]
	if archiveNamed[name] {
		return true
	}
	dot := strings.LastIndex(name, ".")
	if dot < 1 {
		return false
	}
	return archiveAdmittedExt[strings.ToLower(name[dot+1:])]
}

type ArchiveFile struct {
	Digest string `json:"digest"`
	Path   string `json:"path"`
	Size   int    `json:"size"`
}

type Archive struct {
	Zip    []byte
	Digest string
	Size   int
	Files  []ArchiveFile
	// Forbidden names the entries the allowlist refuses, sorted: a
	// symlink, an executable, a dotfile directory, or a name outside
	// the table.
	Forbidden []string
}

func walkTree(dir, prefix string, out *[]ZipEntry, forbidden *[]string) {
	entries, err := os.ReadDir(dir)
	if nil != err { //coverage:ignore the caller stat'd this directory
		return
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		name := e.Name()
		if "" == prefix && metaDir == name {
			continue
		}
		full := filepath.Join(dir, name)
		rel := name
		if "" != prefix {
			rel = prefix + "/" + name
		}
		st, err := os.Lstat(full)
		if nil != err { //coverage:ignore ReadDir listed it a moment ago
			continue
		}
		if 0 != st.Mode()&os.ModeSymlink {
			*forbidden = append(*forbidden, rel)
			continue
		}
		if st.IsDir() {
			if strings.HasPrefix(name, ".") {
				*forbidden = append(*forbidden, rel+"/")
				continue
			}
			walkTree(full, rel, out, forbidden)
			continue
		}
		if !st.Mode().IsRegular() || 0 != st.Mode().Perm()&0o111 || !ArchiveAdmits(rel) {
			*forbidden = append(*forbidden, rel)
			continue
		}
		data, err := os.ReadFile(full)
		if nil != err { //coverage:ignore a regular, listed file reads
			continue
		}
		*out = append(*out, ZipEntry{Path: rel, Data: data})
	}
}

// ArchiveOf is the canonical archive of a tree, and every file's own
// digest.
func ArchiveOf(dir string) Archive {
	entries := []ZipEntry{}
	forbidden := []string{}
	walkTree(dir, "", &entries, &forbidden)
	zip := ZipCanonical(entries)
	files := make([]ArchiveFile, 0, len(entries))
	for _, e := range entries {
		files = append(files, ArchiveFile{Path: e.Path, Digest: Sha256Hex(e.Data), Size: len(e.Data)})
	}
	sort.Strings(forbidden)
	return Archive{Zip: zip, Digest: Sha256Hex(zip), Size: len(zip), Files: files, Forbidden: forbidden}
}

type storedManifest struct {
	digest string
	files  []ArchiveFile
}

// storedManifestOf is the pin a locked tree carries beside it, when it
// was acquired from a repository: the served manifest, verbatim.
func storedManifestOf(dir string) *storedManifest {
	data, err := os.ReadFile(filepath.Join(dir, metaDir, "manifest.aon"))
	if nil != err {
		return nil
	}
	out := &storedManifest{digest: Sha256Hex(data), files: []ArchiveFile{}}
	var doc struct {
		Archive struct {
			Files []ArchiveFile `json:"files"`
		} `json:"archive"`
	}
	if err := json.Unmarshal([]byte(lockJSON(string(data))), &doc); nil == err && nil != doc.Archive.Files {
		out.files = doc.Archive.Files
	}
	return out
}

// pinTree is the lock entry a store tree yields for a key.
func pinTree(key, dir, v, pkg string, opts *PkgOptions) (entry LockEntry, unevaluable bool, forbidden []string) {
	main := filepath.Join(dir, packageSelf(dir, opts).Main)
	hash := ""
	if data, err := os.ReadFile(main); nil == err {
		got := evalPkg(toValidSource(string(data)), main, opts)
		if !got.ok {
			return LockEntry{}, true, []string{}
		}
		hash = got.hash
	}
	archive := ArchiveOf(dir)
	entry = LockEntry{Key: key, V: v, Canon: hash, Archive: archive.Digest, Pkg: pkg}
	if m := storedManifestOf(dir); nil != m {
		entry.Manifest = m.digest
	}
	forbidden = []string{}
	for _, f := range archive.Forbidden {
		forbidden = append(forbidden, key+": "+f)
	}
	return entry, false, forbidden
}

// targetOf is the package an alias key names: from the declaration,
// else from the previous lock; a package path names itself.
func targetOf(key string, dep Dependency, prev LockEntry) string {
	if !isAlias(key) {
		return key
	}
	if "" != dep.Pkg {
		return dep.Pkg
	}
	return prev.Pkg
}

func sortedKeys[T any](m map[string]T) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// PkgTidy is `aontu pkg tidy`: resolve the closure by MVS and rewrite
// the lockfile.
func PkgTidy(root string, opts *PkgOptions) PkgTidyReport {
	report := PkgResolve(root, opts)
	if "ok" == report.Verdict {
		if err := writeLock(root, report.Lock, opts); nil != err {
			report.Verdict = "error"
			report.Unevaluable = append(report.Unevaluable, lockFile+": "+err.Error())
		}
	}
	return report
}

// PkgResolve is the resolution alone, for a caller that decides
// whether to write.
func PkgResolve(root string, opts *PkgOptions) PkgTidyReport {
	previous := readLock(root)
	selected := map[string]Dependency{}
	missing := map[string]bool{}

	// The closure, breadth-first from the project's own declarations. A
	// package already selected at a version at least as high contributes
	// nothing new, which is what makes this terminate without a cycle
	// check: the selected version only ever rises.
	frontier := declaredDeps(filepath.Join(root, pkgFile), opts)
	for 0 < len(frontier) {
		next := map[string]Dependency{}

		for _, key := range sortedKeys(frontier) {
			want := frontier[key]
			if have, ok := selected[key]; ok && 0 <= VersionCompare(have.V, want.V) {
				continue
			}
			merged := want
			if "" == merged.Pkg {
				merged.Pkg = selected[key].Pkg
			}
			selected[key] = merged

			if !usableKey(key) {
				// A key this tooling cannot act on names nothing any
				// store can hold: the same answer as an absent package.
				missing[key] = true
				continue
			}

			dir := pkgStoreDir(root, key, previous[key].Canon,
				targetOf(key, selected[key], previous[key]), opts.cache(), selected[key].V)
			if "" == dir {
				missing[key] = true
				continue
			}

			for dk, d := range declaredDeps(filepath.Join(dir, pkgFile), opts) {
				if bid, ok := next[dk]; !ok || 0 > VersionCompare(bid.V, d.V) {
					if "" == d.Pkg {
						d.Pkg = bid.Pkg
					}
					next[dk] = d
				}
			}
		}

		frontier = next
	}

	lock := []LockEntry{}
	unevaluable := []string{}
	forbidden := []string{}
	for _, key := range sortedKeys(selected) {
		if missing[key] {
			continue
		}
		pkg := targetOf(key, selected[key], previous[key])
		dir := pkgStoreDir(root, key, previous[key].Canon, pkg, opts.cache(), selected[key].V)
		aliasPkg := ""
		if isAlias(key) {
			aliasPkg = pkg
		}
		entry, bad, forb := pinTree(key, dir, selected[key].V, aliasPkg, opts)
		forbidden = append(forbidden, forb...)
		if bad {
			unevaluable = append(unevaluable, key)
			continue
		}
		lock = append(lock, entry)
	}

	miss := sortedKeys(missing)
	sort.Strings(unevaluable)
	sort.Strings(forbidden)

	verdict := "ok"
	if 0 < len(unevaluable) || 0 < len(forbidden) {
		verdict = "error"
	} else if 0 < len(miss) {
		verdict = "missing"
	}
	return PkgTidyReport{
		Verdict: verdict, Lock: lock, Missing: miss,
		Unevaluable: unevaluable, Forbidden: forbidden,
	}
}

func lockPkg(e LockEntry) string {
	if "" != e.Pkg {
		return e.Pkg
	}
	return e.Key
}

func PkgVerify(root string, opts *PkgOptions) PkgVerifyReport {
	locked := readLock(root)
	verified := []string{}
	mismatched := []PkgMismatch{}
	missing := []string{}

	unlocked := []string{}
	for key := range declaredDeps(filepath.Join(root, pkgFile), opts) {
		if _, ok := locked[key]; !ok {
			unlocked = append(unlocked, key)
		}
	}
	sort.Strings(unlocked)

	for _, key := range sortedKeys(locked) {
		entry := locked[key]
		if !usableKey(key) {
			missing = append(missing, key)
			continue
		}
		dir := pkgStoreDir(root, key, entry.Canon, lockPkg(entry), opts.cache(), entry.V)
		if "" == dir {
			missing = append(missing, key)
			continue
		}
		main := filepath.Join(dir, packageSelf(dir, opts).Main)
		data, err := os.ReadFile(main)
		if nil != err {
			missing = append(missing, key)
			continue
		}

		// BYTES BEFORE MEANING (ADR-019): the archive digest and the
		// manifest's file list first, on fixed-size reads, then the one
		// evaluation.
		before := len(mismatched)
		archive := ArchiveOf(dir)
		for _, f := range archive.Forbidden {
			mismatched = append(mismatched, PkgMismatch{Key: key, Pin: "archive", Want: entry.Archive, Got: "forbidden: " + f})
		}
		if 0 == len(archive.Forbidden) && entry.Archive != archive.Digest {
			mismatched = append(mismatched, PkgMismatch{Key: key, Pin: "archive", Want: entry.Archive, Got: archive.Digest})
		}
		if m := storedManifestOf(dir); nil == m {
			if "" != entry.Manifest {
				mismatched = append(mismatched, PkgMismatch{Key: key, Pin: "manifest", Want: entry.Manifest, Got: ""})
			}
		} else {
			if "" != entry.Manifest && entry.Manifest != m.digest {
				mismatched = append(mismatched, PkgMismatch{Key: key, Pin: "manifest", Want: entry.Manifest, Got: m.digest})
			}
			listed := map[string]string{}
			for _, f := range m.files {
				listed[f.Path] = f.Digest
			}
			for _, f := range archive.Files {
				if listed[f.Path] != f.Digest {
					mismatched = append(mismatched, PkgMismatch{Key: key, Pin: "manifest", Want: listed[f.Path], Got: f.Path + " " + f.Digest})
				}
			}
		}
		if before != len(mismatched) {
			continue
		}

		got := evalPkg(toValidSource(string(data)), main, opts)
		if got.ok && entry.Canon == got.hash {
			verified = append(verified, key)
			continue
		}
		shown := ""
		if got.ok {
			shown = got.hash
		}
		mismatched = append(mismatched, PkgMismatch{Key: key, Pin: "canon", Want: entry.Canon, Got: shown})
	}

	sort.Strings(missing)

	verdict := "ok"
	if 0 < len(mismatched) {
		verdict = "mismatch"
	} else if 0 < len(unlocked) {
		verdict = "unlocked"
	} else if 0 < len(missing) {
		verdict = "missing"
	}
	return PkgVerifyReport{
		Verdict: verdict, Verified: verified,
		Mismatched: mismatched, Unlocked: unlocked, Missing: missing,
	}
}

// PkgVendor materialises the locked closure into `aontu_meta/vendor/`.
func PkgVendor(root string, opts *PkgOptions) PkgVendorReport {
	locked := readLock(root)
	vendored := []string{}
	missing := []string{}

	vendorRoot := filepath.Join(root, metaDir, vendorDir)

	for _, key := range sortedKeys(locked) {
		entry := locked[key]
		if !usableKey(key) {
			missing = append(missing, key)
			continue
		}
		from := pkgStoreDir(root, key, entry.Canon, lockPkg(entry), opts.cache(), entry.V)
		if "" == from {
			missing = append(missing, key)
			continue
		}
		to := moduleDir(vendorRoot, key)
		if from != to {
			if err := vendorCopy(from, to); nil != err { //coverage:ignore a readable store copies
				missing = append(missing, key)
				continue
			}
		}
		vendored = append(vendored, key)
	}

	verdict := "ok"
	if 0 < len(missing) {
		verdict = "missing"
	}
	return PkgVendorReport{Verdict: verdict, Vendored: vendored, Missing: missing}
}

// vendorCopy is a store tree into the vendor tree: the whole
// directory, less the store's own lock, so the copy resolves against
// the consumer's.
func vendorCopy(from, to string) error {
	_ = os.RemoveAll(to)
	if err := copyTree(from, to); nil != err { //coverage:ignore a readable store copies
		return err
	}
	lock := filepath.Join(to, metaDir, lockFile)
	if _, err := os.Stat(lock); nil == err {
		return os.Remove(lock)
	}
	return nil
}

// copyTree copies a whole package directory as real files: the vendor
// tree is committed, and a link into a shared store is corruption
// waiting for an edit.
func copyTree(from, to string) error {
	if err := os.MkdirAll(to, 0o755); nil != err { //coverage:ignore a writable project makes dirs
		return err
	}
	entries, err := os.ReadDir(from)
	if nil != err { //coverage:ignore the caller stat'd this directory
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		src := filepath.Join(from, e.Name())
		dst := filepath.Join(to, e.Name())
		if e.IsDir() {
			if err := copyTree(src, dst); nil != err { //coverage:ignore see above
				return err
			}
			continue
		}
		if err := copyFile(src, dst); nil != err { //coverage:ignore see above
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if nil != err { //coverage:ignore ReadDir listed it a moment ago
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); nil != err { //coverage:ignore see above
		return err
	}
	out, err := os.Create(dst)
	if nil != err { //coverage:ignore see above
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// PkgRefreeze is `aontu pkg refreeze`: recompute every canon pin and
// nothing else, which is what a canonical-form change in the engine
// needs.
func PkgRefreeze(root string, opts *PkgOptions) PkgRefreezeReport {
	locked := readLock(root)
	repinned := []PkgRepin{}
	unchanged := []string{}
	missing := []string{}
	unevaluable := []string{}
	lock := []LockEntry{}

	for _, key := range sortedKeys(locked) {
		entry := locked[key]
		dir := ""
		if usableKey(key) {
			dir = pkgStoreDir(root, key, entry.Canon, lockPkg(entry), opts.cache(), entry.V)
		}
		var data []byte
		var err error = os.ErrNotExist
		main := ""
		if "" != dir {
			main = filepath.Join(dir, packageSelf(dir, opts).Main)
			data, err = os.ReadFile(main)
		}
		if nil != err {
			missing = append(missing, key)
			lock = append(lock, entry)
			continue
		}
		got := evalPkg(toValidSource(string(data)), main, opts)
		if !got.ok {
			unevaluable = append(unevaluable, key)
			lock = append(lock, entry)
			continue
		}
		if got.hash == entry.Canon {
			unchanged = append(unchanged, key)
			lock = append(lock, entry)
			continue
		}
		repinned = append(repinned, PkgRepin{Key: key, From: entry.Canon, To: got.hash})
		entry.Canon = got.hash
		lock = append(lock, entry)
	}

	held := 0 == len(missing) && 0 == len(unevaluable)
	if held && 0 < len(repinned) {
		if err := writeLock(root, lock, opts); nil != err { //coverage:ignore the directory the lock was just read from
			unevaluable = append(unevaluable, lockFile+": "+err.Error())
		}
	}

	verdict := "ok"
	if 0 < len(unevaluable) {
		verdict = "error"
	} else if 0 < len(missing) {
		verdict = "missing"
	}
	return PkgRefreezeReport{
		Verdict: verdict, Repinned: repinned, Unchanged: unchanged,
		Missing: missing, Unevaluable: unevaluable,
	}
}

// archiveOverCaps: every consumer refuses an archive past
// params.archive at acquire, so a publisher refuses to mint one.
func archiveOverCaps(archive Archive) []string {
	over := []string{}
	if ArchiveLimitBytes < archive.Size {
		over = append(over, "archive: "+strconv.Itoa(archive.Size)+" bytes, over the cap of "+strconv.Itoa(ArchiveLimitBytes))
	}
	if ArchiveLimitFiles < len(archive.Files) {
		over = append(over, "archive: "+strconv.Itoa(len(archive.Files))+" files, over the cap of "+strconv.Itoa(ArchiveLimitFiles))
	}
	total := 0
	for _, f := range archive.Files {
		total += f.Size
		if ArchiveLimitFileBytes < f.Size {
			over = append(over, f.Path+": "+strconv.Itoa(f.Size)+" bytes, over the cap of "+strconv.Itoa(ArchiveLimitFileBytes))
		}
	}
	if ArchiveLimitUnpacked < total {
		over = append(over, "archive: unpacks to "+strconv.Itoa(total)+" bytes, over the cap of "+strconv.Itoa(ArchiveLimitUnpacked))
	}
	return over
}

// PkgTree is `aontu pkg tree`: the locked closure as a graph, each
// node's edges read from its own package file in the store.
func PkgTree(root string, opts *PkgOptions) PkgTreeReport {
	locked := readLock(root)
	self := packageSelf(root, opts)
	nodes := []PkgTreeNode{}
	missing := []string{}

	rootKey := self.Path
	if "" == rootKey {
		rootKey = "."
	}
	nodes = append(nodes, PkgTreeNode{
		Key: rootKey, V: self.Version,
		Deps: sortedKeys(declaredDeps(filepath.Join(root, pkgFile), opts)),
	})

	for _, key := range sortedKeys(locked) {
		entry := locked[key]
		dir := ""
		if usableKey(key) {
			dir = pkgStoreDir(root, key, entry.Canon, lockPkg(entry), opts.cache(), entry.V)
		}
		if "" == dir {
			missing = append(missing, key)
			nodes = append(nodes, PkgTreeNode{Key: key, V: entry.V, Deps: []string{}})
			continue
		}
		nodes = append(nodes, PkgTreeNode{
			Key: key, V: entry.V,
			Deps: sortedKeys(declaredDeps(filepath.Join(dir, pkgFile), opts)),
		})
	}

	verdict := "ok"
	if 0 < len(missing) {
		verdict = "missing"
	}
	return PkgTreeReport{Verdict: verdict, Root: rootKey, Nodes: nodes, Missing: missing}
}

const ManifestSchema = "aontu-package/v1"

type ManifestModule struct {
	Canon string `json:"canon"`
	Main  string `json:"main"`
	Path  string `json:"path"`
}

type ManifestArchive struct {
	Digest string        `json:"digest"`
	Files  []ArchiveFile `json:"files"`
	Format string        `json:"format"`
	Size   int           `json:"size"`
}

// PkgManifest is the signed manifest a publish sends (T.Manifest in the
// specification), less what the act of publishing supplies: the time,
// and the publisher the token names.
type PkgManifest struct {
	Archive ManifestArchive       `json:"archive"`
	Deps    map[string]Dependency `json:"deps"`
	Modules []ManifestModule      `json:"modules"`
	Moved   string                `json:"moved,omitempty"`
	Package string                `json:"package"`
	Publish string                `json:"publish"`
	Retract []string              `json:"retract,omitempty"`
	Schema  string                `json:"schema"`
	Version string                `json:"version"`
}

type PkgManifestReport struct {
	Findings  []VetFinding `json:"findings"`
	Forbidden []string     `json:"forbidden"`
	Manifest  *PkgManifest `json:"manifest,omitempty"`
	// Missing names what the package does not declare, sorted. A
	// manifest cannot be minted without them.
	Missing []string `json:"missing"`
	Verdict string   `json:"verdict"`
}

// PkgManifest is `aontu pkg manifest`: the manifest a publish would
// send, and the gate that decides whether it may be. against is the
// prior version's tree, or empty for no gate.
func PkgManifestOf(root, against string, opts *PkgOptions) PkgManifestReport {
	self := packageSelf(root, opts)

	missing := []string{}
	if "" == self.Path {
		missing = append(missing, "pkg.path")
	} else if isAlias(self.Path) || !usableKey(self.Path) {
		missing = append(missing, "pkg.path ("+self.Path+" is not a package path)")
	}
	if "" == self.Version {
		missing = append(missing, "pkg.version")
	} else if !versionRe.MatchString(self.Version) {
		missing = append(missing, "pkg.version ("+self.Version+" is not MAJOR.MINOR.PATCH)")
	}
	main := filepath.Join(root, self.Main)
	data, err := os.ReadFile(main)
	if nil != err || "" != RelPathError(self.Main) {
		missing = append(missing, self.Main)
	}

	refused := func(why, forbidden []string) PkgManifestReport {
		sort.Strings(why)
		return PkgManifestReport{
			Verdict: "error", Missing: why, Forbidden: forbidden, Findings: []VetFinding{},
		}
	}

	if 0 < len(missing) {
		return refused(missing, []string{})
	}

	newSrc := toValidSource(string(data))
	got := evalPkg(newSrc, main, opts)
	// Nothing to pin: PkgTidy refuses the same way.
	if !got.ok {
		return refused([]string{self.Main}, []string{})
	}

	archive := ArchiveOf(root)
	if 0 < len(archive.Forbidden) {
		return refused([]string{}, archive.Forbidden)
	}
	if over := archiveOverCaps(archive); 0 < len(over) {
		return refused([]string{}, over)
	}

	report := PkgManifestReport{
		Verdict: "ok",
		Manifest: &PkgManifest{
			Schema:  ManifestSchema,
			Package: self.Path,
			Version: self.Version,
			Publish: self.Publish,
			Archive: ManifestArchive{
				Format: "zip", Digest: archive.Digest, Size: archive.Size, Files: archive.Files,
			},
			Modules: []ManifestModule{{Path: self.Path, Main: self.Main, Canon: got.hash}},
			Deps:    declaredDeps(filepath.Join(root, pkgFile), opts),
			Moved:   self.Moved,
		},
		Missing:   []string{},
		Forbidden: []string{},
		Findings:  []VetFinding{},
	}
	if 0 < len(self.Retract) {
		report.Manifest.Retract = self.Retract
	}

	if "" == against {
		return report
	}

	// THE PUBLISH-TIME COMPATIBILITY GATE: G3's subsumption
	// (go/subsume.go), wired at the one place versions are minted, with
	// no major to bump past it (ADR-022).
	prior := packageSelf(against, opts)
	priorMain := filepath.Join(against, prior.Main)
	priorData, err := os.ReadFile(priorMain)
	if nil != err {
		report.Verdict = "error"
		report.Missing = []string{prior.Main}
		return report
	}

	priorSrc := toValidSource(string(priorData))
	urls := &SubsumeOptions{
		GeneralURL:   main,
		SpecificURL:  priorMain,
		GeneralPath:  main,
		SpecificPath: priorMain,
	}
	gate := Subsume(newSrc, priorSrc, urls)

	if nil != gate.Findings {
		report.Findings = gate.Findings
	}
	report.Verdict = manifestVerdict[gate.Verdict]
	if SubsumeError == gate.Verdict {
		return report
	}

	// Admission alone is not compatibility: what the prior version
	// generated, the next must generate, and the same (go/compat.go).
	outcome := CompatOutcome(newSrc, priorSrc, urls)
	report.Findings = append(report.Findings, outcome.Findings...)
	if "breaking" == outcome.Verdict {
		report.Verdict = "breaking"
	}
	return report
}

var manifestVerdict = map[string]string{
	SubsumeYes:       "ok",
	SubsumeNo:        "breaking",
	SubsumeUndecided: "undecided",
	SubsumeError:     "error",
}

// ManifestText is the manifest as the bytes a publish signs and a
// repository serves: canonical aontu, one line, keys sorted, which for
// scalar leaves is JSON.
func ManifestText(m *PkgManifest, extra map[string]any, opts *PkgOptions) string {
	raw, _ := json.Marshal(m)
	var doc map[string]any
	_ = json.Unmarshal(raw, &doc)
	for k, v := range extra {
		doc[k] = v
	}
	src, _ := json.Marshal(doc)
	return evalPkg(string(src), "manifest.aon", opts).canon
}

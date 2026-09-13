/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// ModLock is one entry of the lockfile, and of a tidy report. Field
// order is LEXICOGRAPHIC, the canonical emitter's order.
type ModLock struct {
	Canon string `json:"canon"`
	// Mod is the module path and major, as an import spells it.
	Mod string `json:"mod"`
	// Oci is the registry digest, carried over from a previous
	// lockfile. Empty when nothing has ever fetched this module: the
	// OCI pin is the registry's word, and only a fetch can hear it.
	Oci string `json:"oci"`
	// V is the selected version.
	V string `json:"v"`
}

// ModTidyReport is the result of `aontu mod tidy`.
type ModTidyReport struct {
	Lock    []ModLock `json:"lock"`
	Missing []string  `json:"missing"`
	// Unevaluable names the modules present in a store which DO NOT
	// EVALUATE standalone, sorted. A pin is what a module MEANS, so
	// there is nothing to pin here and the lockfile is left alone.
	Unevaluable []string `json:"unevaluable"`
	Verdict     string   `json:"verdict"`
}

type ModVerifyReport struct {
	// Mismatched is what the lockfile pins against what the store now
	// means, for each module that does not match, sorted by module.
	Mismatched []ModMismatch `json:"mismatched"`
	Missing    []string      `json:"missing"`
	// Unlocked names the dependencies the project declares that the
	// lockfile does not name, sorted. A tidy is what fills them in.
	Unlocked []string `json:"unlocked"`
	Verdict  string   `json:"verdict"`
	// Verified names the locked modules that still mean what is pinned.
	Verified []string `json:"verified"`
}

type ModMismatch struct {
	Got  string `json:"got"`
	Mod  string `json:"mod"`
	Want string `json:"want"`
}

// ModVendorReport is the result of `aontu mod vendor`.
type ModVendorReport struct {
	Missing  []string `json:"missing"`
	Vendored []string `json:"vendored"`
	Verdict  string   `json:"verdict"`
}

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
		xn, xerr := strconv.Atoi(x)
		yn, yerr := strconv.Atoi(y)
		if nil == xerr && nil == yerr {
			if xn < yn {
				return -1
			}
			return 1
		}
		if (nil == xerr) != (nil == yerr) {
			if nil == xerr {
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

// modEval is one standalone evaluation of a source: what it means, what
// its meaning hashes to, and its canonical form.
type modEval struct {
	gen   any
	hash  string
	canon string
	ok bool
}

// ModOptions mirrors ModToolOptions in ts/src/mod-tool.ts. A nil Trust
// is the default `system` capability.
type ModOptions struct {
	Cache   string
	Trust   *TrustOptions
	TextExt []string
}

func (o *ModOptions) cache() string {
	if nil == o {
		return ""
	}
	return o.Cache
}

func evalMod(src, path string, opts *ModOptions) modEval {
	a := NewWithBase(filepath.Dir(path))
	a.File = path
	if nil != opts {
		a.Trust = opts.Trust
		a.TextExt = opts.TextExt
	}
	v, err := a.Unify(src)
	gen, _ := v.Gen(&Ctx{collect: true})
	return modEval{
		gen: gen, hash: CanonHash(v), canon: v.Canon(),
		ok: nil == err && nil != v && !v.Nil(),
	}
}

// declaredDeps is the `dep` block a module file declares: import string
// -> version.
func declaredDeps(file string, opts *ModOptions) map[string]string {
	data, err := os.ReadFile(file)
	if nil != err {
		return map[string]string{}
	}

	out := map[string]string{}
	gen, ok := evalMod(toValidSource(string(data)), file, opts).gen.(map[string]any)
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
			out[key] = v
		}
	}
	return out
}

func usableRef(mod string) (ModuleRef, bool) {
	ref, ok := parseModuleRef(mod)
	if !ok || "" != validateModulePath(ref.Path) {
		return ModuleRef{}, false
	}
	return ref, true
}

// modStoreDir is the directory a module is in, in the local stores: the
// project's vendor tree first, then the cache under the hash the
// lockfile pins.
func modStoreDir(root string, ref ModuleRef, hash, cache string) string {
	stores := []string{moduleDir(filepath.Join(root, "aontu_meta", "vendor"), ref)}
	if "" != cache && "" != hash {
		stores = append(stores, filepath.Join(cache, hash))
	}
	for _, d := range stores {
		if _, err := os.Stat(filepath.Join(d, "mod.aon")); nil == err {
			return d
		}
	}
	return ""
}

// readLock is the lockfile's entries, as written.
func readLock(root string) map[string]ModLock {
	data, err := os.ReadFile(filepath.Join(root, "aontu_meta", "mod-lock.aon"))
	if nil != err {
		return map[string]ModLock{}
	}

	var lock struct {
		Lock map[string]struct {
			Canon string `json:"canon"`
			Oci   string `json:"oci"`
			V     string `json:"v"`
		} `json:"lock"`
	}
	if err := json.Unmarshal([]byte(lockJSON(string(data))), &lock); nil != err {
		return map[string]ModLock{}
	}

	out := map[string]ModLock{}
	for mod, e := range lock.Lock {
		out[mod] = ModLock{Mod: mod, Canon: e.Canon, Oci: e.Oci, V: e.V}
	}
	return out
}

// lockHeader is the generated-file header. A lockfile is
// machine-written, and the file says so where an editor will see it.
const lockHeader = "# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n"

// LockText is the lockfile TEXT: canonical Aontu, one line, keys
// sorted. Built as source and canonicalised by the ENGINE rather than
// printed by hand, so "canonical form" means what the language means by
// it and cannot drift from it.
func LockText(entries []ModLock, opts *ModOptions) string {
	parts := make([]string, 0, len(entries))
	for _, e := range entries {
		parts = append(parts,
			quote(e.Mod)+":{"+
				"\"canon\":"+quote(e.Canon)+","+
				"\"oci\":"+quote(e.Oci)+","+
				"\"v\":"+quote(e.V)+"}")
	}
	return evalMod("{\"lock\":{"+strings.Join(parts, ",")+"}}", "mod-lock.aon", opts).canon
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// ModTidy resolves the closure by MVS and rewrites the lockfile.
func ModTidy(root string, opts *ModOptions) ModTidyReport {
	previous := readLock(root)
	selected := map[string]string{}
	missing := map[string]bool{}

	// The closure, breadth-first from the project's own declarations. A
	// module already selected at a version at least as high contributes
	// nothing new, which is what makes this terminate without a cycle
	// check: the selected version only ever rises.
	frontier := declaredDeps(filepath.Join(root, "mod.aon"), opts)
	for 0 < len(frontier) {
		next := map[string]string{}

		mods := make([]string, 0, len(frontier))
		for mod := range frontier {
			mods = append(mods, mod)
		}
		sort.Strings(mods)

		for _, mod := range mods {
			want := frontier[mod]
			if have, ok := selected[mod]; ok && 0 <= VersionCompare(have, want) {
				continue
			}
			selected[mod] = want

			ref, ok := usableRef(mod)
			if !ok {
				// A dependency key this tooling cannot act on names
				// nothing this resolver can find, which is the same
				// answer as a module that is not there (see usableRef).
				missing[mod] = true
				continue
			}

			dir := modStoreDir(root, ref, previous[mod].Canon, opts.cache())
			if "" == dir {
				missing[mod] = true
				continue
			}

			for key, v := range declaredDeps(filepath.Join(dir, "mod.aon"), opts) {
				if bid, ok := next[key]; !ok || 0 > VersionCompare(bid, v) {
					next[key] = v
				}
			}
		}

		frontier = next
	}

	mods := make([]string, 0, len(selected))
	for mod := range selected {
		mods = append(mods, mod)
	}
	sort.Strings(mods)

	lock := []ModLock{}
	unevaluable := []string{}
	for _, mod := range mods {
		if missing[mod] {
			continue
		}
		ref, _ := usableRef(mod)
		dir := modStoreDir(root, ref, previous[mod].Canon, opts.cache())
		main := filepath.Join(dir, moduleMain(filepath.Join(dir, "mod.aon"), 0))
		hash := ""
		if data, err := os.ReadFile(main); nil == err {
			got := evalMod(toValidSource(string(data)), main, opts)
			if !got.ok {
				unevaluable = append(unevaluable, mod)
				continue
			}
			hash = got.hash
		}
		lock = append(lock, ModLock{
			Mod:   mod,
			V:     selected[mod],
			Canon: hash,
			// Carried over: the OCI digest is the registry's word about
			// the bytes it served, and nothing local can hear it.
			Oci: previous[mod].Oci,
		})
	}

	miss := make([]string, 0, len(missing))
	for mod := range missing {
		miss = append(miss, mod)
	}
	sort.Strings(miss)
	sort.Strings(unevaluable)

	held := 0 == len(miss) && 0 == len(unevaluable)
	if held {
		_ = os.MkdirAll(filepath.Join(root, "aontu_meta"), 0o755)
		_ = os.WriteFile(filepath.Join(root, "aontu_meta", "mod-lock.aon"),
			[]byte(lockHeader+LockText(lock, opts)+"\n"), 0o600)
	}

	verdict := "ok"
	if 0 < len(unevaluable) {
		verdict = "error"
	} else if 0 < len(miss) {
		verdict = "missing"
	}
	return ModTidyReport{
		Verdict: verdict, Lock: lock, Missing: miss,
		Unevaluable: unevaluable,
	}
}

func ModVerify(root string, opts *ModOptions) ModVerifyReport {
	locked := readLock(root)
	verified := []string{}
	mismatched := []ModMismatch{}
	missing := []string{}

	unlocked := []string{}
	for mod := range declaredDeps(filepath.Join(root, "mod.aon"), opts) {
		if _, ok := locked[mod]; !ok {
			unlocked = append(unlocked, mod)
		}
	}
	sort.Strings(unlocked)

	mods := make([]string, 0, len(locked))
	for mod := range locked {
		mods = append(mods, mod)
	}
	sort.Strings(mods)

	for _, mod := range mods {
		ref, ok := usableRef(mod)
		if !ok {
			missing = append(missing, mod)
			continue
		}
		dir := modStoreDir(root, ref, locked[mod].Canon, opts.cache())
		if "" == dir {
			missing = append(missing, mod)
			continue
		}
		main := filepath.Join(dir, moduleMain(filepath.Join(dir, "mod.aon"), 0))
		data, err := os.ReadFile(main)
		if nil != err {
			missing = append(missing, mod)
			continue
		}

		got := evalMod(toValidSource(string(data)), main, opts)
		want := locked[mod].Canon
		if got.ok && want == got.hash {
			verified = append(verified, mod)
			continue
		}
		shown := ""
		if got.ok {
			shown = got.hash
		}
		mismatched = append(mismatched,
			ModMismatch{Mod: mod, Want: want, Got: shown})
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
	return ModVerifyReport{
		Verdict: verdict, Verified: verified,
		Mismatched: mismatched, Unlocked: unlocked, Missing: missing,
	}
}

// ModVendor materialises the locked closure into `aontu_meta/vendor/`.
func ModVendor(root string, opts *ModOptions) ModVendorReport {
	locked := readLock(root)

	mods := make([]string, 0, len(locked))
	for mod := range locked {
		mods = append(mods, mod)
	}
	sort.Strings(mods)

	vendored := []string{}
	missing := []string{}

	vendorRoot := filepath.Join(root, "aontu_meta", "vendor")

	for _, mod := range mods {
		ref, ok := usableRef(mod)
		if !ok {
			missing = append(missing, mod)
			continue
		}
		from := modStoreDir(root, ref, locked[mod].Canon, opts.cache())
		if "" == from {
			missing = append(missing, mod)
			continue
		}
		to := moduleDir(vendorRoot, ref)
		if from != to {
			if err := copyTree(from, to); nil != err { //coverage:ignore a readable store copies
				missing = append(missing, mod)
				continue
			}
		}
		vendored = append(vendored, mod)
	}

	verdict := "ok"
	if 0 < len(missing) {
		verdict = "missing"
	}
	return ModVendorReport{Verdict: verdict, Vendored: vendored, Missing: missing}
}

// copyTree copies a whole module directory. Modules are source trees —
// that is what an OCI layer holds — so this walks rather than reading
// one file.
func copyTree(from, to string) error {
	if err := os.MkdirAll(to, 0o755); nil != err { //coverage:ignore a writable project makes dirs
		return err
	}
	entries, err := os.ReadDir(from)
	if nil != err { //coverage:ignore the caller stat'd this directory
		return err
	}
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
	if nil != err { //coverage:ignore the directory listing named this file
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if nil != err { //coverage:ignore a writable project creates files
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}


// ModuleConfigMediaType is the config media type the design fixes: an
// Aontu module is not an image, and the type is what tells a registry
// so.
const ModuleConfigMediaType = "application/vnd.aontu.module.v1+json"

const (
	ModuleAnnotationCanon = "com.github.rjrodger.aontu.canon"
	ModuleAnnotationMajor = "com.github.rjrodger.aontu.major"
)

// ModManifestReport is the OCI artifact description a publish would
// push, and the gate's verdict on whether it may be.
type ModManifestReport struct {
	Annotations map[string]string `json:"annotations"`
	Canon       string            `json:"canon"`
	Config      string            `json:"config"`
	Files       []string          `json:"files"`
	Findings    []VetFinding      `json:"findings"`
	Missing     []string          `json:"missing"`
	Mod         string            `json:"mod"`
	Verdict     string            `json:"verdict"`
	Version     string            `json:"version"`
}

// modSelf is what a module file says about ITSELF. Distinct from
// declaredDeps, which reads what it says about others.
type modSelf struct {
	path    string
	version string
	main    string
}

func readModSelf(dir string, opts *ModOptions) modSelf {
	self := modSelf{main: "main.aon"}
	file := filepath.Join(dir, "mod.aon")
	data, err := os.ReadFile(file)
	if nil != err {
		return self
	}
	gen, ok := evalMod(toValidSource(string(data)), file, opts).gen.(map[string]any)
	if !ok {
		return self
	}
	mod, ok := gen["mod"].(map[string]any)
	if !ok {
		return self
	}
	str := func(k string) string {
		s, _ := mod[k].(string)
		return s
	}
	self.path = str("path")
	self.version = str("version")
	if m := str("main"); "" != m {
		self.main = m
	}
	return self
}

// majorOf is the leading numeric component of a version, which is the
// major an import spells. Empty when the version does not start with
// one: a version whose major cannot be read cannot be published under a
// module path, because the path is where the major lives.
func majorOf(version string) string {
	end := 0
	for end < len(version) && '0' <= version[end] && version[end] <= '9' {
		end++
	}
	return version[:end]
}

func layerFiles(dir, prefix string) []string {
	out := []string{}
	entries, err := os.ReadDir(dir)
	if nil != err { //coverage:ignore the caller stat'd this directory
		return out
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})
	for _, e := range entries {
		if "aontu_meta" == e.Name() {
			continue
		}
		rel := e.Name()
		if "" != prefix {
			rel = prefix + "/" + e.Name()
		}
		if e.IsDir() {
			out = append(out, layerFiles(filepath.Join(dir, e.Name()), rel)...)
			continue
		}
		out = append(out, rel)
	}
	return out
}

// ModManifest is `aontu mod manifest`: the OCI artifact description a
// publish would push, and the gate that decides whether it may be.
// against is the prior version's module directory, or empty for no gate.
func ModManifest(root, against string, opts *ModOptions) ModManifestReport {
	self := readModSelf(root, opts)
	major := majorOf(self.version)

	missing := []string{}
	if "" == self.path {
		missing = append(missing, "mod.path")
	}
	if "" == major {
		missing = append(missing, "mod.version")
	}
	main := filepath.Join(root, self.main)
	if _, err := os.Stat(main); nil != err {
		missing = append(missing, self.main)
	}

	mod := ""
	if "" != self.path && "" != major {
		mod = self.path + "@" + major
	}

	report := ModManifestReport{
		Verdict:     "ok",
		Mod:         mod,
		Version:     self.version,
		Config:      ModuleConfigMediaType,
		Annotations: map[string]string{},
		Files:       []string{},
		Missing:     []string{},
		Findings:    []VetFinding{},
	}

	if 0 < len(missing) {
		sort.Strings(missing)
		report.Verdict = "error"
		report.Missing = missing
		return report
	}

	data, err := os.ReadFile(main)
	if nil != err { //coverage:ignore the missing-entry arm above stat'd this
		report.Verdict = "error"
		return report
	}
	newSrc := toValidSource(string(data))
	got := evalMod(newSrc, main, opts)
	// Nothing to pin: ModTidy refuses the same way.
	if !got.ok {
		report.Verdict = "error"
		report.Missing = []string{self.main}
		return report
	}
	report.Canon = got.hash
	report.Files = layerFiles(root, "")
	report.Annotations = map[string]string{
		ModuleAnnotationCanon:              report.Canon,
		ModuleAnnotationMajor:              major,
		"org.opencontainers.image.title":   self.path,
		"org.opencontainers.image.version": self.version,
	}

	if "" == against {
		return report
	}

	// THE PUBLISH-TIME BREAKING GATE. The semantics of "breaking" belong
	// wholly to G3 (go/subsume.go); this is the wiring, at the one place
	// versions are minted.
	prior := readModSelf(against, opts)
	priorMain := filepath.Join(against, prior.main)
	priorData, err := os.ReadFile(priorMain)
	if nil != err {
		report.Verdict = "error"
		report.Missing = []string{prior.main}
		return report
	}

	// A MAJOR BUMP IS WHERE BREAKING IS ALLOWED. The major lives in the
	// module path, so a consumer of `@1` never sees `@2` unless it asks:
	// checking compatibility across majors would forbid the one change
	// the version scheme exists to express.
	if majorOf(prior.version) != major {
		return report
	}

	gate := Subsume(newSrc, toValidSource(string(priorData)), &SubsumeOptions{
		GeneralURL:   main,
		SpecificURL:  priorMain,
		GeneralPath:  main,
		SpecificPath: priorMain,
	})

	if nil != gate.Findings {
		report.Findings = gate.Findings
	}
	report.Verdict = manifestVerdict[gate.Verdict]
	return report
}

var manifestVerdict = map[string]string{
	SubsumeYes:       "ok",
	SubsumeNo:        "breaking",
	SubsumeUndecided: "undecided",
	SubsumeError:     "error",
}

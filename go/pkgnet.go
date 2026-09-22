/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// THE CLIENT HALF OF THE PACKAGE REPOSITORY (aontu-lang/system, spec/),
// mirroring ts/src/pkg-net.ts: acquisition, sync, publication and the
// local registry, over one injected transport.

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type HTTPResponse struct {
	Status int
	Body   []byte
}

type PublishParts struct {
	Manifest []byte
	Proof    []byte
	Archive  []byte
}

// PkgHTTP is the seam. Get reads one object; Post sends one publish. A
// transport failure is status 0.
type PkgHTTP interface {
	Get(url string) HTTPResponse
	Post(url string, parts PublishParts, token string) HTTPResponse
}

const (
	DefaultBase  = "https://pkg.aontu.dev"
	DefaultWrite = "https://publish.aontu.dev"
	PublishPath  = "/v1/publish"

	CooldownHours = 72
	ClosureMax    = 1024

	SignatureEncoding = "aontu-signature/v1"
)

var (
	versionRe = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`)
	digestRe  = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	canonRe   = regexp.MustCompile(`^aon1-[A-Za-z0-9_-]{43}$`)
	keyIDRe   = regexp.MustCompile(`^ed25519:[A-Za-z0-9_-]{43}$`)
	sigRe     = regexp.MustCompile(`^[A-Za-z0-9_-]{86}$`)
	patternRe = regexp.MustCompile(
		`^\*$|^[a-z0-9.-]+$|^[a-z0-9.-]+/[A-Za-z0-9._/-]+$|^[a-z0-9.-]+/\*$|^[a-z0-9.-]+/[A-Za-z0-9._/-]+/\*$`)
	relElemRe = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
)

type TrustEntry struct {
	Signer    string
	Inclusion string
}

type RepoConfig struct {
	Base        []string
	Write       string
	Private     []string
	PrivateBase []string
	Trust       map[string]TrustEntry
}

type PkgEvent struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type PkgRefusalReport struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Pkg     string `json:"pkg,omitempty"`
}

// PkgRefusal is a check that did not hold, raised where it fails and
// caught at the verb.
type PkgRefusal struct {
	Code    string
	Message string
	Pkg     string
}

func (r *PkgRefusal) Error() string { return r.Code + ": " + r.Message }

func (r *PkgRefusal) report() *PkgRefusalReport {
	return &PkgRefusalReport{Code: r.Code, Message: r.Message, Pkg: r.Pkg}
}

func refuse(code, msg, pkg string) {
	panic(&PkgRefusal{Code: code, Message: msg, Pkg: pkg})
}

// catchRefusal answers the refusal fn raised, if any. Another panic
// propagates.
func catchRefusal(fn func()) (refusal *PkgRefusal) {
	defer func() {
		if r := recover(); nil != r {
			if ref, ok := r.(*PkgRefusal); ok {
				refusal = ref
				return
			}
			panic(r)
		}
	}()
	fn()
	return nil
}

func IsLoopback(raw string) bool {
	u, err := url.Parse(raw)
	if nil != err || "http" != u.Scheme {
		return false
	}
	h := u.Hostname()
	return "127.0.0.1" == h || "localhost" == h || "::1" == h
}

// BaseAdmitted: https, or http on a loopback host (ADR-039 part 10).
func BaseAdmitted(raw string) bool {
	u, err := url.Parse(raw)
	if nil != err {
		return false
	}
	return "https" == u.Scheme || IsLoopback(raw)
}

type RepoOverrides struct {
	Base  []string
	Write string
}

func strList(v any) []string {
	out := []string{}
	if list, ok := v.([]any); ok {
		for _, e := range list {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
	}
	return out
}

// repoConfig is the project's trust configuration: `repo` in its
// package file, the defaults where it is silent, the command line over
// both.
func repoConfig(root string, opts *PkgOptions, over RepoOverrides) RepoConfig {
	repo := map[string]any{}
	if data, err := os.ReadFile(filepath.Join(root, pkgFile)); nil == err {
		if gen, ok := evalPkg(toValidSource(string(data)), filepath.Join(root, pkgFile), opts).gen.(map[string]any); ok {
			if r, ok := gen["repo"].(map[string]any); ok {
				repo = r
			}
		}
	}

	trust := map[string]TrustEntry{"*": {Signer: "forge", Inclusion: "required"}}
	if declared, ok := repo["trust"].(map[string]any); ok {
		for _, pattern := range sortedKeys(declared) {
			e, ok := declared[pattern].(map[string]any)
			if !patternRe.MatchString(pattern) || !ok {
				refuse("config_invalid", "repo.trust: "+pattern+" is not a pattern", "")
			}
			signer, _ := e["signer"].(string)
			if "forge" != signer && !keyIDRe.MatchString(signer) {
				refuse("config_invalid",
					"repo.trust: "+pattern+" names no signer (forge, or ed25519:<key>)", "")
			}
			inclusion := "required"
			if "none" == e["inclusion"] {
				inclusion = "none"
			}
			trust[pattern] = TrustEntry{Signer: signer, Inclusion: inclusion}
		}
	}

	priv := strList(repo["private"])
	for _, p := range priv {
		if !patternRe.MatchString(p) {
			refuse("config_invalid", "repo.private: "+p+" is not a pattern", "")
		}
	}
	self := packageSelf(root, opts)
	if "" != self.Path && "private" == self.Publish && !contains(priv, self.Path) {
		priv = append(priv, self.Path)
	}

	base := over.Base
	if nil == base {
		base = strList(repo["base"])
		if 0 == len(base) {
			base = []string{DefaultBase}
		}
	}
	write := over.Write
	if "" == write {
		write = DefaultWrite
		if w, ok := repo["write"].(string); ok {
			write = w
		}
	}
	privateBase := strList(repo["private_base"])
	for _, b := range append(append(append([]string{}, base...), write), privateBase...) {
		if !BaseAdmitted(b) {
			refuse("base_not_https", "repository base is not https: "+b, "")
		}
	}
	return RepoConfig{Base: base, Write: write, Private: priv, PrivateBase: privateBase, Trust: trust}
}

// PatternMatches: a path, a path with `/*` beneath it, or `*` alone.
func PatternMatches(pattern, pkg string) bool {
	if "*" == pattern {
		return true
	}
	if strings.HasSuffix(pattern, "/*") {
		prefix := pattern[:len(pattern)-2]
		return pkg == prefix || strings.HasPrefix(pkg, prefix+"/")
	}
	return pattern == pkg
}

// trustEntryFor is the most specific entry: an exact path, then the
// longest prefix, then the default.
func trustEntryFor(config RepoConfig, pkg string) TrustEntry {
	best := "*"
	for _, pattern := range sortedKeys(config.Trust) {
		if !PatternMatches(pattern, pkg) {
			continue
		}
		if pattern == pkg || (best != pkg && len(pattern) > len(best)) {
			best = pattern
		}
	}
	return config.Trust[best]
}

func isPrivateName(config RepoConfig, pkg string) bool {
	for _, p := range config.Private {
		if PatternMatches(p, pkg) {
			return true
		}
	}
	return false
}

// PkgURLPath is a package path as the layout spells it.
func PkgURLPath(pkg string) string {
	elems := strings.Split(pkg, "/")
	for i, e := range elems {
		elems[i] = escapeElem(e)
	}
	return strings.Join(elems, "/")
}

// ObjectPath is the read-path layout (spec layout.objects).
func ObjectPath(kind, pkg, version string) string {
	p := "/pkg/" + PkgURLPath(pkg)
	switch kind {
	case "list":
		return p + "/@v/list"
	case "latest":
		return p + "/@latest"
	case "archive":
		return p + "/@v/" + version + ".zip"
	case "manifest":
		return p + "/@v/" + version + ".manifest"
	case "signature":
		return p + "/@v/" + version + ".sig"
	case "sigstore":
		return p + "/@v/" + version + ".sigstore.json"
	case "advisory":
		return "/advisory/" + PkgURLPath(pkg) + ".aontu"
	}
	return "/tombstone/" + PkgURLPath(pkg) + "/@v/" + version + ".aontu"
}

func Timestamp(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05Z")
}

func parseDoc(b []byte) (map[string]any, bool) {
	var doc any
	if err := json.Unmarshal([]byte(lockJSON(string(b))), &doc); nil != err {
		return nil, false
	}
	m, ok := doc.(map[string]any)
	return m, ok
}

// canonLine is one canonical line, the form every stored object takes.
func canonLine(obj any, opts *PkgOptions, name string) []byte {
	src, _ := json.Marshal(obj)
	return []byte(evalPkg(string(src), name, opts).canon + "\n")
}

// THE KEY PROVIDER (ADR-024 part 4): an Ed25519 key signs the manifest's
// digest, domain-separated by the encoding name.
func signedBytes(over string) []byte {
	return []byte(SignatureEncoding + "\n" + over + "\n")
}

func KeyIDOf(pub ed25519.PublicKey) string {
	return "ed25519:" + base64.RawURLEncoding.EncodeToString(pub)
}

func privateKeyFromPEM(pemText string) (ed25519.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemText))
	if nil == block {
		return nil, &PkgRefusal{Code: "key_invalid", Message: "the key file is not PEM"}
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if nil != err {
		return nil, err
	}
	priv, ok := key.(ed25519.PrivateKey)
	if !ok {
		return nil, &PkgRefusal{Code: "key_invalid", Message: "the key is not Ed25519"}
	}
	return priv, nil
}

func KeyIDFromPEM(pemText string) (string, error) {
	priv, err := privateKeyFromPEM(pemText)
	if nil != err {
		return "", err
	}
	return KeyIDOf(priv.Public().(ed25519.PublicKey)), nil
}

// Keygen is `aontu pkg keygen`: a new signing key, written once. The
// answer is the signer id a consumer names, or the reason nothing was
// written.
func Keygen(file string) (signer string, refused string) {
	if _, err := os.Stat(file); nil == err {
		return "", file + " exists; a key is written once"
	}
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if nil != err { //coverage:ignore the platform's random source answers
		return "", err.Error()
	}
	der, _ := x509.MarshalPKCS8PrivateKey(priv)
	_ = os.MkdirAll(filepath.Dir(file), 0o755)
	if err := os.WriteFile(file, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0o600); nil != err {
		return "", file + ": " + err.Error()
	}
	return KeyIDOf(priv.Public().(ed25519.PublicKey)), ""
}

type KeyProof struct {
	Encoding  string `json:"encoding"`
	Kind      string `json:"kind"`
	Over      string `json:"over"`
	Signature string `json:"signature"`
	Signer    string `json:"signer"`
}

func SignDigest(pemText, over string) (KeyProof, error) {
	priv, err := privateKeyFromPEM(pemText)
	if nil != err {
		return KeyProof{}, err
	}
	sig := ed25519.Sign(priv, signedBytes(over))
	return KeyProof{
		Kind: "key", Encoding: SignatureEncoding, Over: over,
		Signer:    KeyIDOf(priv.Public().(ed25519.PublicKey)),
		Signature: base64.RawURLEncoding.EncodeToString(sig),
	}, nil
}

// The small-order points of the curve, by y with the sign bit cleared:
// a signature under one verifies for any message. The last entry is p,
// and every encoding at or above it is not canonical.
var smallOrderY = map[string]bool{
	"0000000000000000000000000000000000000000000000000000000000000000": true,
	"0100000000000000000000000000000000000000000000000000000000000000": true,
	"26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05": true,
	"c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a": true,
	"ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f": true,
}

func SmallOrderKey(raw []byte) bool {
	y := append([]byte(nil), raw...)
	y[31] &= 0x7f
	h := hex.EncodeToString(y)
	return smallOrderY[h] || (strings.HasSuffix(h, strings.Repeat("ff", 30)+"7f") && 0xed <= y[0])
}

func VerifyKeyProof(proof map[string]any, over, signer string) string {
	sig, _ := proof["signature"].(string)
	id, _ := proof["signer"].(string)
	if nil == proof || "key" != proof["kind"] || SignatureEncoding != proof["encoding"] ||
		"" == sig || !keyIDRe.MatchString(id) {
		return "the proof is not an aontu-signature/v1 key proof"
	}
	if proof["over"] != over {
		o, _ := proof["over"].(string)
		return "the proof signs " + o + ", not this manifest"
	}
	if id != signer {
		return "signed by " + id + "; the trust entry accepts " + signer
	}
	strict := base64.RawURLEncoding.Strict()
	raw, err1 := strict.DecodeString(id[len("ed25519:"):])
	sigBytes, err2 := strict.DecodeString(sig)
	if !sigRe.MatchString(sig) || nil != err1 || nil != err2 || 32 != len(raw) || 64 != len(sigBytes) {
		return "the proof carries a malformed key or signature"
	}
	if SmallOrderKey(raw) {
		return "the signer is a key of small order"
	}
	if !ed25519.Verify(ed25519.PublicKey(raw), signedBytes(over), sigBytes) {
		return "the signature does not verify"
	}
	return ""
}

// PackagePath: domain-shaped, the element rules, never an alias.
func PackagePath(v any) bool {
	s, ok := v.(string)
	return ok && !isAlias(s) && usableKey(s)
}

func isInt(v any) bool {
	f, ok := v.(float64)
	return ok && f == float64(int64(f))
}

// ManifestError checks T.Manifest field by field: a served object is
// input.
func ManifestError(m map[string]any) string {
	if nil == m || ManifestSchema != m["schema"] {
		return "schema is not " + ManifestSchema
	}
	if !PackagePath(m["package"]) {
		return "package is not a package path"
	}
	if v, _ := m["version"].(string); !versionRe.MatchString(v) {
		return "version is not MAJOR.MINOR.PATCH"
	}
	if "public" != m["publish"] && "private" != m["publish"] {
		return "publish is not public or private"
	}
	a, _ := m["archive"].(map[string]any)
	digest, _ := a["digest"].(string)
	files, _ := a["files"].([]any)
	if nil == a || "zip" != a["format"] || !digestRe.MatchString(digest) ||
		!isInt(a["size"]) || 0 == len(files) {
		return "archive is not a zip with a digest, a size and files"
	}
	for _, f := range files {
		fm, _ := f.(map[string]any)
		p, _ := fm["path"].(string)
		d, _ := fm["digest"].(string)
		if nil == fm || "" == p || !digestRe.MatchString(d) || !isInt(fm["size"]) || "" != RelPathError(p) {
			return "archive.files names a file without a path, a digest and a size"
		}
	}
	mods, _ := m["modules"].([]any)
	var mod map[string]any
	if 1 == len(mods) {
		mod, _ = mods[0].(map[string]any)
	}
	main, _ := mod["main"].(string)
	canon, _ := mod["canon"].(string)
	if nil == mod || mod["path"] != m["package"] || "" == main || !canonRe.MatchString(canon) {
		return "modules is not the one module at the package path with an entry and a canon-hash"
	}
	held := false
	for _, f := range files {
		fm, _ := f.(map[string]any)
		if fm["path"] == main {
			held = true
		}
	}
	if "" != RelPathError(main) || !held {
		return "modules names an entry the archive does not hold"
	}
	deps, ok := m["deps"].(map[string]any)
	if !ok {
		return "deps is not a map"
	}
	for _, k := range sortedKeys(deps) {
		d, _ := deps[k].(map[string]any)
		v, _ := d["v"].(string)
		if !versionRe.MatchString(v) || (nil != d["pkg"] && !PackagePath(d["pkg"])) {
			return "deps." + k + " is not a minimum version"
		}
	}
	if _, ok := m["published"].(string); !ok {
		return "published is not a timestamp"
	}
	if nil != m["moved"] && !PackagePath(m["moved"]) {
		return "moved is not a package path"
	}
	if r, present := m["retract"]; present {
		list, ok := r.([]any)
		if !ok {
			return "retract is not a list of versions"
		}
		for _, v := range list {
			if s, ok := v.(string); !ok || !versionRe.MatchString(s) {
				return "retract is not a list of versions"
			}
		}
	}
	return ""
}

// RelPathError: a path inside an archive, forward slashes, the element
// rules, never absolute and never escaping.
const relPathMaxElements = 32

var reservedNameRe = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$`)

func RelPathError(p string) string {
	if "" == p || 512 < len(p) || strings.HasPrefix(p, "/") || strings.HasSuffix(p, "/") {
		return "an entry path is empty, absolute or a directory"
	}
	elements := strings.Split(p, "/")
	if relPathMaxElements < len(elements) {
		return "an entry path has more than " + strconv.Itoa(relPathMaxElements) + " elements"
	}
	for _, e := range elements {
		if "" == e || strings.HasPrefix(e, ".") || strings.HasSuffix(e, ".") {
			return "an entry path element is empty or begins or ends with a dot"
		}
		if !relElemRe.MatchString(e) {
			return "an entry path element is outside the alphabet"
		}
		if reservedNameRe.MatchString(e) {
			return "an entry path element is a name a platform reserves"
		}
	}
	return ""
}

type acquired struct {
	pkg            string
	version        string
	canon          string
	archive        string
	manifestDigest string
	deps           map[string]Dependency
	dir            string
	// closure is the lock of everything beneath it: what the module was
	// evaluated against, so a dependant evaluates against the same.
	closure []LockEntry
}

type acquireCtx struct {
	opts     *PkgOptions
	http     PkgHTTP
	config   RepoConfig
	cache    string
	now      func() time.Time
	events   []PkgEvent
	fetched  []string
	acquired map[string]*acquired
	count    int
}

type versionEntry struct {
	version string
	seen    string
}

type objectAnswer struct {
	HTTPResponse
	base string
}

func getObject(ctx *acquireCtx, bases []string, path string) objectAnswer {
	last := objectAnswer{}
	for _, base := range bases {
		r := ctx.http.Get(strings.TrimSuffix(base, "/") + path)
		if 200 == r.Status {
			return objectAnswer{HTTPResponse: r, base: base}
		}
		last = objectAnswer{HTTPResponse: r, base: base}
	}
	return last
}

func basesFor(ctx *acquireCtx, pkg string) []string {
	if !isPrivateName(ctx.config, pkg) {
		return ctx.config.Base
	}
	if 0 == len(ctx.config.PrivateBase) {
		refuse("private_name_public_path",
			pkg+" is on the private list and repo.private_base names no repository", pkg)
	}
	return ctx.config.PrivateBase
}

func fetchList(ctx *acquireCtx, bases []string, pkg string) []versionEntry {
	r := getObject(ctx, bases, ObjectPath("list", pkg, ""))
	if 200 != r.Status {
		why := " (" + strconv.Itoa(r.Status) + " from " + r.base + ")"
		if 0 == r.Status {
			why = " (no repository answered)"
		}
		refuse("fetch_failed", "no version list for "+pkg+why, pkg)
	}
	doc, _ := parseDoc(r.Body)
	list, ok := doc["versions"].([]any)
	if doc["package"] != pkg || !ok {
		refuse("response_mismatch", "the version list served does not name "+pkg, pkg)
	}
	out := []versionEntry{}
	for _, e := range list {
		em, _ := e.(map[string]any)
		v, _ := em["version"].(string)
		seen, ok := em["seen"].(string)
		if !versionRe.MatchString(v) || !ok {
			refuse("response_mismatch", "the version list for "+pkg+" is malformed", pkg)
		}
		out = append(out, versionEntry{version: v, seen: seen})
	}
	sort.Slice(out, func(i, j int) bool { return 0 > VersionCompare(out[i].version, out[j].version) })
	// Every version the list offers is a version this client has seen:
	// its absence later is a rollback whichever version was taken.
	if "" != ctx.cache {
		subject := trustEntryFor(ctx.config, pkg).Signer
		for _, e := range out {
			recordSeen(ctx, pkg, e.version, subject)
		}
	}
	return out
}

func fetchAdvisory(ctx *acquireCtx, bases []string, pkg string) map[string]string {
	out := map[string]string{}
	r := getObject(ctx, bases, ObjectPath("advisory", pkg, ""))
	if 200 != r.Status {
		return out
	}
	doc, _ := parseDoc(r.Body)
	list, _ := doc["retracted"].([]any)
	for _, e := range list {
		em, _ := e.(map[string]any)
		v, ok1 := em["version"].(string)
		by, ok2 := em["by"].(string)
		if ok1 && ok2 {
			out[v] = by
		}
	}
	return out
}

// seenVersions is what this client has seen for a package, from its
// own records: a version absent from the list now is a rollback.
func seenVersions(ctx *acquireCtx, pkg string) []string {
	entries, err := os.ReadDir(cacheSeenDir(ctx.cache, pkg))
	if nil != err {
		return []string{}
	}
	out := []string{}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".aontu") {
			out = append(out, strings.TrimSuffix(e.Name(), ".aontu"))
		}
	}
	sort.Strings(out)
	return out
}

func recordSeen(ctx *acquireCtx, pkg, version, subject string) {
	dir := cacheSeenDir(ctx.cache, pkg)
	file := filepath.Join(dir, version+".aontu")
	if _, err := os.Stat(file); nil == err {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(file, canonLine(map[string]any{
		"package": pkg, "version": version, "seen": Timestamp(ctx.now()), "subject": subject,
	}, ctx.opts, "seen.aontu"), 0o600)
}

func cooldownEnd(seen string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339, seen)
	if nil != err {
		return time.Time{}, false
	}
	return t.Add(CooldownHours * time.Hour), true
}

// selectVersion (spec acquire step 6): the newest version outside the
// cooldown, timed from the repository's first-seen time (ADR-039 part
// 9), not retracted. A version named explicitly is taken as it is.
func selectVersion(ctx *acquireCtx, pkg string, list []versionEntry,
	advisory map[string]string, asked, fallback string) string {
	if "" != asked {
		return asked
	}
	priv := isPrivateName(ctx.config, pkg)
	now := ctx.now()
	var held *versionEntry
	for i := len(list) - 1; 0 <= i; i-- {
		e := list[i]
		if _, retracted := advisory[e.version]; retracted {
			continue
		}
		until, ok := cooldownEnd(e.seen)
		if !priv && (!ok || now.Before(until)) {
			if nil == held {
				held = &list[i]
			}
			continue
		}
		if nil != held {
			until, _ := cooldownEnd(held.seen)
			ctx.events = append(ctx.events, PkgEvent{
				Code: "cooldown_pending",
				Message: pkg + " " + held.version + " is inside the cooldown until " +
					Timestamp(until) + "; " + e.version + " was selected",
			})
		}
		return e.version
	}
	why := pkg + " has no selectable version"
	code := "fetch_failed"
	if nil != held {
		until, _ := cooldownEnd(held.seen)
		why = pkg + " " + held.version + " is inside the cooldown until " + Timestamp(until) +
			" and no earlier version is selectable"
		code = "cooldown_pending"
	}
	if "" != fallback {
		ctx.events = append(ctx.events, PkgEvent{Code: "cooldown_pending", Message: why})
		return fallback
	}
	refuse(code, why, pkg)
	return ""
}

func tombstoneReason(ctx *acquireCtx, bases []string, pkg, version string) (string, bool) {
	t := getObject(ctx, bases, ObjectPath("tombstone", pkg, version))
	if 200 != t.Status {
		return "", false
	}
	doc, _ := parseDoc(t.Body)
	if reason, ok := doc["reason"].(string); ok {
		return " (" + reason + ")", true
	}
	return "", true
}

func cachedObject(ctx *acquireCtx, pkg, name string) ([]byte, bool) {
	data, err := os.ReadFile(filepath.Join(cacheDownloadDir(ctx.cache, pkg), name))
	return data, nil == err
}

func fetchManifest(ctx *acquireCtx, bases []string, pkg, version string) ([]byte, map[string]any) {
	data, ok := cachedObject(ctx, pkg, version+".manifest")
	if !ok {
		r := getObject(ctx, bases, ObjectPath("manifest", pkg, version))
		if 200 != r.Status {
			if reason, tomb := tombstoneReason(ctx, bases, pkg, version); tomb {
				refuse("tombstoned", pkg+" "+version+" was withdrawn by the repository"+reason, pkg)
			}
			refuse("fetch_failed", "no manifest for "+pkg+" "+version, pkg)
		}
		data = r.Body
	}
	manifest, _ := parseDoc(data)
	if bad := ManifestError(manifest); "" != bad {
		refuse("manifest_invalid", "the manifest for "+pkg+" "+version+": "+bad, pkg)
	}
	if manifest["package"] != pkg || manifest["version"] != version {
		p, _ := manifest["package"].(string)
		v, _ := manifest["version"].(string)
		refuse("response_mismatch", "the manifest served names "+p+" "+v+", not "+pkg+" "+version, pkg)
	}
	return data, manifest
}

func fetchProof(ctx *acquireCtx, bases []string, pkg, version string, entry TrustEntry,
	manifestDigest string) []byte {
	if "forge" == entry.Signer {
		refuse("proof_signer_untrusted", "the trust entry for "+pkg+
			" names the forge signer, and this build verifies key proofs only;"+
			" name a key under repo.trust", pkg)
	}
	data, ok := cachedObject(ctx, pkg, version+".sig")
	if !ok {
		r := getObject(ctx, bases, ObjectPath("signature", pkg, version))
		if 200 != r.Status {
			refuse("proof_missing", "no proof is served for "+pkg+" "+version, pkg)
		}
		data = r.Body
	}
	doc, _ := parseDoc(data)
	if bad := VerifyKeyProof(doc, manifestDigest, entry.Signer); "" != bad {
		code := "proof_invalid"
		if strings.HasPrefix(bad, "signed by") {
			code = "proof_signer_untrusted"
		}
		refuse(code, "the proof for "+pkg+" "+version+": "+bad, pkg)
	}
	if "required" == entry.Inclusion {
		refuse("inclusion_missing", "the trust entry for "+pkg+
			" requires log inclusion, which a key proof does not carry in this build;"+
			" set inclusion: none for a key signer", pkg)
	}
	return data
}

func manifestArchive(manifest map[string]any) map[string]any {
	a, _ := manifest["archive"].(map[string]any)
	return a
}

func fetchArchive(ctx *acquireCtx, bases []string, pkg, version string, manifest map[string]any) []byte {
	data, ok := cachedObject(ctx, pkg, version+".zip")
	if !ok {
		r := getObject(ctx, bases, ObjectPath("archive", pkg, version))
		if 200 != r.Status {
			refuse("fetch_failed", "no archive for "+pkg+" "+version, pkg)
		}
		data = r.Body
	}
	if ArchiveLimitBytes < len(data) {
		refuse("archive_too_large", "the archive for "+pkg+" "+version+
			" is over the compressed cap", pkg)
	}
	digest := Sha256Hex(data)
	want, _ := manifestArchive(manifest)["digest"].(string)
	if digest != want {
		refuse("archive_digest_mismatch", "the archive for "+pkg+" "+version+
			" is "+digest+", not "+want, pkg)
	}
	return data
}

// unpack (spec acquire step 11): the entry rules the write path
// applies, applied again here, because only this protects against a
// hostile mirror; then every file against the manifest.
func unpack(pkg, version string, zip []byte, manifest map[string]any) []ZipEntry {
	entries, err := UnzipCanonical(zip)
	if nil != err {
		refuse("archive_not_canonical", "the archive for "+pkg+" "+version+": "+err.Error(), pkg)
	}
	if ArchiveLimitFiles < len(entries) {
		refuse("archive_too_many_files", "the archive for "+pkg+" "+version+
			" is over the file-count cap", pkg)
	}
	total := 0
	listed := map[string]map[string]any{}
	files, _ := manifestArchive(manifest)["files"].([]any)
	for _, f := range files {
		fm, _ := f.(map[string]any)
		p, _ := fm["path"].(string)
		listed[p] = fm
	}
	for _, e := range entries {
		if bad := RelPathError(e.Path); "" != bad {
			refuse("archive_path_invalid", "the archive for "+pkg+" "+version+": "+
				bad+" ("+e.Path+")", pkg)
		}
		if !ArchiveAdmits(e.Path) {
			refuse("archive_entry_forbidden", "the archive for "+pkg+" "+version+
				" carries "+e.Path+", which the allowlist does not admit", pkg)
		}
		total += len(e.Data)
		if ArchiveLimitFileBytes < len(e.Data) || ArchiveLimitUnpacked < total {
			refuse("archive_bomb", "the archive for "+pkg+" "+version+
				" unpacks past the size cap", pkg)
		}
		f, ok := listed[e.Path]
		size, _ := f["size"].(float64)
		if !ok || f["digest"] != Sha256Hex(e.Data) || int(size) != len(e.Data) {
			refuse("file_manifest_mismatch", "the archive for "+pkg+" "+version+
				" holds "+e.Path+", which the manifest does not list as served", pkg)
		}
		delete(listed, e.Path)
	}
	if 0 < len(listed) {
		refuse("file_manifest_mismatch", "the archive for "+pkg+" "+version+
			" lacks "+sortedKeys(listed)[0]+", which the manifest lists", pkg)
	}
	return entries
}

func writeTree(dir string, entries []ZipEntry) {
	for _, e := range entries {
		full := filepath.Join(append([]string{dir}, strings.Split(e.Path, "/")...)...)
		_ = os.MkdirAll(filepath.Dir(full), 0o755)
		_ = os.WriteFile(full, e.Data, 0o600)
	}
}

func randomHex() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// acquire (spec ops.acquire): one package, its deps first, the pins
// checked in order -- proof, bytes, meaning -- then recorded, cached
// and returned for the lock.
func acquire(ctx *acquireCtx, pkg, asked string, depth int) *acquired {
	// Excluded: the evaluator refuses a chain this deep first, and a
	// publisher cannot mint the seventeenth link.
	if moduleMaxDepth <= depth { //coverage:ignore see above
		refuse("module_depth", "the closure under "+pkg+" nests past "+strconv.Itoa(moduleMaxDepth), pkg)
	}
	// Excluded: a thousand-package closure is beyond a unit test, and
	// the guard is one comparison.
	if ClosureMax <= ctx.count { //coverage:ignore see above
		refuse("closure_too_large", "the closure exceeds "+strconv.Itoa(ClosureMax)+" packages", pkg)
	}
	bases := basesFor(ctx, pkg)
	entry := trustEntryFor(ctx.config, pkg)

	list := fetchList(ctx, bases, pkg)
	for _, v := range seenVersions(ctx, pkg) {
		if _, tomb := tombstoneReason(ctx, bases, pkg, v); !hasVersion(list, v) && !tomb {
			refuse("list_rollback", pkg+" "+v+" was seen before and is absent from the list", pkg)
		}
	}
	advisory := fetchAdvisory(ctx, bases, pkg)
	version := selectVersion(ctx, pkg, list, advisory, asked, "")
	newest := ""
	if 0 < len(list) {
		newest = list[len(list)-1].version
	}
	if "" != asked && !hasVersion(list, asked) {
		if reason, tomb := tombstoneReason(ctx, bases, pkg, asked); tomb {
			refuse("tombstoned", pkg+" "+asked+" was withdrawn by the repository"+reason, pkg)
		}
		refuse("fetch_failed", pkg+" "+asked+" is not in the version list", pkg)
	}

	id := pkg + "@" + version
	if had, ok := ctx.acquired[id]; ok {
		return had
	}
	ctx.count++

	// The newest version speaks for the name: a move declared there
	// refuses every version, and nothing follows it.
	if "" != newest && newest != version {
		_, top := fetchManifest(ctx, bases, pkg, newest)
		if moved, ok := top["moved"].(string); ok {
			refuse("module_moved", pkg+" moved to "+moved+"; import that instead, nothing follows a move", pkg)
		}
	}
	manifestBytes, manifest := fetchManifest(ctx, bases, pkg, version)
	if moved, ok := manifest["moved"].(string); ok {
		refuse("module_moved", pkg+" moved to "+moved+"; import that instead, nothing follows a move", pkg)
	}
	manifestDigest := Sha256Hex(manifestBytes)
	proofBytes := fetchProof(ctx, bases, pkg, version, entry, manifestDigest)
	zip := fetchArchive(ctx, bases, pkg, version, manifest)
	entries := unpack(pkg, version, zip, manifest)

	// Deps first, at the minima the manifest declares: the module is
	// evaluated in its publisher's context, which is what its canon pins.
	deps := manifestDeps(manifest)
	pins := []LockEntry{}
	for _, key := range sortedKeys(deps) {
		target := deps[key].Pkg
		if "" == target {
			if isAlias(key) {
				refuse("manifest_invalid", "the manifest for "+pkg+" "+version+
					" declares "+key+" without the package it names", pkg)
			}
			target = key
		}
		dep := acquire(ctx, target, deps[key].V, depth+1)
		e := LockEntry{Key: key, V: dep.version, Canon: dep.canon, Archive: dep.archive, Manifest: dep.manifestDigest}
		if isAlias(key) {
			e.Pkg = target
		}
		pins = append(pins, e)
		for _, c := range dep.closure {
			if !hasKey(pins, c.Key) {
				pins = append(pins, c)
			}
		}
	}
	sort.Slice(pins, func(i, j int) bool { return pins[i].Key < pins[j].Key })

	tmp := filepath.Join(ctx.cache, "tmp", randomHex())
	_ = os.MkdirAll(filepath.Join(tmp, metaDir), 0o755)
	writeTree(tmp, entries)
	_ = os.WriteFile(filepath.Join(tmp, metaDir, "manifest.aontu"), manifestBytes, 0o600)
	_ = os.WriteFile(filepath.Join(tmp, metaDir, "proof.aontu"), proofBytes, 0o600)
	self := packageSelf(tmp, ctx.opts)
	mods, _ := manifest["modules"].([]any)
	mod, _ := mods[0].(map[string]any)
	main, _ := mod["main"].(string)
	canon, _ := mod["canon"].(string)
	if self.Path != pkg || self.Version != version || self.Main != main {
		_ = os.RemoveAll(tmp)
		refuse("manifest_invalid", "the package file inside "+pkg+" "+version+
			" disagrees with the manifest", pkg)
	}
	// The store tree keeps its own lock: the closure it was verified
	// against, so it verifies again from the cache alone. The vendored
	// copy loses it, and resolves against the consumer's lock instead.
	if 0 < len(pins) {
		_ = writeLock(tmp, pins, ctx.opts)
	}
	// The entry is in the archive: the manifest named it among the
	// files and every listed file was unpacked.
	mainFile := filepath.Join(tmp, main)
	data, _ := os.ReadFile(mainFile)
	got := evalPkg(toValidSource(string(data)), mainFile, ctx.opts)
	if !got.ok || got.hash != canon {
		_ = os.RemoveAll(tmp)
		means := got.hash
		if !got.ok {
			means = "nothing (it does not evaluate)"
		}
		refuse("module_integrity", pkg+" "+version+" means "+means+", and the manifest pins "+canon, pkg)
	}

	dir := cacheStoreDir(ctx.cache, got.hash, pkg)
	_ = os.RemoveAll(dir)
	_ = os.MkdirAll(filepath.Dir(dir), 0o755)
	_ = os.Rename(tmp, dir)

	down := cacheDownloadDir(ctx.cache, pkg)
	_ = os.MkdirAll(down, 0o755)
	for name, data := range map[string][]byte{
		version + ".zip": zip, version + ".manifest": manifestBytes, version + ".sig": proofBytes,
	} {
		if _, err := os.Stat(filepath.Join(down, name)); nil != err {
			_ = os.WriteFile(filepath.Join(down, name), data, 0o600)
		}
	}
	recordSeen(ctx, pkg, version, entry.Signer)

	out := &acquired{
		pkg: pkg, version: version, canon: got.hash, archive: Sha256Hex(zip),
		manifestDigest: manifestDigest, deps: deps, dir: dir, closure: pins,
	}
	ctx.acquired[id] = out
	ctx.fetched = append(ctx.fetched, pkg+" "+version)
	return out
}

func hasVersion(list []versionEntry, v string) bool {
	for _, e := range list {
		if e.version == v {
			return true
		}
	}
	return false
}

func hasKey(entries []LockEntry, key string) bool {
	for _, e := range entries {
		if e.Key == key {
			return true
		}
	}
	return false
}

func manifestDeps(manifest map[string]any) map[string]Dependency {
	out := map[string]Dependency{}
	deps, _ := manifest["deps"].(map[string]any)
	for k, v := range deps {
		d, _ := v.(map[string]any)
		ver, _ := d["v"].(string)
		pkg, _ := d["pkg"].(string)
		out[k] = Dependency{V: ver, Pkg: pkg}
	}
	return out
}

type PkgSyncReport struct {
	Changes     []string          `json:"changes"`
	Events      []PkgEvent        `json:"events"`
	Fetched     []string          `json:"fetched"`
	Forbidden   []string          `json:"forbidden"`
	Lock        []LockEntry       `json:"lock"`
	Mismatched  []PkgMismatch     `json:"mismatched"`
	Missing     []string          `json:"missing"`
	Refusal     *PkgRefusalReport `json:"refusal,omitempty"`
	Unevaluable []string          `json:"unevaluable"`
	Unlocked    []string          `json:"unlocked"`
	Vendored    []string          `json:"vendored"`
	Verdict     string            `json:"verdict"`
}

type SyncArgs struct {
	RepoOverrides
	Frozen bool
	Now    func() time.Time
}

func emptySync() PkgSyncReport {
	return PkgSyncReport{
		Verdict: "ok", Fetched: []string{}, Lock: []LockEntry{}, Vendored: []string{},
		Missing: []string{}, Unevaluable: []string{}, Forbidden: []string{},
		Mismatched: []PkgMismatch{}, Unlocked: []string{}, Changes: []string{}, Events: []PkgEvent{},
	}
}

func makeCtx(root string, opts *PkgOptions, http PkgHTTP, args SyncArgs) *acquireCtx {
	now := args.Now
	if nil == now {
		now = time.Now
	}
	return &acquireCtx{
		opts: opts, http: http, config: repoConfig(root, opts, args.RepoOverrides),
		cache: opts.cache(), now: now, events: []PkgEvent{}, fetched: []string{},
		acquired: map[string]*acquired{},
	}
}

// heldAt is where the project already holds a package at a version:
// its vendor tree, when the tree's own file agrees, else the cache,
// when the download tree has that version's manifest.
func heldAt(root, key, pkg, version string, ctx *acquireCtx) string {
	vendored := moduleDir(filepath.Join(root, metaDir, vendorDir), key)
	if _, err := os.Stat(filepath.Join(vendored, pkgFile)); nil == err {
		self := packageSelf(vendored, ctx.opts)
		if ("" == self.Version || self.Version == version) && ("" == self.Path || self.Path == pkg) {
			return vendored
		}
	}
	if data, err := os.ReadFile(filepath.Join(cacheDownloadDir(ctx.cache, pkg), version+".manifest")); nil == err {
		m, _ := parseDoc(data)
		mods, _ := m["modules"].([]any)
		if 0 < len(mods) {
			mod, _ := mods[0].(map[string]any)
			if canon, ok := mod["canon"].(string); ok {
				dir := cacheStoreDir(ctx.cache, canon, pkg)
				if _, err := os.Stat(filepath.Join(dir, pkgFile)); nil == err {
					return dir
				}
			}
		}
	}
	return ""
}

func pruneEmpty(dir, stop string) {
	for strings.HasPrefix(dir, stop) {
		entries, err := os.ReadDir(dir)
		if nil != err || 0 < len(entries) {
			return
		}
		_ = os.Remove(dir)
		dir = filepath.Dir(dir)
	}
}

// PkgSync (spec ops.sync): resolve by MVS, fetch what is missing,
// vendor, lock, verify. Idempotent, and Frozen refuses to change the
// lock.
func PkgSync(root string, opts *PkgOptions, http PkgHTTP, args SyncArgs) PkgSyncReport {
	report := emptySync()
	var ctx *acquireCtx
	if ref := catchRefusal(func() { ctx = makeCtx(root, opts, http, args) }); nil != ref {
		report.Verdict = "refused"
		report.Refusal = ref.report()
		return report
	}

	previous := readLock(root)
	selected := map[string]Dependency{}
	dirs := map[string]string{}
	missing := map[string]bool{}
	pending := map[string]bool{}
	frozenStop := false
	bid := func(deps map[string]Dependency) {
		for key, d := range deps {
			have, ok := selected[key]
			if !ok || 0 > VersionCompare(have.V, d.V) {
				if "" == d.Pkg {
					d.Pkg = have.Pkg
				}
				selected[key] = d
				pending[key] = true
			}
		}
	}
	target := func(key string) string { return targetOf(key, selected[key], previous[key]) }

	// Held packages are read before anything is fetched, so a held
	// dependant's bid raises a version before that version is requested.
	ref := catchRefusal(func() {
		bid(declaredDeps(filepath.Join(root, pkgFile), opts))
		for 0 < len(pending) {
			keys := sortedKeys(pending)
			key, dir := "", ""
			for _, k := range keys {
				if !usableKey(k) || "" == target(k) {
					key = k
					break
				}
			}
			if "" != key {
				missing[key] = true
				delete(pending, key)
				continue
			}
			for _, k := range keys {
				if dir = heldAt(root, k, target(k), selected[k].V, ctx); "" != dir {
					key = k
					break
				}
			}
			if "" == key {
				for _, k := range keys {
					if !args.Frozen || previous[k].V == selected[k].V {
						key = k
						break
					}
				}
				if "" == key {
					for _, k := range keys {
						was := previous[k].V
						if "" == was {
							was = "unlocked"
						}
						report.Changes = append(report.Changes, k+": "+was+" -> "+selected[k].V)
					}
					report.Verdict = "frozen"
					frozenStop = true
					return
				}
				dir = acquire(ctx, target(key), selected[key].V, 0).dir
			}
			delete(pending, key)
			dirs[key] = dir
			bid(declaredDeps(filepath.Join(dir, pkgFile), opts))
		}
	})
	report.Events = ctx.events
	sort.Strings(ctx.fetched)
	report.Fetched = ctx.fetched
	if nil != ref {
		report.Verdict = "refused"
		report.Refusal = ref.report()
		return report
	}
	if frozenStop {
		return report
	}

	// Materialise: the closure into the vendor tree, and nothing else
	// left there.
	vendorRoot := filepath.Join(root, metaDir, vendorDir)
	for _, key := range sortedKeys(dirs) {
		to := moduleDir(vendorRoot, key)
		if dirs[key] != to {
			_ = os.RemoveAll(to)
			_ = vendorCopy(dirs[key], to)
		}
		report.Vendored = append(report.Vendored, key)
	}
	// Pruning waits for the lock to be writable: a frozen sync that
	// refuses leaves the locked build whole.
	prune := func() {
		for _, key := range sortedKeys(previous) {
			if _, kept := selected[key]; !kept && usableKey(key) {
				_ = os.RemoveAll(moduleDir(vendorRoot, key))
				pruneEmpty(filepath.Dir(moduleDir(vendorRoot, key)), vendorRoot)
			}
		}
	}

	resolved := PkgResolve(root, opts)
	report.Lock = resolved.Lock
	for _, m := range resolved.Missing {
		missing[m] = true
	}
	report.Missing = sortedKeys(missing)
	report.Unevaluable = resolved.Unevaluable
	report.Forbidden = resolved.Forbidden
	if "ok" != resolved.Verdict || 0 < len(report.Missing) {
		report.Verdict = "missing"
		if 0 < len(report.Unevaluable) || 0 < len(report.Forbidden) {
			report.Verdict = "error"
		}
		return report
	}

	before := ""
	if data, err := os.ReadFile(filepath.Join(root, metaDir, lockFile)); nil == err {
		lines := strings.Split(string(data), "\n")
		before = lines[0]
		if strings.HasPrefix(before, "#") && 1 < len(lines) {
			before = lines[1]
		}
	}
	if args.Frozen && before != LockText(resolved.Lock, opts) {
		for _, e := range resolved.Lock {
			p := previous[e.Key]
			if p.Canon != e.Canon || p.Archive != e.Archive || p.V != e.V || p.Manifest != e.Manifest {
				report.Changes = append(report.Changes, e.Key+": repinned")
			}
		}
		for _, key := range sortedKeys(previous) {
			if !hasKey(resolved.Lock, key) {
				report.Changes = append(report.Changes, key+": dropped")
			}
		}
		report.Verdict = "frozen"
		return report
	}
	prune()
	if err := writeLock(root, resolved.Lock, opts); nil != err {
		report.Verdict = "error"
		report.Unevaluable = append(report.Unevaluable, lockFile+": "+err.Error())
		return report
	}

	verify := PkgVerify(root, opts)
	report.Mismatched = verify.Mismatched
	report.Unlocked = verify.Unlocked
	report.Verdict = verify.Verdict
	return report
}

// EDITING THE PACKAGE FILE. It is authored, so the edits are the
// smallest text changes that keep it the author's: a line appended, a
// version literal rewritten where it stands, a one-line entry removed.
type DepEdit struct {
	Op  string
	Key string
	V   string
}

var depVersionRe = regexp.MustCompile(`\bv\s*:\s*"[^"]*"`)

func EditDeps(root string, edit DepEdit, opts *PkgOptions) string {
	file := filepath.Join(root, pkgFile)
	before := ""
	if data, err := os.ReadFile(file); nil == err {
		before = string(data)
	}
	after := ""
	if "add" == edit.Op {
		sep := ""
		if "" != before && !strings.HasSuffix(before, "\n") {
			sep = "\n"
		}
		after = before + sep + "dep: " + quote(edit.Key) + ": { v: " + quote(edit.V) + " }\n"
	} else {
		lines := strings.Split(before, "\n")
		at := -1
		for i, l := range lines {
			if strings.Contains(l, quote(edit.Key)) {
				at = i
				break
			}
		}
		if 0 > at {
			return edit.Key + " is not on one line of " + pkgFile + "; edit it by hand"
		}
		line := lines[at]
		if strings.Count(line, "{") != strings.Count(line, "}") {
			return edit.Key + " spans several lines of " + pkgFile + "; edit it by hand"
		}
		if "raise" == edit.Op {
			if !depVersionRe.MatchString(line) {
				return edit.Key + " declares its version on another line of " + pkgFile + "; edit it by hand"
			}
			lines[at] = depVersionRe.ReplaceAllLiteralString(line, "v: "+quote(edit.V))
		} else {
			lines = append(lines[:at], lines[at+1:]...)
		}
		after = strings.Join(lines, "\n")
	}
	_ = os.WriteFile(file, []byte(after), 0o600)
	deps := declaredDeps(file, opts)
	_, declared := deps[edit.Key]
	held := evalPkg(toValidSource(after), file, opts).ok
	if "remove" == edit.Op {
		held = held && !declared
	} else {
		held = held && declared && deps[edit.Key].V == edit.V
	}
	if !held {
		_ = os.WriteFile(file, []byte(before), 0o600)
		return "the edit to " + pkgFile + " did not take; edit it by hand"
	}
	return ""
}

type PkgChangeReport struct {
	PkgSyncReport
	Change string `json:"change"`
}

type ChangeArgs struct {
	SyncArgs
	Mode string
}

// ParsePkgSpec reads `<pkg>[@<version>]`; the third answer is a usage
// message when the spelling is wrong.
func ParsePkgSpec(spec string) (pkg, version, bad string) {
	pkg = spec
	if at := strings.Index(spec, "@"); 0 <= at {
		pkg = spec[:at]
		version = spec[at+1:]
	}
	if !PackagePath(pkg) {
		return "", "", "not a package path: " + spec
	}
	if "" != version && !versionRe.MatchString(version) {
		return "", "", "not a version: " + version + " (MAJOR.MINOR.PATCH)"
	}
	return pkg, version, ""
}

// PkgGet is `aontu add` and `aontu get`: a dependency declared or
// raised, then a sync. `add` refuses what is already declared and
// names `get`. A non-empty usage answer is the caller's to print.
func PkgGet(root string, opts *PkgOptions, http PkgHTTP, spec string, args ChangeArgs) (PkgChangeReport, string) {
	pkg, version, bad := ParsePkgSpec(spec)
	if "" != bad {
		return PkgChangeReport{}, bad
	}
	declared := declaredDeps(filepath.Join(root, pkgFile), opts)
	have, has := declared[pkg]
	if "add" == args.Mode && has {
		return PkgChangeReport{}, pkg + " is already a dependency at " + have.V + " (aontu get raises it)"
	}

	var ctx *acquireCtx
	ref := catchRefusal(func() {
		ctx = makeCtx(root, opts, http, args.SyncArgs)
		if "" == version {
			bases := basesFor(ctx, pkg)
			list := fetchList(ctx, bases, pkg)
			version = selectVersion(ctx, pkg, list, fetchAdvisory(ctx, bases, pkg), "", "")
		}
	})
	if nil != ref {
		report := PkgChangeReport{PkgSyncReport: emptySync(), Change: "none"}
		report.Verdict = "refused"
		report.Refusal = ref.report()
		if nil != ctx {
			report.Events = ctx.events
		}
		return report, ""
	}

	before := snapshot(root)
	change := ""
	switch {
	case !has:
		if bad := EditDeps(root, DepEdit{Op: "add", Key: pkg, V: version}, opts); "" != bad {
			return PkgChangeReport{}, bad
		}
		change = "added " + pkg + " " + version
	case 0 <= VersionCompare(have.V, version):
		change = pkg + " is at " + have.V + " already"
	default:
		if bad := EditDeps(root, DepEdit{Op: "raise", Key: pkg, V: version}, opts); "" != bad {
			return PkgChangeReport{}, bad
		}
		change = "raised " + pkg + " " + have.V + " -> " + version
	}

	syncArgs := args.SyncArgs
	syncArgs.Frozen = false
	sync := PkgSync(root, opts, http, syncArgs)
	sync.Events = append(append([]PkgEvent{}, ctx.events...), sync.Events...)
	return PkgChangeReport{PkgSyncReport: sync, Change: settled(root, before, sync, change)}, ""
}

// snapshot is everything a sync may change, kept aside: the package
// file, the lock, and the vendor tree, copied under the project's tmp.
type snapshotOf struct {
	pkgFile   string
	lock      *string
	vendorTmp string
}

func snapshot(root string) snapshotOf {
	data, _ := os.ReadFile(filepath.Join(root, pkgFile))
	snap := snapshotOf{pkgFile: string(data)}
	if lock, err := os.ReadFile(filepath.Join(root, metaDir, lockFile)); nil == err {
		text := string(lock)
		snap.lock = &text
	}
	vendorRoot := filepath.Join(root, metaDir, vendorDir)
	if _, err := os.Stat(vendorRoot); nil == err {
		snap.vendorTmp = filepath.Join(root, metaDir, "tmp", randomHex())
		_ = copyTree(vendorRoot, snap.vendorTmp)
	}
	return snap
}

// settled takes back a change the sync could not carry, lock and vendor
// tree included: neither verb leaves the project half-changed.
func settled(root string, before snapshotOf, sync PkgSyncReport, change string) string {
	tmp := filepath.Join(root, metaDir, "tmp")
	if "ok" == sync.Verdict {
		_ = os.RemoveAll(tmp)
		return change
	}
	_ = os.WriteFile(filepath.Join(root, pkgFile), []byte(before.pkgFile), 0o600)
	lock := filepath.Join(root, metaDir, lockFile)
	if nil == before.lock {
		_ = os.Remove(lock)
	} else {
		_ = os.WriteFile(lock, []byte(*before.lock), 0o600)
	}
	vendorRoot := filepath.Join(root, metaDir, vendorDir)
	_ = os.RemoveAll(vendorRoot)
	if "" != before.vendorTmp {
		_ = os.Rename(before.vendorTmp, vendorRoot)
	}
	_ = os.RemoveAll(tmp)
	return "none (" + change + " was taken back)"
}

// PkgRemove is `aontu remove`: the pair of `add`.
func PkgRemove(root string, opts *PkgOptions, http PkgHTTP, pkg string, args SyncArgs) (PkgChangeReport, string) {
	declared := declaredDeps(filepath.Join(root, pkgFile), opts)
	if _, has := declared[pkg]; !has {
		return PkgChangeReport{}, pkg + " is not a dependency of this project"
	}
	before := snapshot(root)
	if bad := EditDeps(root, DepEdit{Op: "remove", Key: pkg}, opts); "" != bad {
		return PkgChangeReport{}, bad
	}
	args.Frozen = false
	sync := PkgSync(root, opts, http, args)
	return PkgChangeReport{PkgSyncReport: sync, Change: settled(root, before, sync, "removed "+pkg)}, ""
}

type PkgWhyReport struct {
	Paths   [][]string `json:"paths"`
	Pkg     string     `json:"pkg"`
	Verdict string     `json:"verdict"`
}

// PkgWhy is `aontu why`: every chain of dependencies from the project
// to a package, read from the lock and the package files in the store.
func PkgWhy(root string, opts *PkgOptions, pkg string) PkgWhyReport {
	locked := readLock(root)
	self := packageSelf(root, opts)
	rootKey := self.Path
	if "" == rootKey {
		rootKey = "."
	}
	edges := map[string][]string{
		rootKey: sortedKeys(declaredDeps(filepath.Join(root, pkgFile), opts)),
	}
	for key, entry := range locked {
		edges[key] = []string{}
		if usableKey(key) {
			if dir := pkgStoreDir(root, key, entry.Canon, lockPkg(entry), opts.cache(), entry.V); "" != dir {
				edges[key] = sortedKeys(declaredDeps(filepath.Join(dir, pkgFile), opts))
			}
		}
	}

	paths := [][]string{}
	var walk func(key string, trail []string)
	walk = func(key string, trail []string) {
		if key == pkg || (isAlias(key) && locked[key].Pkg == pkg) {
			paths = append(paths, append(append([]string{}, trail...), key))
			return
		}
		if contains(trail, key) {
			return
		}
		for _, dep := range edges[key] {
			walk(dep, append(append([]string{}, trail...), key))
		}
	}
	walk(rootKey, []string{})
	verdict := "missing"
	if 0 < len(paths) {
		verdict = "ok"
	}
	return PkgWhyReport{Verdict: verdict, Pkg: pkg, Paths: paths}
}

// THE READ-PATH LAYOUT, written into a directory: what `publish --to`
// leaves behind and `pkg serve` serves.
type LayoutWrite struct {
	Manifest      map[string]any
	ManifestBytes []byte
	ProofBytes    []byte
	Archive       []byte
}

func WriteLayout(dir string, w LayoutWrite, opts *PkgOptions, now time.Time) {
	pkg, _ := w.Manifest["package"].(string)
	version, _ := w.Manifest["version"].(string)
	if !PackagePath(pkg) || !versionRe.MatchString(version) {
		refuse("manifest_invalid", "the manifest names "+pkg+" "+version+", not a package path at a version", pkg)
	}
	at := filepath.Join(append([]string{dir, "pkg"}, append(strings.Split(PkgURLPath(pkg), "/"), "@v")...)...)
	_ = os.MkdirAll(at, 0o755)

	entries, _ := os.ReadDir(at)
	manifests := []map[string]any{}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".manifest") {
			continue
		}
		if strings.TrimSuffix(e.Name(), ".manifest") == version {
			refuse("version_exists", pkg+" "+version+" was published before and is never reusable", pkg)
		}
		data, _ := os.ReadFile(filepath.Join(at, e.Name()))
		m, _ := parseDoc(data)
		manifests = append(manifests, m)
	}
	for _, m := range manifests {
		if moved, ok := m["moved"].(string); ok {
			refuse("path_moved", pkg+" is frozen by a moved declaration (now "+moved+")", pkg)
		}
	}

	_ = os.WriteFile(filepath.Join(at, version+".zip"), w.Archive, 0o600)
	_ = os.WriteFile(filepath.Join(at, version+".manifest"), w.ManifestBytes, 0o600)
	_ = os.WriteFile(filepath.Join(at, version+".sig"), w.ProofBytes, 0o600)

	listFile := filepath.Join(at, "list")
	versions := []any{}
	if data, err := os.ReadFile(listFile); nil == err {
		old, _ := parseDoc(data)
		if list, ok := old["versions"].([]any); ok {
			versions = list
		}
	}
	versions = append(versions, map[string]any{"version": version, "seen": Timestamp(now)})
	sort.Slice(versions, func(i, j int) bool {
		a, _ := versions[i].(map[string]any)["version"].(string)
		b, _ := versions[j].(map[string]any)["version"].(string)
		return 0 > VersionCompare(a, b)
	})
	_ = os.WriteFile(listFile, canonLine(map[string]any{"package": pkg, "versions": versions}, opts, "list"), 0o600)
	top, _ := versions[len(versions)-1].(map[string]any)
	_ = os.WriteFile(filepath.Join(filepath.Dir(at), "@latest"),
		canonLine(map[string]any{"package": pkg, "version": top["version"], "seen": top["seen"]}, opts, "latest"), 0o600)

	retracted := []map[string]any{}
	for _, m := range append(manifests, w.Manifest) {
		list, _ := m["retract"].([]any)
		for _, v := range list {
			retracted = append(retracted, map[string]any{"version": v, "by": m["version"]})
		}
	}
	sort.Slice(retracted, func(i, j int) bool {
		a, _ := retracted[i]["version"].(string)
		b, _ := retracted[j]["version"].(string)
		return 0 > VersionCompare(a, b)
	})
	advisory := filepath.Join(append([]string{dir, "advisory"}, strings.Split(PkgURLPath(pkg), "/")...)...) + ".aontu"
	_ = os.MkdirAll(filepath.Dir(advisory), 0o755)
	_ = os.WriteFile(advisory, canonLine(map[string]any{"package": pkg, "retracted": retracted}, opts, "advisory"), 0o600)
}

// dirHTTP is a directory as a repository: the layout above, read by
// path.
type dirHTTP struct{ dir string }

func DirHTTP(dir string) PkgHTTP { return dirHTTP{dir: dir} }

func (d dirHTTP) Get(raw string) HTTPResponse {
	u, err := url.Parse(raw)
	if nil != err { //coverage:ignore every URL the client builds parses
		return HTTPResponse{Status: 404}
	}
	elems := []string{}
	for _, e := range strings.Split(u.Path, "/") {
		if ".." == e {
			return HTTPResponse{Status: 404}
		}
		if "" != e {
			elems = append(elems, e)
		}
	}
	file := filepath.Join(append([]string{d.dir}, elems...)...)
	st, err := os.Stat(file)
	if nil != err || !st.Mode().IsRegular() {
		return HTTPResponse{Status: 404}
	}
	data, _ := os.ReadFile(file)
	return HTTPResponse{Status: 200, Body: data}
}

func (d dirHTTP) Post(string, PublishParts, string) HTTPResponse {
	return HTTPResponse{Status: 405, Body: []byte("a directory takes no publish")}
}

type PkgPublishReport struct {
	Against   string            `json:"against,omitempty"`
	Digest    string            `json:"digest,omitempty"`
	Findings  []VetFinding      `json:"findings"`
	Forbidden []string          `json:"forbidden"`
	Manifest  *PkgManifest      `json:"manifest,omitempty"`
	Missing   []string          `json:"missing"`
	Refusal   *PkgRefusalReport `json:"refusal,omitempty"`
	Signer    string            `json:"signer,omitempty"`
	To        string            `json:"to,omitempty"`
	Verdict   string            `json:"verdict"`
	Write     string            `json:"write,omitempty"`
}

type PublishArgs struct {
	RepoOverrides
	Yes     bool
	To      string
	Key     string
	Token   string
	Against string
	Now     func() time.Time
}

// PublisherFromToken is what a forge token says about its bearer. The
// write path verifies the claims; the client copies them.
func PublisherFromToken(token string) map[string]any {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if 3 != len(parts) {
		return nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if nil != err {
		return nil
	}
	var claims map[string]any
	if err := json.Unmarshal(raw, &claims); nil != err {
		return nil
	}
	str := func(v any) string {
		switch x := v.(type) {
		case string:
			return x
		case float64:
			return strconv.FormatInt(int64(x), 10)
		}
		return ""
	}
	runner := "hosted"
	if "self-hosted" == claims["runner_environment"] {
		runner = "self_hosted"
	}
	switch claims["iss"] {
	case "https://token.actions.githubusercontent.com":
		trigger := "push"
		if "release" == claims["event_name"] {
			trigger = "release"
		}
		out := map[string]any{
			"host": "github.com", "namespace": claims["repository"],
			"subject": map[string]any{
				"host": "github.com", "owner_id": str(claims["repository_owner_id"]),
				"repository_id": str(claims["repository_id"]),
			},
			"trigger": trigger, "runner": runner,
		}
		if w, ok := claims["workflow_ref"]; ok {
			out["workflow"] = w
		}
		return out
	case "https://gitlab.com":
		out := map[string]any{
			"host": "gitlab.com", "namespace": claims["project_path"],
			"subject": map[string]any{
				"host": "gitlab.com", "owner_id": str(claims["namespace_id"]),
				"repository_id": str(claims["project_id"]),
			},
			"trigger": "push", "runner": runner,
		}
		if w, ok := claims["ci_config_ref_uri"]; ok {
			out["workflow"] = w
		}
		return out
	}
	return nil
}

// PkgPublish (spec ops.publish, the client's side): the manifest and
// its gate, then the signed objects sent, or written into a directory.
// A dry run without Yes.
func PkgPublish(root string, opts *PkgOptions, http PkgHTTP, args PublishArgs) PkgPublishReport {
	now := args.Now
	if nil == now {
		now = time.Now
	}
	local := PkgManifestOf(root, args.Against, opts)
	report := PkgPublishReport{
		Verdict: "dry-run", Missing: local.Missing, Forbidden: local.Forbidden,
		Findings: local.Findings, Against: args.Against,
	}
	if "ok" != local.Verdict {
		report.Verdict = local.Verdict
		return report
	}
	m := local.Manifest
	report.Manifest = m

	var config RepoConfig
	if ref := catchRefusal(func() { config = repoConfig(root, opts, args.RepoOverrides) }); nil != ref {
		return refusedPublish(report, ref)
	}
	target := config.Write
	if "" != args.To {
		target = args.To
		report.To = target
	} else {
		report.Write = target
	}

	// The repository's own predecessor, when one can be read: the
	// highest existing version is what compatibility is decided against.
	reader := http
	bases := config.Base
	if "" != args.To {
		reader = DirHTTP(args.To)
		bases = []string{"http://127.0.0.1"}
	}
	ctx := &acquireCtx{
		opts: opts, http: reader, config: config, cache: opts.cache(), now: now,
		events: []PkgEvent{}, fetched: []string{}, acquired: map[string]*acquired{},
	}
	ctx.config.Private = []string{}
	gated := false
	if ref := catchRefusal(func() {
		listed := reader.Get(strings.TrimSuffix(bases[0], "/") + ObjectPath("list", m.Package, ""))
		if 200 != listed.Status || "" != args.Against {
			return
		}
		list := fetchList(ctx, bases, m.Package)
		if hasVersion(list, m.Version) {
			refuse("version_exists", m.Package+" "+m.Version+" was published before and is never reusable", m.Package)
		}
		if 0 == len(list) {
			return
		}
		newest := list[len(list)-1]
		_, prior := fetchManifest(ctx, bases, m.Package, newest.version)
		if moved, ok := prior["moved"].(string); ok {
			refuse("path_moved", m.Package+" is frozen by a moved declaration (now "+moved+")", m.Package)
		}
		zip := fetchArchive(ctx, bases, m.Package, newest.version, prior)
		entries := unpack(m.Package, newest.version, zip, prior)
		// Under the project's own meta directory, so the predecessor's
		// imports resolve against the vendor tree the publisher synced.
		tmp := filepath.Join(root, metaDir, "tmp", randomHex())
		_ = os.MkdirAll(tmp, 0o755)
		writeTree(tmp, entries)
		gate := PkgManifestOf(root, tmp, opts)
		_ = os.RemoveAll(filepath.Join(root, metaDir, "tmp"))
		report.Against = m.Package + " " + newest.version
		report.Findings = gate.Findings
		if "ok" != gate.Verdict {
			report.Verdict = gate.Verdict
			gated = true
		}
	}); nil != ref {
		return refusedPublish(report, ref)
	}
	if gated {
		return report
	}

	if "" == args.To && "public" != m.Publish && !IsLoopback(target) {
		return refusedPublish(report, &PkgRefusal{Code: "not_public",
			Message: m.Package + " does not declare publish: public; nothing is uploaded", Pkg: m.Package})
	}

	extra := map[string]any{"published": Timestamp(now())}
	if "" != args.Token {
		tok, _ := os.ReadFile(args.Token)
		if publisher := PublisherFromToken(string(tok)); nil != publisher {
			extra["publisher"] = publisher
		}
	}
	manifestBytes := []byte(ManifestText(m, extra, opts) + "\n")
	report.Digest = Sha256Hex(manifestBytes)
	keyPEM := ""
	if "" != args.Key {
		data, _ := os.ReadFile(args.Key)
		keyPEM = string(data)
		id, err := KeyIDFromPEM(keyPEM)
		if nil != err {
			return refusedPublish(report, &PkgRefusal{Code: "key_invalid", Message: args.Key + ": " + err.Error()})
		}
		report.Signer = id
	}
	if !args.Yes {
		return report
	}

	proof, _ := SignDigest(keyPEM, report.Digest)
	proofBytes := canonLine(proof, opts, "proof.aontu")
	archive := ArchiveOf(root)
	full, _ := parseDoc(manifestBytes)
	if ref := catchRefusal(func() {
		if "" != args.To {
			WriteLayout(args.To, LayoutWrite{Manifest: full, ManifestBytes: manifestBytes,
				ProofBytes: proofBytes, Archive: archive.Zip}, opts, now())
			return
		}
		token := ""
		if "" != args.Token {
			data, _ := os.ReadFile(args.Token)
			token = strings.TrimSpace(string(data))
		}
		r := http.Post(strings.TrimSuffix(target, "/")+PublishPath,
			PublishParts{Manifest: manifestBytes, Proof: proofBytes, Archive: archive.Zip}, token)
		if 200 != r.Status && 201 != r.Status {
			doc, _ := parseDoc(r.Body)
			code, _ := doc["code"].(string)
			msg, _ := doc["message"].(string)
			if "" == code {
				code = "fetch_failed"
			}
			if "" == msg {
				msg = "the write path answered " + strconv.Itoa(r.Status)
			}
			refuse(code, msg, m.Package)
		}
	}); nil != ref {
		return refusedPublish(report, ref)
	}
	report.Verdict = "sent"
	return report
}

func refusedPublish(report PkgPublishReport, ref *PkgRefusal) PkgPublishReport {
	report.Verdict = "refused"
	report.Refusal = ref.report()
	return report
}

type PkgOutdatedEntry struct {
	Key       string   `json:"key"`
	Moves     []string `json:"moves"`
	Newest    string   `json:"newest"`
	Retracted string   `json:"retracted,omitempty"`
	V         string   `json:"v"`
}

type PkgOutdatedReport struct {
	Events  []PkgEvent         `json:"events"`
	Locked  []PkgOutdatedEntry `json:"locked"`
	Refusal *PkgRefusalReport  `json:"refusal,omitempty"`
	Verdict string             `json:"verdict"`
}

// PkgOutdated is `aontu pkg outdated`: for every locked package, the
// newest selectable version, and what a resolution taking it would
// move with it.
func PkgOutdated(root string, opts *PkgOptions, http PkgHTTP, args SyncArgs) PkgOutdatedReport {
	report := PkgOutdatedReport{Verdict: "current", Locked: []PkgOutdatedEntry{}, Events: []PkgEvent{}}
	var ctx *acquireCtx
	if ref := catchRefusal(func() { ctx = makeCtx(root, opts, http, args) }); nil != ref {
		report.Verdict = "refused"
		report.Refusal = ref.report()
		return report
	}
	locked := readLock(root)
	ref := catchRefusal(func() {
		for _, key := range sortedKeys(locked) {
			entry := locked[key]
			pkg := lockPkg(entry)
			if !usableKey(key) {
				continue
			}
			bases := basesFor(ctx, pkg)
			list := fetchList(ctx, bases, pkg)
			advisory := fetchAdvisory(ctx, bases, pkg)
			newest := selectVersion(ctx, pkg, list, advisory, "", entry.V)
			out := PkgOutdatedEntry{Key: key, V: entry.V, Newest: newest, Moves: []string{}, Retracted: advisory[entry.V]}
			if 0 < VersionCompare(newest, entry.V) {
				out.Moves = movesWith(ctx, locked, key, pkg, newest)
				report.Verdict = "outdated"
			} else if "" != out.Retracted {
				report.Verdict = "outdated"
			}
			report.Locked = append(report.Locked, out)
		}
	})
	report.Events = ctx.events
	if nil != ref {
		report.Verdict = "refused"
		report.Refusal = ref.report()
	}
	return report
}

// movesWith is what a resolution taking newest for one key would move
// with it: minimum version selection over the repository's manifests,
// from the upgraded declaration down to the closure, against the lock.
func movesWith(ctx *acquireCtx, locked map[string]LockEntry, key, pkg, newest string) []string {
	selected := map[string]string{}
	targets := map[string]string{}
	for k, e := range locked {
		selected[k] = e.V
		if "" != e.Pkg {
			targets[k] = e.Pkg
		}
	}
	selected[key] = newest
	targets[key] = pkg
	frontier := []string{key}
	for depth := 0; 0 < len(frontier); depth++ {
		// Excluded as in acquire: the bounds are one comparison each,
		// and a closure that reaches them is beyond a unit test.
		if moduleMaxDepth <= depth { //coverage:ignore see above
			refuse("module_depth", "the closure under "+pkg+" nests past "+strconv.Itoa(moduleMaxDepth), pkg)
		}
		if ClosureMax < len(selected) { //coverage:ignore see above
			refuse("closure_too_large", "the closure exceeds "+strconv.Itoa(ClosureMax)+" packages", pkg)
		}
		next := []string{}
		for _, k := range frontier {
			target, aliased := targets[k]
			if !aliased {
				target = k
			}
			if !usableKey(k) || (isAlias(k) && !aliased) {
				continue
			}
			_, top := fetchManifest(ctx, basesFor(ctx, target), target, selected[k])
			deps := manifestDeps(top)
			for _, dk := range sortedKeys(deps) {
				if "" != deps[dk].Pkg {
					targets[dk] = deps[dk].Pkg
				}
				if have, ok := selected[dk]; !ok || 0 > VersionCompare(have, deps[dk].V) {
					selected[dk] = deps[dk].V
					next = append(next, dk)
				}
			}
		}
		frontier = next
	}
	moves := []string{}
	for _, k := range sortedKeys(selected) {
		have, has := locked[k]
		if k == key || (has && have.V == selected[k]) {
			continue
		}
		was := "unlocked"
		if has {
			was = have.V
		}
		moves = append(moves, k+" "+was+" -> "+selected[k])
	}
	return moves
}

// THE LOCAL REGISTRY AND PROXY (`aontu pkg serve`): the directory
// layout served verbatim; with upstreams, fetched on a miss and kept.
var objectRe = regexp.MustCompile(
	`^/(pkg/[A-Za-z0-9!._/-]+/@v/(list|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(zip|manifest|sig|sigstore\.json))|pkg/[A-Za-z0-9!._/-]+/@latest|advisory/[A-Za-z0-9!._/-]+\.aontu|tombstone/(feed\.aontu|[A-Za-z0-9!._/-]+/@v/(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.aontu))$`)

func ObjectShape(p string) bool {
	if !objectRe.MatchString(p) || strings.Contains(p, "//") {
		return false
	}
	for _, e := range strings.Split(p, "/") {
		if "." == e || ".." == e {
			return false
		}
	}
	return true
}

func ObjectMutable(p string) bool {
	return strings.HasSuffix(p, "/list") || strings.HasSuffix(p, "/@latest") ||
		strings.HasPrefix(p, "/advisory/") || strings.HasPrefix(p, "/tombstone/")
}

func contentType(p string) string {
	switch {
	case strings.HasSuffix(p, ".zip"):
		return "application/zip"
	case strings.HasSuffix(p, ".json"):
		return "application/json"
	}
	return "text/plain; charset=utf-8"
}

type ServeOptions struct {
	Dir      string
	Upstream []string
	Listen   string
	HTTP     PkgHTTP
}

type ServedObject struct {
	Status int
	Body   []byte
	Stale  bool
}

// ServeObject is one request: the shape gate, the directory, then the
// upstreams.
func ServeObject(opts ServeOptions, p string) ServedObject {
	if !ObjectShape(p) {
		return ServedObject{Status: 404, Body: []byte("not an object path\n")}
	}
	elems := []string{}
	for _, e := range strings.Split(p, "/") {
		if "" != e {
			elems = append(elems, e)
		}
	}
	file := filepath.Join(append([]string{opts.Dir}, elems...)...)
	st, err := os.Stat(file)
	have := nil == err && st.Mode().IsRegular()
	mutable := ObjectMutable(p)
	if have && !mutable {
		data, _ := os.ReadFile(file)
		return ServedObject{Status: 200, Body: data}
	}
	for _, up := range opts.Upstream {
		r := opts.HTTP.Get(strings.TrimSuffix(up, "/") + p)
		if 200 == r.Status {
			_ = os.MkdirAll(filepath.Dir(file), 0o755)
			_ = os.WriteFile(file, r.Body, 0o600)
			return ServedObject{Status: 200, Body: r.Body}
		}
	}
	if have {
		data, _ := os.ReadFile(file)
		return ServedObject{Status: 200, Body: data, Stale: 0 < len(opts.Upstream)}
	}
	return ServedObject{Status: 404, Body: []byte("no such object\n")}
}

// ServeHandler is the registry as an http.Handler.
func ServeHandler(opts ServeOptions) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if "GET" != req.Method && "HEAD" != req.Method {
			w.Header().Set("content-type", "text/plain; charset=utf-8")
			w.WriteHeader(405)
			_, _ = w.Write([]byte("the read path is GET\n"))
			return
		}
		p := req.URL.Path
		r := ServeObject(opts, p)
		ct := "text/plain; charset=utf-8"
		if 200 == r.Status {
			ct = contentType(p)
		}
		w.Header().Set("content-type", ct)
		cache := "max-age=31536000, immutable"
		if ObjectMutable(p) {
			cache = "max-age=60"
		}
		w.Header().Set("cache-control", cache)
		if r.Stale {
			w.Header().Set("x-aontu-stale", "no upstream answered; served from the cache")
		}
		w.WriteHeader(r.Status)
		if "HEAD" != req.Method {
			_, _ = w.Write(r.Body)
		}
	})
}

type Served struct {
	URL   string
	Close func()
}

// SplitListen is the address to listen on; a bare host takes the
// default port.
func SplitListen(listen string) string {
	at := strings.LastIndex(listen, ":")
	if 0 > at {
		return listen + ":8017"
	}
	if _, err := strconv.Atoi(listen[at+1:]); nil != err {
		return listen[:at] + ":8017"
	}
	return listen
}

func StartServe(opts ServeOptions) (*Served, error) {
	ln, err := net.Listen("tcp", SplitListen(opts.Listen))
	if nil != err {
		return nil, err
	}
	server := &http.Server{Handler: ServeHandler(opts)}
	go func() { _ = server.Serve(ln) }()
	addr := ln.Addr().(*net.TCPAddr)
	return &Served{
		URL:   "http://" + net.JoinHostPort(addr.IP.String(), strconv.Itoa(addr.Port)),
		Close: func() { _ = server.Close() },
	}, nil
}

// THE ADAPTER: the platform's client, and the multipart a publish
// sends.
type defaultHTTP struct{ client *http.Client }

func DefaultHTTP() PkgHTTP {
	return defaultHTTP{client: &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (d defaultHTTP) Get(raw string) HTTPResponse {
	r, err := d.client.Get(raw)
	if nil != err {
		return HTTPResponse{}
	}
	defer r.Body.Close()
	// Read no further than the archive cap: what comes back past it is
	// over the cap by construction, and every reader refuses it.
	data, _ := io.ReadAll(io.LimitReader(r.Body, int64(ArchiveLimitBytes)+1))
	return HTTPResponse{Status: r.StatusCode, Body: data}
}

func (d defaultHTTP) Post(raw string, parts PublishParts, token string) HTTPResponse {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	for _, part := range []struct {
		field, name, ctype string
		data               []byte
	}{
		{"manifest", "manifest.aontu", "text/plain", parts.Manifest},
		{"proof", "proof.aontu", "text/plain", parts.Proof},
		{"archive", "archive.zip", "application/zip", parts.Archive},
	} {
		h := map[string][]string{
			"Content-Disposition": {`form-data; name="` + part.field + `"; filename="` + part.name + `"`},
			"Content-Type":        {part.ctype},
		}
		w, _ := form.CreatePart(h)
		_, _ = w.Write(part.data)
	}
	_ = form.Close()
	req, err := http.NewRequest("POST", raw, &body)
	if nil != err {
		return HTTPResponse{}
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	if "" != token {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	r, err := d.client.Do(req)
	if nil != err {
		return HTTPResponse{}
	}
	defer r.Body.Close()
	data, _ := io.ReadAll(r.Body)
	return HTTPResponse{Status: r.StatusCode, Body: data}
}

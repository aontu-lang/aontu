/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

const netService = "name: string\nport: *8080 | integer\n"

func newKeyPEM(t *testing.T) string {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if nil != err {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(priv)
	if nil != err {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
}

// netWorld is one world: a key, a repository directory, a private
// cache, and options that read that cache.
type netWorld struct {
	t     *testing.T
	dir   string
	key   string
	keyID string
	repo  string
	cache string
	opts  *PkgOptions
	http  PkgHTTP
	apps  int
}

func newNetWorld(t *testing.T) *netWorld {
	t.Helper()
	dir := t.TempDir()
	pemText := newKeyPEM(t)
	key := filepath.Join(dir, "key.pem")
	write(t, key, pemText)
	id, err := KeyIDFromPEM(pemText)
	if nil != err {
		t.Fatal(err)
	}
	repo := filepath.Join(dir, "repo")
	_ = os.MkdirAll(repo, 0o755)
	cache := filepath.Join(dir, "xdg", "aontu", "pkg")
	_ = os.MkdirAll(cache, 0o755)
	return &netWorld{
		t: t, dir: dir, key: key, keyID: id, repo: repo, cache: cache,
		opts: &PkgOptions{Cache: cache}, http: DirHTTP(repo),
	}
}

func (w *netWorld) repoBlock() string {
	return "repo: {base: [\"http://127.0.0.1\"], trust: {\"corp.example/*\": {signer: \"" +
		w.keyID + "\", inclusion: none}}}\n"
}

func (w *netWorld) publisher(name, version, src, extra string) string {
	dir := filepath.Join(w.dir, name+"-"+version)
	write(w.t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"corp.example/"+name+"\", version: \""+version+"\", main: \"main.aontu\"}\n"+extra)
	write(w.t, filepath.Join(dir, "main.aontu"), src)
	return dir
}

func (w *netWorld) publish(tree string) PkgPublishReport {
	return PkgPublish(tree, w.opts, w.http, PublishArgs{Yes: true, Key: w.key, To: w.repo})
}

func (w *netWorld) mustPublish(tree string) {
	w.t.Helper()
	r := w.publish(tree)
	if "sent" != r.Verdict {
		w.t.Fatalf("publish %s: %s %s", tree, r.Verdict, refusalText(r.Refusal))
	}
}

// publisherWith is a publisher with dependencies of its own, synced
// first: the archive carries no vendor tree, and the gate evaluates
// the entry.
func (w *netWorld) publisherWith(name, version, src, deps, extra string) string {
	w.t.Helper()
	dir := w.publisher(name, version, src, "dep: {"+deps+"}\n"+w.repoBlock()+extra)
	r := PkgSync(dir, w.opts, w.http, SyncArgs{})
	if "ok" != r.Verdict {
		w.t.Fatalf("sync %s: %s %s", dir, r.Verdict, refusalText(r.Refusal))
	}
	return dir
}

func (w *netWorld) consumer(deps, repo string) string {
	if "" == repo {
		repo = w.repoBlock()
	}
	w.apps++
	app := filepath.Join(w.dir, "app"+itoaT(w.apps))
	write(w.t, filepath.Join(app, "pkg.aontu"),
		"pkg: {path: \"corp.example/app\"}\ndep: {"+deps+"}\n"+repo)
	write(w.t, filepath.Join(app, "main.aontu"), "svc: @\"corp.example/service\"\nsvc: name: \"auth\"\n")
	return app
}

func itoaT(n int) string {
	return string(rune('0' + n%10))
}

func (w *netWorld) at(name string) string {
	return filepath.Join(w.repo, "pkg", "corp.example", name, "@v")
}

func readJSON(t *testing.T, file string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(file)
	if nil != err {
		t.Fatal(err)
	}
	doc, ok := parseDoc(data)
	if !ok {
		t.Fatalf("not a document: %s", file)
	}
	return doc
}

func writeJSON(t *testing.T, file string, doc any) {
	t.Helper()
	data, _ := json.Marshal(doc)
	write(t, file, string(data)+"\n")
}

// backdate rewrites a version list with old first-seen times: outside
// the cooldown.
func (w *netWorld) backdate(name string, versions ...string) {
	file := filepath.Join(w.at(name), "list")
	list := readJSON(w.t, file)
	for _, e := range list["versions"].([]any) {
		em := e.(map[string]any)
		if 0 == len(versions) || contains(versions, em["version"].(string)) {
			em["seen"] = "2020-01-01T00:00:00Z"
		}
	}
	writeJSON(w.t, file, list)
}

// resign rewrites a served manifest by hand, re-signed by the key.
func (w *netWorld) resign(name, version string, edit func(m map[string]any)) {
	file := filepath.Join(w.at(name), version+".manifest")
	m := readJSON(w.t, file)
	edit(m)
	data, _ := json.Marshal(m)
	data = append(data, '\n')
	write(w.t, file, string(data))
	proof, err := SignDigest(mustRead(w.t, w.key), Sha256Hex(data))
	if nil != err {
		w.t.Fatal(err)
	}
	writeJSON(w.t, filepath.Join(w.at(name), version+".sig"), proof)
}

func refusalText(r *PkgRefusalReport) string {
	if nil == r {
		return ""
	}
	return r.Code + ": " + r.Message
}

func mustRead(t *testing.T, file string) string {
	t.Helper()
	data, err := os.ReadFile(file)
	if nil != err {
		t.Fatal(err)
	}
	return string(data)
}

func (w *netWorld) sync(app string, frozen bool) PkgSyncReport {
	return PkgSync(app, w.opts, w.http, SyncArgs{Frozen: frozen})
}

func (w *netWorld) get(app, spec, mode string) (PkgChangeReport, string) {
	return PkgGet(app, w.opts, w.http, spec, ChangeArgs{Mode: mode})
}

func (w *netWorld) fresh() {
	_ = os.RemoveAll(w.cache)
	_ = os.MkdirAll(w.cache, 0o755)
}

func refusedWith(t *testing.T, refusal *PkgRefusalReport, code, pattern string) {
	t.Helper()
	if nil == refusal || code != refusal.Code {
		t.Fatalf("want refusal %s, got %+v", code, refusal)
	}
	if !regexp.MustCompile(pattern).MatchString(refusal.Message) {
		t.Fatalf("%s: message %q does not match %s", code, refusal.Message, pattern)
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return nil == err
}

func TestPkgNetRoundTrip(t *testing.T) {
	w := newNetWorld(t)
	tree := w.publisher("service", "1.4.2", netService, "")

	dry := PkgPublish(tree, w.opts, w.http, PublishArgs{Key: w.key, To: w.repo})
	if "dry-run" != dry.Verdict || w.keyID != dry.Signer || "" == dry.Digest || w.repo != dry.To {
		t.Fatalf("dry run: %+v", dry)
	}
	if entries, _ := os.ReadDir(w.repo); 0 != len(entries) {
		t.Fatal("a dry run wrote")
	}
	sent := w.publish(tree)
	if "sent" != sent.Verdict {
		t.Fatalf("publish: %+v", sent)
	}
	for _, f := range []string{"1.4.2.manifest", "1.4.2.sig", "1.4.2.zip", "list"} {
		if !exists(filepath.Join(w.at("service"), f)) {
			t.Fatalf("missing %s", f)
		}
	}
	if !exists(filepath.Join(w.repo, "pkg", "corp.example", "service", "@latest")) ||
		!exists(filepath.Join(w.repo, "advisory", "corp.example", "service.aontu")) {
		t.Fatal("no latest or advisory")
	}

	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	r := w.sync(app, false)
	if "ok" != r.Verdict || 1 != len(r.Fetched) || "corp.example/service 1.4.2" != r.Fetched[0] {
		t.Fatalf("sync: %+v", r)
	}
	lock := readLock(app)["corp.example/service"]
	if "1.4.2" != lock.V || !strings.HasPrefix(lock.Canon, "aon1-") ||
		!strings.HasPrefix(lock.Archive, "sha256:") || !strings.HasPrefix(lock.Manifest, "sha256:") {
		t.Fatalf("lock: %+v", lock)
	}
	vendored := filepath.Join(app, "aontu_meta", "vendor", "corp.example", "service")
	if !exists(filepath.Join(vendored, "aontu_meta", "manifest.aontu")) ||
		!exists(filepath.Join(vendored, "aontu_meta", "proof.aontu")) ||
		exists(filepath.Join(vendored, "aontu_meta", "pkg-lock.aontu")) {
		t.Fatal("vendored tree lacks its manifest and proof, or carries a lock")
	}
	if !exists(filepath.Join(w.cache, "download", "corp.example", "service", "@v", "1.4.2.zip")) ||
		!exists(filepath.Join(w.cache, "seen", "corp.example", "service", "1.4.2.aontu")) ||
		!exists(filepath.Join(w.cache, "store", lock.Canon, "corp.example", "service", "main.aontu")) {
		t.Fatal("cache trees")
	}

	again := w.sync(app, false)
	if "ok" != again.Verdict || 0 != len(again.Fetched) {
		t.Fatalf("second sync: %+v", again)
	}
	if frozen := w.sync(app, true); "ok" != frozen.Verdict {
		t.Fatalf("frozen: %+v", frozen)
	}
	if v := PkgVerify(app, w.opts); "ok" != v.Verdict {
		t.Fatalf("verify: %+v", v)
	}
	if !exists(filepath.Join(app, "main.aontu")) {
		t.Fatal("no entry")
	}
	got := evalPkg(mustRead(t, filepath.Join(app, "main.aontu")), filepath.Join(app, "main.aontu"), w.opts)
	if !got.ok {
		t.Fatal("the consumer does not evaluate through the vendor tree")
	}
	// A lockfile that names another key pins nothing for this import,
	// which then resolves from the vendor tree unpinned.
	write(t, filepath.Join(app, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/other\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.0.0\"}}}\n")
	if again := evalPkg(mustRead(t, filepath.Join(app, "main.aontu")), filepath.Join(app, "main.aontu"), w.opts); !again.ok {
		t.Fatal("an unpinned vendored import")
	}
}

func TestPkgSyncFrozenRefusesAChangingLock(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("common", "1.0.0", "x: 1\n", ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}

	pkgAon := filepath.Join(app, "pkg.aontu")
	write(t, pkgAon, mustRead(t, pkgAon)+"dep: \"corp.example/common\": {v: \"1.0.0\"}\n")
	added := w.sync(app, true)
	if "frozen" != added.Verdict || 1 != len(added.Changes) ||
		"corp.example/common: unlocked -> 1.0.0" != added.Changes[0] {
		t.Fatalf("frozen add: %+v", added)
	}
	if exists(filepath.Join(w.cache, "download", "corp.example", "common")) {
		t.Fatal("frozen fetched before refusing")
	}
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}

	main := filepath.Join(app, "aontu_meta", "vendor", "corp.example", "service", "main.aontu")
	write(t, main, strings.Replace(netService, "8080", "9090", 1))
	tampered := w.sync(app, true)
	if "frozen" != tampered.Verdict || !contains(tampered.Changes, "corp.example/service: repinned") {
		t.Fatalf("frozen tamper: %+v", tampered)
	}
	write(t, main, netService)

	lines := []string{}
	for _, l := range strings.Split(mustRead(t, pkgAon), "\n") {
		if !strings.Contains(l, "common") {
			lines = append(lines, l)
		}
	}
	write(t, pkgAon, strings.Join(lines, "\n"))
	dropped := w.sync(app, true)
	if "frozen" != dropped.Verdict || !contains(dropped.Changes, "corp.example/common: dropped") {
		t.Fatalf("frozen drop: %+v", dropped)
	}
}

func TestPkgSyncReplacesAVendorTreeAtAnotherVersion(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	vendored := filepath.Join(app, "aontu_meta", "vendor", "corp.example", "service")
	write(t, filepath.Join(vendored, "pkg.aontu"),
		"pkg: {path: \"corp.example/service\", version: \"1.4.1\", main: \"main.aontu\"}\n")
	write(t, filepath.Join(vendored, "main.aontu"), "name: string\n")
	r := w.sync(app, false)
	if "ok" != r.Verdict || 1 != len(r.Fetched) || !strings.Contains(mustRead(t, filepath.Join(vendored, "main.aontu")), "8080") {
		t.Fatalf("replace: %+v", r)
	}

	// A hand-vendored tree that names no version is taken as it is.
	write(t, filepath.Join(vendored, "pkg.aontu"), "pkg: {path: \"corp.example/service\", main: \"main.aontu\"}\n")
	_ = os.RemoveAll(filepath.Join(vendored, "aontu_meta"))
	if kept := w.sync(app, false); "ok" != kept.Verdict || 0 != len(kept.Fetched) {
		t.Fatalf("kept: %+v", kept)
	}
	// With the vendor tree gone, the cache serves without a fetch.
	_ = os.RemoveAll(filepath.Join(app, "aontu_meta", "vendor"))
	if cached := w.sync(app, false); "ok" != cached.Verdict || 0 != len(cached.Fetched) {
		t.Fatalf("cached: %+v", cached)
	}
}

func TestPkgGetRaisesAddRefusesRemoveDrops(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("service", "1.4.3", netService+"tier?: string\n", ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}

	raised, usage := w.get(app, "corp.example/service@1.4.3", "get")
	if "" != usage || "ok" != raised.Verdict || "raised corp.example/service 1.4.2 -> 1.4.3" != raised.Change {
		t.Fatalf("raise: %q %+v", usage, raised)
	}
	if !strings.Contains(mustRead(t, filepath.Join(app, "pkg.aontu")), "v: \"1.4.3\"") ||
		"1.4.3" != readLock(app)["corp.example/service"].V {
		t.Fatal("the raise did not land")
	}
	same, _ := w.get(app, "corp.example/service@1.4.2", "get")
	if "corp.example/service is at 1.4.3 already" != same.Change {
		t.Fatalf("same: %+v", same)
	}
	if _, usage := w.get(app, "corp.example/service", "add"); !strings.Contains(usage, "already a dependency at 1.4.3 (aontu get raises it)") {
		t.Fatalf("add existing: %q", usage)
	}
	if _, usage := w.get(app, "nodomain", "get"); !strings.HasPrefix(usage, "not a package path: nodomain") {
		t.Fatalf("bad spec: %q", usage)
	}
	if _, usage := w.get(app, "corp.example/service@latest", "get"); !strings.HasPrefix(usage, "not a version: latest") {
		t.Fatalf("bad version: %q", usage)
	}

	removed, usage := PkgRemove(app, w.opts, w.http, "corp.example/service", SyncArgs{})
	if "" != usage || "ok" != removed.Verdict || "removed corp.example/service" != removed.Change {
		t.Fatalf("remove: %q %+v", usage, removed)
	}
	if strings.Contains(mustRead(t, filepath.Join(app, "pkg.aontu")), "service") ||
		exists(filepath.Join(app, "aontu_meta", "vendor", "corp.example")) || 0 != len(readLock(app)) {
		t.Fatal("remove left traces")
	}
	if _, usage := PkgRemove(app, w.opts, w.http, "corp.example/service", SyncArgs{}); !strings.Contains(usage, "not a dependency of this project") {
		t.Fatalf("remove gone: %q", usage)
	}

	w.backdate("service")
	added, usage := w.get(app, "corp.example/service", "add")
	if "" != usage || "added corp.example/service 1.4.3" != added.Change {
		t.Fatalf("add: %q %+v", usage, added)
	}
	if !strings.Contains(mustRead(t, filepath.Join(app, "pkg.aontu")), "dep: \"corp.example/service\": { v: \"1.4.3\" }") {
		t.Fatal("add did not append")
	}
	why := PkgWhy(app, w.opts, "corp.example/service")
	if "ok" != why.Verdict || 1 != len(why.Paths) || "corp.example/app -> corp.example/service" != strings.Join(why.Paths[0], " -> ") {
		t.Fatalf("why: %+v", why)
	}
}

func TestPkgCooldownHoldsTheNewestBack(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("service", "1.4.3", netService, ""))
	app := w.consumer("", "")

	held, _ := w.get(app, "corp.example/service", "get")
	if "refused" != held.Verdict || "none" != held.Change {
		t.Fatalf("held: %+v", held)
	}
	refusedWith(t, held.Refusal, "cooldown_pending", `corp.example/service 1.4.3 is inside the cooldown until .* and no earlier version is selectable`)
	if strings.Contains(mustRead(t, filepath.Join(app, "pkg.aontu")), "corp.example/service") {
		t.Fatal("a refused get edited the package file")
	}

	pinned, _ := w.get(app, "corp.example/service@1.4.2", "get")
	if "ok" != pinned.Verdict {
		t.Fatalf("pinned: %+v", pinned)
	}
	nothing := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "current" != nothing.Verdict || 1 != len(nothing.Events) || "cooldown_pending" != nothing.Events[0].Code ||
		!strings.Contains(nothing.Events[0].Message, "no earlier version is selectable") {
		t.Fatalf("nothing selectable: %+v", nothing)
	}
	if dropped, _ := PkgRemove(app, w.opts, w.http, "corp.example/service", SyncArgs{}); "ok" != dropped.Verdict {
		t.Fatalf("drop: %+v", dropped)
	}

	w.backdate("service", "1.4.2")
	older, _ := w.get(app, "corp.example/service", "get")
	if "ok" != older.Verdict || "added corp.example/service 1.4.2" != older.Change ||
		1 != len(older.Events) || !strings.Contains(older.Events[0].Message, "; 1.4.2 was selected") {
		t.Fatalf("older: %+v", older)
	}
	current := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "current" != current.Verdict || "1.4.2" != current.Locked[0].Newest || 1 != len(current.Events) {
		t.Fatalf("current: %+v", current)
	}
	w.backdate("service")
	outdated := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "outdated" != outdated.Verdict || "1.4.3" != outdated.Locked[0].Newest {
		t.Fatalf("outdated: %+v", outdated)
	}

	// A private name skips the cooldown, read from its own repository.
	priv := w.consumer("", "repo: {private: [\"corp.example/*\"], private_base: [\"http://127.0.0.1\"], "+
		"trust: {\"corp.example/*\": {signer: \""+w.keyID+"\", inclusion: none}}}\n")
	w.fresh()
	w.mustPublish(w.publisher("service", "1.4.4", netService, ""))
	freshGet, _ := w.get(priv, "corp.example/service", "get")
	if "ok" != freshGet.Verdict || "added corp.example/service 1.4.4" != freshGet.Change {
		t.Fatalf("private: %+v", freshGet)
	}
}

func TestPkgOutdatedListsMovesAndRetractions(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("common", "1.0.0", "x: 1\n", ""))
	w.mustPublish(w.publisher("common", "1.1.0", "x: 1\ny?: integer\n", ""))
	w.mustPublish(w.publisherWith("service", "1.0.0", "@\"corp.example/common\"\nname: string\n",
		"\"corp.example/common\": {v: \"1.0.0\"}", ""))
	w.mustPublish(w.publisherWith("service", "1.1.0", "@\"corp.example/common\"\nname: string\n",
		"\"corp.example/common\": {v: \"1.1.0\"}", "retract: [\"1.0.0\"]\n"))
	app := w.consumer("\"corp.example/service\": {v: \"1.0.0\"}", "")
	r := w.sync(app, false)
	if "ok" != r.Verdict || 2 != len(r.Fetched) || "corp.example/common 1.0.0" != r.Fetched[0] {
		t.Fatalf("sync: %+v", r)
	}

	held := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "outdated" != held.Verdict || "1.1.0" != held.Locked[1].Retracted || "1.0.0" != held.Locked[1].Newest {
		t.Fatalf("held: %+v", held)
	}
	_ = os.Remove(filepath.Join(w.repo, "advisory", "corp.example", "common.aontu"))
	if noAdvisory := PkgOutdated(app, w.opts, w.http, SyncArgs{}); "outdated" != noAdvisory.Verdict {
		t.Fatalf("no advisory: %+v", noAdvisory)
	}
	w.mustPublish(w.publisher("common", "1.2.0", "x: 1\ny?: integer\n", ""))
	heldGet, _ := w.get(w.consumer("", ""), "corp.example/service", "get")
	refusedWith(t, heldGet.Refusal, "cooldown_pending", `corp.example/service 1.1.0 is inside the cooldown`)

	// A later, lower bid for a package already selected changes nothing.
	both := w.consumer("\"corp.example/service\": {v: \"1.0.0\"}, \"corp.example/common\": {v: \"1.1.0\"}", "")
	if b := w.sync(both, false); "ok" != b.Verdict || "1.1.0" != readLock(both)["corp.example/common"].V {
		t.Fatalf("both: %+v", b)
	}

	w.backdate("service")
	w.backdate("common", "1.0.0", "1.1.0")
	out := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "outdated" != out.Verdict || 2 != len(out.Locked) {
		t.Fatalf("outdated: %+v", out)
	}
	if "1.1.0" != out.Locked[0].Newest || "1.1.0" != out.Locked[1].Newest ||
		1 != len(out.Locked[1].Moves) || "corp.example/common 1.0.0 -> 1.1.0" != out.Locked[1].Moves[0] ||
		"1.1.0" != out.Locked[1].Retracted || 1 != len(out.Events) {
		t.Fatalf("outdated rows: %+v", out.Locked)
	}

	freshApp := w.consumer("", "")
	got, _ := w.get(freshApp, "corp.example/service", "get")
	if "ok" != got.Verdict || "added corp.example/service 1.1.0" != got.Change {
		t.Fatalf("retraction skipped: %+v", got)
	}

	// A newest version that retracts others and depends on something the
	// consumer never locked.
	w.mustPublish(w.publisher("extra", "1.0.0", "e?: integer\n", ""))
	w.mustPublish(w.publisherWith("service", "1.2.0", "@\"corp.example/common\"\n@\"corp.example/extra\"\nname: string\n",
		"\"corp.example/common\": {v: \"1.1.0\"}, \"corp.example/extra\": {v: \"1.0.0\"}", "retract: [\"1.0.0\", \"1.1.0\"]\n"))
	w.backdate("service")
	again := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "1.2.0" != again.Locked[1].Newest || 2 != len(again.Locked[1].Moves) ||
		"corp.example/extra unlocked -> 1.0.0" != again.Locked[1].Moves[1] || "1.2.0" != again.Locked[1].Retracted {
		t.Fatalf("two retractions: %+v", again.Locked)
	}
	advisory := readJSON(t, filepath.Join(w.repo, "advisory", "corp.example", "service.aontu"))
	if 3 != len(advisory["retracted"].([]any)) {
		t.Fatalf("advisory: %+v", advisory)
	}
	why := PkgWhy(freshApp, w.opts, "corp.example/common")
	if 1 != len(why.Paths) || "corp.example/app -> corp.example/service -> corp.example/common" != strings.Join(why.Paths[0], " -> ") {
		t.Fatalf("why: %+v", why)
	}
}

func TestPkgClosureDepsFirstAndAlias(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("common", "1.0.0", "x: 1\n", ""))
	w.mustPublish(w.publisherWith("service", "1.0.0", "@\"corp.example/common\"\nname: string\n",
		"\"corp.example/common\": {v: \"1.0.0\"}", ""))
	w.mustPublish(w.publisherWith("service", "2.0.0", "@\"corp.example/common\"\nname: string\nport?: integer\n",
		"\"corp.example/common\": {v: \"1.0.0\"}", ""))
	app := w.consumer("\"corp.example/service\": {v: \"2.0.0\"}, \"alias:legacy\": {pkg: \"corp.example/service\", v: \"1.0.0\"}", "")
	write(t, filepath.Join(app, "main.aontu"), "a: @\"corp.example/service\"\nb: @\"alias:legacy\"\na: name: \"x\"\nb: name: \"y\"\n")
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}
	lock := readLock(app)
	if "corp.example/service" != lock["alias:legacy"].Pkg || "1.0.0" != lock["alias:legacy"].V ||
		"2.0.0" != lock["corp.example/service"].V ||
		!exists(filepath.Join(app, "aontu_meta", "vendor", "alias", "legacy", "main.aontu")) {
		t.Fatalf("lock: %+v", lock)
	}
	why := PkgWhy(app, w.opts, "corp.example/service")
	if 2 != len(why.Paths) || "alias:legacy" != why.Paths[0][1] {
		t.Fatalf("why: %+v", why)
	}
	if none := PkgWhy(app, w.opts, "corp.example/nowhere"); "missing" != none.Verdict {
		t.Fatalf("none: %+v", none)
	}

	// One package reached twice in one closure is acquired once, and a
	// dependency of a dependency is pinned for the package above it.
	w.mustPublish(w.publisherWith("mid", "1.0.0", "@\"corp.example/common\"\n", "\"corp.example/common\": {v: \"1.0.0\"}", ""))
	w.mustPublish(w.publisherWith("top", "1.0.0", "@\"corp.example/common\"\n@\"corp.example/mid\"\n",
		"\"corp.example/common\": {v: \"1.0.0\"}, \"corp.example/mid\": {v: \"1.0.0\"}", ""))
	w.fresh()
	once := w.sync(w.consumer("\"corp.example/top\": {v: \"1.0.0\"}", ""), false)
	if "ok" != once.Verdict || 3 != len(once.Fetched) {
		t.Fatalf("once: %s %+v", refusalText(once.Refusal), once)
	}
	w.mustPublish(w.publisherWith("over", "1.0.0", "@\"corp.example/mid\"\n", "\"corp.example/mid\": {v: \"1.0.0\"}", ""))
	w.fresh()
	overApp := w.consumer("\"corp.example/over\": {v: \"1.0.0\"}", "")
	if deep := w.sync(overApp, false); "ok" != deep.Verdict {
		t.Fatalf("over: %+v", deep)
	}
	storeLock := readLock(filepath.Join(w.cache, "store", readLock(overApp)["corp.example/over"].Canon, "corp.example", "over"))
	if 2 != len(storeLock) || "" == storeLock["corp.example/common"].Canon {
		t.Fatalf("store lock: %+v", storeLock)
	}

	// A published package may itself depend through an alias.
	w.mustPublish(w.publisherWith("aliased", "1.0.0", "@\"alias:old\"\n",
		"\"alias:old\": {pkg: \"corp.example/common\", v: \"1.0.0\"}", ""))
	w.fresh()
	aliasedApp := w.consumer("\"corp.example/aliased\": {v: \"1.0.0\"}", "")
	if r := w.sync(aliasedApp, false); "ok" != r.Verdict {
		t.Fatalf("aliased: %s %+v", refusalText(r.Refusal), r)
	}
	aliasedLock := readLock(filepath.Join(w.cache, "store", readLock(aliasedApp)["corp.example/aliased"].Canon, "corp.example", "aliased"))
	if "corp.example/common" != aliasedLock["alias:old"].Pkg {
		t.Fatalf("aliased store lock: %+v", aliasedLock)
	}
}

func TestPkgRoutingAndTrustRefusals(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	dep := "\"corp.example/service\": {v: \"1.4.2\"}"

	cases := []struct{ repo, code, pattern string }{
		{"repo: {base: [\"http://mirror.example\"]}\n", "base_not_https", `^repository base is not https: http://mirror.example$`},
		{"repo: {trust: {\"Corp/x\": {signer: forge}}}\n", "config_invalid", `repo.trust: Corp/x is not a pattern`},
		{"repo: {trust: {\"corp.example/*\": {signer: \"rsa:x\"}}}\n", "config_invalid", `names no signer`},
		{"repo: {trust: {\"corp.example/*\": 1}}\n", "config_invalid", `is not a pattern`},
		{"repo: {private: [\"Corp/*\"]}\n", "config_invalid", `repo.private: Corp/\* is not a pattern`},
		{"repo: {private: [\"corp.example/service\"]}\n", "private_name_public_path", `on the private list`},
		{"repo: {base: [\"http://127.0.0.1\"]}\n", "proof_signer_untrusted", `names the forge signer`},
		{"repo: {base: [\"http://127.0.0.1\"], trust: {\"corp.example/*\": {signer: \"" + w.keyID + "\", inclusion: required}}}\n",
			"inclusion_missing", `requires log inclusion`},
	}
	for _, c := range cases {
		r := w.sync(w.consumer(dep, c.repo), false)
		if "refused" != r.Verdict {
			t.Fatalf("%s: %+v", c.code, r)
		}
		refusedWith(t, r.Refusal, c.code, c.pattern)
	}
	other := newKeyPEM(t)
	otherID, _ := KeyIDFromPEM(other)
	o := w.sync(w.consumer(dep, "repo: {base: [\"http://127.0.0.1\"], trust: {\"corp.example/*\": {signer: \""+otherID+"\", inclusion: none}}}\n"), false)
	refusedWith(t, o.Refusal, "proof_signer_untrusted", `^the proof for corp.example/service 1.4.2: signed by ed25519:`)

	config := repoConfig(w.consumer(dep,
		"repo: {trust: {\"corp.example/service\": {signer: \""+w.keyID+"\", inclusion: none}, "+
			"\"corp.example/service/*\": {signer: forge}, \"corp.example/*\": {signer: \""+w.keyID+"\"}}}\n"), w.opts, RepoOverrides{})
	if w.keyID != trustEntryFor(config, "corp.example/service").Signer ||
		"none" != trustEntryFor(config, "corp.example/service").Inclusion ||
		"forge" != trustEntryFor(config, "corp.example/service/sub").Signer ||
		"required" != trustEntryFor(config, "corp.example/other").Inclusion ||
		"forge" != trustEntryFor(config, "other.example/x").Signer ||
		DefaultBase != config.Base[0] || DefaultWrite != config.Write {
		t.Fatalf("config: %+v", config)
	}
	if !PatternMatches("corp.example/*", "corp.example") || PatternMatches("corp.example/x", "corp.example/xy") ||
		BaseAdmitted("not a url") || !BaseAdmitted("http://localhost:8017") || !BaseAdmitted("http://[::1]:8017") ||
		IsLoopback("://") || IsLoopback("https://127.0.0.1") || BaseAdmitted("http://[::1") ||
		"/pkg/corp.example/!svc/@v/1.0.0.sigstore.json" != ObjectPath("sigstore", "corp.example/Svc", "1.0.0") ||
		"/pkg/corp.example/x/@latest" != ObjectPath("latest", "corp.example/x", "") {
		t.Fatal("patterns, bases or paths")
	}
	// A consumer with no package file at all reads the defaults.
	bare := t.TempDir()
	if c := repoConfig(bare, w.opts, RepoOverrides{Write: "https://w.example"}); DefaultBase != c.Base[0] || "https://w.example" != c.Write {
		t.Fatalf("bare: %+v", c)
	}
	write(t, filepath.Join(bare, "pkg.aontu"), "pkg: {path: \"corp.example/x\"}\nrepo: {write: \"https://own.example\"}\n")
	if c := repoConfig(bare, w.opts, RepoOverrides{}); "https://own.example" != c.Write || !contains(c.Private, "corp.example/x") {
		t.Fatalf("own write: %+v", c)
	}
}

func TestPkgSelectionRefusals(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("service", "1.4.3", netService, ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")

	unknown, _ := w.get(app, "corp.example/nothing@1.0.0", "get")
	refusedWith(t, unknown.Refusal, "fetch_failed", `^no version list for corp.example/nothing \(404 from `)
	absent, _ := w.get(app, "corp.example/service@9.9.9", "get")
	refusedWith(t, absent.Refusal, "fetch_failed", `9.9.9 is not in the version list`)

	listFile := filepath.Join(w.at("service"), "list")
	list := mustRead(t, listFile)
	writeJSON(t, listFile, map[string]any{"package": "corp.example/other", "versions": []any{}})
	refusedWith(t, w.sync(app, false).Refusal, "response_mismatch", `does not name corp.example/service`)
	writeJSON(t, listFile, map[string]any{"package": "corp.example/service", "versions": []any{map[string]any{"version": "x"}}})
	refusedWith(t, w.sync(app, false).Refusal, "response_mismatch", `is malformed`)
	write(t, listFile, list)

	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}
	write(t, filepath.Join(w.cache, "seen", "corp.example", "service", "1.0.0.aontu"),
		"{\"package\":\"corp.example/service\",\"version\":\"1.0.0\"}\n")
	rollback, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, rollback.Refusal, "list_rollback", `1.0.0 was seen before and is absent from the list`)
	_ = os.RemoveAll(filepath.Join(w.cache, "seen"))

	// A record under either suffix is evidence: forgetting one lets a
	// repository shorten a version list unnoticed.
	write(t, filepath.Join(w.cache, "seen", "corp.example", "service", "1.0.0.aon"),
		"{\"package\":\"corp.example/service\",\"version\":\"1.0.0\"}\n")
	legacySeen, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, legacySeen.Refusal, "list_rollback", `1.0.0 was seen before and is absent from the list`)
	_ = os.RemoveAll(filepath.Join(w.cache, "seen"))

	_ = os.Remove(filepath.Join(w.at("service"), "1.4.3.manifest"))
	write(t, filepath.Join(w.repo, "tombstone", "corp.example", "service", "@v", "1.4.3.aontu"),
		"{\"package\":\"corp.example/service\",\"version\":\"1.4.3\",\"reason\":\"malware\"}\n")
	tomb, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, tomb.Refusal, "tombstoned", `withdrawn by the repository \(malware\)$`)
	writeJSON(t, listFile, map[string]any{"package": "corp.example/service",
		"versions": []any{map[string]any{"version": "1.4.2", "seen": "2020-01-01T00:00:00Z"}}})
	tombAsked, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, tombAsked.Refusal, "tombstoned", `1.4.3 was withdrawn`)
	write(t, filepath.Join(w.repo, "tombstone", "corp.example", "service", "@v", "1.4.3.aontu"), "{}\n")
	bareTomb, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, bareTomb.Refusal, "tombstoned", `withdrawn by the repository$`)
	_ = os.RemoveAll(filepath.Join(w.repo, "tombstone"))
	write(t, listFile, list)
	gone, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, gone.Refusal, "fetch_failed", `^no manifest for corp.example/service 1.4.3$`)

	writeJSON(t, listFile, map[string]any{"package": "corp.example/service", "versions": []any{}})
	empty, _ := w.get(app, "corp.example/service", "get")
	refusedWith(t, empty.Refusal, "fetch_failed", `has no selectable version`)
	// A first-seen time that does not parse holds the version back.
	writeJSON(t, listFile, map[string]any{"package": "corp.example/service", "versions": []any{
		map[string]any{"version": "1.4.2", "seen": "2020-01-01T00:00:00Z"},
		map[string]any{"version": "1.4.3", "seen": "yesterday"}}})
	odd, _ := w.get(w.consumer("", ""), "corp.example/service", "get")
	if "ok" != odd.Verdict || "added corp.example/service 1.4.2" != odd.Change || 1 != len(odd.Events) {
		t.Fatalf("odd seen: %+v", odd)
	}
	write(t, listFile, list)

	// No repository answers at all.
	w.fresh()
	none := PkgSync(w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", ""), w.opts, DirHTTP(t.TempDir()),
		SyncArgs{RepoOverrides: RepoOverrides{Base: []string{"https://a.example", "https://b.example"}}})
	refusedWith(t, none.Refusal, "fetch_failed", `\(404 from https://b.example\)`)
	dead := PkgSync(w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", ""), w.opts, deadHTTP{}, SyncArgs{})
	refusedWith(t, dead.Refusal, "fetch_failed", `\(no repository answered\)`)
}

type deadHTTP struct{}

func (deadHTTP) Get(string) HTTPResponse                        { return HTTPResponse{} }
func (deadHTTP) Post(string, PublishParts, string) HTTPResponse { return HTTPResponse{} }

func TestPkgMoveRefusesAndNeverRedirects(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("service", "1.4.3", netService, "moved: \"corp.example/service2\"\n"))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	refusedWith(t, w.sync(app, false).Refusal, "module_moved", `moved to corp.example/service2; import that instead`)
	newest, _ := w.get(app, "corp.example/service@1.4.3", "get")
	refusedWith(t, newest.Refusal, "module_moved", `moved to corp.example/service2`)
	frozen := w.publish(w.publisher("service", "1.4.4", netService, ""))
	refusedWith(t, frozen.Refusal, "path_moved", `frozen by a moved declaration \(now corp.example/service2\)`)
}

func TestPkgBytesBeforeMeaningRefusals(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	zipFile := filepath.Join(w.at("service"), "1.4.2.zip")
	original, _ := os.ReadFile(zipFile)
	sigFile := filepath.Join(w.at("service"), "1.4.2.sig")

	_ = os.Remove(sigFile)
	refusedWith(t, w.sync(app, false).Refusal, "proof_missing", `no proof is served for corp.example/service 1.4.2`)
	write(t, sigFile, "not a proof\n")
	refusedWith(t, w.sync(app, false).Refusal, "proof_invalid", `not an aontu-signature/v1 key proof`)
	w.resign("service", "1.4.2", func(map[string]any) {})
	proof := readJSON(t, sigFile)
	proof["over"] = "sha256:" + strings.Repeat("0", 64)
	writeJSON(t, sigFile, proof)
	refusedWith(t, w.sync(app, false).Refusal, "proof_invalid", `the proof signs sha256:0+, not this manifest`)
	proof = readJSON(t, sigFile)
	w.resign("service", "1.4.2", func(map[string]any) {})
	proof = readJSON(t, sigFile)
	proof["signature"] = strings.Repeat("A", 86)
	writeJSON(t, sigFile, proof)
	refusedWith(t, w.sync(app, false).Refusal, "proof_invalid", `the signature does not verify`)
	proof["signature"] = "AAAA"
	writeJSON(t, sigFile, proof)
	refusedWith(t, w.sync(app, false).Refusal, "proof_invalid", `malformed key or signature`)
	w.resign("service", "1.4.2", func(map[string]any) {})

	write(t, zipFile, string(original)+"x")
	w.fresh()
	refusedWith(t, w.sync(app, false).Refusal, "archive_digest_mismatch", `^the archive for corp.example/service 1.4.2 is sha256:`)
	_ = os.Remove(zipFile)
	refusedWith(t, w.sync(app, false).Refusal, "fetch_failed", `^no archive for corp.example/service 1.4.2$`)
	write(t, zipFile, string(original))

	pkgFileData := []byte("pkg: {path: \"corp.example/service\", version: \"1.4.2\", main: \"main.aontu\"}\n")
	good := []ZipEntry{
		{Path: "main.aontu", Data: []byte(netService)},
		{Path: "pkg.aontu", Data: pkgFileData},
	}
	serve := func(entries []ZipEntry, edit func(m map[string]any)) {
		zip := ZipCanonical(entries)
		write(t, zipFile, string(zip))
		w.resign("service", "1.4.2", func(m map[string]any) {
			m["schema"] = ManifestSchema
			m["version"] = "1.4.2"
			m["deps"] = map[string]any{}
			files := []any{}
			for _, e := range entries {
				files = append(files, map[string]any{"path": e.Path, "digest": Sha256Hex(e.Data), "size": float64(len(e.Data))})
			}
			m["archive"].(map[string]any)["digest"] = Sha256Hex(zip)
			m["archive"].(map[string]any)["size"] = float64(len(zip))
			m["archive"].(map[string]any)["files"] = files
			edit(m)
		})
		w.fresh()
	}
	none := func(map[string]any) {}
	files := func(m map[string]any) []any { return m["archive"].(map[string]any)["files"].([]any) }

	serve(append(append([]ZipEntry{}, good...), ZipEntry{Path: "run.sh", Data: []byte("#!/bin/sh\n")}), none)
	refusedWith(t, w.sync(app, false).Refusal, "archive_entry_forbidden", `carries run.sh, which the allowlist does not admit`)
	serve(append(append([]ZipEntry{}, good...), ZipEntry{Path: "../x.aontu", Data: []byte("a")}), func(m map[string]any) {
		for _, f := range files(m) {
			if "../x.aontu" == f.(map[string]any)["path"] {
				f.(map[string]any)["path"] = "x.aontu"
			}
		}
	})
	refusedWith(t, w.sync(app, false).Refusal, "archive_path_invalid", `begins or ends with a dot \(\.\./x.aontu\)`)
	serve(append(append([]ZipEntry{}, good...), ZipEntry{Path: "big.aontu", Data: make([]byte, ArchiveLimitFileBytes+1)}), none)
	refusedWith(t, w.sync(app, false).Refusal, "archive_bomb", `unpacks past the size cap`)
	serve(good, func(m map[string]any) { files(m)[0].(map[string]any)["digest"] = "sha256:" + strings.Repeat("a", 64) })
	refusedWith(t, w.sync(app, false).Refusal, "file_manifest_mismatch", `holds main.aontu, which the manifest does not list as served`)
	serve(good, func(m map[string]any) {
		m["archive"].(map[string]any)["files"] = append(files(m), map[string]any{"path": "zzz.aontu", "digest": "sha256:" + strings.Repeat("a", 64), "size": float64(1)})
	})
	refusedWith(t, w.sync(app, false).Refusal, "file_manifest_mismatch", `lacks zzz.aontu, which the manifest lists`)
	serve(good, func(m map[string]any) {
		m["modules"].([]any)[0].(map[string]any)["canon"] = "aon1-" + strings.Repeat("A", 43)
	})
	refusedWith(t, w.sync(app, false).Refusal, "module_integrity", `means aon1-.*, and the manifest pins aon1-A+`)
	serve([]ZipEntry{good[0], {Path: "pkg.aontu", Data: []byte("pkg: {path: \"corp.example/service\", version: \"1.4.1\", main: \"main.aontu\"}\n")}}, none)
	refusedWith(t, w.sync(app, false).Refusal, "manifest_invalid", `package file inside corp.example/service 1.4.2 disagrees`)
	serve([]ZipEntry{{Path: "main.aontu", Data: []byte("a: 1\na: 2\n")}, good[1]}, none)
	refusedWith(t, w.sync(app, false).Refusal, "module_integrity", `means nothing \(it does not evaluate\)`)
	serve(good, func(m map[string]any) { m["deps"] = map[string]any{"alias:x": map[string]any{"v": "1.0.0"}} })
	refusedWith(t, w.sync(app, false).Refusal, "manifest_invalid", `declares alias:x without the package it names`)
	serve(good, func(m map[string]any) { m["version"] = "1.4.9" })
	refusedWith(t, w.sync(app, false).Refusal, "response_mismatch", `names corp.example/service 1.4.9, not corp.example/service 1.4.2`)
	serve(good, func(m map[string]any) { m["schema"] = "other" })
	refusedWith(t, w.sync(app, false).Refusal, "manifest_invalid", `schema is not aontu-package/v1`)

	loose := ZipCanonical(good)
	loose[6], loose[7] = 0x00, 0x08
	write(t, zipFile, string(loose))
	w.resign("service", "1.4.2", func(m map[string]any) {
		m["schema"] = ManifestSchema
		m["version"] = "1.4.2"
		m["deps"] = map[string]any{}
		m["archive"].(map[string]any)["digest"] = Sha256Hex(loose)
	})
	w.fresh()
	refusedWith(t, w.sync(app, false).Refusal, "archive_not_canonical", `archive is not canonical`)

	many := []ZipEntry{}
	for i := 0; i <= ArchiveLimitFiles; i++ {
		name := "f" + itoa4(i) + ".aontu"
		if 0 == i {
			name = "main.aontu"
		}
		many = append(many, ZipEntry{Path: name, Data: []byte("a")})
	}
	serve(many, none)
	refusedWith(t, w.sync(app, false).Refusal, "archive_too_many_files", `over the file-count cap`)
	huge := make([]byte, ArchiveLimitBytes+1)
	write(t, zipFile, string(huge))
	w.resign("service", "1.4.2", func(m map[string]any) { m["archive"].(map[string]any)["digest"] = Sha256Hex(huge) })
	w.fresh()
	refusedWith(t, w.sync(app, false).Refusal, "archive_too_large", `over the compressed cap`)
}

func itoa4(n int) string {
	s := ""
	for i := 0; i < 4; i++ {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

func TestManifestAndProofShapes(t *testing.T) {
	base := func() map[string]any {
		return map[string]any{
			"schema": ManifestSchema, "package": "corp.example/x", "version": "1.0.0", "publish": "private",
			"archive": map[string]any{"format": "zip", "digest": "sha256:" + strings.Repeat("a", 64), "size": float64(1),
				"files": []any{map[string]any{"path": "main.aontu", "digest": "sha256:" + strings.Repeat("b", 64), "size": float64(1)}}},
			"modules": []any{map[string]any{"path": "corp.example/x", "main": "main.aontu", "canon": "aon1-" + strings.Repeat("A", 43)}},
			"deps":    map[string]any{}, "published": "2026-01-01T00:00:00Z",
		}
	}
	if bad := ManifestError(base()); "" != bad {
		t.Fatal(bad)
	}
	cases := []struct {
		edit func(m map[string]any)
		want string
	}{
		{func(m map[string]any) { m["package"] = "nodomain" }, "package is not a package path"},
		{func(m map[string]any) { m["version"] = "1.0" }, "version is not MAJOR.MINOR.PATCH"},
		{func(m map[string]any) { m["publish"] = "maybe" }, "publish is not public or private"},
		{func(m map[string]any) { m["archive"].(map[string]any)["format"] = "tar" }, "archive is not a zip"},
		{func(m map[string]any) { m["archive"] = "x" }, "archive is not a zip"},
		{func(m map[string]any) {
			m["archive"].(map[string]any)["files"].([]any)[0].(map[string]any)["path"] = "../x"
		}, "archive.files names a file without"},
		{func(m map[string]any) { m["archive"].(map[string]any)["files"] = []any{"x"} }, "archive.files names a file without"},
		{func(m map[string]any) { m["modules"] = []any{} }, "modules is not the one module"},
		{func(m map[string]any) { m["modules"] = []any{"x"} }, "modules is not the one module"},
		{func(m map[string]any) { m["deps"] = []any{} }, "deps is not a map"},
		{func(m map[string]any) { m["deps"] = map[string]any{"corp.example/y": map[string]any{"v": "latest"}} }, "deps.corp.example/y is not a minimum version"},
		{func(m map[string]any) {
			m["deps"] = map[string]any{"corp.example/y": map[string]any{"v": "1.0.0", "pkg": "x"}}
		}, "deps.corp.example/y is not a minimum version"},
		{func(m map[string]any) { delete(m, "published") }, "published is not a timestamp"},
		{func(m map[string]any) { m["moved"] = "x" }, "moved is not a package path"},
		{func(m map[string]any) { m["retract"] = []any{"x"} }, "retract is not a list of versions"},
		{func(m map[string]any) { m["retract"] = "x" }, "retract is not a list of versions"},
	}
	for _, c := range cases {
		m := base()
		c.edit(m)
		if got := ManifestError(m); !strings.HasPrefix(got, c.want) {
			t.Fatalf("want %q, got %q", c.want, got)
		}
	}
	for _, main := range []string{"../main.aontu", "other.aontu"} {
		m := base()
		mods, _ := m["modules"].([]any)
		mods[0].(map[string]any)["main"] = main
		if got := ManifestError(m); "modules names an entry the archive does not hold" != got {
			t.Fatalf("main %q: %q", main, got)
		}
	}
	if "schema is not aontu-package/v1" != ManifestError(nil) {
		t.Fatal("nil manifest")
	}
	ok := base()
	ok["deps"] = map[string]any{"corp.example/y": map[string]any{"v": "1.0.0", "pkg": "corp.example/z"}}
	ok["retract"] = []any{"0.9.0"}
	ok["moved"] = "corp.example/z"
	if bad := ManifestError(ok); "" != bad {
		t.Fatal(bad)
	}

	for p, want := range map[string]string{
		"": "an entry path is empty, absolute or a directory", "a/": "an entry path is empty, absolute or a directory",
		"a b.aontu":         "an entry path element is outside the alphabet",
		"a/.hidden/b.aontu": "an entry path element is empty or begins or ends with a dot", "a/b.aontu": "",
	} {
		if got := RelPathError(p); want != got {
			t.Fatalf("%q: %q", p, got)
		}
	}

	pemText := newKeyPEM(t)
	id, _ := KeyIDFromPEM(pemText)
	digest := "sha256:" + strings.Repeat("c", 64)
	proof, err := SignDigest(pemText, digest)
	if nil != err {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(proof)
	doc, _ := parseDoc(raw)
	if "" != VerifyKeyProof(doc, digest, id) {
		t.Fatal("a good proof")
	}
	doc["kind"] = "sigstore"
	if !strings.Contains(VerifyKeyProof(doc, digest, id), "not an aontu-signature") {
		t.Fatal("kind")
	}
	doc["kind"] = "key"
	other, _ := KeyIDFromPEM(newKeyPEM(t))
	if !strings.HasPrefix(VerifyKeyProof(doc, digest, other), "signed by ed25519:") {
		t.Fatal("signer")
	}
	doc["signer"] = "ed25519:" + strings.Repeat("A", 43)
	if "the signer is a key of small order" != VerifyKeyProof(doc, digest, "ed25519:"+strings.Repeat("A", 43)) {
		t.Fatal("small order")
	}
	keyOf := func(h string) string {
		b, _ := hex.DecodeString(h)
		return "ed25519:" + base64.RawURLEncoding.EncodeToString(b)
	}
	for _, h := range []string{"ec" + strings.Repeat("ff", 30) + "7f", "ed" + strings.Repeat("ff", 30) + "7f",
		"ee" + strings.Repeat("ff", 30) + "ff", "01" + strings.Repeat("00", 30) + "80"} {
		doc["signer"] = keyOf(h)
		if "the signer is a key of small order" != VerifyKeyProof(doc, digest, keyOf(h)) {
			t.Fatal("small order " + h)
		}
	}
	for _, h := range []string{"02" + strings.Repeat("ff", 30) + "7f", "ed" + strings.Repeat("ff", 29) + "fe7f"} {
		b, _ := hex.DecodeString(h)
		if SmallOrderKey(b) {
			t.Fatal("not small order " + h)
		}
	}
	doc["signer"] = id
	good, _ := doc["signature"].(string)
	const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	slack := func(s string) string {
		return s[:len(s)-1] + string(b64[strings.IndexByte(b64, s[len(s)-1])|1])
	}
	doc["signature"] = slack(good)
	if "the proof carries a malformed key or signature" != VerifyKeyProof(doc, digest, id) {
		t.Fatal("slack signature")
	}
	doc["signature"] = good[:85] + "="
	if "the proof carries a malformed key or signature" != VerifyKeyProof(doc, digest, id) {
		t.Fatal("padded signature")
	}
	doc["signature"] = good
	doc["signer"] = slack(id)
	if "the proof carries a malformed key or signature" != VerifyKeyProof(doc, digest, slack(id)) {
		t.Fatal("slack signer")
	}
	doc["signer"] = "ed25519:" + strings.Repeat("!", 43)
	if !strings.Contains(VerifyKeyProof(doc, digest, doc["signer"].(string)), "not an aontu-signature") {
		t.Fatal("malformed id")
	}
	if "2026-01-02T03:04:05Z" != Timestamp(time.Date(2026, 1, 2, 3, 4, 5, 678, time.UTC)) {
		t.Fatal("timestamp")
	}

	// Keys that are not what the provider signs with.
	if _, err := KeyIDFromPEM("not pem"); nil == err || !strings.Contains(err.Error(), "not PEM") {
		t.Fatalf("not pem: %v", err)
	}
	if _, err := KeyIDFromPEM(string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("junk")}))); nil == err {
		t.Fatal("junk der")
	}
	rsaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	der, _ := x509.MarshalPKCS8PrivateKey(rsaKey)
	if _, err := KeyIDFromPEM(string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))); nil == err || !strings.Contains(err.Error(), "not Ed25519") {
		t.Fatalf("rsa: %v", err)
	}
	if _, err := SignDigest("not pem", digest); nil == err {
		t.Fatal("sign with no key")
	}
}

func TestEditDeps(t *testing.T) {
	w := newNetWorld(t)
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	pkgAon := filepath.Join(app, "pkg.aontu")
	if bad := EditDeps(app, DepEdit{Op: "raise", Key: "corp.example/none", V: "1.0.0"}, w.opts); !strings.Contains(bad, "is not on one line of pkg.aontu") {
		t.Fatal(bad)
	}
	write(t, pkgAon, "dep: {\n  \"corp.example/service\": {\n    v: \"1.4.2\"\n  }\n}\n")
	if bad := EditDeps(app, DepEdit{Op: "raise", Key: "corp.example/service", V: "1.4.3"}, w.opts); !strings.Contains(bad, "spans several lines") {
		t.Fatal(bad)
	}
	if bad := EditDeps(app, DepEdit{Op: "remove", Key: "corp.example/service"}, w.opts); !strings.Contains(bad, "spans several lines") {
		t.Fatal(bad)
	}
	write(t, pkgAon, "dep: {\n  \"corp.example/service\": {}\n}\n")
	if bad := EditDeps(app, DepEdit{Op: "raise", Key: "corp.example/service", V: "1.4.3"}, w.opts); !strings.Contains(bad, "declares its version on another line") {
		t.Fatal(bad)
	}
	write(t, pkgAon, "# \"corp.example/service\" was here\ndep: {\"corp.example/service\": {v: \"1.4.2\"}}\n")
	if bad := EditDeps(app, DepEdit{Op: "remove", Key: "corp.example/service"}, w.opts); !strings.Contains(bad, "did not take") {
		t.Fatal(bad)
	}
	if !strings.HasPrefix(mustRead(t, pkgAon), "# \"corp.example/service\" was here") {
		t.Fatal("not restored")
	}
	write(t, pkgAon, "dep: {")
	if bad := EditDeps(app, DepEdit{Op: "add", Key: "corp.example/service", V: "1.4.2"}, w.opts); !strings.Contains(bad, "did not take") {
		t.Fatal(bad)
	}
	write(t, pkgAon, "dep: {}")
	if bad := EditDeps(app, DepEdit{Op: "add", Key: "corp.example/service", V: "1.4.2"}, w.opts); "" != bad {
		t.Fatal(bad)
	}
	if "dep: {}\ndep: \"corp.example/service\": { v: \"1.4.2\" }\n" != mustRead(t, pkgAon) {
		t.Fatalf("append: %q", mustRead(t, pkgAon))
	}
	if bad := EditDeps(app, DepEdit{Op: "raise", Key: "corp.example/service", V: "1.4.3"}, w.opts); "" != bad {
		t.Fatal(bad)
	}
	if bad := EditDeps(app, DepEdit{Op: "remove", Key: "corp.example/service"}, w.opts); "" != bad {
		t.Fatal(bad)
	}
	if "dep: {}\n" != mustRead(t, pkgAon) {
		t.Fatalf("remove: %q", mustRead(t, pkgAon))
	}
	_ = os.Remove(pkgAon)
	if bad := EditDeps(app, DepEdit{Op: "add", Key: "corp.example/service", V: "1.4.2"}, w.opts); "" != bad {
		t.Fatal(bad)
	}
	if p, v, bad := ParsePkgSpec("corp.example/x@1.2.3"); "corp.example/x" != p || "1.2.3" != v || "" != bad {
		t.Fatal("spec")
	}
}

func TestPkgChangeTakenBack(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("service", "1.4.3", netService, ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}
	before := mustRead(t, filepath.Join(app, "pkg.aontu"))
	_ = os.Remove(filepath.Join(w.at("service"), "1.4.3.sig"))
	r, _ := w.get(app, "corp.example/service@1.4.3", "get")
	if "refused" != r.Verdict || "none (raised corp.example/service 1.4.2 -> 1.4.3 was taken back)" != r.Change ||
		before != mustRead(t, filepath.Join(app, "pkg.aontu")) {
		t.Fatalf("taken back: %+v", r)
	}

	write(t, filepath.Join(app, "pkg.aontu"), "dep: {\n  \"corp.example/service\": {\n    v: \"1.4.2\"\n  }\n}\n"+w.repoBlock())
	if _, usage := w.get(app, "corp.example/service@1.4.3", "get"); !strings.Contains(usage, "spans several lines") {
		t.Fatalf("spans: %q", usage)
	}
	if _, usage := PkgRemove(app, w.opts, w.http, "corp.example/service", SyncArgs{}); !strings.Contains(usage, "spans several lines") {
		t.Fatalf("spans remove: %q", usage)
	}
	write(t, filepath.Join(app, "pkg.aontu"), "dep: {\n")
	if _, usage := w.get(app, "corp.example/service@1.4.2", "add"); !strings.Contains(usage, "did not take") {
		t.Fatalf("broken: %q", usage)
	}

	// The lock and the vendor tree are taken back with the package
	// file, and no tmp is left behind.
	w.resign("service", "1.4.3", func(map[string]any) {})
	kept := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	if r := w.sync(kept, false); "ok" != r.Verdict {
		t.Fatalf("kept: %+v", r)
	}
	write(t, filepath.Join(kept, "pkg.aontu"), mustRead(t, filepath.Join(kept, "pkg.aontu"))+"dep: {\"bad key!\": {v: \"1.0.0\"}}\n")
	lockBefore := mustRead(t, filepath.Join(kept, "aontu_meta", "pkg-lock.aontu"))
	vendoredFile := filepath.Join(kept, "aontu_meta", "vendor", "corp.example", "service", "pkg.aontu")
	back, _ := w.get(kept, "corp.example/service@1.4.3", "get")
	if "missing" != back.Verdict || !strings.Contains(back.Change, "was taken back") ||
		lockBefore != mustRead(t, filepath.Join(kept, "aontu_meta", "pkg-lock.aontu")) ||
		!strings.Contains(mustRead(t, vendoredFile), "version: \"1.4.2\"") {
		t.Fatalf("kept back: %+v", back)
	}
	if _, err := os.Stat(filepath.Join(kept, "aontu_meta", "tmp")); nil == err {
		t.Fatal("tmp left behind")
	}
	none := w.consumer("\"bad key!\": {v: \"1.0.0\"}", "")
	if added, _ := w.get(none, "corp.example/service@1.4.2", "add"); !strings.Contains(added.Change, "was taken back") {
		t.Fatalf("none: %+v", added)
	}
	for _, p := range []string{"pkg-lock.aontu", "vendor"} {
		if _, err := os.Stat(filepath.Join(none, "aontu_meta", p)); nil == err {
			t.Fatal(p + " left behind")
		}
	}

	odd := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}, \"not a path\": {v: \"1.0.0\"}, \"alias:x\": {v: \"1.0.0\"}", "")
	m := w.sync(odd, false)
	if "missing" != m.Verdict || !contains(m.Missing, "alias:x") || !contains(m.Missing, "not a path") {
		t.Fatalf("odd: %+v", m)
	}
	bad := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	vendored := filepath.Join(bad, "aontu_meta", "vendor", "corp.example", "service")
	write(t, filepath.Join(vendored, "pkg.aontu"), "pkg: {path: \"corp.example/service\", version: \"1.4.2\", main: \"main.aontu\"}\n")
	write(t, filepath.Join(vendored, "main.aontu"), "a: 1\na: 2\n")
	if e := w.sync(bad, false); "error" != e.Verdict || !contains(e.Unevaluable, "corp.example/service") {
		t.Fatalf("unevaluable: %+v", e)
	}
	// A tampered vendor tree after a lock: verify reports the mismatch
	// as the sync verdict.
	main := filepath.Join(app, "aontu_meta", "vendor", "corp.example", "service", "main.aontu")
	write(t, filepath.Join(app, "pkg.aontu"), before)
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("resync: %+v", r)
	}
	write(t, main, "name: string\n")
	if r := w.sync(app, false); "mismatch" != r.Verdict || 1 != len(r.Mismatched) || "manifest" != r.Mismatched[0].Pin {
		t.Fatalf("a changed tree disagrees with its kept manifest: %+v", r)
	}
}

type answerHTTP struct {
	get    PkgHTTP
	status int
	body   string
	posted *struct {
		url   string
		parts PublishParts
		token string
	}
}

func (a *answerHTTP) Get(url string) HTTPResponse { return a.get.Get(url) }
func (a *answerHTTP) Post(url string, parts PublishParts, token string) HTTPResponse {
	a.posted = &struct {
		url   string
		parts PublishParts
		token string
	}{url, parts, token}
	return HTTPResponse{Status: a.status, Body: []byte(a.body)}
}

func TestPkgPublishGatesAndRefusals(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))

	breaking := w.publish(w.publisher("service", "1.5.0", netService+"owner: string\n", ""))
	if "breaking" != breaking.Verdict || "corp.example/service 1.4.2" != breaking.Against || 0 == len(breaking.Findings) ||
		exists(filepath.Join(w.at("service"), "1.5.0.manifest")) {
		t.Fatalf("breaking: %+v", breaking)
	}
	w.mustPublish(w.publisher("service", "1.5.0", netService+"owner?: string\n", ""))
	refusedWith(t, w.publish(w.publisher("service", "1.5.0", netService, "")).Refusal, "version_exists", `1.5.0 was published before`)
	explicit := PkgPublish(w.publisher("service", "1.6.0", netService, ""), w.opts, w.http,
		PublishArgs{Yes: true, Key: w.key, To: w.repo, Against: filepath.Join(w.dir, "service-1.4.2")})
	if "sent" != explicit.Verdict || filepath.Join(w.dir, "service-1.4.2") != explicit.Against {
		t.Fatalf("explicit: %+v", explicit)
	}
	if nothing := w.publish(filepath.Join(w.dir, "empty")); "error" != nothing.Verdict {
		t.Fatalf("empty: %+v", nothing)
	}

	priv := w.publisher("service", "1.7.0", netService, "")
	home := PkgPublish(priv, w.opts, w.http, PublishArgs{Yes: true, Key: w.key})
	if DefaultWrite != home.Write {
		t.Fatalf("home: %+v", home)
	}
	refusedWith(t, home.Refusal, "not_public", `does not declare publish: public`)

	pub := w.publisher("service", "1.7.0", netService, "publish: public\n")
	token := filepath.Join(w.dir, "token")
	claims, _ := json.Marshal(map[string]any{
		"iss": "https://token.actions.githubusercontent.com", "repository": "corp/service",
		"repository_owner_id": 1, "repository_id": 2, "event_name": "release",
		"runner_environment": "github-hosted", "workflow_ref": "corp/service/.github/workflows/publish.yml@refs/tags/v1",
	})
	jwt := "eyJhbGciOiJSUzI1NiJ9." + base64.RawURLEncoding.EncodeToString(claims) + ".sig"
	write(t, token, jwt+"\n")
	answer := &answerHTTP{get: w.http, status: 201}
	sent := PkgPublish(pub, w.opts, answer, PublishArgs{Yes: true, Key: w.key, Token: token,
		RepoOverrides: RepoOverrides{Write: "https://write.example"}})
	if "sent" != sent.Verdict || "https://write.example/v1/publish" != answer.posted.url || jwt != answer.posted.token {
		t.Fatalf("sent: %+v %+v", sent, answer.posted)
	}
	manifest, _ := parseDoc(answer.posted.parts.Manifest)
	publisher := manifest["publisher"].(map[string]any)
	if "github.com" != publisher["host"] || "release" != publisher["trigger"] ||
		"1" != publisher["subject"].(map[string]any)["owner_id"] || "public" != manifest["publish"] {
		t.Fatalf("publisher: %+v", publisher)
	}
	answer.status, answer.body = 403, `{"code":"namespace_mismatch","message":"not yours"}`
	refusedWith(t, PkgPublish(pub, w.opts, answer, PublishArgs{Yes: true, Key: w.key, RepoOverrides: RepoOverrides{Write: "https://write.example"}}).Refusal,
		"namespace_mismatch", `^not yours$`)
	answer.status, answer.body = 500, "oops"
	refusedWith(t, PkgPublish(pub, w.opts, answer, PublishArgs{Yes: true, Key: w.key, RepoOverrides: RepoOverrides{Write: "https://write.example"}}).Refusal,
		"fetch_failed", `^the write path answered 500$`)
	refusedWith(t, PkgPublish(pub, w.opts, w.http, PublishArgs{RepoOverrides: RepoOverrides{Write: "ftp://x"}}).Refusal,
		"base_not_https", `ftp://x`)
	badKey := filepath.Join(w.dir, "bad.pem")
	write(t, badKey, "not pem")
	refusedWith(t, PkgPublish(pub, w.opts, w.http, PublishArgs{Key: badKey, To: w.repo}).Refusal, "key_invalid", `not PEM`)

	if nil != PublisherFromToken("nope") || nil != PublisherFromToken("a.!!.c") || nil != PublisherFromToken("a.e30.c") ||
		nil != PublisherFromToken("a."+base64.RawURLEncoding.EncodeToString([]byte(`{"iss":"https://other"}`))+".c") ||
		nil != PublisherFromToken("a."+base64.RawURLEncoding.EncodeToString([]byte(`[]`))+".c") {
		t.Fatal("tokens that carry no publisher")
	}
	gl := PublisherFromToken("a." + base64.RawURLEncoding.EncodeToString([]byte(
		`{"iss":"https://gitlab.com","project_path":"corp/svc","namespace_id":3,"project_id":4,"runner_environment":"self-hosted","ci_config_ref_uri":"gitlab.com/corp/svc//.gitlab-ci.yml@refs/heads/main"}`)) + ".c")
	if "gitlab.com" != gl["host"] || "self_hosted" != gl["runner"] || "gitlab.com/corp/svc//.gitlab-ci.yml@refs/heads/main" != gl["workflow"] ||
		"3" != gl["subject"].(map[string]any)["owner_id"] {
		t.Fatalf("gitlab: %+v", gl)
	}
	bareGl := PublisherFromToken("a." + base64.RawURLEncoding.EncodeToString([]byte(
		`{"iss":"https://gitlab.com","project_path":"corp/svc","namespace_id":"3","project_id":"4"}`)) + ".c")
	if _, has := bareGl["workflow"]; has || "hosted" != bareGl["runner"] || "3" != bareGl["subject"].(map[string]any)["owner_id"] {
		t.Fatalf("bare gitlab: %+v", bareGl)
	}
	bareGh := PublisherFromToken("a." + base64.RawURLEncoding.EncodeToString([]byte(
		`{"iss":"https://token.actions.githubusercontent.com","repository":"corp/svc","repository_owner_id":true,"repository_id":2,"event_name":"push"}`)) + ".c")
	if _, has := bareGh["workflow"]; has || "push" != bareGh["trigger"] || "" != bareGh["subject"].(map[string]any)["owner_id"] {
		t.Fatalf("bare github: %+v", bareGh)
	}
	// A version list that exists and names nothing yet.
	writeJSON(t, filepath.Join(w.at("fresh"), "list"), map[string]any{"package": "corp.example/fresh", "versions": []any{}})
	if r := w.publish(w.publisher("fresh", "1.0.0", "f: 1\n", "")); "sent" != r.Verdict {
		t.Fatalf("fresh: %s", refusalText(r.Refusal))
	}
	write(t, token, "nope")
	answer.status, answer.body = 200, ""
	if r := PkgPublish(pub, w.opts, answer, PublishArgs{Yes: true, Key: w.key, Token: token, RepoOverrides: RepoOverrides{Write: "https://write.example"}}); "sent" != r.Verdict {
		t.Fatalf("no publisher: %+v", r)
	}
	if m, _ := parseDoc(answer.posted.parts.Manifest); nil != m["publisher"] {
		t.Fatal("a token that is not a token added a publisher")
	}

	// The platform's own transport, posting to a loopback write path
	// and to a port nothing answers.
	received := []map[string]any{}
	sink := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		data, _ := io.ReadAll(req.Body)
		received = append(received, map[string]any{"auth": req.Header.Get("Authorization"), "type": req.Header.Get("Content-Type"), "n": len(data)})
		rw.WriteHeader(201)
	}))
	write(t, token, "tok")
	real := PkgPublish(priv, w.opts, DefaultHTTP(), PublishArgs{Yes: true, Key: w.key, Token: token, RepoOverrides: RepoOverrides{Write: sink.URL}})
	sink.Close()
	if "sent" != real.Verdict || 1 != len(received) || "Bearer tok" != received[0]["auth"] ||
		!strings.HasPrefix(received[0]["type"].(string), "multipart/form-data; boundary=") || 1000 > received[0]["n"].(int) {
		t.Fatalf("real post: %+v %+v", real, received)
	}
	dead := PkgPublish(priv, w.opts, DefaultHTTP(), PublishArgs{Yes: true, Key: w.key, RepoOverrides: RepoOverrides{Write: "http://127.0.0.1:1"}})
	refusedWith(t, dead.Refusal, "fetch_failed", `answered 0$`)
	if 0 != DefaultHTTP().Get("http://127.0.0.1:1/x").Status {
		t.Fatal("a dead port answers")
	}
	if 0 != DefaultHTTP().Post(":bad url", PublishParts{}, "").Status {
		t.Fatal("a bad url posts")
	}
}

func TestPkgPublishReadsThePredecessor(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.resign("service", "1.4.2", func(m map[string]any) { m["archive"].(map[string]any)["digest"] = "sha256:" + strings.Repeat("f", 64) })
	refusedWith(t, w.publish(w.publisher("service", "1.4.3", netService, "")).Refusal, "archive_digest_mismatch", `is sha256:`)

	w2 := newNetWorld(t)
	w2.mustPublish(w2.publisher("service", "1.0.0", "a: min(1)\n", ""))
	if u := w2.publish(w2.publisher("service", "1.1.0", "a: must(min(1), \"m\")\n", "")); "undecided" != u.Verdict {
		t.Fatalf("undecided: %+v", u)
	}
}

func TestPkgServeAndProxy(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	origin, err := StartServe(ServeOptions{Dir: w.repo, Listen: "127.0.0.1:0", HTTP: DefaultHTTP()})
	if nil != err {
		t.Fatal(err)
	}
	cacheDir := filepath.Join(w.dir, "proxy")
	_ = os.MkdirAll(cacheDir, 0o755)
	proxy, err := StartServe(ServeOptions{Dir: cacheDir, Upstream: []string{origin.URL}, Listen: "127.0.0.1:0", HTTP: DefaultHTTP()})
	if nil != err {
		t.Fatal(err)
	}
	defer proxy.Close()

	client := DefaultHTTP()
	list := client.Get(origin.URL + ObjectPath("list", "corp.example/service", ""))
	if doc, _ := parseDoc(list.Body); 200 != list.Status || "corp.example/service" != doc["package"] {
		t.Fatalf("list: %+v", list)
	}
	for _, p := range []string{"/pkg/corp.example/service/@v/9.9.9.zip", "/etc/passwd", "/pkg/../x/@v/list"} {
		if 404 != client.Get(origin.URL+p).Status {
			t.Fatalf("%s served", p)
		}
	}
	r, _ := http.Get(origin.URL + ObjectPath("archive", "corp.example/service", "1.4.2"))
	if "application/zip" != r.Header.Get("content-type") || "max-age=31536000, immutable" != r.Header.Get("cache-control") {
		t.Fatalf("archive headers: %v", r.Header)
	}
	r.Body.Close()
	head, _ := http.Head(origin.URL + ObjectPath("list", "corp.example/service", ""))
	if 200 != head.StatusCode || "max-age=60" != head.Header.Get("cache-control") {
		t.Fatalf("head: %v", head.Header)
	}
	post, _ := http.Post(origin.URL+"/", "text/plain", strings.NewReader(""))
	if 405 != post.StatusCode {
		t.Fatal("post")
	}
	post.Body.Close()
	sig, _ := http.Get(origin.URL + ObjectPath("signature", "corp.example/service", "1.4.2"))
	if "text/plain; charset=utf-8" != sig.Header.Get("content-type") {
		t.Fatal("sig type")
	}
	sig.Body.Close()
	write(t, filepath.Join(w.at("service"), "1.4.2.sigstore.json"), "{}\n")
	bundle, _ := http.Get(origin.URL + "/pkg/corp.example/service/@v/1.4.2.sigstore.json")
	if 200 != bundle.StatusCode || "application/json" != bundle.Header.Get("content-type") {
		t.Fatalf("json type: %v", bundle.Header)
	}
	bundle.Body.Close()
	redirecting := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		http.Redirect(rw, req, "/elsewhere", 302)
	}))
	if 302 != client.Get(redirecting.URL+"/x").Status {
		t.Fatal("a redirect was followed")
	}
	redirecting.Close()

	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}",
		"repo: {base: [\""+proxy.URL+"\"], trust: {\"corp.example/*\": {signer: \""+w.keyID+"\", inclusion: none}}}\n")
	if s := PkgSync(app, w.opts, client, SyncArgs{}); "ok" != s.Verdict {
		t.Fatalf("proxied sync: %+v", s)
	}
	if !exists(filepath.Join(cacheDir, "pkg", "corp.example", "service", "@v", "1.4.2.zip")) ||
		!exists(filepath.Join(cacheDir, "pkg", "corp.example", "service", "@v", "list")) {
		t.Fatal("the proxy kept nothing")
	}
	if 404 != client.Get(proxy.URL+ObjectPath("list", "corp.example/other", "")).Status {
		t.Fatal("a miss everywhere served")
	}
	origin.Close()
	stale, _ := http.Get(proxy.URL + ObjectPath("list", "corp.example/service", ""))
	if 200 != stale.StatusCode || !strings.Contains(stale.Header.Get("x-aontu-stale"), "no upstream answered") {
		t.Fatalf("stale: %v", stale.Header)
	}
	stale.Body.Close()
	served := ServeObject(ServeOptions{Dir: cacheDir, Upstream: []string{"http://127.0.0.1:1"}, HTTP: client},
		ObjectPath("list", "corp.example/service", ""))
	if 200 != served.Status || !served.Stale {
		t.Fatalf("served: %+v", served)
	}

	if !ObjectShape("/pkg/corp.example/x/@v/list") || !ObjectShape("/pkg/corp.example/x/@v/1.0.0.sigstore.json") ||
		!ObjectShape("/tombstone/feed.aontu") || ObjectShape("/pkg/corp.example//x/@v/list") ||
		ObjectShape("/pkg/corp.example/x/@v/1.0.zip") || ObjectShape("/pkg/./x/@v/list") {
		t.Fatal("shapes")
	}
	if "127.0.0.1:8017" != SplitListen("127.0.0.1:8017") || "localhost:8017" != SplitListen("localhost") ||
		"localhost:8017" != SplitListen("localhost:x") {
		t.Fatal("listen")
	}
	if _, err := StartServe(ServeOptions{Dir: w.repo, Listen: "256.0.0.1:0", HTTP: client}); nil == err {
		t.Fatal("an address nothing can listen on")
	}
	if v6, err := StartServe(ServeOptions{Dir: w.repo, Listen: "[::1]:0", HTTP: client}); nil == err {
		if !strings.HasPrefix(v6.URL, "http://[::1]:") {
			t.Fatalf("v6: %s", v6.URL)
		}
		v6.Close()
	}
}

func TestKeygenWritesAKeyOnce(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "keys", "new.pem")
	signer, refused := Keygen(file)
	if "" != refused || !keyIDRe.MatchString(signer) {
		t.Fatalf("keygen: %q %q", signer, refused)
	}
	id, err := KeyIDFromPEM(mustRead(t, file))
	if nil != err || id != signer {
		t.Fatalf("the file does not match the id: %v %s", err, id)
	}
	if _, refused := Keygen(file); !strings.Contains(refused, "exists; a key is written once") {
		t.Fatalf("overwrite: %q", refused)
	}
	if _, refused := Keygen(filepath.Join(file, "under-a-file.pem")); "" == refused {
		t.Fatal("a path under a file was written")
	}
}

func TestWriteLayoutAndDirHTTP(t *testing.T) {
	w := newNetWorld(t)
	if 405 != w.http.Post("http://x/y", PublishParts{}, "").Status || 404 != w.http.Get("http://x/pkg/../etc").Status {
		t.Fatal("dir http")
	}
	_ = os.MkdirAll(filepath.Join(w.repo, "adir"), 0o755)
	if 404 != w.http.Get("http://x/adir").Status {
		t.Fatal("a directory served")
	}

	manifest := map[string]any{
		"schema": ManifestSchema, "package": "corp.example/Svc", "version": "1.0.0", "publish": "private",
		"archive": map[string]any{"format": "zip", "digest": "sha256:" + strings.Repeat("a", 64), "size": 1, "files": []any{}},
		"modules": []any{}, "deps": map[string]any{}, "published": "2026-01-01T00:00:00Z",
	}
	bytes, _ := json.Marshal(manifest)
	one := LayoutWrite{Manifest: manifest, ManifestBytes: bytes, ProofBytes: []byte("p"), Archive: []byte("z")}
	WriteLayout(w.repo, one, w.opts, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if !exists(filepath.Join(w.repo, "pkg", "corp.example", "!svc", "@v", "1.0.0.zip")) {
		t.Fatal("no escaped layout")
	}
	if ref := catchRefusal(func() { WriteLayout(w.repo, one, w.opts, time.Now()) }); nil == ref || "version_exists" != ref.Code {
		t.Fatalf("version exists: %+v", ref)
	}
	moved := map[string]any{}
	for k, v := range manifest {
		moved[k] = v
	}
	moved["version"] = "1.1.0"
	moved["moved"] = "corp.example/elsewhere"
	movedBytes, _ := json.Marshal(moved)
	WriteLayout(w.repo, LayoutWrite{Manifest: moved, ManifestBytes: movedBytes, ProofBytes: []byte("p"), Archive: []byte("z")}, w.opts, time.Now())
	third := map[string]any{}
	for k, v := range manifest {
		third[k] = v
	}
	third["version"] = "1.2.0"
	if ref := catchRefusal(func() {
		WriteLayout(w.repo, LayoutWrite{Manifest: third, ManifestBytes: bytes, ProofBytes: []byte("p"), Archive: []byte("z")}, w.opts, time.Now())
	}); nil == ref || "path_moved" != ref.Code {
		t.Fatalf("path moved: %+v", ref)
	}
	if "path_moved: corp.example/Svc is frozen by a moved declaration (now corp.example/elsewhere)" !=
		(&PkgRefusal{Code: "path_moved", Message: "corp.example/Svc is frozen by a moved declaration (now corp.example/elsewhere)"}).Error() {
		t.Fatal("error text")
	}

	// `why` reads the store beside the vendor tree, and a cycle ends
	// the walk rather than the process.
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	write(t, filepath.Join(app, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/service\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.4.2\"},\"bad key\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.0.0\"}}}\n")
	if why := PkgWhy(app, w.opts, "corp.example/service"); 1 != len(why.Paths) {
		t.Fatalf("why: %+v", why)
	}
	write(t, filepath.Join(app, "aontu_meta", "vendor", "corp.example", "service", "pkg.aontu"),
		"pkg: {path: \"corp.example/service\"}\ndep: {\"corp.example/common\": {v: \"1.0.0\"}}\n")
	write(t, filepath.Join(app, "aontu_meta", "vendor", "corp.example", "common", "pkg.aontu"),
		"pkg: {path: \"corp.example/common\"}\ndep: {\"corp.example/service\": {v: \"1.0.0\"}}\n")
	write(t, filepath.Join(app, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/service\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.4.2\"},\"corp.example/common\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.0.0\"}}}\n")
	if why := PkgWhy(app, w.opts, "corp.example/nowhere"); 0 != len(why.Paths) {
		t.Fatalf("cycle: %+v", why)
	}
	if why := PkgWhy(app, w.opts, "corp.example/common"); 1 != len(why.Paths) || 3 != len(why.Paths[0]) {
		t.Fatalf("through: %+v", why)
	}
	if r := PkgSync(app, w.opts, w.http, SyncArgs{RepoOverrides: RepoOverrides{Base: []string{"ftp://x"}}}); "refused" != r.Verdict {
		t.Fatalf("base: %+v", r)
	}
	unnamed := t.TempDir()
	write(t, filepath.Join(unnamed, "pkg.aontu"), "dep: {\"corp.example/x\": {v: \"1.0.0\"}}\n")
	if why := PkgWhy(unnamed, w.opts, "corp.example/x"); 1 != len(why.Paths) || "." != why.Paths[0][0] {
		t.Fatalf("unnamed root: %+v", why)
	}
	write(t, filepath.Join(app, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"bad key\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.0.0\"},\"corp.example/common\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.0.0\"}}}\n")
	if r := PkgOutdated(app, w.opts, w.http, SyncArgs{RepoOverrides: RepoOverrides{Base: []string{"ftp://x"}}}); "refused" != r.Verdict {
		t.Fatalf("outdated base: %+v", r)
	}
	od := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	refusedWith(t, od.Refusal, "fetch_failed", `no version list for corp.example/common`)

	// A panic that is not a refusal is not caught.
	func() {
		defer func() {
			if r := recover(); nil == r {
				t.Fatal("swallowed")
			}
		}()
		catchRefusal(func() { panic("boom") })
	}()
}

func TestEveryListedVersionIsSeenAndATombstoneIsNotARollback(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("service", "1.4.3", netService, ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}
	seen := cacheSeenDir(w.cache, "corp.example/service")
	for _, v := range []string{"1.4.2", "1.4.3"} {
		if _, err := os.Stat(filepath.Join(seen, v+".aontu")); nil != err {
			t.Fatal("unseen " + v)
		}
	}

	// A version dropped from the list with nothing in its place is a
	// rollback, though this client never took it. A held closure asks
	// nothing, so a consumer that must fetch is the one that notices.
	listFile := filepath.Join(w.at("service"), "list")
	list := readJSON(t, listFile)
	kept := []any{}
	for _, e := range list["versions"].([]any) {
		if em, _ := e.(map[string]any); "1.4.3" != em["version"] {
			kept = append(kept, e)
		}
	}
	list["versions"] = kept
	writeJSON(t, listFile, list)
	wants := w.consumer("\"corp.example/service\": {v: \"1.4.3\"}", "")
	refusedWith(t, w.sync(wants, false).Refusal, "list_rollback", `1.4.3 was seen before and is absent from the list`)
	// A tombstone standing where it was is the repository's word, and
	// the version it names is refused as withdrawn, not as a rollback.
	write(t, filepath.Join(w.repo, "tombstone", "corp.example", "service", "@v", "1.4.3.aontu"), "{\"reason\": \"malware\"}\n")
	refusedWith(t, w.sync(wants, false).Refusal, "tombstoned", `corp.example/service 1.4.3`)
	for _, sub := range []string{"download", "store"} {
		_ = os.RemoveAll(filepath.Join(w.cache, sub))
	}
	if r := w.sync(w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", ""), false); "ok" != r.Verdict {
		t.Fatalf("stood: %+v", r)
	}

	// A list that offers nothing records nothing, and selects nothing.
	write(t, filepath.Join(w.repo, "pkg", "corp.example", "empty", "@v", "list"), "{\"package\":\"corp.example/empty\",\"versions\":[]}\n")
	refusedWith(t, w.sync(w.consumer("\"corp.example/empty\": {v: \"1.0.0\"}", ""), false).Refusal,
		"fetch_failed", `corp.example/empty 1.0.0 is not in the version list`)
	if _, err := os.Stat(cacheSeenDir(w.cache, "corp.example/empty")); nil == err {
		t.Fatal("seen from nothing")
	}

	// A lock written without its header line is read the same under frozen.
	lockFile := filepath.Join(app, "aontu_meta", "pkg-lock.aontu")
	body := []string{}
	for _, l := range strings.Split(mustRead(t, lockFile), "\n") {
		if !strings.HasPrefix(l, "#") {
			body = append(body, l)
		}
	}
	write(t, lockFile, strings.Join(body, "\n"))
	if r := w.sync(app, true); "ok" != r.Verdict {
		t.Fatalf("frozen: %+v", r)
	}
}

func TestAFrozenRefusalPrunesNothingAndAVendoredTreeIsThePackageAsked(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	w.mustPublish(w.publisher("other", "1.4.2", netService, ""))
	pair := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}, \"corp.example/other\": {v: \"1.4.2\"}", "")
	if r := w.sync(pair, false); "ok" != r.Verdict {
		t.Fatalf("pair: %+v", r)
	}
	otherDir := filepath.Join(pair, "aontu_meta", "vendor", "corp.example", "other")
	pkgFile := filepath.Join(pair, "pkg.aontu")
	write(t, pkgFile, strings.Replace(mustRead(t, pkgFile), ", \"corp.example/other\": {v: \"1.4.2\"}", "", 1))
	if r := w.sync(pair, true); "frozen" != r.Verdict {
		t.Fatalf("frozen: %+v", r)
	}
	if _, err := os.Stat(otherDir); nil != err {
		t.Fatal("pruned under frozen")
	}
	if r := w.sync(pair, false); "ok" != r.Verdict {
		t.Fatalf("thawed: %+v", r)
	}
	if _, err := os.Stat(otherDir); nil == err {
		t.Fatal("not pruned")
	}

	// An alias retargeted at the same version fetches its target
	// rather than reusing the tree it had.
	alias := filepath.Join(w.dir, "alias-app")
	write(t, filepath.Join(alias, "pkg.aontu"),
		"pkg: {path: \"corp.example/app\"}\ndep: {\"alias:svc\": {v: \"1.4.2\", pkg: \"corp.example/service\"}}\n"+w.repoBlock())
	write(t, filepath.Join(alias, "main.aontu"), "svc: @\"alias:svc\"\n")
	if r := w.sync(alias, false); "ok" != r.Verdict {
		t.Fatalf("alias: %+v", r)
	}
	aliasPkg := filepath.Join(alias, "pkg.aontu")
	write(t, aliasPkg, strings.Replace(mustRead(t, aliasPkg), "pkg: \"corp.example/service\"", "pkg: \"corp.example/other\"", 1))
	if r := w.sync(alias, false); "ok" != r.Verdict || "corp.example/other" != readLock(alias)["alias:svc"].Pkg {
		t.Fatalf("retarget: %+v", r)
	}
	tree := mustRead(t, filepath.Join(moduleDir(filepath.Join(alias, "aontu_meta", "vendor"), "alias:svc"), "pkg.aontu"))
	if !strings.Contains(tree, "corp.example/other") {
		t.Fatalf("tree: %q", tree)
	}

	// A pinned manifest that is gone from the tree is a mismatch, not a pass.
	vend := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	if r := w.sync(vend, false); "ok" != r.Verdict {
		t.Fatalf("vend: %+v", r)
	}
	_ = os.Remove(filepath.Join(vend, "aontu_meta", "vendor", "corp.example", "service", "aontu_meta", "manifest.aontu"))
	v := PkgVerify(vend, w.opts)
	if "mismatch" != v.Verdict || 1 != len(v.Mismatched) || "manifest" != v.Mismatched[0].Pin || "" != v.Mismatched[0].Got ||
		readLock(vend)["corp.example/service"].Manifest != v.Mismatched[0].Want {
		t.Fatalf("verify: %+v", v)
	}

	// A lock the sync cannot write is an error, not an ok over no file.
	stuck := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")
	write(t, filepath.Join(stuck, "aontu_meta"), "a file where the directory goes\n")
	if r := w.sync(stuck, false); "error" != r.Verdict || 1 != len(r.Unevaluable) || !strings.HasPrefix(r.Unevaluable[0], "pkg-lock.aontu: ") {
		t.Fatalf("stuck: %+v", r)
	}
}

func TestTheTransportReadsToTheCap(t *testing.T) {
	saved := ArchiveLimitBytes
	defer func() { ArchiveLimitBytes = saved }()
	srv := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(200)
		_, _ = rw.Write(make([]byte, 6000))
	}))
	defer srv.Close()
	ArchiveLimitBytes = 1000
	if r := DefaultHTTP().Get(srv.URL + "/x"); 200 != r.Status || 1001 != len(r.Body) {
		t.Fatalf("capped: %d %d", r.Status, len(r.Body))
	}
	ArchiveLimitBytes = saved
	if r := DefaultHTTP().Get(srv.URL + "/x"); 6000 != len(r.Body) {
		t.Fatalf("whole: %d", len(r.Body))
	}
}

func TestOutdatedWalksTheWholeClosureThatMoves(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("base", "1.0.0", "x: 1\n", ""))
	w.mustPublish(w.publisher("base", "1.1.0", "x: 1\ny?: integer\n", ""))
	w.mustPublish(w.publisher("common", "1.0.0", "x: 1\n", ""))
	w.mustPublish(w.publisherWith("common", "1.2.0", "@\"corp.example/base\"\nx: 1\n", "\"corp.example/base\": {v: \"1.1.0\"}", ""))
	w.mustPublish(w.publisherWith("service", "1.0.0", "@\"corp.example/common\"\nname: string\n", "\"corp.example/common\": {v: \"1.0.0\"}", ""))
	// The later service names common through an alias too, as a
	// consumer may.
	w.mustPublish(w.publisherWith("service", "1.2.0", "@\"corp.example/common\"\nname: string\n",
		"\"corp.example/common\": {v: \"1.2.0\"}, \"alias:c\": {v: \"1.2.0\", pkg: \"corp.example/common\"}", ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.0.0\"}, \"alias:b\": {v: \"1.0.0\", pkg: \"corp.example/base\"}", "")
	if r := w.sync(app, false); "ok" != r.Verdict {
		t.Fatalf("sync: %+v", r)
	}
	for _, name := range []string{"base", "common", "service"} {
		w.backdate(name)
	}
	moves := func(r PkgOutdatedReport, key string) string {
		for _, e := range r.Locked {
			if key == e.Key {
				return strings.Join(e.Moves, "|")
			}
		}
		return "?"
	}
	r := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "outdated" != r.Verdict || "alias:c unlocked -> 1.2.0|corp.example/base unlocked -> 1.1.0|corp.example/common 1.0.0 -> 1.2.0" != moves(r, "corp.example/service") ||
		"corp.example/base unlocked -> 1.1.0" != moves(r, "corp.example/common") || "" != moves(r, "alias:b") {
		t.Fatalf("moves: %+v", r)
	}
	// A declaration the walk cannot follow is reported as a move and
	// not walked: an alias without its package, a key that names none.
	w.resign("service", "1.2.0", func(m map[string]any) {
		deps := m["deps"].(map[string]any)
		deps["alias:zed"] = map[string]any{"v": "1.0.0"}
		deps["corp.example/data.json"] = map[string]any{"v": "1.0.0"}
	})
	odd := PkgOutdated(app, w.opts, w.http, SyncArgs{})
	if "alias:c unlocked -> 1.2.0|alias:zed unlocked -> 1.0.0|corp.example/base unlocked -> 1.1.0|corp.example/common 1.0.0 -> 1.2.0|corp.example/data.json unlocked -> 1.0.0" != moves(odd, "corp.example/service") {
		t.Fatalf("odd: %+v", odd)
	}
}

func TestTheMeaningIsCheckedAgainstThePinAndACycleInWhyEnds(t *testing.T) {
	w := newNetWorld(t)
	w.mustPublish(w.publisher("service", "1.4.2", netService, ""))
	app := w.consumer("\"corp.example/service\": {v: \"1.4.2\"}", "")

	// The manifest pins a canon the module does not mean.
	w.resign("service", "1.4.2", func(m map[string]any) {
		m["modules"].([]any)[0].(map[string]any)["canon"] = "aon1-" + strings.Repeat("A", 43)
	})
	w.fresh()
	refusedWith(t, w.sync(app, false).Refusal, "module_integrity", `and the manifest pins aon1-AAAA`)

	// The module does not evaluate at all.
	entries := []ZipEntry{
		{Path: "main.aontu", Data: []byte("a: 1\na: 2\n")},
		{Path: "pkg.aontu", Data: []byte("pkg: {path: \"corp.example/service\", version: \"1.4.2\", main: \"main.aontu\"}\n")},
	}
	zip := ZipCanonical(entries)
	if err := os.WriteFile(filepath.Join(w.at("service"), "1.4.2.zip"), zip, 0o600); nil != err {
		t.Fatal(err)
	}
	w.resign("service", "1.4.2", func(m map[string]any) {
		a := m["archive"].(map[string]any)
		a["digest"] = Sha256Hex(zip)
		a["size"] = float64(len(zip))
		files := []any{}
		for _, e := range entries {
			files = append(files, map[string]any{"path": e.Path, "digest": Sha256Hex(e.Data), "size": float64(len(e.Data))})
		}
		a["files"] = files
	})
	w.fresh()
	refusedWith(t, w.sync(app, false).Refusal, "module_integrity", `means nothing \(it does not evaluate\)`)

	// Hand-vendored packages that depend on each other: why walks the
	// cycle once.
	cyc := filepath.Join(w.dir, "cyc")
	entry := func(canon string) string {
		return "{\"archive\":\"sha256:" + strings.Repeat("0", 64) + "\",\"canon\":\"" + canon + "\",\"v\":\"1.0.0\"}"
	}
	write(t, filepath.Join(cyc, "pkg.aontu"), "pkg: {path: \"corp.example/app\"}\ndep: {\"corp.example/a\": {v: \"1.0.0\"}}\n")
	write(t, filepath.Join(cyc, "main.aontu"), "x: 1\n")
	vendor := filepath.Join(cyc, "aontu_meta", "vendor", "corp.example")
	write(t, filepath.Join(vendor, "a", "pkg.aontu"), "pkg: {path: \"corp.example/a\", version: \"1.0.0\", main: \"main.aontu\"}\ndep: {\"corp.example/b\": {v: \"1.0.0\"}}\n")
	write(t, filepath.Join(vendor, "a", "main.aontu"), "a: 1\n")
	write(t, filepath.Join(vendor, "b", "pkg.aontu"), "pkg: {path: \"corp.example/b\", version: \"1.0.0\", main: \"main.aontu\"}\ndep: {\"corp.example/a\": {v: \"1.0.0\"}}\n")
	write(t, filepath.Join(vendor, "b", "main.aontu"), "b: 1\n")
	write(t, filepath.Join(cyc, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/a\":"+entry("aon1-"+strings.Repeat("A", 43))+",\"corp.example/b\":"+entry("aon1-"+strings.Repeat("B", 43))+"}}\n")
	why := PkgWhy(cyc, w.opts, "corp.example/b")
	if "ok" != why.Verdict || 1 != len(why.Paths) || "corp.example/app corp.example/a corp.example/b" != strings.Join(why.Paths[0], " ") {
		t.Fatalf("why: %+v", why)
	}

	// The layout writer refuses coordinates that are not a package path
	// at a version before they become directories.
	for _, m := range []map[string]any{
		{"package": "../../escape", "version": "1.0.0"},
		{"package": "corp.example/x", "version": "../x"},
	} {
		ref := catchRefusal(func() {
			WriteLayout(w.repo, LayoutWrite{Manifest: m, ManifestBytes: []byte("{}"), ProofBytes: []byte("{}"), Archive: []byte("x")}, w.opts, time.Now())
		})
		refusedWith(t, ref.report(), "manifest_invalid", `not a package path at a version`)
	}
}

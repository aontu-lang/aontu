/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	aontu "github.com/aontu-lang/aontu/go"
)

// netRun drives a verb with the repository directory as its transport
// and the cache under a private XDG_CACHE_HOME.
type netCLI struct {
	t     *testing.T
	dir   string
	key   string
	keyID string
	repo  string
	apps  int
}

func newNetCLI(t *testing.T) *netCLI {
	t.Helper()
	dir := t.TempDir()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	der, _ := x509.MarshalPKCS8PrivateKey(priv)
	pemText := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	key := filepath.Join(dir, "key.pem")
	writeAt(t, key, pemText)
	id, err := aontu.KeyIDFromPEM(pemText)
	if nil != err {
		t.Fatal(err)
	}
	repo := filepath.Join(dir, "repo")
	_ = os.MkdirAll(repo, 0o755)
	t.Setenv("XDG_CACHE_HOME", filepath.Join(dir, "xdg"))
	cliServers = func() servers {
		return servers{
			http:  func() aontu.PkgHTTP { return aontu.DirHTTP(repo) },
			serve: func(*aontu.Served) {},
		}
	}
	t.Cleanup(func() { cliServers = defaultServers })
	return &netCLI{t: t, dir: dir, key: key, keyID: id, repo: repo}
}

func writeNet(t *testing.T, path, src string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); nil != err {
		t.Fatal(err)
	}
	writeAt(t, path, src)
}

func (c *netCLI) run(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func (c *netCLI) publisher(name, version, src, extra string) string {
	dir := filepath.Join(c.dir, name+"-"+version)
	writeNet(c.t, filepath.Join(dir, "pkg.aontu"),
		"pkg: {path: \"corp.example/"+name+"\", version: \""+version+"\", main: \"main.aontu\"}\n"+extra)
	writeNet(c.t, filepath.Join(dir, "main.aontu"), src)
	return dir
}

func (c *netCLI) publish(tree string) (string, string, int) {
	return c.run("publish", "--yes", "--key", c.key, "--to", c.repo, tree)
}

func (c *netCLI) consumer(deps string) string {
	c.apps++
	app := filepath.Join(c.dir, "app"+string(rune('0'+c.apps)))
	writeNet(c.t, filepath.Join(app, "pkg.aontu"),
		"pkg: {path: \"corp.example/app\"}\ndep: {"+deps+"}\n"+
			"repo: {base: [\"http://127.0.0.1\"], trust: {\"corp.example/*\": {signer: \""+c.keyID+"\", inclusion: none}}}\n")
	writeNet(c.t, filepath.Join(app, "main.aontu"), "svc: @\"corp.example/service\"\nsvc: name: \"auth\"\n")
	return app
}

func (c *netCLI) backdate(name string) {
	file := filepath.Join(c.repo, "pkg", "corp.example", name, "@v", "list")
	data, _ := os.ReadFile(file)
	var list map[string]any
	_ = json.Unmarshal(data, &list)
	for _, e := range list["versions"].([]any) {
		e.(map[string]any)["seen"] = "2020-01-01T00:00:00Z"
	}
	out, _ := json.Marshal(list)
	writeAt(c.t, file, string(out)+"\n")
}

func wantMatch(t *testing.T, text, pattern string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(text) {
		t.Fatalf("no /%s/ in:\n%s", pattern, text)
	}
}

const cliService = "name: string\nport: *8080 | integer\n"

func TestPackageVerbsRoundTrip(t *testing.T) {
	c := newNetCLI(t)
	tree := c.publisher("service", "1.4.2", cliService, "")
	out, errw, code := c.run("publish", "--key", c.key, "--to", c.repo, tree)
	if 0 != code {
		t.Fatal(errw)
	}
	wantMatch(t, out, `^verdict: dry-run\n`)
	wantMatch(t, out, `\nsigner: ed25519:`)
	wantMatch(t, out, `dry run: nothing sent \(add --yes\)\n$`)
	out, errw, code = c.publish(tree)
	if 0 != code {
		t.Fatal(errw)
	}
	wantMatch(t, out, `^verdict: sent\n`)
	wantMatch(t, out, `\nto: `)
	wantMatch(t, out, `\nsent\n$`)

	app := c.consumer("\"corp.example/service\": {v: \"1.4.2\"}")
	out, errw, code = c.run("sync", app)
	if 0 != code {
		t.Fatal(out + errw)
	}
	wantMatch(t, out, `^verdict: ok\nfetched: corp.example/service 1.4.2\ncorp.example/service 1.4.2 aon1-`)
	out, _, code = c.run("sync", "--format", "json", app)
	var report map[string]any
	if err := json.Unmarshal([]byte(out), &report); nil != err || 0 != code {
		t.Fatal(out)
	}
	if "sync" != report["aontu"].(map[string]any)["verb"] || "ok" != report["verdict"] || 0 != len(report["fetched"].([]any)) {
		t.Fatalf("json: %s", out)
	}
	if _, _, code = c.run("sync", "--frozen", app); 0 != code {
		t.Fatal("frozen")
	}

	out, _, code = c.run("why", "corp.example/service", app)
	if 0 != code || "verdict: ok\ncorp.example/app -> corp.example/service\n" != out {
		t.Fatalf("why: %q", out)
	}
	out, _, code = c.run("why", "--format", "json", "corp.example/service", app)
	if 0 != code || !strings.Contains(out, `"paths"`) {
		t.Fatalf("why json: %s", out)
	}
	out, _, code = c.run("why", "corp.example/nowhere", app)
	if 1 != code || "verdict: missing\ncorp.example/nowhere: not in the closure\n" != out {
		t.Fatalf("why missing: %q", out)
	}

	c.publish(c.publisher("service", "1.4.3", cliService, ""))
	out, _, code = c.run("pkg", "outdated", app)
	if 0 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: current\ncorp.example/service 1.4.2: current\ncooldown_pending: `)
	out, _, code = c.run("get", "corp.example/service@1.4.3", app)
	if 0 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: ok\nchange: raised corp.example/service 1.4.2 -> 1.4.3\nfetched: `)
	out, errw, code = c.run("add", "corp.example/service", app)
	if 2 != code {
		t.Fatal(out)
	}
	wantMatch(t, errw, `already a dependency at 1.4.3 \(aontu get raises it\)`)
	out, _, code = c.run("get", "corp.example/service", app)
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: refused\nchange: none\nrefused: cooldown_pending: `)
	out, _, code = c.run("remove", "corp.example/service", app)
	if 0 != code || !strings.HasPrefix(out, "verdict: ok\nchange: removed corp.example/service\n") {
		t.Fatalf("remove: %s", out)
	}
	c.backdate("service")
	out, _, code = c.run("add", "corp.example/service", app)
	if 0 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `change: added corp.example/service 1.4.3`)
	c.publish(c.publisher("service", "1.4.4", cliService, ""))
	out, _, code = c.run("get", "corp.example/service", app)
	if 0 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `change: corp.example/service is at 1.4.3 already\n.*\ncooldown_pending: corp.example/service 1.4.4 is inside the cooldown until .*; 1.4.3 was selected\n$`)

	// The frozen report; then the mismatch a kept manifest reports once
	// the tree it describes has been edited.
	vendored := filepath.Join(app, "aontu_meta", "vendor", "corp.example", "service")
	writeAt(t, filepath.Join(vendored, "main.aontu"), "name: string\n")
	out, _, code = c.run("sync", "--frozen", app)
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: frozen\n.*\nlockfile would change: corp.example/service: repinned\n$`)
	out, _, code = c.run("sync", app)
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: mismatch\n.*\ncorp.example/service: pinned manifest sha256:.* but the store holds main.aontu sha256:.*\n$`)

	// A vendored tree that does not evaluate, and one that carries what
	// the allowlist refuses.
	writeAt(t, filepath.Join(vendored, "main.aontu"), "a: 1\na: 2\n")
	out, _, code = c.run("sync", app)
	if 4 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: error\ncorp.example/service: does not evaluate on its own; nothing to pin\n$`)
	writeAt(t, filepath.Join(vendored, "main.aontu"), cliService)
	writeAt(t, filepath.Join(vendored, "run.sh"), "#!/bin/sh\n")
	out, _, code = c.run("sync", app)
	if 4 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `corp.example/service: run.sh: not admitted in a package\n`)
}

func TestPackageVerbsRenderEveryLine(t *testing.T) {
	c := newNetCLI(t)
	c.publish(c.publisher("common", "1.0.0", "x: 1\n", ""))
	c.publish(c.publisher("common", "1.1.0", "x: 1\ny?: integer\n", ""))
	dep := c.publisher("service", "1.0.0", "@\"corp.example/common\"\nname: string\n",
		"dep: {\"corp.example/common\": {v: \"1.0.0\"}}\nrepo: {base: [\"http://127.0.0.1\"], trust: {\"corp.example/*\": {signer: \""+c.keyID+"\", inclusion: none}}}\n")
	if _, errw, code := c.run("sync", dep); 0 != code {
		t.Fatal(errw)
	}
	if out, _, code := c.publish(dep); 0 != code {
		t.Fatal(out)
	}
	next := c.publisher("service", "1.1.0", "@\"corp.example/common\"\nname: string\n",
		"dep: {\"corp.example/common\": {v: \"1.1.0\"}}\nretract: [\"1.0.0\"]\nrepo: {base: [\"http://127.0.0.1\"], trust: {\"corp.example/*\": {signer: \""+c.keyID+"\", inclusion: none}}}\n")
	if _, errw, code := c.run("sync", next); 0 != code {
		t.Fatal(errw)
	}
	out, _, code := c.publish(next)
	if 0 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `\nagainst: corp.example/service 1.0.0\n`)
	wantMatch(t, out, `\ndep: corp.example/common 1.1.0\nretract: 1.0.0\n`)

	app := c.consumer("\"corp.example/service\": {v: \"1.0.0\"}")
	if out, _, code := c.run("sync", app); 0 != code {
		t.Fatal(out)
	}
	c.backdate("service")
	c.backdate("common")
	out, _, code = c.run("pkg", "outdated", app)
	if 1 != code {
		t.Fatal(out)
	}
	if "verdict: outdated\ncorp.example/common 1.0.0 -> 1.1.0\ncorp.example/service 1.0.0 -> 1.1.0\n  corp.example/common 1.0.0 -> 1.1.0\ncorp.example/service 1.0.0: retracted by 1.1.0\n" != out {
		t.Fatalf("outdated: %q", out)
	}
	out, _, _ = c.run("pkg", "outdated", "--format", "json", app)
	if !strings.Contains(out, `"verb": "pkg outdated"`) {
		t.Fatalf("outdated json: %s", out)
	}
	out, _, code = c.run("why", "corp.example/common", app)
	if 0 != code || "verdict: ok\ncorp.example/app -> corp.example/service -> corp.example/common\n" != out {
		t.Fatalf("why: %q", out)
	}

	// Publish refusals, gates and the write path.
	out, _, code = c.publish(c.publisher("service", "1.2.0", "@\"corp.example/common\"\nname: string\nowner: string\n",
		"dep: {\"corp.example/common\": {v: \"1.1.0\"}}\n"))
	if 4 != code {
		t.Fatalf("an unsynced publisher: %d %s", code, out)
	}
	wantMatch(t, out, `^verdict: error\n`)
	out, _, code = c.publish(c.publisher("common", "1.1.0", "x: 1\n", ""))
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `refused: version_exists: corp.example/common 1.1.0 was published before`)
	out, _, code = c.publish(c.publisher("common", "1.2.0", "x: 1\nz: string\n", ""))
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `^verdict: breaking\n`)
	wantMatch(t, out, `\$.z: the general value requires this key`)
	out, _, code = c.run("publish", "--yes", "--key", c.key, c.publisher("common", "1.2.0", "x: 1\n", ""))
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `\nwrite: https://publish.aontu.dev/v1/publish\nrefused: not_public: `)
	out, _, code = c.run("publish", "--yes", "--key", c.key, "--write", "http://127.0.0.1:1",
		c.publisher("common", "1.3.0", "x: 1\n", ""))
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `refused: fetch_failed: the write path answered 405`)
}

func TestPackageVerbsTakeTheirArguments(t *testing.T) {
	c := newNetCLI(t)
	app := c.consumer("")
	for _, verb := range []string{"sync", "add", "get", "remove", "why", "publish"} {
		if _, _, code := c.run(verb, "--help"); 0 != code {
			t.Fatalf("%s --help", verb)
		}
		if _, _, code := c.run(verb, "--bogus"); 2 != code {
			t.Fatalf("%s --bogus", verb)
		}
		if _, _, code := c.run(verb, "--trust", "bogus"); 2 != code {
			t.Fatalf("%s --trust bogus", verb)
		}
	}
	_, errw, code := c.run("sync", app, "extra")
	if 2 != code || !strings.Contains(errw, "sync takes a directory\naontu sync") {
		t.Fatalf("extra: %s", errw)
	}
	_, errw, code = c.run("add")
	if 2 != code || !strings.Contains(errw, "add needs a package\naontu add") {
		t.Fatalf("none: %s", errw)
	}
	_, errw, code = c.run("get", "nodomain", app)
	if 2 != code || !strings.Contains(errw, "not a package path: nodomain") {
		t.Fatalf("bad: %s", errw)
	}
	_, errw, code = c.run("remove", "corp.example/none", app)
	if 2 != code || !strings.Contains(errw, "not a dependency of this project") {
		t.Fatalf("remove none: %s", errw)
	}
	_, errw, code = c.run("sync", "--trust", "root", app)
	if 2 != code || !strings.Contains(errw, "reads and writes the user cache") {
		t.Fatalf("confined: %s", errw)
	}
	if _, _, code = c.run("pkg", "outdated", "--trust", "root", app); 2 != code {
		t.Fatal("confined outdated")
	}
	writeNet(t, filepath.Join(app, "aontu_meta", "pkg-lock.aontu"),
		"{\"lock\":{\"corp.example/none\":{\"archive\":\"\",\"canon\":\"\",\"v\":\"1.0.0\"}}}\n")
	out, _, code := c.run("pkg", "outdated", app)
	if 1 != code {
		t.Fatal(out)
	}
	wantMatch(t, out, `refused: fetch_failed: no version list for corp.example/none`)
	out, _, _ = c.run("pkg", "outdated", "--base", "ftp://x", app)
	wantMatch(t, out, `refused: base_not_https`)
	out, _, _ = c.run("sync", "--base", "ftp://x", app)
	wantMatch(t, out, `^verdict: refused\nrefused: base_not_https: repository base is not https: ftp://x\n$`)

	_, errw, code = c.run("publish", "--yes", app)
	if 2 != code || !strings.Contains(errw, "publish --yes needs --key") {
		t.Fatalf("no key: %s", errw)
	}
	_, errw, code = c.run("publish", "--key", filepath.Join(c.dir, "nokey"), app)
	if 2 != code || !strings.Contains(errw, "cannot read ") {
		t.Fatalf("no file: %s", errw)
	}
	_, errw, code = c.run("publish", "--yes", "--key", c.key, "--to", c.repo, "--format", "text", filepath.Join(c.dir, "empty"))
	if 4 != code {
		t.Fatalf("empty: %d %s", code, errw)
	}

	// A key minted once, then a publish signed with it.
	keyFile := filepath.Join(c.dir, "new.pem")
	out, errw, code = c.run("pkg", "keygen", keyFile)
	if 0 != code || !regexp.MustCompile(`^signer: ed25519:[A-Za-z0-9_-]{43}\n$`).MatchString(out) {
		t.Fatalf("keygen: %d %s %s", code, out, errw)
	}
	if _, errw, code = c.run("pkg", "keygen", keyFile); 2 != code || !strings.Contains(errw, "written once") {
		t.Fatalf("keygen twice: %s", errw)
	}
	if _, errw, code = c.run("pkg", "keygen"); 2 != code || !strings.Contains(errw, "needs the file to write") {
		t.Fatalf("keygen no file: %s", errw)
	}
	if out, _, code = c.run("publish", "--yes", "--key", keyFile, "--to", c.repo, c.publisher("minted", "1.0.0", "m: 1\n", "")); 0 != code {
		t.Fatal(out)
	}

	// `pkg serve`, told when to stop; and an address nothing listens on.
	out, errw, code = c.run("pkg", "serve", "--listen", "127.0.0.1:0", "--upstream", "http://127.0.0.1:1", c.repo)
	if 0 != code {
		t.Fatal(errw)
	}
	wantMatch(t, out, `^serving .* at http://127.0.0.1:\d+\nupstream: http://127.0.0.1:1\n$`)
	out, errw, code = c.run("pkg", "serve", c.repo)
	if 0 != code {
		t.Fatal(errw)
	}
	wantMatch(t, out, `^serving .* at http://127.0.0.1:8017\n$`)
	_, errw, code = c.run("pkg", "serve", "--listen", "256.0.0.1:0", c.repo)
	if 2 != code || !strings.Contains(errw, "cannot listen on 256.0.0.1:0") {
		t.Fatalf("bad listen: %s", errw)
	}
}

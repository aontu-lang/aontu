.PHONY: all build test clean build-ts build-go test-ts test-go clean-ts clean-go \
        install install-ts install-go \
        publish publish-go check-go-major tags-go reset cov cov-ts cov-go sig \
        prose

all: build test

build: build-ts build-go

test: test-ts test-go

clean: clean-ts clean-go

# INSTALL FROM THE CLONE, EACH BUILD BY ITS OWN TOOLCHAIN.
#
#   make install       # both
#   make install-ts    # npm link: the global `aontu` IS this checkout
#   make install-go    # go install: a build of ./cmd/aontu and ./cmd/aontu-lsp
#
# The two builds ship the same commands under the same names, and each
# toolchain puts them where it always does -- npm's global bin
# (`npm prefix -g`/bin, so this needs the write access `npm install -g`
# needs) and Go's (`go env GOBIN`, else GOPATH/bin). With both installed,
# PATH order decides which `aontu` answers and `aontu --version` says
# which did: the npm series or the Go series. The TypeScript install is
# a LINK, so `make build-ts` updates it in place; the Go install is a
# build, so rerun `make install-go` after a change. Undo with
# `npm uninstall -g aontu` and by deleting the two Go binaries.
install: install-ts install-go

install-ts: build-ts
	cd ts && npm link --no-audit --no-fund
	@echo "install-ts: aontu, aontu-lsp and aontu-mcp in $$(npm prefix -g)/bin link to $(CURDIR)/ts"

install-go:
	cd go && go install ./cmd/aontu ./cmd/aontu-lsp
	@bin=$$(cd go && go env GOBIN); [ -n "$$bin" ] || bin=$$(cd go && go env GOPATH)/bin; \
	  echo "install-go: aontu and aontu-lsp built into $$bin"

# The prose gate (see docs/STYLE-GUIDE.md). Vale over the reader-facing
# pages, at the levels set in .vale.ini, on the same file list
# ts/test/docs.test.ts reads. Requires `vale` on PATH and one
# `vale sync` to fetch the pinned Google package; CI does both in
# .github/workflows/docs.yml. Warnings are advisory, errors fail.
prose:
	vale --minAlertLevel=error $$(node ts/scripts/gated-docs.cjs)

# Test coverage (see docs/test-coverage.md)
cov: cov-ts cov-go

cov-ts:
	cd ts && npm run test-cov
	cd ts && npm run test-cov-check

# Unit-test statement coverage, plus GOCOVERDIR integration runs of the
# two command binaries so their literal main() functions are counted —
# go test cannot execute a main() that os.Exits. The two profiles are
# unioned by scripts/covmerge.
cov-go:
	cd go && go test -cover -coverprofile=coverage-unit.out $$(go list ./... | grep -v /scripts/)
	cd go && rm -rf covdata && mkdir -p covdata bin \
		&& go build -cover -o bin/aontu-cov ./cmd/aontu \
		&& go build -cover -o bin/aontu-lsp-cov ./cmd/aontu-lsp
	cd go && GOCOVERDIR=covdata ./bin/aontu-cov --version >/dev/null
	cd go && echo 'a:1' | GOCOVERDIR=covdata ./bin/aontu-cov >/dev/null
	cd go && GOCOVERDIR=covdata ./bin/aontu-lsp-cov </dev/null >/dev/null || true
	cd go && go tool covdata textfmt -i=covdata -o coverage-main.out
	cd go && go run ./scripts/covmerge coverage-unit.out coverage-main.out > coverage.out
	cd go && go tool cover -func=coverage.out | tail -1
	@cd go && n=$$(awk '$$NF==0' coverage.out | wc -l | tr -d ' '); \
		if [ "$$n" != "0" ]; then \
			echo "covcheck: $$n uncovered block(s) — ADR-002 requires 100%:"; \
			awk '$$NF==0 {print "  " $$1}' coverage.out; \
			echo; \
			echo "Close each with a shared spec row (preferred), a Go test, or —"; \
			echo "only when genuinely unreachable — a //coverage:ignore marker"; \
			echo "carrying its justification. See ADR.md."; \
			exit 1; \
		fi; \
		echo "covcheck: 100% (ADR-002)"
	cd go && rm -rf covdata bin coverage-unit.out coverage-main.out

# TypeScript (canonical implementation, package lives in ts/)
build-ts: sig
	cd ts && npm run build
	node ts/scripts/figures.cjs

# Regenerate the build-time-inlined copies of the signature
# declaration (ts/src/sigdecl.ts, go/sigdecl.txt) from the shared
# source test/spec/signature.tsv (docs/design/SIGNATURES.0.md).
sig:
	node ts/scripts/sigdecl.cjs

test-ts:
	cd ts && npm test

clean-ts:
	rm -rf ts/dist ts/dist-test

# Go
build-go:
	cd go && go build ./...

test-go:
	cd go && go test -v ./...

clean-go:
	cd go && go clean

# ONE COMMAND, BOTH ARTIFACTS -- WITH THEIR OWN VERSION SERIES.
#
#   make publish V=0.53.0 GOV=0.2.0   # release both
#   make publish V=0.53.0             # npm only
#   make publish GOV=0.2.0            # Go module only
#
# npm and the Go module are versioned independently, deliberately: sharing a
# major would put the Go module at v2+, and Go requires the major in the
# module path from v2 on (see check-go-major), which changes every consumer's
# import path. Two numbers is the cheaper trade.
#
# Bumps whichever versions are given, runs the full suite, commits, pushes
# main, and dispatches the publish workflow with matching inputs.
#
# Every guard runs BEFORE anything is written, because half of this cannot be
# taken back: npm never allows republishing a version, and proxy.golang.org
# caches a Go module version immutably.
#
# See docs/release-and-tag.md.
publish:
	@test -n "$(V)$(GOV)" || \
	  (echo "Usage: make publish [V=x.y.z] [GOV=x.y.z]   (npm version, Go module version)" && exit 1)
	@if [ -n "$(V)" ]; then \
	  echo "$(V)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$$' || \
	    { echo "publish: V=$(V) is not a semver x.y.z (build metadata is not accepted)"; exit 1; }; \
	  case "$(V)" in *+*) echo "publish: V=$(V) carries +build metadata, which npm discards"; exit 1 ;; esac; \
	fi
	@if [ -n "$(GOV)" ]; then \
	  echo "$(GOV)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$$' || \
	    { echo "publish: GOV=$(GOV) is not a semver x.y.z (build metadata is not accepted)"; exit 1; }; \
	  case "$(GOV)" in *+*) echo "publish: GOV=$(GOV) carries +build metadata"; exit 1 ;; esac; \
	  $(MAKE) --no-print-directory check-go-major V=$(GOV); \
	fi
	@command -v gh >/dev/null 2>&1 || \
	  (echo "publish: needs the gh CLI to dispatch the workflow" && exit 1)
	@test "$$(git rev-parse --abbrev-ref HEAD)" = "main" || \
	  (echo "publish: must be on main (currently $$(git rev-parse --abbrev-ref HEAD))" && exit 1)
	@test -z "$$(git status --porcelain)" || \
	  (echo "publish: working tree is not clean" && exit 1)
	@git fetch origin main --quiet && test -z "$$(git rev-list HEAD..origin/main)" || \
	  (echo "publish: local main is behind origin/main" && exit 1)
	@# ASK THE REMOTE, NOT THE CLONE. `git fetch origin main` does not fetch
	@# tags, so a local rev-parse passes in a fresh or stale clone while the
	@# tag already exists on origin -- and by the time the workflow refuses,
	@# this target has already bumped and pushed main.
	@if [ -n "$(V)" ] && git ls-remote --exit-code --tags origin "refs/tags/v$(V)" >/dev/null 2>&1; then \
	  echo "publish: tag v$(V) already exists on origin"; exit 1; fi
	@if [ -n "$(GOV)" ] && git ls-remote --exit-code --tags origin "refs/tags/go/v$(GOV)" >/dev/null 2>&1; then \
	  echo "publish: tag go/v$(GOV) already exists on origin"; exit 1; fi
	@if [ -n "$(V)" ] && git rev-parse -q --verify "refs/tags/v$(V)" >/dev/null 2>&1; then \
	  echo "publish: tag v$(V) already exists locally"; exit 1; fi
	@if [ -n "$(GOV)" ] && git rev-parse -q --verify "refs/tags/go/v$(GOV)" >/dev/null 2>&1; then \
	  echo "publish: tag go/v$(GOV) already exists locally"; exit 1; fi
	@if [ -n "$(V)" ]; then cd ts && npm version --no-git-tag-version $(V); fi
	@if [ -n "$(GOV)" ]; then \
	  perl -pi -e 's/^const VERSION = ".*"/const VERSION = "$(GOV)"/' go/aontu.go; \
	  grep -q '^const VERSION = "$(GOV)"' go/aontu.go || \
	    { echo "publish: failed to set VERSION in go/aontu.go"; exit 1; }; \
	fi
	$(MAKE) all
	@# package-lock.json is gitignored in this repo, so only package.json moves.
	@# THREE PATHS, not one: `npm version` rewrites ts/src/aontu.ts's VERSION
	@# constant too (the postversion hook), and `make all` above rebuilds
	@# ts/dist from it -- both of which are committed. Staging package.json
	@# alone left the release commit claiming a version its own source and
	@# build did not, which ts/test/version.test.ts catches in the publish
	@# job, AFTER the tag push and before `npm publish`. It fails closed, and
	@# it fails late; staging all three is what makes it not happen.
	@if [ -n "$(V)" ];   then git add ts/package.json ts/src/aontu.ts ts/dist; fi
	@if [ -n "$(GOV)" ]; then git add go/aontu.go; fi
	git commit -m "release:$(if $(V), npm $(V))$(if $(GOV), go $(GOV))"
	git push origin main
	@# `--ref main` is a MOVING target: another commit can land between the
	@# push above and the run resolving, and be released under the version
	@# just bumped. Pin the dispatch to the SHA we pushed.
	gh workflow run publish.yml --ref main \
	  -f npm=$(if $(V),true,false) -f go=$(if $(GOV),true,false) \
	  -f expect_sha=$$(git rev-parse HEAD)
	@echo
	@echo "dispatched. watch with:  gh run list --workflow=publish.yml --limit 1"

# Go's semantic import versioning: from v2 on, the MAJOR must appear in the
# module path. Tagging go/v2.0.0 while go.mod still says
# `module github.com/aontu-lang/aontu/go` produces a version the toolchain
# will not resolve -- and the tag cannot be taken back. Refuse instead.
check-go-major:
	@test -n "$(V)" || (echo "Usage: make check-go-major V=x.y.z" && exit 1)
	@major=$$(echo "$(V)" | cut -d. -f1); \
	 path=$$(sed -n 's/^module //p' go/go.mod); \
	 if [ "$$major" -ge 2 ]; then \
	   case "$$path" in \
	     */v$$major) : ;; \
	     *) echo "publish: go.mod says '$$path' but v$(V) is major $$major."; \
	        echo "         Go requires the major in the module path from v2 on:"; \
	        echo "           module $$path/v$$major"; \
	        echo "         Every consumer's import path changes with it."; \
	        exit 1 ;; \
	   esac; \
	 else \
	   case "$$path" in \
	     */v[0-9]*) echo "publish: go.mod path '$$path' carries a major suffix but V=$(V) is major $$major." && exit 1 ;; \
	     *) : ;; \
	   esac; \
	 fi

# Publish Go module directly: make publish-go V=0.1.2
# Prefer `make publish GOV=...`, which runs the guards and the workflow.
publish-go: test-go
	@# BRANCH AND CLEANLINESS GUARDS, checked before anything is written.
	@#
	@# This target commits to the CURRENT branch, tags THAT commit, and then
	@# pushes `main` plus the tag. Run from a feature branch it therefore tags
	@# unreviewed code and publishes it as an immutable Go module version,
	@# while pushing a `main` that does not contain the commit at all -- a
	@# module release nobody reviewed, which proxy.golang.org caches forever.
	@test "$$(git rev-parse --abbrev-ref HEAD)" = "main" || \
	  (echo "publish-go: must be on main (currently $$(git rev-parse --abbrev-ref HEAD))" && exit 1)
	@test -z "$$(git status --porcelain)" || \
	  (echo "publish-go: working tree is not clean" && exit 1)
	@git fetch origin main --quiet && test -z "$$(git rev-list HEAD..origin/main)" || \
	  (echo "publish-go: local main is behind origin/main" && exit 1)
	@test -n "$(V)" || (echo "Usage: make publish-go V=x.y.z" && exit 1)
	# Portable in-place edit: `sed -i ''` is BSD/macOS only and fails on
	# GNU sed (it reads '' as the script), which left VERSION stale.
	perl -pi -e 's/^const VERSION = ".*"/const VERSION = "$(V)"/' go/aontu.go
	@grep -q '^const VERSION = "$(V)"' go/aontu.go || \
	  (echo "publish-go: failed to set VERSION in go/aontu.go" && exit 1)
	git add go/aontu.go
	git commit -m "go: v$(V)"
	git tag go/v$(V)
	git push origin main go/v$(V)
	if command -v gh >/dev/null 2>&1; then gh release create go/v$(V) --title "go/v$(V)" --notes "Go module release v$(V)"; fi

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

reset:
	cd ts && npm run reset
	cd go && go clean -cache
	cd go && go build ./...
	cd go && go test -v ./...

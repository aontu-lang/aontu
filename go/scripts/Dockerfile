# syntax=docker/dockerfile:1
# THE IMAGE (docs/release-and-tag.md, "The install channels"): the
# release binaries on scratch, one image for amd64 and arm64, on GHCR.
# The build context is a release's dist directory with the Linux
# archives unpacked (the publish workflow's image job does that), and
# VERSION names them. No shell and no package manager: the CLI is the
# entrypoint, and /work is where a bind mount goes.
#
#   docker run --rm -v "$PWD:/work" ghcr.io/aontu-lang/aontu vet schema.aon data.aon
FROM scratch
ARG VERSION
ARG TARGETARCH
LABEL org.opencontainers.image.title="aontu" \
      org.opencontainers.image.description="Aontu, the unifying configuration language: the aontu CLI and the aontu-lsp language server" \
      org.opencontainers.image.source="https://github.com/aontu-lang/aontu" \
      org.opencontainers.image.url="https://aontu.dev" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
COPY aontu_${VERSION}_linux_${TARGETARCH}/aontu /usr/bin/aontu
COPY aontu_${VERSION}_linux_${TARGETARCH}/aontu-lsp /usr/bin/aontu-lsp
COPY aontu_${VERSION}_linux_${TARGETARCH}/LICENSE /LICENSE
WORKDIR /work
ENTRYPOINT ["/usr/bin/aontu"]

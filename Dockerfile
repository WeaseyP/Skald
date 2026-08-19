# ==============================================================================
# Skald web build — one container that serves the browser UI and runs the
# codegen + Odin -> wasm preview pipeline (the job the Electron main process
# does on the desktop). Built for free container hosts (Render, Koyeb, ...).
#
#   docker build -t skald-web .
#   docker run --rm -p 8787:8787 skald-web
#
# The host's PORT env var is honored automatically (web-server/server.mjs
# prefers PORT over SKALD_WEB_PORT).
# ==============================================================================

# ---------- Stage 1: build the web UI (dist-web/) ----------------------------
FROM node:22-bookworm-slim AS ui
WORKDIR /build/skald-ui
# The dependency tree includes Electron, but the web bundle doesn't run it —
# skip its ~100MB binary download, and skip install scripts entirely (esbuild
# and rollup ship their Linux binaries as optional deps, no scripts needed).
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY skald-ui/package.json skald-ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY skald-ui/ ./
RUN npx vite build --config vite.web.config.ts

# ---------- Stage 2: Odin toolchain (same pinned version as .tools/) ---------
FROM ubuntu:24.04 AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl unzip clang lld llvm \
    && rm -rf /var/lib/apt/lists/*
ARG ODIN_VERSION=dev-2025-02
RUN curl -fsSL -o /tmp/odin.zip \
        "https://github.com/odin-lang/Odin/releases/download/${ODIN_VERSION}/odin-linux-amd64-${ODIN_VERSION}.zip" \
    && mkdir -p /opt/odin && cd /opt/odin \
    && unzip -q /tmp/odin.zip && rm /tmp/odin.zip \
    # Some Odin release zips wrap a tarball; unwrap whichever layout this one is.
    && if [ -f dist.tar.gz ]; then tar xzf dist.tar.gz --strip-components=1 && rm dist.tar.gz; fi \
    && ODIN_BIN="$(find /opt/odin -maxdepth 3 -name odin -type f | head -n1)" \
    && chmod +x "$ODIN_BIN" \
    && ln -s "$ODIN_BIN" /usr/local/bin/odin \
    && odin version

# ---------- Stage 3: build skald_codegen from the backend source -------------
FROM toolchain AS codegen
COPY skald-backend/ /build/skald-backend/
WORKDIR /build/skald-backend
RUN odin build main.odin -file -out:/build/skald_codegen

# ---------- Stage 4: runtime --------------------------------------------------
FROM toolchain AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/skald-ui
COPY --from=ui /build/skald-ui/dist-web ./dist-web
COPY --from=codegen /build/skald_codegen ./skald_codegen
COPY skald-ui/web-server ./web-server
COPY examples/ /app/examples
# Container is the one place binding beyond localhost is intended: the host's
# proxy is the only route in, and the process runs unprivileged.
ENV SKALD_ODIN=/usr/local/bin/odin \
    SKALD_WEB_HOST=0.0.0.0 \
    SKALD_WEB_PORT=8787
RUN useradd --create-home skald
USER skald
EXPOSE 8787
CMD ["node", "web-server/server.mjs"]

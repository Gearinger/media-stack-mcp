FROM node:22-alpine

RUN apk add --no-cache aria2 tini

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY docker ./docker

# exFAT/Windows checkouts lose the exec bit, so set it explicitly.
RUN chmod +x /app/docker/entrypoint.sh

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    ARIA2_MANAGED=1 \
    ARIA2_RPC_URL=http://127.0.0.1:6800/jsonrpc \
    DOWNLOAD_DIR=/downloads \
    MEDIA_STACK_CONFIG=/config/config.json

VOLUME ["/downloads", "/config"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/bin/sh", "/app/docker/entrypoint.sh"]

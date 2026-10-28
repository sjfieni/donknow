FROM node:24-bookworm-slim AS web
WORKDIR /build/mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; npm ci --include=dev --no-audit --no-fund
COPY mobile/ ./
ENV EXPO_NO_TELEMETRY=1 EXPO_NO_CACHE=1 CI=1 EXPO_PUBLIC_AUTO_SERVER=1
RUN npm run export:web -- --max-workers 2

FROM node:24-bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt SSL_CERT_DIR=/etc/ssl/certs
ENV NODE_ENV=production PORT=3000 DATA_DIR=/var/lib/duckduck BACKUP_DIR=/var/backups/duckduck WEB_DIR=/app/mobile-web
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=extra_ca,required=false if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; npm ci --omit=dev --no-audit --no-fund && mkdir -p /var/lib/duckduck /var/backups/duckduck && chown node:node /var/lib/duckduck /var/backups/duckduck
COPY --chown=node:node server.js ./
COPY --chown=node:node server/ ./server/
COPY --chown=node:node scripts/backup.js scripts/import-legacy.js ./scripts/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node --from=web /build/mobile/dist-web/ ./mobile-web/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

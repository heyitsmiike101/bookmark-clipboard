# Bookmark Dashboard — zero-dependency Node.js app.
# No build step, no npm install (the server uses only Node built-ins).
FROM node:20-alpine

# tini for clean signal handling (graceful container stop).
RUN apk add --no-cache tini

WORKDIR /app

# Copy the application. config.json acts as the seed for first run.
COPY server.js package.json config.json ./
COPY index.html docs.html Bookmarks.html llms.txt ./

# Persisted data (config + uploads) lives here. Mount a volume to keep it.
ENV DATA_DIR=/data
RUN mkdir -p /data/attachments
VOLUME ["/data"]

EXPOSE 3000

# Basic container health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api?action=version >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

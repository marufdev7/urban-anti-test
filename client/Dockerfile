# UrbanMend client — Vite dev image.
# Dev-only: the compose service mounts the source over /app and runs the dev
# server, so this image only needs Node and system deps. A production build
# stage can be added in Phase 5.
FROM node:20-alpine

WORKDIR /app

COPY package.json ./

EXPOSE 5173

# Deps are installed at container start (compose command), so the mount and
# node_modules volume stay in sync with package.json without a rebuild.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM node:20-alpine
WORKDIR /app

# Copiar monorepo (root + packages/credo + servicio)
COPY package.json package-lock.json* ./
COPY packages packages
COPY verifier-service verifier-service

RUN npm config set fetch-retries 5 && npm config set fetch-retry-maxtimeout 120000
RUN npm install
RUN npm run build -w @one/credo
RUN npm run build -w verifier-service

WORKDIR /app/verifier-service
EXPOSE 9004
CMD ["node", "dist/main.js"]

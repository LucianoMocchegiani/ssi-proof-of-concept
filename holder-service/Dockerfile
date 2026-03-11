FROM node:20-alpine
WORKDIR /app

# Copiar monorepo (root + packages/credo + servicio)
COPY package.json package-lock.json* ./
COPY packages packages
COPY holder-service holder-service

RUN npm config set fetch-retries 5 && npm config set fetch-retry-maxtimeout 120000
RUN npm install
RUN npm run build -w @one/credo
RUN npm run build -w holder-service

WORKDIR /app/holder-service
EXPOSE 9005
CMD ["node", "dist/main.js"]

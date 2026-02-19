FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4003
CMD ["node", "dist/main.js"]

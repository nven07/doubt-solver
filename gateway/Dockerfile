FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY doubt.proto ./

EXPOSE 3000
CMD ["node", "src/index.js"]
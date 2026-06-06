FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

# Run as the non-root 'node' user (uid 1000) shipped in the base image.
USER node

EXPOSE 4000
CMD ["node", "src/index.js"]

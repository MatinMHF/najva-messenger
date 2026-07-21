FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
# Generate the Prisma client BEFORE tsc: the build imports generated types
# (e.g. the MessageType enum), so the client must exist when `npm run build` runs.
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# prisma/seed.ts is run with tsx and imports from ../src, so the sources and the
# tsconfig that resolves their paths have to be here too — dist alone is not enough.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3000

CMD npx prisma migrate deploy && node dist/index.js

FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3030

USER node

# The seed is idempotent: it only creates the first owner when none exists.
CMD ["sh", "-c", "npx prisma migrate deploy && (npx prisma db seed || echo 'SEED FAILED: no owner was created - check SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD.') && exec node dist/main"]
FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3030

USER node

CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main"]
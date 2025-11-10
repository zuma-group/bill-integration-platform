FROM node:18-bullseye AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# Skip Prisma generate during deps install; builder runs it after copying prisma/
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm ci --ignore-scripts

# Build stage
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client and build Next.js
RUN npx prisma generate
RUN npm run build

# Production image, copy necessary files
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Add a non-root user
RUN groupadd -r nextjs && useradd -r -g nextjs nextjs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Entrypoint script to run prisma db push and then start
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nextjs
EXPOSE 3004
ENV PORT=3004
CMD ["/entrypoint.sh"]



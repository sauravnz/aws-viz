# Multi-stage Dockerfile for AWS Viz application

# Stage 1: Build the client
FROM node:18-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --only=production

COPY client/ ./
COPY shared/ ../shared/
RUN npm run build

# Stage 2: Build the server
FROM node:18-alpine AS server-builder

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --only=production

COPY server/ ./
COPY shared/ ../shared/
RUN npm run build

# Stage 3: Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

WORKDIR /app

# Copy server build and dependencies
COPY --from=server-builder --chown=appuser:nodejs /app/server/dist ./dist
COPY --from=server-builder --chown=appuser:nodejs /app/server/node_modules ./node_modules
COPY --from=server-builder --chown=appuser:nodejs /app/server/package.json ./package.json

# Copy client build to serve as static files
COPY --from=client-builder --chown=appuser:nodejs /app/client/dist ./public

# Create a simple static file server setup
RUN mkdir -p ./public/static

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV CORS_ORIGIN=*

# Expose port
EXPOSE 3000

# Switch to app user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1) \
  }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"] 
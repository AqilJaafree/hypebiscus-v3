# ==========================================
# Hypebiscus MCP Server - Production Dockerfile
# ==========================================
# Multi-stage build for optimal image size and security
# Uses pnpm for efficient dependency management

# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:18.20.0-alpine AS builder

# Install pnpm globally (faster than npm)
RUN npm install -g pnpm@10.11.0

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
# This layer is cached unless package.json or pnpm-lock.yaml changes
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
# --frozen-lockfile ensures reproducible builds
# Using mount cache for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
    pnpm install --frozen-lockfile

# Copy Prisma schema for client generation
COPY prisma ./prisma

# Generate Prisma client
RUN pnpm prisma:generate

# Copy source code and configuration files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
# This creates the dist/ directory with compiled code
RUN pnpm build

# ==========================================
# Stage 2: Production Stage
# ==========================================
FROM node:18.20.0-alpine AS production

# Install pnpm in production stage
RUN npm install -g pnpm@10.11.0

# Create non-root user for security
# MCP servers should NEVER run as root
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001 -G mcpuser

# Set working directory
WORKDIR /app

# Copy package files with ownership
COPY --chown=mcpuser:mcpuser package.json pnpm-lock.yaml ./

# Copy Prisma schema with ownership
COPY --chown=mcpuser:mcpuser prisma ./prisma

# Install ONLY production dependencies and generate Prisma client
# Using mount cache for faster rebuilds
RUN --mount=type=cache,target=/root/.npm,uid=1001 \
    pnpm install --frozen-lockfile --prod && \
    pnpm prisma:generate

# Copy compiled code from builder stage with ownership
COPY --chown=mcpuser:mcpuser --from=builder /app/dist ./dist

# Switch to non-root user before any file operations
USER mcpuser

# Environment variables with defaults
# These can be overridden at runtime via docker run -e or docker-compose
ENV NODE_ENV=production \
    SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
    CACHE_TTL=30 \
    REQUEST_TIMEOUT=10000 \
    LOG_LEVEL=info

# MCP servers use stdio transport, not HTTP ports
# No EXPOSE directive needed - communication via stdin/stdout

# Health check (optional - checks if Node.js is still running)
# Note: This is basic - MCP stdio transport doesn't have traditional health endpoints
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f "node.*index.js" || exit 1

# Entry point - runs the compiled MCP server
# Uses node directly (not npm start) for proper signal handling
ENTRYPOINT ["node", "dist/index.js"]

# Labels for metadata
LABEL maintainer="Hypebiscus Team" \
      description="MCP server for real-time Meteora DLMM pool metrics" \
      version="1.0.0" \
      org.opencontainers.image.source="https://github.com/hypebiscus/hypebiscus-v2"

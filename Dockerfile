
FROM node:18-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code dan build TypeScript (akan menghasilkan folder dist)
# Ini akan menjalankan npm run build yang sudah saya modifikasi untuk menyalin assets logo
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy package.json dan install production dependencies saja
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev

# Copy hasil build dari tahap sebelumnya (otomatis menyertakan dist/assets logo)
COPY --from=build /app/dist ./dist

# Pastikan direktori uploads ada dengan permission yang sesuai
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Gunakan non-root user untuk keamanan (opsional namun disarankan)
USER node

# Aplikasi berjalan di port 3003 (sesuai config meetrip-be)
EXPOSE 3000

# Start the API Server
CMD ["node", "dist/server.js"]


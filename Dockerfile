FROM node:20-slim

WORKDIR /app

# Install Python for PDF report generation
RUN apt-get update && apt-get install -y python3 python3-pip --no-install-recommends \
    && pip3 install reportlab --break-system-packages \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Install and build frontend
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Copy server code
COPY server/ ./server/
COPY samples/ ./samples/
COPY .env.example ./.env.example

# Create data directories
RUN mkdir -p data uploads

# Single port - Express serves both API and built frontend
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]

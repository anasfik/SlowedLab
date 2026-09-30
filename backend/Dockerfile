FROM node:20-bookworm-slim

WORKDIR /app

# yt-dlp + ffmpeg + JS runtime (deno) for link import.
# Debian slim: deno has no apt package, install via static zip.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates unzip python3 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o /tmp/deno.zip \
  && unzip -o /tmp/deno.zip -d /usr/local/bin \
  && rm /tmp/deno.zip \
  && yt-dlp --version \
  && ffmpeg -version | head -1 \
  && deno --version

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Persisted data: bug reports + audio cache
VOLUME ["/app/data"]

# Expose port
EXPOSE 4001

# Start server
CMD ["npm", "run", "dev"]

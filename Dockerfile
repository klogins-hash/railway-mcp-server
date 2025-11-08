FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code first (needed for build)
COPY src ./src

# Install dependencies (this will trigger the build in prepare script)
RUN npm install

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]

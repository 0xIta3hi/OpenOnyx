# 🐳 Docker

## What is Docker?

Platform for building, shipping, and running applications in containers.

## Key Concepts

### Images vs Containers
- **Image**: Blueprint/template (read-only)
- **Container**: Running instance of an image

### Dockerfile
```dockerfile
# Base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
```

## Basic Commands

```bash
# Build image
docker build -t myapp:1.0 .

# Run container
docker run -d -p 3000:3000 myapp:1.0

# List containers
docker ps
docker ps -a  # including stopped

# Stop container
docker stop <container_id>

# Remove container
docker rm <container_id>

# List images
docker images

# Remove image
docker rmi <image_id>

# Logs
docker logs <container_id>

# Execute command in container
docker exec -it <container_id> sh
```

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
  
  db:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

## Best Practices

1. Use specific image tags
2. Multi-stage builds for smaller images
3. Don't run as root
4. Use `.dockerignore`
5. One process per container

## See Also

- [[Kubernetes]]
- [[DevOps MOC]]
- [[Microservices Architecture]]

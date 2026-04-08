# 🏗️ System Design

## Key Concepts

### Scalability
- Vertical: More powerful machine
- Horizontal: More machines

### Load Balancing
Distribute traffic across servers:
- Round Robin
- Least Connections
- IP Hash

### Caching
| Layer | Tool | TTL |
|-------|------|-----|
| CDN | CloudFlare | Hours |
| App | Redis | Minutes |
| DB | Query cache | Seconds |

### Database Scaling
- Read replicas
- Sharding
- Partitioning

## Common Patterns

### Microservices
- Independent deployment
- Technology diversity
- Complexity tradeoff

### Event-Driven
- Loose coupling
- Async processing
- Message queues (Kafka, RabbitMQ)

### CQRS
Command Query Responsibility Segregation

## Design Process

1. **Clarify** requirements
2. **Estimate** scale
3. **Design** high-level
4. **Deep dive** components
5. **Identify** bottlenecks

## Classic Problems

- URL Shortener
- Twitter Feed
- Chat System
- Rate Limiter

## See Also

- [[Microservices Architecture]]
- [[API Design Principles]]
- [[Docker]]

# 🔧 Microservices Architecture

## Core Principles

1. **Single Responsibility** - One service, one job
2. **Autonomy** - Independent deploy/scale
3. **Resilience** - Graceful degradation
4. **Decentralization** - No single point of failure

## Communication

### Synchronous
- REST APIs
- gRPC

### Asynchronous
- Message queues
- Event streams

```
┌─────────┐   HTTP   ┌─────────┐
│ Service │ ──────── │ Service │
│    A    │          │    B    │
└─────────┘          └─────────┘
     │
     │ Event
     ▼
┌─────────────┐
│ Message     │
│ Queue       │
└─────────────┘
```

## Patterns

### API Gateway
Single entry point for clients.

### Service Discovery
Services find each other dynamically.

### Circuit Breaker
Prevent cascade failures.

### Saga Pattern
Distributed transactions.

## Challenges

- Network latency
- Data consistency
- Monitoring complexity
- Service coordination

## Tools

| Category | Tools |
|----------|-------|
| Containers | [[Docker]], Kubernetes |
| API Gateway | Kong, AWS API Gateway |
| Service Mesh | Istio, Linkerd |
| Monitoring | Prometheus, Grafana |

## See Also

- [[System Design]]
- [[Docker]]
- [[API Design Principles]]

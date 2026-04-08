# 🚀 Deployment Strategies

## Types

### Blue-Green
Two identical environments. Switch traffic instantly.

### Canary
Gradual rollout to subset of users.

### Rolling
Replace instances one by one.

## CI/CD Pipeline

```
Code → Build → Test → Stage → Prod
```

## Tools

| Tool | Use Case |
|------|----------|
| GitHub Actions | CI/CD |
| Docker | Containerization |
| Kubernetes | Orchestration |
| Vercel | Frontend hosting |

## Best Practices

- Automate everything
- Test in staging
- Monitor after deploy
- Have rollback plan

## See Also

- [[Docker]]
- [[Git Version Control]]

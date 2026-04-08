# 📋 Logging Best Practices

## Log Levels

| Level | Use Case |
|-------|----------|
| ERROR | Something broke |
| WARN | Potential issue |
| INFO | Normal events |
| DEBUG | Detailed info |

## What to Log

- Request/response metadata
- Errors with context
- Key business events
- Performance metrics

## What NOT to Log

- Passwords
- API keys
- Personal data
- Full request bodies

## Format

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "message": "User logged in",
  "userId": "123"
}
```

## See Also

- [[Debugging Strategies]]
- [[Error Handling]]

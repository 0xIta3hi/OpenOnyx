# 🌐 REST API Design

## Principles

1. **Resources** - Nouns, not verbs
2. **HTTP Methods** - GET, POST, PUT, DELETE
3. **Stateless** - No server-side sessions
4. **Uniform Interface** - Consistent patterns

## URL Design

```
# Good
GET    /users           # List users
GET    /users/123       # Get user
POST   /users           # Create user
PUT    /users/123       # Update user
DELETE /users/123       # Delete user

# Bad
GET /getUser
POST /createNewUser
GET /deleteUser?id=123
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |

## Response Format

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "total": 100
  },
  "errors": null
}
```

## Best Practices

1. Use plural nouns (`/users` not `/user`)
2. Version your API (`/v1/users`)
3. Use query params for filtering (`?status=active`)
4. Support pagination
5. Handle errors consistently

## See Also

- [[API Design Principles]]
- [[System Design]]

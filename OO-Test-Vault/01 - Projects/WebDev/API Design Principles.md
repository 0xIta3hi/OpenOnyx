# 🔌 API Design Principles

## RESTful Design

### Resource Naming
- Use nouns, not verbs: `/users` not `/getUsers`
- Plural names: `/articles` not `/article`
- Hierarchical: `/users/123/posts`

### HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Read | Yes |
| POST | Create | No |
| PUT | Update (full) | Yes |
| PATCH | Update (partial) | No |
| DELETE | Remove | Yes |

### Status Codes

```
2xx - Success
  200 OK
  201 Created
  204 No Content

4xx - Client Error
  400 Bad Request
  401 Unauthorized
  404 Not Found

5xx - Server Error
  500 Internal Server Error
```

## Best Practices

1. **Versioning**: `/api/v1/users`
2. **Pagination**: `?page=1&limit=20`
3. **Filtering**: `?status=active&role=admin`
4. **Error responses**: Consistent format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [...]
  }
}
```

## See Also

- [[GraphQL]]
- [[Node.js]]
- [[Authentication Patterns]]

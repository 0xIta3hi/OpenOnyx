# 🔐 Authentication Patterns

## Session-Based

1. User logs in
2. Server creates session
3. Session ID stored in cookie
4. Cookie sent with each request

## Token-Based (JWT)

1. User logs in
2. Server returns JWT
3. Client stores token
4. Token sent in Authorization header

```
Authorization: Bearer <token>
```

## OAuth 2.0

Delegated authorization:
1. User clicks "Login with Google"
2. Redirect to Google
3. User grants permission
4. Redirect back with code
5. Exchange code for token

## Best Practices

- Use HTTPS
- Hash passwords (bcrypt)
- Implement rate limiting
- Short token expiration
- Refresh token rotation

## See Also

- [[Web Security]]
- [[API Design Principles]]

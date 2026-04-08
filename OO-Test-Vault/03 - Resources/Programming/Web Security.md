# 🔒 Web Security

## Common Vulnerabilities

### XSS (Cross-Site Scripting)
Injecting malicious scripts into web pages.

**Prevention**:
- Escape user input
- Content Security Policy
- HTTP-only cookies

### CSRF (Cross-Site Request Forgery)
Tricking users into making unwanted requests.

**Prevention**:
- CSRF tokens
- SameSite cookies
- Check Referer header

### SQL Injection
Executing malicious SQL through user input.

**Prevention**:
- Parameterized queries
- ORMs
- Input validation

## Best Practices

- Use HTTPS everywhere
- Validate all input
- Use secure headers
- Keep dependencies updated
- Implement rate limiting

## See Also

- [[API Design Principles]]
- [[Clean Code Principles]]

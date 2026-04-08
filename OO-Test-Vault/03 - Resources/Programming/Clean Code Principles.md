# ✨ Clean Code Principles

## Naming

```javascript
// Bad
const d = new Date();
const x = users.filter(u => u.a > 18);

// Good
const currentDate = new Date();
const adultUsers = users.filter(user => user.age > 18);
```

## Functions

### Do One Thing
```javascript
// Bad
function handleUserAndSendEmail(user) { ... }

// Good
function validateUser(user) { ... }
function sendWelcomeEmail(user) { ... }
```

### Keep Them Small
Aim for 20 lines or less.

### Limit Parameters
```javascript
// Bad
function createUser(name, email, age, address, phone) { ... }

// Good
function createUser({ name, email, age, address, phone }) { ... }
```

## Comments

> "Comments are a failure to express yourself in code."

```javascript
// Bad - explains what
i++; // Increment i

// Good - explains why
i++; // Account for zero-indexing in display
```

## Error Handling

```javascript
// Bad
if (user == null) return null;

// Good
if (!user) {
  throw new UserNotFoundError(userId);
}
```

## SOLID Principles

- **S**ingle Responsibility
- **O**pen/Closed
- **L**iskov Substitution
- **I**nterface Segregation
- **D**ependency Inversion

## See Also

- [[Design Patterns]]
- [[Code Review Checklist]]

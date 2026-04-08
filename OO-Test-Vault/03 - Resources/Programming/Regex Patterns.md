# 🔤 Regex Patterns

## Common Patterns

```regex
# Email
^[\w.-]+@[\w.-]+\.\w+$

# Phone
\d{3}-\d{3}-\d{4}

# URL
https?://[\w.-]+

# Date (YYYY-MM-DD)
\d{4}-\d{2}-\d{2}
```

## Syntax

| Pattern | Meaning |
|---------|---------|
| `.` | Any character |
| `\d` | Digit |
| `\w` | Word character |
| `\s` | Whitespace |
| `*` | 0 or more |
| `+` | 1 or more |
| `?` | 0 or 1 |
| `^` | Start |
| `$` | End |

## JavaScript

```javascript
const regex = /pattern/flags;
const match = string.match(regex);
const test = regex.test(string);
```

## See Also

- [[JavaScript]]
- [[Python Programming]]

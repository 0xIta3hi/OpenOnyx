# 🔧 Environment Variables

## Why Use Them?

- Separate config from code
- Keep secrets secure
- Different values per environment

## Node.js

```javascript
// .env file
DATABASE_URL=postgres://localhost/mydb
API_KEY=secret123

// Access
require('dotenv').config();
const dbUrl = process.env.DATABASE_URL;
```

## Best Practices

1. Never commit .env to git
2. Document required variables
3. Provide .env.example
4. Validate on startup

## Example .env.example

```
DATABASE_URL=
API_KEY=
NODE_ENV=development
```

## See Also

- [[Docker]]
- [[Git Version Control]]

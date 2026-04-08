# 📦 NPM Packages

## Essential Commands

```bash
npm init -y         # Initialize
npm install pkg     # Install
npm install -D pkg  # Dev dependency
npm update          # Update all
npm audit           # Security check
```

## Useful Packages

### Development
- nodemon: Auto-restart
- dotenv: Environment variables
- eslint: Linting
- prettier: Formatting

### Web
- express: Server framework
- axios: HTTP client
- cors: CORS middleware

### Testing
- jest: Test runner
- supertest: API testing

### Utilities
- lodash: Helper functions
- date-fns: Date utilities
- uuid: Generate IDs

## package.json Scripts

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "jest",
    "build": "tsc"
  }
}
```

## See Also

- [[Node.js]]
- [[JavaScript]]

# 📦 Monorepo Setup

## What is a Monorepo?

Multiple projects in one repository.

## Benefits

- Shared code
- Atomic changes
- Unified tooling
- Simplified dependencies

## Tools

| Tool | Ecosystem |
|------|-----------|
| Turborepo | JavaScript |
| Nx | JavaScript |
| Lerna | JavaScript |
| Bazel | Multi-language |

## Structure

```
monorepo/
├── apps/
│   ├── web/
│   └── mobile/
├── packages/
│   ├── shared/
│   └── ui/
└── package.json
```

## See Also

- [[NPM Packages]]
- [[Code Organization]]

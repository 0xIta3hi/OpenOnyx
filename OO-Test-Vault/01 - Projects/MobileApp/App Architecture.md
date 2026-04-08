# 🏗️ App Architecture

## Tech Stack

- [[React Native]]
- TypeScript
- Redux Toolkit
- React Navigation

## Project Structure

```
src/
├── components/     # Reusable UI
├── screens/        # Screen components
├── navigation/     # Nav config
├── store/          # Redux store
├── services/       # API calls
├── hooks/          # Custom hooks
├── utils/          # Helpers
└── types/          # TypeScript types
```

## State Management

Using Redux Toolkit:
- Auth slice
- Notes slice
- Settings slice

## API Layer

```typescript
// services/api.ts
const api = {
  getNotes: () => fetch('/api/notes'),
  createNote: (note) => fetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify(note)
  })
};
```

## See Also

- [[Mobile App Project]]
- [[React Native]]
- [[State Management]]

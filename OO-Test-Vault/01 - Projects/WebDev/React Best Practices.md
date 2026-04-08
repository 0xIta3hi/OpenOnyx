# ⚛️ React Best Practices

## Component Design

### 1. Keep Components Small
Each component should do one thing well. Follow the **Single Responsibility Principle**.

### 2. Use Functional Components
Prefer functional components with hooks over class components.

```jsx
// Good
const UserCard = ({ user }) => (
  <div className="user-card">
    <h3>{user.name}</h3>
    <p>{user.email}</p>
  </div>
);
```

### 3. Custom Hooks
Extract reusable logic into custom hooks:

```javascript
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });
  
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  
  return [value, setValue];
}
```

## State Management

- Use [[React Context]] for global state
- Consider [[Redux]] for complex apps
- [[React Query]] for server state

## Performance

- Memoization with `useMemo` and `useCallback`
- Lazy loading with `React.lazy()`
- Virtual lists for large datasets

See also: [[React Hooks]], [[TypeScript]], [[Testing React Components]]

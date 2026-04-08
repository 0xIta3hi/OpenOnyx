# 📊 State Management

## Local State

```javascript
const [count, setCount] = useState(0);
```

## Lifting State

Share state by moving it to common ancestor.

## Context API

```javascript
const ThemeContext = createContext('light');

// Provider
<ThemeContext.Provider value="dark">
  <App />
</ThemeContext.Provider>

// Consumer
const theme = useContext(ThemeContext);
```

## External Libraries

| Library | Best For |
|---------|----------|
| Redux | Complex apps |
| Zustand | Simple global |
| Jotai | Atomic state |
| Recoil | React-specific |

## When to Use What

- Local state: Component-specific
- Context: Theme, auth, settings
- Redux: Large app, complex state

## See Also

- [[React Best Practices]]
- [[React Hooks]]

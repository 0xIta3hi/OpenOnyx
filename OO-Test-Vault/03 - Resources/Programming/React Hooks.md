# ⚛️ React Hooks

## Built-in Hooks

### useState
```javascript
const [count, setCount] = useState(0);
setCount(prev => prev + 1);
```

### useEffect
```javascript
useEffect(() => {
  // Run on mount and deps change
  return () => {
    // Cleanup
  };
}, [dependencies]);
```

### useContext
Access context without Consumer wrapper.

### useReducer
For complex state logic:
```javascript
const [state, dispatch] = useReducer(reducer, initialState);
```

### useRef
Mutable reference that persists:
```javascript
const inputRef = useRef(null);
```

### useMemo
Memoize expensive computations:
```javascript
const sorted = useMemo(() => items.sort(), [items]);
```

### useCallback
Memoize functions:
```javascript
const handleClick = useCallback(() => {
  // handler
}, [deps]);
```

## Rules of Hooks

1. Only call at top level
2. Only call from React functions
3. Name custom hooks with `use` prefix

## Custom Hooks

```javascript
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initialValue;
  });
  
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  
  return [value, setValue];
}
```

## See Also

- [[React Best Practices]]
- [[JavaScript]]

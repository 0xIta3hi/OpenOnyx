# 🔄 Event Loop

## How It Works

```
┌─────────────┐
│  Call Stack │
└──────┬──────┘
       │
┌──────▼──────┐
│ Event Loop  │ ← Checks if stack empty
└──────┬──────┘
       │
┌──────▼──────┐
│ Task Queue  │
└─────────────┘
```

## Execution Order

1. Synchronous code
2. Microtasks (Promises)
3. Macrotasks (setTimeout)

## Example

```javascript
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
// Output: 1, 4, 3, 2
```

## See Also

- [[Async Programming]]
- [[JavaScript]]

# 🎁 Closures

## What is a Closure?

Function that remembers its outer scope.

## Example

```javascript
function counter() {
  let count = 0;
  return function() {
    return ++count;
  };
}

const increment = counter();
increment(); // 1
increment(); // 2
```

## Use Cases

- Data privacy
- Partial application
- Factory functions
- Event handlers

## Common Pitfall

```javascript
// Problem
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
// Logs: 3, 3, 3

// Solution: use let or closure
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
// Logs: 0, 1, 2
```

## See Also

- [[JavaScript]]
- [[Functional Programming]]

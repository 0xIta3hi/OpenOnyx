# λ Functional Programming

## Core Concepts

### Pure Functions
Same input → same output, no side effects.

### Immutability
Don't modify data, create new data.

### First-Class Functions
Functions as values.

## JavaScript Examples

```javascript
// Map
const doubled = nums.map(x => x * 2);

// Filter
const evens = nums.filter(x => x % 2 === 0);

// Reduce
const sum = nums.reduce((acc, x) => acc + x, 0);
```

## Benefits

- Easier to test
- Predictable behavior
- Easier to parallelize

## See Also

- [[JavaScript]]
- [[Clean Code Principles]]

# 🟨 JavaScript

## Overview

The language of the web. Runs in browsers and on servers (Node.js).

## ES6+ Features

### Arrow Functions
```javascript
const add = (a, b) => a + b;
const greet = name => `Hello, ${name}!`;
```

### Destructuring
```javascript
const { name, age } = person;
const [first, ...rest] = array;
```

### Spread Operator
```javascript
const newArr = [...arr1, ...arr2];
const newObj = { ...obj1, ...obj2 };
```

### Template Literals
```javascript
const message = `Hello, ${name}! You are ${age} years old.`;
```

### Async/Await
```javascript
async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
  }
}
```

## Important Concepts

### Closures
Functions that remember their lexical scope.

### Prototypes
JavaScript's inheritance mechanism.

### Event Loop
How JS handles async operations.

### This Binding
Context-dependent keyword.

## Common Patterns

```javascript
// Debounce
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Throttle
const throttle = (fn, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};
```

## See Also

- [[TypeScript]]
- [[React Best Practices]]
- [[Node.js]]

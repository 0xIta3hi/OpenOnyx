# ⚠️ Error Handling

## JavaScript

```javascript
try {
  riskyOperation();
} catch (error) {
  console.error('Error:', error.message);
} finally {
  cleanup();
}
```

## Custom Errors

```javascript
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

## Best Practices

1. Be specific about errors caught
2. Don't swallow errors silently
3. Log useful context
4. Fail fast
5. Recover gracefully when possible

## Error Boundaries (React)

```javascript
class ErrorBoundary extends React.Component {
  componentDidCatch(error, info) {
    logError(error, info);
  }
  
  render() {
    if (this.state.hasError) {
      return <Fallback />;
    }
    return this.props.children;
  }
}
```

## See Also

- [[Clean Code Principles]]
- [[Debugging Strategies]]

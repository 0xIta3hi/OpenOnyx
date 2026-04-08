# 🧪 Testing Strategies

## Testing Pyramid

```
        /\
       /E2E\       Few, slow, expensive
      /------\
     /  Int   \    Some, medium
    /----------\
   /   Unit     \  Many, fast, cheap
  /--------------\
```

## Unit Tests

Test individual functions/components in isolation.

```javascript
test('add returns sum of numbers', () => {
  expect(add(2, 3)).toBe(5);
});
```

## Integration Tests

Test how modules work together.

```javascript
test('user can submit form', async () => {
  render(<Form />);
  await userEvent.type(screen.getByLabelText('Email'), 'test@test.com');
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(await screen.findByText('Success')).toBeInTheDocument();
});
```

## E2E Tests

Test entire user flows (Cypress, Playwright).

## Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **Arrange-Act-Assert pattern**
4. **Keep tests independent**
5. **Don't test external libraries**

## Code Coverage

| Metric | Target |
|--------|--------|
| Lines | 80%+ |
| Branches | 75%+ |
| Functions | 85%+ |

## See Also

- [[React Best Practices]]
- [[Clean Code Principles]]

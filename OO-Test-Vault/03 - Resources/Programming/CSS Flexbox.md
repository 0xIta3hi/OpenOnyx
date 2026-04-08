# 📦 CSS Flexbox

## Container Properties

```css
.container {
  display: flex;
  flex-direction: row; /* row | column */
  justify-content: center; /* main axis */
  align-items: center; /* cross axis */
  gap: 1rem;
}
```

## Item Properties

```css
.item {
  flex: 1; /* grow | shrink | basis */
  order: 0;
  align-self: center;
}
```

## Common Patterns

### Centering
```css
.center {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

### Space Between
```css
.navbar {
  display: flex;
  justify-content: space-between;
}
```

## See Also

- [[CSS Grid Layout]]
- [[Responsive Design]]

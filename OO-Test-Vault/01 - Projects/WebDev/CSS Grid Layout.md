# 🎨 CSS Grid Layout

## Basic Grid

```css
.container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-gap: 20px;
}
```

## Common Patterns

### Holy Grail Layout

```css
.layout {
  display: grid;
  grid-template-areas:
    "header header header"
    "nav    main   aside"
    "footer footer footer";
  grid-template-rows: auto 1fr auto;
  grid-template-columns: 200px 1fr 200px;
  min-height: 100vh;
}
```

### Responsive Grid

```css
.responsive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}
```

## Grid vs Flexbox

| Feature | Grid | Flexbox |
|---------|------|---------|
| Dimension | 2D | 1D |
| Use case | Layouts | Components |
| Alignment | Both axes | Main/cross |

## Related

- [[Tailwind CSS]]
- [[Responsive Design]]
- [[CSS Flexbox]]

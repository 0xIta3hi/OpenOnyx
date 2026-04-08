# 📱 Responsive Design

## Mobile-First Approach

Start with mobile, add complexity for larger screens.

```css
/* Mobile styles (default) */
.container {
  padding: 1rem;
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

## Breakpoints

| Device | Width |
|--------|-------|
| Mobile | 320-480px |
| Tablet | 768px |
| Laptop | 1024px |
| Desktop | 1200px+ |

## Techniques

### Fluid Typography
```css
font-size: clamp(1rem, 2.5vw, 2rem);
```

### Flexible Images
```css
img {
  max-width: 100%;
  height: auto;
}
```

### CSS Grid/Flexbox
See [[CSS Grid Layout]].

## See Also

- [[CSS Grid Layout]]
- [[Mobile UI Patterns]]

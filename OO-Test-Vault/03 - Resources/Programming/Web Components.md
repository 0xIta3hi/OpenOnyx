# 🧩 Web Components

## Core APIs

### Custom Elements
```javascript
class MyElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<p>Hello!</p>';
  }
}
customElements.define('my-element', MyElement);
```

### Shadow DOM
Encapsulated styling and markup.

### Templates
Reusable markup fragments.

## Usage

```html
<my-element></my-element>
```

## Benefits

- Framework agnostic
- Native browser support
- Encapsulation

## See Also

- [[JavaScript Frameworks]]
- [[JavaScript]]

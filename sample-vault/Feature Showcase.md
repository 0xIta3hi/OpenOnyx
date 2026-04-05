# OpenObsidian Feature Showcase

This note demonstrates all the core Obsidian features implemented in OpenObsidian.

## Wiki Links

Basic link: [[Welcome]]
Link with alias: [[Markdown Guide|Check out the Markdown Guide]]
Link to heading: [[Knowledge Management#Benefits]]
Link to non-existent note: [[New Note Ideas]]

## Embeds

Embedded note preview:
![[Welcome]]

## Tags

This note has several tags: #feature #showcase #demo #testing

Nested tags work too: #project/personal #status/active

## Callouts / Admonitions

> [!note]
> This is a standard note callout.

> [!tip] Pro Tip
> You can add titles to callouts!

> [!warning]
> Be careful with this feature.

> [!danger] Critical
> This is very important!

> [!info]
> Informational callout.

> [!quote]
> "The best way to predict the future is to create it." - Peter Drucker

> [!example]
> Here's an example of how something works.

> [!question]
> What features would you like to see next?

> [!abstract] Summary
> This is a collapsible summary section.

> [!todo]
> - Task to complete
> - Another task

> [!success]
> Everything is working correctly!

> [!bug]
> Known issue: none currently!

## Task Lists

- [x] Implement wiki links
- [x] Add callout support  
- [x] Create graph view
- [ ] Add more themes
- [ ] Export to PDF
- [ ] Mobile support

## Code Blocks

Inline code: `console.log("Hello World")`

```javascript
// JavaScript example
function greet(name) {
  return `Hello, ${name}!`;
}
```

```python
# Python example
def greet(name):
    return f"Hello, {name}!"
```

## Math (LaTeX)

Inline math: $E = mc^2$

Block math:
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Wiki Links | ✅ Done | High |
| Graph View | ✅ Done | High |
| Templates | ✅ Done | Medium |
| Themes | 🔄 In Progress | Medium |

## Images

You can paste images directly from clipboard! They'll be saved to the `attachments/` folder.

## Frontmatter

This note has YAML frontmatter at the top (not visible in preview).

---
title: Feature Showcase
tags: [feature, showcase, demo]
created: 2024-01-15
status: complete
---

## Links

- [[Welcome]] - Start here
- [[Markdown Guide]] - Learn markdown syntax
- [[Knowledge Management]] - Organization tips
- [[Project Ideas]] - Future projects

#openobsidian #features

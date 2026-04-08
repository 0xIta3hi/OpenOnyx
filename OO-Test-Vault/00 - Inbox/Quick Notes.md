# 📝 Quick Notes

## Meeting Notes - Feb 1

- Discussed new feature requirements
- Need to review [[API Design Principles]]
- Follow up with team on [[Agile Methodology]]

## Random Thoughts

The key to learning is **active recall** and **spaced repetition**. See [[Learning Techniques]].

## Code Snippet to Remember

```javascript
// Debounce function
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};
```

## Links to Process

- https://example.com/interesting-article
- Book recommendation from colleague
- [[React Hooks]] deep dive video

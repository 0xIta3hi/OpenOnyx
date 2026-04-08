# 🎤 Interview Preparation

## Data Structures

### Must Know
- Arrays and Strings
- Linked Lists
- Trees and Graphs
- Hash Tables
- Stacks and Queues

### Code Examples

```javascript
// Binary Search
function binarySearch(arr, target) {
  let left = 0, right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}
```

## Algorithms

- Sorting (Quick, Merge, Heap)
- Searching (Binary, BFS, DFS)
- Dynamic Programming
- Greedy algorithms

## System Design

Key topics:
- [[Load Balancing]]
- [[Caching Strategies]]
- [[Database Sharding]]
- [[Microservices Architecture]]

## Behavioral Questions

Use STAR method:
- **S**ituation
- **T**ask
- **A**ction
- **R**esult

### Common Questions
1. Tell me about yourself
2. Describe a challenging project
3. How do you handle conflict?
4. Why this company?

## Resources

- LeetCode
- "Cracking the Coding Interview"
- System Design Primer (GitHub)

## See Also

- [[Career Development]]
- [[Technical Skills Roadmap]]
- [[Algorithm Patterns]]

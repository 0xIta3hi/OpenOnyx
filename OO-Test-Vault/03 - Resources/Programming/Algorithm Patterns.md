# 🧩 Algorithm Patterns

## Common Patterns

### 1. Two Pointers

```javascript
// Find pair with target sum in sorted array
function twoSum(arr, target) {
  let left = 0, right = arr.length - 1;
  while (left < right) {
    const sum = arr[left] + arr[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }
  return null;
}
```

### 2. Sliding Window

```javascript
// Max sum subarray of size k
function maxSubarraySum(arr, k) {
  let maxSum = 0, windowSum = 0;
  
  for (let i = 0; i < k; i++) {
    windowSum += arr[i];
  }
  maxSum = windowSum;
  
  for (let i = k; i < arr.length; i++) {
    windowSum = windowSum - arr[i - k] + arr[i];
    maxSum = Math.max(maxSum, windowSum);
  }
  
  return maxSum;
}
```

### 3. Fast & Slow Pointers

```javascript
// Detect cycle in linked list
function hasCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}
```

### 4. BFS / DFS

```javascript
// BFS for shortest path
function bfs(graph, start, end) {
  const queue = [[start, 0]];
  const visited = new Set([start]);
  
  while (queue.length) {
    const [node, dist] = queue.shift();
    if (node === end) return dist;
    
    for (const neighbor of graph[node]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  return -1;
}
```

### 5. Dynamic Programming

```javascript
// Fibonacci with memoization
function fib(n, memo = {}) {
  if (n <= 1) return n;
  if (memo[n]) return memo[n];
  memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
  return memo[n];
}
```

## See Also

- [[Data Structures]]
- [[Big O Notation]]
- [[Interview Preparation]]

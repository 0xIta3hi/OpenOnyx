# 📊 Data Structures

## Overview

Ways to organize and store data for efficient access and modification.

## Arrays

```javascript
// O(1) access by index
// O(n) insert/delete
const arr = [1, 2, 3, 4, 5];
arr[0];        // Access: O(1)
arr.push(6);   // Append: O(1)
arr.shift();   // Remove first: O(n)
```

## Linked Lists

```javascript
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
  }
  
  append(value) {
    const node = new Node(value);
    if (!this.head) {
      this.head = node;
      return;
    }
    let current = this.head;
    while (current.next) {
      current = current.next;
    }
    current.next = node;
  }
}
```

## Hash Tables

```javascript
// O(1) average for get/set/delete
const map = new Map();
map.set('key', 'value');
map.get('key');
map.has('key');
map.delete('key');
```

## Trees

### Binary Search Tree
```javascript
class TreeNode {
  constructor(value) {
    this.value = value;
    this.left = null;
    this.right = null;
  }
}

class BST {
  insert(value) {
    // O(log n) average
  }
  
  search(value) {
    // O(log n) average
  }
}
```

## Complexity Comparison

| Structure | Access | Search | Insert | Delete |
|-----------|--------|--------|--------|--------|
| Array | O(1) | O(n) | O(n) | O(n) |
| Linked List | O(n) | O(n) | O(1) | O(1) |
| Hash Table | N/A | O(1) | O(1) | O(1) |
| BST | O(log n) | O(log n) | O(log n) | O(log n) |

## See Also

- [[Algorithm Patterns]]
- [[Big O Notation]]
- [[Interview Preparation]]

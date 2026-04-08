# 🎭 Object-Oriented Programming

## Four Pillars

### Encapsulation
Bundle data with methods that operate on it.

### Abstraction
Hide complexity, show only essentials.

### Inheritance
Create new classes based on existing ones.

### Polymorphism
Same interface, different implementations.

## Example (Python)

```python
class Animal:
    def __init__(self, name):
        self.name = name
    
    def speak(self):
        raise NotImplementedError

class Dog(Animal):
    def speak(self):
        return f"{self.name} says woof!"
```

## See Also

- [[Design Patterns]]
- [[Clean Code Principles]]

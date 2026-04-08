# 🐍 Python Programming

## Why Python?

- Readable, beginner-friendly syntax
- Rich ecosystem of libraries
- Great for ML, data science, automation
- Cross-platform

## Core Concepts

### Data Structures
```python
# Lists
numbers = [1, 2, 3, 4, 5]

# Dictionaries
person = {"name": "John", "age": 30}

# Sets
unique = {1, 2, 3}

# Tuples (immutable)
coords = (10, 20)
```

### List Comprehensions
```python
# Basic
squares = [x**2 for x in range(10)]

# With condition
evens = [x for x in range(10) if x % 2 == 0]

# Nested
matrix = [[i*j for j in range(3)] for i in range(3)]
```

### Functions
```python
def greet(name: str, greeting: str = "Hello") -> str:
    """Return a greeting message."""
    return f"{greeting}, {name}!"

# Lambda
square = lambda x: x ** 2
```

### Classes
```python
class Person:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
    
    def greet(self) -> str:
        return f"Hi, I'm {self.name}"
    
    @property
    def is_adult(self) -> bool:
        return self.age >= 18
```

## Common Libraries

| Library | Purpose |
|---------|---------|
| [[NumPy]] | Numerical computing |
| [[Pandas]] | Data manipulation |
| [[Scikit-learn]] | Machine learning |
| Matplotlib | Visualization |
| Requests | HTTP requests |
| FastAPI | Web APIs |

## Virtual Environments

```bash
# Create
python -m venv venv

# Activate (Unix)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## See Also

- [[NumPy]]
- [[Pandas]]
- [[Machine Learning Research]]

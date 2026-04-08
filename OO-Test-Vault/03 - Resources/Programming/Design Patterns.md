# 🏗️ Design Patterns

## Creational Patterns

### Singleton
```javascript
class Database {
  static instance = null;
  
  static getInstance() {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }
}
```

### Factory
```javascript
class AnimalFactory {
  create(type) {
    switch (type) {
      case 'dog': return new Dog();
      case 'cat': return new Cat();
      default: throw new Error('Unknown type');
    }
  }
}
```

## Structural Patterns

### Adapter
```javascript
// Make incompatible interfaces work together
class OldAPI {
  oldRequest() { return 'old data'; }
}

class Adapter {
  constructor(oldApi) {
    this.oldApi = oldApi;
  }
  
  request() {
    return this.oldApi.oldRequest();
  }
}
```

### Decorator
```javascript
class Coffee {
  cost() { return 5; }
}

class MilkDecorator {
  constructor(coffee) {
    this.coffee = coffee;
  }
  
  cost() {
    return this.coffee.cost() + 2;
  }
}
```

## Behavioral Patterns

### Observer
```javascript
class EventEmitter {
  constructor() {
    this.listeners = {};
  }
  
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}
```

### Strategy
```javascript
class PaymentProcessor {
  constructor(strategy) {
    this.strategy = strategy;
  }
  
  process(amount) {
    return this.strategy.pay(amount);
  }
}

class CreditCardStrategy {
  pay(amount) { /* ... */ }
}

class PayPalStrategy {
  pay(amount) { /* ... */ }
}
```

## See Also

- [[Clean Code Principles]]
- [[Object-Oriented Programming]]
- [[System Design]]

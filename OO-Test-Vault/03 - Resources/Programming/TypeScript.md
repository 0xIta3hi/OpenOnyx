# 🔷 TypeScript

## Why TypeScript?

- Static type checking
- Better IDE support
- Catch errors at compile time
- Self-documenting code

## Basic Types

```typescript
// Primitives
let name: string = "John";
let age: number = 30;
let isActive: boolean = true;

// Arrays
let numbers: number[] = [1, 2, 3];
let names: Array<string> = ["a", "b"];

// Tuples
let tuple: [string, number] = ["hello", 42];

// Enums
enum Status {
  Pending,
  Active,
  Completed
}
```

## Interfaces vs Types

```typescript
// Interface (extendable)
interface User {
  id: number;
  name: string;
  email?: string; // optional
}

// Type (for unions, intersections)
type ID = string | number;
type UserWithRole = User & { role: string };
```

## Generics

```typescript
function identity<T>(arg: T): T {
  return arg;
}

interface Container<T> {
  value: T;
  getValue(): T;
}
```

## Utility Types

```typescript
// Partial - all properties optional
type PartialUser = Partial<User>;

// Required - all properties required
type RequiredUser = Required<User>;

// Pick - select properties
type UserName = Pick<User, 'name'>;

// Omit - exclude properties
type UserWithoutId = Omit<User, 'id'>;

// Record - key-value mapping
type UserMap = Record<string, User>;
```

## Best Practices

1. Enable `strict` mode
2. Avoid `any` when possible
3. Use `unknown` instead of `any` for unknown types
4. Leverage type inference

## See Also

- [[JavaScript]]
- [[React Best Practices]]
- [[Node.js]]

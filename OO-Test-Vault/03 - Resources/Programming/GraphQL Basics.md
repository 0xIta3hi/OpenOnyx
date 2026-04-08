# 🔷 GraphQL Basics

## What is GraphQL?

Query language for APIs. Get exactly what you need.

## Query Example

```graphql
query {
  user(id: "123") {
    name
    email
    posts {
      title
      createdAt
    }
  }
}
```

## Mutation Example

```graphql
mutation {
  createUser(name: "John", email: "john@test.com") {
    id
    name
  }
}
```

## vs REST

| GraphQL | REST |
|---------|------|
| Single endpoint | Multiple endpoints |
| Get exact data | Over/under-fetching |
| Strong typing | Varies |

## See Also

- [[REST API Design]]
- [[API Design Principles]]

# 🗄️ SQL Database

## Basic Queries

```sql
-- Select
SELECT name, email FROM users WHERE active = true;

-- Insert
INSERT INTO users (name, email) VALUES ('John', 'john@test.com');

-- Update
UPDATE users SET active = false WHERE id = 1;

-- Delete
DELETE FROM users WHERE id = 1;
```

## Joins

```sql
-- INNER JOIN
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN
SELECT u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;
```

## Indexing

```sql
-- Create index for faster lookups
CREATE INDEX idx_users_email ON users(email);

-- Composite index
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at);
```

## Performance Tips

1. Use indexes on WHERE/JOIN columns
2. Avoid SELECT *
3. Limit results with LIMIT
4. Use EXPLAIN to analyze queries
5. Batch large operations

## Common Patterns

### Pagination
```sql
SELECT * FROM posts
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;
```

### Aggregation
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as count,
  SUM(amount) as total
FROM orders
GROUP BY DATE(created_at);
```

## See Also

- [[Data Structures]]
- [[System Design]]

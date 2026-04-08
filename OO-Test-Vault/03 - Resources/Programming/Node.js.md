# 🟢 Node.js

## Overview

JavaScript runtime built on Chrome's V8 engine. Enables server-side JavaScript.

## Core Modules

```javascript
const fs = require('fs');          // File system
const path = require('path');      // Path utilities
const http = require('http');      // HTTP server
const crypto = require('crypto');  // Cryptography
const os = require('os');          // OS info
```

## Express.js Basics

```javascript
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Routes
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  // Create user...
  res.status(201).json({ id: 1, name, email });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Async Patterns

```javascript
// Callbacks (old way)
fs.readFile('file.txt', (err, data) => {
  if (err) throw err;
  console.log(data);
});

// Promises
const fsPromises = require('fs').promises;
fsPromises.readFile('file.txt')
  .then(data => console.log(data))
  .catch(err => console.error(err));

// Async/Await (preferred)
async function readFile() {
  try {
    const data = await fsPromises.readFile('file.txt');
    console.log(data);
  } catch (err) {
    console.error(err);
  }
}
```

## Environment Variables

```javascript
// Using dotenv
require('dotenv').config();

const port = process.env.PORT || 3000;
const dbUrl = process.env.DATABASE_URL;
```

## See Also

- [[Express Middleware]]
- [[API Design Principles]]
- [[JavaScript]]

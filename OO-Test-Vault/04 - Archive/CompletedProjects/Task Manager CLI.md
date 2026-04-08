# ✅ Task Manager CLI

## Overview

A command-line task manager built with [[Python Programming]].

## Features

- [x] Add/remove tasks
- [x] Priority levels
- [x] Due dates
- [x] Categories
- [x] Export to JSON/CSV

## Code Structure

```
task-manager/
├── cli.py           # Main entry point
├── models.py        # Task data model
├── storage.py       # File storage
├── commands/        # CLI commands
│   ├── add.py
│   ├── list.py
│   └── done.py
└── tests/
```

## Sample Usage

```bash
# Add task
task add "Review PR" --priority high --due 2024-01-15

# List tasks
task list --status pending

# Complete task
task done 1
```

## Lessons Learned

- Click library is excellent for CLIs
- JSON for simple persistence works well
- Argparse vs Click vs Typer comparison

## See Also

- [[Python Programming]]
- [[Terminal Commands]]

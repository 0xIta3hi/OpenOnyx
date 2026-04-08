# 🔀 Git Version Control

## Basic Commands

```bash
# Initialize
git init

# Clone
git clone <url>

# Stage changes
git add .
git add <file>

# Commit
git commit -m "message"

# Push
git push origin main

# Pull
git pull origin main
```

## Branching

```bash
# Create branch
git branch feature/new-feature

# Switch branch
git checkout feature/new-feature

# Create and switch
git checkout -b feature/new-feature

# Merge
git checkout main
git merge feature/new-feature

# Delete branch
git branch -d feature/new-feature
```

## Advanced Commands

```bash
# Interactive rebase
git rebase -i HEAD~3

# Stash changes
git stash
git stash pop

# Cherry-pick
git cherry-pick <commit-hash>

# Reset
git reset --soft HEAD~1  # Keep changes
git reset --hard HEAD~1  # Discard changes

# Revert (creates new commit)
git revert <commit-hash>
```

## Git Flow

```
main
  │
  └─── develop
         │
         ├─── feature/login
         │
         ├─── feature/dashboard
         │
         └─── release/1.0
```

## Best Practices

1. **Commit often** with clear messages
2. **Use branches** for features
3. **Pull before push** to avoid conflicts
4. **Review diffs** before committing
5. **Write good commit messages**

```
feat: add user authentication
fix: resolve login redirect issue
docs: update README with setup instructions
refactor: extract validation logic
```

## See Also

- [[DevOps MOC]]
- [[Code Review Best Practices]]
- [[Terminal Commands]]

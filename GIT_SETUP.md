# 🛠️ Git Authentication Setup Guide

If you are seeing a `Permission denied (publickey)` error when trying to push or pull with the Git plugin, follow these steps to set up your authentication.

## 1. Add your SSH Key to the Agent (Recommended for Linux/macOS)
Open your system terminal and run:

```bash
# Start the ssh-agent in the background
eval "$(ssh-agent -s)"

# Add your default private key
ssh-add ~/.ssh/id_rsa
```

*Note: If your key has a different name (e.g., `id_ed25519`), use that instead.*

## 2. Verify Connection
Run this command to check if GitHub recognizes your key:

```bash
ssh -T git@github.com
```

You should see: `Hi username! You've successfully authenticated...`

## 3. Use HTTPS with a Token (Alternative)
If you prefer not to use SSH, you can switch your remote to HTTPS and use a Personal Access Token (PAT):

1. Generate a PAT on GitHub (**Settings > Developer Settings > Personal Access Tokens**).
2. In your vault folder, run:
   ```bash
   git remote set-url origin https://github.com/your-username/your-repo.git
   ```
3. When prompted for a password inside OpenObsidian, use your **Personal Access Token**.

## 4. Plugin Settings
Ensure you have set your Git username and email in the **Obsidian Git** plugin settings inside OpenObsidian.

---
*OpenObsidian is now optimized to handle passphrase prompts automatically if you have an `ssh-agent` running.*

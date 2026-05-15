# 0007 — SSH host alias for the Arxys-Projects GitHub account

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

The dev machine already has a GitHub identity in active use (TorqueCoffee), authenticated via HTTPS with credentials cached in the macOS Keychain (`osxkeychain` credential helper). Adding the Arxys-Projects identity requires a way to use a *different* GitHub account for *this one repo* without disrupting the other identity.

The first push to `Arxys-Projects/Portal` returned HTTP 403 because the Keychain offered the TorqueCoffee credential, which has no write access to the Arxys-Projects org.

## Options considered

- **A. Switch the global GitHub credential to Arxys-Projects.** Simplest, but breaks the TorqueCoffee workflow on every other repo.
- **B. Per-repo HTTPS credential override.** Possible with `git config credential.helper` per-repo, but Keychain's caching makes the result fragile and platform-specific.
- **C. SSH key dedicated to the Arxys-Projects org, exposed via an `~/.ssh/config` host alias.** Standard pattern. Works regardless of what's in the Keychain. Each repo's remote URL specifies which identity to use.

## Decision

**Option C: SSH host alias.**

Created `~/.ssh/id_ed25519_arxys` (no passphrase, ed25519, dedicated to this org). Added to `~/.ssh/config`:

```ssh-config
Host github.com-arxys
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_arxys
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
```

The Arxys-Projects repo's remote uses the alias: `git@github.com-arxys:Arxys-Projects/Portal.git`. The TorqueCoffee workflow (HTTPS + Keychain) is untouched.

`IdentitiesOnly yes` is the load-bearing flag. Without it, SSH would offer every key in the agent in turn, and the first one accepted by github.com might be the wrong identity for the target org.

## Consequences

**Positive:**
- Both GitHub identities coexist on the same machine. Switching is invisible — `git push` from the Arxys repo Just Works, `git push` from a TorqueCoffee repo Just Works.
- No global config to remember to flip. The alias in the remote URL is self-documenting.
- The dedicated key has no passphrase, so commits and pushes are friction-free. Tradeoff: anyone with file-system access to the dev machine and ability to read `~/.ssh/id_ed25519_arxys` can act as this identity. Acceptable given full-disk encryption is on and the key only has access to one GitHub org.

**Negative:**
- New project setups on this machine for the Arxys org must remember to clone via the alias, not plain `github.com`. Documented in [Runbook §9](../RUNBOOK.md#9-github-ssh-multi-account-setup).
- The public key needs to be added to the Arxys-Projects GitHub account once. Documented in the same runbook section.

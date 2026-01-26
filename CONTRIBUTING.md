# Contributing to we-ne

Thank you for your interest in contributing! This document provides guidelines for contributing to the we-ne project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Naming](#branch-naming)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/we-ne.git`
3. Add upstream remote: `git remote add upstream https://github.com/ORIGINAL/we-ne.git`
4. Install dependencies (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md))

## Development Workflow

1. Create a new branch from `main`
2. Make your changes
3. Write/update tests if applicable
4. Run linting and tests locally
5. Commit with conventional commit messages
6. Push to your fork
7. Open a Pull Request

## Branch Naming

Use descriptive branch names:

```
feat/add-allowlist-merkle
fix/phantom-redirect-timeout
docs/update-security-model
chore/upgrade-dependencies
```

Prefixes:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `chore/` - Maintenance, dependencies
- `refactor/` - Code refactoring
- `test/` - Test additions/changes

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

### Examples

```
feat(grant): add merkle-based allowlist verification
fix(mobile): handle Phantom redirect timeout
docs(readme): add quickstart section
chore(deps): upgrade @solana/web3.js to 1.98.x
```

## Pull Request Process

1. **Title**: Use conventional commit format
2. **Description**: Explain what/why/how
3. **Checklist**:
   - [ ] Tests pass locally
   - [ ] Linting passes
   - [ ] Documentation updated (if needed)
   - [ ] No secrets committed
4. **Review**: Wait for maintainer review
5. **Merge**: Squash and merge after approval

### PR Template

```markdown
## Summary
Brief description of changes

## Changes
- Change 1
- Change 2

## Testing
How to test these changes

## Screenshots (if UI changes)
```

## Code Style

### TypeScript (Mobile App)

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use named exports
- Document public APIs with JSDoc

### Rust (Anchor Program)

- Follow Rust conventions
- Use `cargo fmt` before committing
- Add doc comments for public items

### General

- Keep functions small and focused
- Write self-documenting code
- Add comments for complex logic
- No hardcoded secrets or keys

## Questions?

Open an issue or start a discussion. We're happy to help!

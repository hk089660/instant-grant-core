# Security Policy

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately:

1. **Email**: [Create a private security advisory](https://github.com/hk089660/instant-grant-core/security/advisories/new) on GitHub
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < main  | :x:                |

## Security Model

### Smart Contract (grant_program)

- **Non-custodial**: Users maintain control of their wallets
- **PDA-based**: All state accounts are Program Derived Addresses
- **No admin keys**: Once deployed, no privileged operations except grant owner
- **Audit status**: NOT AUDITED - use at your own risk

### Mobile App (wene-mobile)

- **No private keys stored**: App never has access to wallet private keys
- **Phantom integration**: Keys stay in Phantom wallet
- **Session tokens**: Encrypted with NaCl box, stored in AsyncStorage
- **Deep link validation**: Strict URL parsing to prevent injection

### Known Limitations

1. **Sybil resistance**: Allowlist-based, not identity-based
2. **Replay attacks**: Prevented by period_index + ClaimReceipt PDA
3. **Front-running**: Possible on public mempool (standard Solana limitation)

## Security Best Practices for Contributors

1. **Never commit secrets**: Use `.env.example` as template
2. **Validate all inputs**: Especially deep link parameters
3. **Use constant-time comparisons**: For cryptographic operations
4. **Audit dependencies**: Check for known vulnerabilities
5. **Test edge cases**: Empty inputs, malformed data, timeouts

## Disclosure Policy

- We follow responsible disclosure
- Public disclosure after fix is deployed
- Credit given to reporters (unless anonymity requested)

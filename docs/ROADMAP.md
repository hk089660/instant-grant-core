# Roadmap

This document outlines the development roadmap for we-ne.

## Vision

Enable instant, transparent, and low-cost benefit distribution for public support programs in Japan and beyond.

## Current Status (MVP)

✅ **Completed**
- SPL token-based periodic grants (smart contract)
- Mobile app for recipients (React Native/Expo)
- Phantom wallet integration
- Deep link support (custom scheme + Universal Links)
- Basic claim flow with double-claim prevention

## Short Term (2 Weeks)

### Smart Contract
- [ ] Merkle-based allowlist verification
- [ ] Event emission for better indexing
- [ ] Instruction to update grant parameters

### Mobile App
- [ ] Improved error handling and user feedback
- [ ] Transaction history screen
- [ ] Offline-capable grant info caching

### Infrastructure
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing coverage >60%
- [ ] Devnet deployment scripts

## Medium Term (1 Month)

### Smart Contract
- [ ] Multi-token grant support
- [ ] Batch claim optimization
- [ ] Grant expiry and auto-close

### Mobile App
- [ ] Multiple wallet support (Solflare, etc.)
- [ ] Push notifications for claim availability
- [ ] Localization (EN/JA complete)

### Admin Tools
- [ ] Web dashboard for grant creators
- [ ] Analytics and monitoring
- [ ] Bulk allowlist management

### Security
- [ ] Smart contract audit (external)
- [ ] Mobile app security review
- [ ] Bug bounty program launch

## Long Term (3 Months)

### FairScale Integration
- [ ] Sybil resistance layer
- [ ] Privacy-preserving eligibility proofs
- [ ] Cross-grant deduplication

### Ecosystem
- [ ] SDK for third-party integrations
- [ ] API for grant discovery
- [ ] Partner onboarding tools

### Compliance
- [ ] KYC integration (optional, for regulated use cases)
- [ ] Audit trail and reporting tools
- [ ] Multi-sig grant administration

### Scale
- [ ] Mainnet deployment
- [ ] Performance optimization
- [ ] Geographic expansion beyond Japan

## Grant Milestones (for Solana Foundation)

| Milestone | Deliverable | Timeline |
|-----------|-------------|----------|
| M1 | Devnet MVP with docs | Complete |
| M2 | Allowlist + audit prep | +2 weeks |
| M3 | Admin dashboard + audit | +1 month |
| M4 | Mainnet beta + partners | +3 months |

## How to Contribute

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Priority areas for contributions:
1. Testing (unit + integration)
2. Documentation improvements
3. Localization
4. Security review
5. UI/UX feedback

## Contact

- GitHub Issues: Feature requests and bugs
- GitHub Discussions: General questions

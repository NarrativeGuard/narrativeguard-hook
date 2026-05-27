# Security Policy

NarrativeGuard is a hackathon-stage protocol prototype with internal hardening notes and automated tests. Do not use it to secure production TVL without an independent security review, a production oracle process, and a multisig or equivalent operational setup.

## Reporting

Please report security issues privately to the repository maintainers before public disclosure. Include:

- affected contract or frontend area;
- reproduction steps;
- expected impact;
- any transaction, calldata, or test case that helps reproduce the issue.

## Key Handling

Never commit private keys, seed phrases, API keys, or `.env` files. The repository includes `.env.example` only as a local configuration template.

## Current Scope

Security-relevant code includes:

- `contracts/NarrativeGuardHook.sol`;
- `scripts/deploy.ts`;
- `frontend/src/DeployPanel.jsx`;
- generated frontend ABIs in `frontend/src/generated/contracts.js`.

# Local Signing Deployment

The primary product path is the wallet-connected Risk OS: connect OKX Wallet or MetaMask, load or deploy the Hook, and confirm transactions in the wallet.

This document covers the developer-only scripted deployment path. It signs transactions locally from a private key stored in a local `.env` file.

Never share private keys, seed phrases, or `.env` files.

## 1. Create `.env`

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` locally and fill only your own test wallet private key:

```bash
DEPLOYER_PRIVATE_KEY=0x...
```

For X Layer mainnet demo, keep:

```bash
XLAYER_MAINNET_RPC_URL=https://rpc.xlayer.tech
POOL_MANAGER_ADDRESS=0x360E68faccca8cA495c1B759Fd9EEe466db9FB32
```

## 2. Scripted Mainnet Deployment

This deploys:

- `NarrativeGuardHook` through CREATE2;
- two demo ERC20 tokens;
- hook policy configuration;
- a dynamic-fee v4 pool initialized at 1:1 price.

```bash
npm run auto:xlayer-mainnet-demo
```

The script writes public output to:

```text
deployments/xlayerMainnet.json
```

Share only that public JSON output or public explorer links with collaborators. Never share `.env`.

Only promote a new Hook address to README, the frontend current-deployment constants, or hackathon submission material after the script has also configured the Hook policy and initialized the matching v4 pool. A Hook with code but no configured PoolId is fail-open and is not a complete public demo.

To re-check an existing public deployment without signing anything:

```bash
npm run verify:xlayer-mainnet
```

## 3. Safer Partial Mainnet Deploy

If you only want the Hook contract first:

```bash
npm run deploy:xlayer-mainnet
```

To configure and initialize a pool later, rerun with:

```bash
DEPLOY_DEMO_TOKENS=true CONFIGURE_DEMO_POOL=true INITIALIZE_V4_POOL=true npm run deploy:xlayer-mainnet
```

## Notes

- The script never prints the configured private key.
- Prefer a dedicated deployer wallet with limited funds.
- If a deployment fails, share only terminal errors and public addresses.

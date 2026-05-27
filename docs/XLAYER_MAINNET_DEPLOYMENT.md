# X Layer Mainnet Deployment

Deployment time: `2026-05-27T12:36:25.809Z`

Network: X Layer mainnet  
Chain ID: `196`

Status: configured live demo deployment. The Hook below has code on X Layer, its policy is configured for the PoolId below, and the v4 pool initialization transaction succeeded.

## Core Addresses

Hook contract:

```text
0xAa242C1c9Dac355D6a66eA165E3Dfa96D0924080
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/address/0xAa242C1c9Dac355D6a66eA165E3Dfa96D0924080
```

Uniswap v4 PoolManager:

```text
0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/address/0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32
```

V4 PoolId:

```text
0xa9e01de25bcd4f5917afcfbb2b5728a1dfd392d360e7c9d7cefe10d4465dc893
```

Uniswap v4 pools live inside PoolManager storage and are identified by `PoolId`, not by a separate pool contract address.

## Demo Tokens

Token0:

```text
0x6213da9f111E2768FEd4BF4875fA50001B7304FF
```

Token1:

```text
0xb23f8a79e29113Dc41E41cC75261713e5fFb1f0E
```

## Transactions

Deploy Hook:

```text
0xff87423ccf7464befa20a6e5bd2f0f18fcb870dfe5bebcd966d21e952f558d2a
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/tx/0xff87423ccf7464befa20a6e5bd2f0f18fcb870dfe5bebcd966d21e952f558d2a
```

Configure Hook policy:

```text
0x3212e9c6f91ffd770bceff07207446b279c0e8c3dd30d7d78c212b5548b84c15
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/tx/0x3212e9c6f91ffd770bceff07207446b279c0e8c3dd30d7d78c212b5548b84c15
```

Initialize v4 pool:

```text
0xddf9684b8e64829b56836322d3a0c8acaedb2c0c7545d3eb3db49e2a281313a1
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/tx/0xddf9684b8e64829b56836322d3a0c8acaedb2c0c7545d3eb3db49e2a281313a1
```

## RPC Verification

Verified on X Layer RPC:

- Hook code bytes: `9221`
- Token0 code bytes: `1880`
- Token1 code bytes: `1880`
- PoolManager code bytes: `24009`
- Hook config for the PoolId: `enabled = true`
- Hook risk score: `6500` bps
- Hook quoted dynamic fee: `66050` pips
- Hook deployment transaction status: `success`
- Configure transaction status: `success`
- Initialize transaction status: `success`

## Superseded QA Note

Earlier QA observed an unconfigured candidate Hook at:

```text
0x517D1fB0Fc551B4622fC8d2815502e7D2d370080
```

That address is not used for the public demo. The current Hook above is the refreshed deployment with successful Hook deploy, policy configuration, v4 pool initialization, and enabled PoolId verification.

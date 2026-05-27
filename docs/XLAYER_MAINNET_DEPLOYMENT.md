# X Layer Mainnet Deployment

Deployment time: `2026-05-26T04:40:24.868Z`

Network: X Layer mainnet  
Chain ID: `196`

Status: live reference deployment. The deployment scripts can refresh addresses from the current source if the final verification workflow requires exact latest-source bytecode matching.

## Core Addresses

Hook contract:

```text
0x86Ef9197Bde5Dd40352D0a58589b1772376B4080
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/address/0x86Ef9197Bde5Dd40352D0a58589b1772376B4080
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
0x57c6a64160f4f9fc82d32432ab6f242b52f28159e6ed882b024ebdf3ebf57bf1
```

Uniswap v4 pools live inside PoolManager storage and are identified by `PoolId`, not by a separate pool contract address.

## Demo Tokens

Token0:

```text
0x6213da9f111e2768fed4bf4875fa50001b7304ff
```

Token1:

```text
0xb23f8a79e29113dc41e41cc75261713e5ffb1f0e
```

## Transactions

Configure Hook policy:

```text
0xc18e335fe8d88c5d472485140dc9aeb667d91e981f543073916633711c4adac0
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/tx/0xc18e335fe8d88c5d472485140dc9aeb667d91e981f543073916633711c4adac0
```

Initialize v4 pool:

```text
0xaa1cb8472066987c4e5763faba214a69fe2450339abb340baef179ef71917a44
```

Explorer:

```text
https://www.okx.com/web3/explorer/xlayer/tx/0xaa1cb8472066987c4e5763faba214a69fe2450339abb340baef179ef71917a44
```

## RPC Verification

Verified on X Layer RPC:

- Hook code bytes: `8378`
- Token0 code bytes: `1880`
- Token1 code bytes: `1880`
- PoolManager code bytes: `24009`
- Configure transaction status: `success`
- Initialize transaction status: `success`

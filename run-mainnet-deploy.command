#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

echo "NarrativeGuard Hook - X Layer mainnet auto deploy"
echo ""

if [ ! -f ".env" ]; then
  echo "Missing .env."
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "Open .env, fill DEPLOYER_PRIVATE_KEY locally, then run this file again."
  echo "Do not paste the private key into chat."
  open -e .env
  echo ""
  read -k 1 "?Press any key to close..."
  exit 1
fi

if ! node --input-type=module -e 'import "dotenv/config"; const key = process.env.DEPLOYER_PRIVATE_KEY ?? ""; process.exit(/^0x[0-9a-fA-F]{64}$/.test(key.trim()) ? 0 : 1);'; then
  echo "DEPLOYER_PRIVATE_KEY is missing or malformed in .env."
  echo "Opening .env now. Fill it locally, save, then run this file again."
  echo "Do not paste the private key into chat."
  open -e .env
  echo ""
  read -k 1 "?Press any key to close..."
  exit 1
fi

echo "Running checks before mainnet deploy..."
npm run compile
npm test

echo ""
echo "Starting X Layer mainnet deployment..."
npm run auto:xlayer-mainnet-demo

echo ""
echo "Verifying public deployment..."
npm run verify:xlayer-mainnet

echo ""
echo "Done. Public deployment output:"
echo "deployments/xlayerMainnet.json"
echo ""

if [ -f "deployments/xlayerMainnet.json" ]; then
  cat deployments/xlayerMainnet.json
fi

echo ""
read -k 1 "?Press any key to close..."

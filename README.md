# Rockside Contracts

Rockside want to increase usage of your Blockchain applications. Like Stripe for online payment, Rockside is the platform for running custodial or non custodial Blockchain applications.

See full documentations [here](http://docs.rockside.io)

We use onchain identities and meta-transactions to simplify account and gas fee management.

This repository contains the contracts deployed by Rockside.

## Install

You need to install truffle as global

```
npm install -g truffle
```

And other dependencies

```
npm install
```

## Test

We have an unknown issue with `ganache-cli` (probably related to EIP712 signature), you must use [geth](https://geth.ethereum.org/docs/install-and-build/installing-geth) as blockchain

```
geth --dev --datadir temp --rpc
```

Run truffle test

```
truffle test
```

## License

Released under [GPL-3.0](LICENSE)

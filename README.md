# Rockside Contracts

Rockside want to increase usage of your Blockchain applications. Like Stripe for online payment, Rockside is the platform for running custodial or non custodial Blockchain applications.

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

Run truffle test

```
truffle test
```

You can choose the provider in `truffle-config.js`. Remove `development` to test with default ganache encapsulated by truffle.

You can test with a dev geth node by lanching it with

```
geth --dev --datadir temp --rpc console
```


## License

Released under [GPL-3.0](LICENSE)
# Contract

This repository contains the contract used Rockside.

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

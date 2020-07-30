# Rockside

Rockside relayer is a non-custodial transaction delivery service. When sending a transaction to Rockside, you provide:
  * the gas price limit which is the maximum price you want to apply to the transaction
  * a chosen speed of inclusion in the blockchain

We make sure your transaction is then executed at the best price in respect to the delay.

See full documentations [here](http://docs.rockside.io)

This repository contains the contracts deployed by Rockside.

## Smart Contracts

**[Forwarder](https://github.com/rocksideio/contracts/blob/master/contracts/Forwarder.sol)**

This contract is use to forward the meta-transaction to the destination contract.

It's responsible for:

*  Message signature validation: The Forwarder verifies that the signature corresponds to the signer and the parameters of the transaction.
* Check and update nonce: To avoid replay attacks, the forwarder verifies that the nonce was not already used. Once done, the current nonce is incremented.
* Call the destination contract: When all verifications are done, the destination contract is called with the parameters of the transactions.
* Refund Rockside relayer: An amount of ether corresponding to the gas consumed and the gas price used (limited by the gas price limit) is sent from the Forwarder to the Rockside Relayer.

Only the owner can transfer funds from the Forwarder contract.

By default forwarders only accept transactions coming from Rockside signers. Only the owner can modify the list of authorized senders.

**[Authorized relayers](https://github.com/rocksideio/contracts/blob/master/contracts/AuthorizedRelayers.sol)**

The forwarder accepts only authorized relayers. The list of authorized relayers is defined on this contract. The forwarder calls the method `verify` of this contract with `msg.sender` to authorize a forward.

**[Proxy](https://github.com/rocksideio/contracts/blob/master/contracts/Proxy.sol)**

Using Rockside API to deploy a forwarder, deploys a proxy contract that use our forwarder implementation. When interacting with a proxy forwarder, the storage of the proxy is used with the logic defined by the implementation.

Advatages are cheapest cost of deployment and upgradability.

**[Proxy factory](https://github.com/rocksideio/contracts/blob/master/contracts/ProxyFactory.sol)**

To deploy proxies forwarder we use this factory.

## Contract Addresses

|   |  Ropsten | Mainnet |
|---|---|---|
| **Forwarder implementation**| [0x16844Ebe125A0906ee0283189Df65e206A3aD943](https://ropsten.etherscan.io/address/0x16844Ebe125A0906ee0283189Df65e206A3aD943) | [0x16844Ebe125A0906ee0283189Df65e206A3aD943](https://etherscan.io/address/0x16844Ebe125A0906ee0283189Df65e206A3aD943) |
| **Authorized Relayer** | [0x3a456db4CF796F5b4B212D189153046823B4aA10](https://ropsten.etherscan.io/address/0x3a456db4CF796F5b4B212D189153046823B4aA10) | [0x3a456db4CF796F5b4B212D189153046823B4aA10](https://etherscan.io/address/0x3a456db4CF796F5b4B212D189153046823B4aA10)   |
| **Proxy Factory** | [0xecF5148B5bbC73721FBA44e461b5ab441Ac7694A](https://ropsten.etherscan.io/address/0xecF5148B5bbC73721FBA44e461b5ab441Ac7694A)  | [0xecF5148B5bbC73721FBA44e461b5ab441Ac7694A](https://etherscan.io/address/0xecF5148B5bbC73721FBA44e461b5ab441Ac7694A)) |


## Calling forward method on proxy forwarder

![Sequence](https://raw.githubusercontent.com/rocksideio/contracts/master/img/proxy-forwarder.png)

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

We have a known issue with `ganache-cli` `ecrecover` ([more details](https://docs.kaleido.io/faqs/why-ecrecover-fails/)), you must use [geth](https://geth.ethereum.org/docs/install-and-build/installing-geth) as blockchain

```
geth --dev --datadir temp --rpc
```

Run truffle test

```
truffle test
```

## License

Released under [GPL-3.0](LICENSE)

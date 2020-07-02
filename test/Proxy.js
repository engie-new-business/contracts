const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

const Proxy = artifacts.require("Proxy");
const ProxyFactory = artifacts.require("ProxyFactory");
const Forwarder = artifacts.require("Forwarder");
const ForwarderSmartWallet = artifacts.require("ForwarderSmartWallet");
const DummyForwarder = artifacts.require("DummyForwarder");
const Relayers = artifacts.require("Relayers");

contract('Proxy', (accounts) => {
  const RELAYER = accounts[0];
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  let EOAs = []

  let relayerContract;
  let forwarderSmartWalletContract
  let forwarderContract;
  let proxyFactoryContract;
  let dummyForwarderContract;

  before(async () => {
    for (var i = 0; i < 5; i++) {
      EOAs[i] = web3.eth.accounts.create();
    }
    Proxy.setWallet(web3.eth.accounts.wallet.add(EOAs[1]));

    relayerContract = await Relayers.new([RELAYER], { from: RELAYER });
    forwarderSmartWalletContract = await ForwarderSmartWallet.new(ZERO_ADDRESS, ZERO_ADDRESS, { from: RELAYER });
    forwarderContract = await Forwarder.new(ZERO_ADDRESS, [ZERO_ADDRESS], { from: RELAYER });
    proxyFactoryContract = await ProxyFactory.new({ from: RELAYER })
    dummyForwarderContract = await DummyForwarder.new(ZERO_ADDRESS, [ZERO_ADDRESS], { from: RELAYER });
  });

  describe('ProxyFactory', async () => {
    it('should have transfert the value to the proxy at creation with nonce', async () => {
      const res = await proxyFactoryContract.createProxyWithNonce(
        RELAYER, web3.utils.utf8ToHex("v0"), "0x0000000000000000000000000000000000000000", "0x", getRandomNonce(),
        { from: RELAYER, value: 1 }
      );
      let address
      for (var i = 0; i < res.logs.length; i++) {
        if (res.logs[i].event == 'ProxyCreation') {
          address = res.logs[i].args.proxy
        }
      }

      assert.equal(await web3.eth.getBalance(address), 1)
    });

    it('should have transfert the value to the proxy at creation', async () => {
      const res = await proxyFactoryContract.createProxy(
        RELAYER, web3.utils.utf8ToHex("v0"), "0x0000000000000000000000000000000000000000", "0x",
        { from: RELAYER, value: 1 }
      );
      let address
      for (var i = 0; i < res.logs.length; i++) {
        if (res.logs[i].event == 'ProxyCreation') {
          address = res.logs[i].args.proxy
        }
      }

      assert.equal(await web3.eth.getBalance(address), 1)
    });
  });

  describe('Forwarder', async () => {
    let proxyForwarder;
    let forwarder;
    let smartWallet;

    before(async () => {
      proxyForwarder = await deployProxy(EOAs[1].address, web3.utils.utf8ToHex("v0"), forwarderContract.address, forwarderContract.contract.methods.initialize(relayerContract.address, []).encodeABI(), { from: RELAYER });
      forwarder = await Forwarder.at(proxyForwarder.address)
      proxySmartWallet = await deployProxy(EOAs[1].address, web3.utils.utf8ToHex("v0"), forwarderSmartWalletContract.address, forwarderSmartWalletContract.contract.methods.initialize(forwarder.address).encodeABI(), { from: RELAYER });
      smartWallet = await ForwarderSmartWallet.at(proxySmartWallet.address)

      await web3.eth.sendTransaction({
        from: accounts[0],
        to: smartWallet.address,
        value: web3.utils.toWei('1', 'ether'),
      });
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: proxyForwarder.address,
        value: web3.utils.toWei('1', 'ether'),
      });
    });

    it('should have a version and implementation', async () => {
      assert.equal(web3.utils.hexToUtf8(await proxyForwarder.version()), "v0")
      assert.equal(await proxyForwarder.implementation(), forwarderContract.address)
    });

    it('should forward a meta tx to an smart wallet', async () => {
      const signer = EOAs[1];
      const metatx = {
        destination: '0x0000000000000000000000000000000000000000',
        value: 0,
        data: '0x',
        gasLimit: 0,
        gasPrice: 1,
        nonce: await getNonceForChannel(forwarder, signer.address, 0),
      };

      const hash = await forwarder.hashTxMessage(
        signer.address, metatx.destination, metatx.value, metatx.data, metatx.nonce
      );
      const signature = await signMetaTx(smartWallet.address, hash, signer);

      const res = await forwarder.forward(
        smartWallet.address, signature, signer.address,
        metatx.destination, metatx.value, metatx.data, metatx.gasPrice,
        metatx.nonce,
        { from: RELAYER }
      );
    });

    it('should change implementation', async () => {
      const signer = EOAs[1];

      let tx = await signer.signTransaction({
        from: signer.address,
        to: proxyForwarder.address,
        value: '0',
        gas: 300000,
        gasPrice: 0,
        data: await proxyForwarder.contract.methods.upgradeTo(web3.utils.utf8ToHex("v2"), dummyForwarderContract.address).encodeABI(),
      })

      try {
        await web3.eth.sendSignedTransaction(tx.rawTransaction)
        forwarder = await DummyForwarder.at(proxyForwarder.address)
        assert.equal(await forwarder.dummyFunction(), "dummy")
      } catch (e) {
        assert.fail("got know error")
      }
    })
  });

  const signMetaTx = async (verifyingContract, hash, signer) => {
    const chainID = await web3.eth.net.getId();
    const domain = {
      chainId: chainID,
      verifyingContract: verifyingContract,
    };

    const hashBuf = new Buffer(hash.substring(2), 'hex');
    const messageToSign = ethUtil.keccak256(
      Buffer.concat([
        Buffer.from('1901', 'hex'),
        structHash('EIP712Domain', domain),
        hashBuf,
      ])
    );

    const privateKey = new Buffer(signer.privateKey.substring(2), 'hex');
    const sig = await ethUtil.ecsign(messageToSign, privateKey);
    const signature = ethUtil.toRpcSig(sig.v, sig.r, sig.s);

    return signature;
  }

  const getNonceForChannel = async (implementation, signer, channel) => {
    const channelNonce = await implementation.channels(signer, channel)

    const nonceValue = BigInt(channelNonce) + (BigInt(channel) * (2n ** 128n));
    return '0x' + nonceValue.toString(16)
  }

  const deployProxy = async (owner, version, implementation, data) => {
    const res = await proxyFactoryContract.createProxyWithNonce(owner, version, implementation, data, getRandomNonce(), { from: RELAYER });
    let address
    for (var i = 0; i < res.logs.length; i++) {
      if (res.logs[i].event == 'ProxyCreation') {
        address = res.logs[i].args.proxy
      }
    }
    return await Proxy.at(address)
  }
});

const types = {
  EIP712Domain: [
    { type: "address", name: "verifyingContract" },
    { type: "uint256", name: "chainId" }
  ]
};

// Recursively finds all the dependencies of a type
function dependencies(primaryType, found = []) {
    if (found.includes(primaryType)) {
        return found;
    }
    if (types[primaryType] === undefined) {
        return found;
    }
    found.push(primaryType);
    for (let field of types[primaryType]) {
        for (let dep of dependencies(field.type, found)) {
            if (!found.includes(dep)) {
                found.push(dep);
            }
        }
    }
    return found;
}

function encodeType(primaryType) {
    // Get dependencies primary first, then alphabetical
    let deps = dependencies(primaryType);
    deps = deps.filter(t => t != primaryType);
    deps = [primaryType].concat(deps.sort());
    // Format as a string with fields
    let result = '';
    for (let type of deps) {
        result += `${type}(${types[type].map(({ name, type }) => `${type} ${name}`).join(',')})`;
    }
    return result;
}

function typeHash(primaryType) {
    return ethUtil.keccak256(encodeType(primaryType));
}

function encodeData(primaryType, data) {
    let encTypes = [];
    let encValues = [];
    // Add typehash
    encTypes.push('bytes32');
    encValues.push(typeHash(primaryType));
    // Add field contents
    for (let field of types[primaryType]) {
        let value = data[field.name];
        if (field.type == 'string' || field.type == 'bytes') {
            encTypes.push('bytes32');
            value = ethUtil.keccak256(value);
            encValues.push(value);
        } else if (types[field.type] !== undefined) {
            encTypes.push('bytes32');
            value = ethUtil.keccak256(encodeData(field.type, value));
            encValues.push(value);
        } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
            throw 'TODO: Arrays currently unimplemented in encodeData';
        } else {
            encTypes.push(field.type);
            encValues.push(value);
        }
    }
    return abi.rawEncode(encTypes, encValues);
}

function structHash(primaryType, data) {
    return ethUtil.keccak256(encodeData(primaryType, data));
}

function getRandomNonce() {
  const channel = Math.ceil(Math.random() * 1000000);
  const nonce = BigInt(channel) * 2n**218n;
  return '0x' + nonce.toString(16);
}

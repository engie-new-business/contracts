const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

const RelayableIdentity = artifacts.require("RelayableIdentity");
const Proxy = artifacts.require("Proxy");
const ProxyFactory = artifacts.require("ProxyFactory");
const RelayableIdentityWihtoutPayement = artifacts.require("RelayableIdentityWihtoutPayement");
const Forwarder = artifacts.require("Forwarder");
const Relayers = artifacts.require("Relayers");

contract('Proxy', (accounts) => {
  const RELAYER = accounts[0];

  let EOAs = []
  let relayableIdentityContract;
  let relayableIdentityWihtoutPayementContract;
  let forwarderContract;
  let proxyFactoryContract;
  let proxy;

  before(async () => {
    for (var i = 0; i < 5; i++) {
      EOAs[i] = web3.eth.accounts.create();
    }
    relayableIdentityContract = await RelayableIdentity.new(EOAs[0].address, { from: RELAYER });
    relayableIdentityWihtoutPayementContract = await RelayableIdentityWihtoutPayement.new(EOAs[0].address, { from: RELAYER });
    relayerContract = await Relayers.new([RELAYER], { from: RELAYER });
    forwarderContract = await Forwarder.new(relayerContract.address, { from: RELAYER });
    proxyFactoryContract = await ProxyFactory.new({ from: RELAYER })
  });

  describe('RelayableIdentity', async () => {
    before(async () => {
      proxy = await deployProxy(EOAs[1].address, "v0", relayableIdentityContract.address, relayableIdentityContract.contract.methods.initialize().encodeABI())
      proxy.identity = await RelayableIdentity.at(proxy.address);

      await web3.eth.sendTransaction({
        from: accounts[0],
        to: proxy.address,
        value: web3.utils.toWei('1', 'ether'),
      });
    });

    it('should have good whitelist', async () => {
      assert.isFalse(await relayableIdentityContract.owners(EOAs[1].address))
      assert.isTrue(await proxy.identity.owners(EOAs[1].address))
      assert.isTrue(await proxy.owners(EOAs[1].address))
    });

    it('should relay metatx', async () => {
      const signer = EOAs[1];

      const metatx = {
        destination: '0x0000000000000000000000000000000000000000',
        value: 0,
        data: '0x',
        gasLimit: 0,
        gasPrice: 1,
        nonce: await getNonceForChannel(proxy.identity, signer.address, 0),
      };

      const hash = await proxy.identity.hashTxMessage(
        RELAYER, signer.address, metatx.destination, metatx.value, metatx.data, metatx.gasLimit, metatx.gasPrice, metatx.nonce
      );

      const signature = await signMetaTx(proxy.identity.address, hash, signer);

      const res = await proxy.identity.relayExecute(
        signature, RELAYER, signer.address,
        metatx.destination, metatx.value, metatx.data, metatx.gasLimit, metatx.gasPrice,
        metatx.nonce,
        { from: RELAYER }
      );

      assert.equal(await getNonceForChannel(proxy.identity, signer.address, 0), 1)
    });

    it('should be able to change implementation', async () => {
      const signer = EOAs[1];
      const metatx = {
        destination: proxy.address,
        value: 0,
        data: proxy.contract.methods.upgradeTo("v2", relayableIdentityWihtoutPayementContract.address).encodeABI(),
        gasLimit: 0,
        gasPrice: 1,
        nonce: await getNonceForChannel(proxy.identity, signer.address, 0),
      };

      const hash = await proxy.identity.hashTxMessage(
        RELAYER, signer.address, metatx.destination, metatx.value, metatx.data, metatx.gasLimit, metatx.gasPrice, metatx.nonce
      );

      const signature = await signMetaTx(proxy.identity.address, hash, signer);

      const res = await proxy.identity.relayExecute(
        signature, RELAYER, signer.address,
        metatx.destination, metatx.value, metatx.data, metatx.gasLimit, metatx.gasPrice,
        metatx.nonce,
        { from: RELAYER }
      );

      proxy.identity = await RelayableIdentityWihtoutPayement.at(proxy.address)
      assert.equal(await getNonceForChannel(proxy.identity, signer.address, 0), 2)
    })

    it('should make transaction withn new implementation', async () => {
      const signer = EOAs[1];

      const metatx = {
        destination: '0x0000000000000000000000000000000000000000',
        value: 0,
        data: '0x',
        nonce: await getNonceForChannel(proxy.identity, signer.address, 0),
      };

      const hash = await proxy.identity.hashTxMessage(
        RELAYER, signer.address, metatx.destination, metatx.value, metatx.data, metatx.nonce
      );

      const signature = await signMetaTx(proxy.identity.address, hash, signer);

      const res = await proxy.identity.relayExecute(
        signature, RELAYER, signer.address,
        metatx.destination, metatx.value, metatx.data,
        metatx.nonce,
        { from: RELAYER }
      );
      assert.equal(await getNonceForChannel(proxy.identity, signer.address, 0), 3)
    });
  });

  describe('Forwarder', async () => {
    before(async () => {
      proxy = await deployProxy(EOAs[1].address, "v0", forwarderContract.address, forwarderContract.contract.methods.initialize(relayerContract.address).encodeABI(), { from: RELAYER });
      proxy.forwarder = await Forwarder.at(proxy.address)

      await web3.eth.sendTransaction({
        from: accounts[0],
        to: relayableIdentityContract.address,
        value: web3.utils.toWei('1', 'ether'),
      });
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: proxy.address,
        value: web3.utils.toWei('1', 'ether'),
      });
    });

    it('should forward a meta tx to an identity', async () => {
      const signer = EOAs[0];
      const metatx = {
        destination: '0x0000000000000000000000000000000000000000',
        value: 0,
        data: '0x',
        gasLimit: 0,
        gasPrice: 1,
        nonce: await getNonceForChannel(relayableIdentityContract, signer.address, 0),
      };

      const hash = await relayableIdentityContract.hashTxMessage(
        RELAYER, signer.address, metatx.destination, metatx.value, metatx.data, metatx.gasLimit, metatx.gasPrice, metatx.nonce
      );
      const signature = await signMetaTx(relayableIdentityContract.address, hash, signer);

      const res = await proxy.forwarder.forward(
        relayableIdentityContract.address, signature, RELAYER, signer.address,
        metatx.destination, metatx.value, metatx.data, metatx.gasLimit, metatx.gasPrice,
        metatx.nonce,
        { from: RELAYER }
      );
    });
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

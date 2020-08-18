const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

const AuthorizedRelayers = artifacts.require("AuthorizedRelayers");
const Forwarder = artifacts.require("Forwarder");
const SmartWallet = artifacts.require("SmartWallet");

contract('Forwarder contract', (accounts) => {
  const RELAYER = accounts[0];

  let EOAs = []
  let smartWalletContract;
  let forwarderContract;

  before(async () => {
    for (var i = 0; i < 5; i++) {
      EOAs[i] = web3.eth.accounts.create();
    }
    authorizedRelayersContract = await AuthorizedRelayers.new([RELAYER], { from: RELAYER });
    forwarderContract = await Forwarder.new(authorizedRelayersContract.address, [], { from: RELAYER });
    smartWalletContract = await SmartWallet.new(EOAs[0].address, forwarderContract.address, { from: RELAYER });

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: smartWalletContract.address,
      value: web3.utils.toWei('1', 'ether'),
    });
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: forwarderContract.address,
      value: web3.utils.toWei('1', 'ether'),
    });
  });

  it('should forward a meta tx to a smartwallet', async () => {
    const signer = EOAs[0];

    const metatx = {
      destination: smartWalletContract.address,
      data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
      gasPrice: 1,
      nonce: await getNonceForChannel(signer.address, 0),
    };

    const signature = await signMetaTx({
      ...metatx,
      signer,
      relayer: RELAYER,
    });

    /* FIXME: this will always revert. We need to retrieve the return data
    const estimation = await forwarderContract.contract.methods.estimateForward(
      signature, signer.address, metatx.destination,
      metatx.data, metatx.gasPrice,
      metatx.nonce
    ).estimateGas({ from: forwarderContract.address, gasPrice: 1 })
    */

    const res = await forwarderContract.forward(
      signature, signer.address, metatx.destination,
      metatx.data, metatx.gasPrice,
      metatx.nonce,
      { from: RELAYER }
    );
  });

  it.skip('should estimate meta tx with invalid nonce', async () => {
    const signer = EOAs[0];

    const futurMetatx = {
      destination: smartWalletContract.address,
      data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
      gasPrice: 1,
      nonce: '0x' + (new Number(await getNonceForChannel(signer.address, 0)) + 1).toString(16),
    };

    const futurSignature = await signMetaTx({
      ...futurMetatx,
      signer,
      relayer: RELAYER,
    });

    const estimation = await forwarderContract.contract.methods.estimateForward(
      futurSignature, signer.address, futurMetatx.destination,
      futurMetatx.data, futurMetatx.gasPrice,
      futurMetatx.nonce
    ).estimateGas({ from: forwarderContract.address, gasPrice: 10 })

    const metatx = {
      destination: smartWalletContract.address,
      data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
      gasPrice: 1,
      nonce: await getNonceForChannel(signer.address, 0),
    };

    const signature = await signMetaTx({
      ...metatx,
      signer,
      relayer: RELAYER,
    });

    const res1 = await forwarderContract.forward(
      signature, signer.address, metatx.destination,
      metatx.data, metatx.gasPrice,
      metatx.nonce,
      { from: RELAYER }
    );

    const res2 = await forwarderContract.forward(
      futurSignature, signer.address, futurMetatx.destination,
      futurMetatx.data, futurMetatx.gasPrice,
      futurMetatx.nonce,
      { from: RELAYER }
    );

    assert.ok(estimation + 10000 > res2.receipt.cumulativeGasUsed);
  });

  it('should not allow to forward a meta tx to a smart wallet that is not owned by the signer', async () => {
    const signer = EOAs[1];

    const metatx = {
      destination: smartWalletContract.address,
      data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
      gasPrice: 1,
      nonce: await getNonceForChannel(signer.address, 0),
    };

    const signature = await signMetaTx({
      ...metatx,
      signer,
      relayer: RELAYER,
    });

    try {
      await forwarderContract.forward(
        signature, signer.address, metatx.destination,
        metatx.data, metatx.gasPrice,
        metatx.nonce,
        { from: RELAYER }
      );
      assert.isTrue(false);
    } catch (e) {
      if (e.reason != undefined) {
        assert.equal('Account not an owner', e.reason);
      } else {
        assert.include(e.message, 'exited with an error (status 0)');
      }
    }
  });


  it('should not allow invalid destination', async () => {
    const forwarderContract = await Forwarder.new(authorizedRelayersContract.address, ['0x0000000000000000000000000000000000000001'], { from: RELAYER });
    const signer = EOAs[0];

    const metatx = {
      destination: smartWalletContract.address,
      data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
      gasPrice: 1,
      nonce: await getNonceForChannel(signer.address, 0),
    };

    const signature = await signMetaTx({
      ...metatx,
      signer,
      relayer: RELAYER,
    });

    try {
      const res = await forwarderContract.forward(
        signature, signer.address,
        metatx.destination, metatx.data, metatx.gasPrice, metatx.nonce,
        { from: RELAYER }
      );
      assert.isTrue(false);
    } catch (e) {
      if (e.reason != undefined) {
        assert.equal('Unauthorized destination', e.reason);
      } else {
        assert.include(e.message, 'exited with an error (status 0)');
      }
    }
  });

  const buildSmartWalletData = ({ destination, value, data }) =>
      abi.rawEncode(['address', 'uint256', 'bytes'], destination, value, data);

  const signMetaTx = async ({ signer, destination, value, data, nonce }) => {
    const hash = await forwarderContract.hashTxMessage(
      signer.address, destination, data, nonce
    );

    const chainID = await web3.eth.net.getId();
    const domain = {
      chainId: chainID,
      verifyingContract: forwarderContract.address,
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

  const getNonceForChannel = async (signer, channel) => {
    const channelNonce = await forwarderContract.channels(signer, channel)

    const nonceValue = BigInt(channelNonce) + (BigInt(channel) * (2n ** 128n));
    return '0x' + nonceValue.toString(16)
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

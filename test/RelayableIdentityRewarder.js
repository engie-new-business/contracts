const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const ethTypedData = require('eth-typed-data');
const RelayableIdentityRewarder = artifacts.require("RelayableIdentity");
const LogSomething = artifacts.require("LogSomething");
const ERC20 = artifacts.require("DummyERC20");

// web3 injected by truffle

contract('RelayableIdentityRewarder contract', (accounts) => {
  let RelayableIdentityRewarderContract
  let LogSomethingContract

  const RELAYER = accounts[0];
  const MAXGAS = 6283185;

  let EOAs = []

  before(async () => {
    for (var i = 0; i < 5; i++) {
      EOAs[i] = web3.eth.accounts.create();
    }
    RelayableIdentityRewarderContract = await RelayableIdentityRewarder.new(EOAs[0].address, {
      from: RELAYER
    });
    LogSomethingContract = await LogSomething.new({
      from: RELAYER
    });
    await web3.eth.sendTransaction({
      from: (await web3.eth.getAccounts())[0],
      to:RelayableIdentityRewarderContract.address, value:web3.utils.toWei('1', 'ether')
    })
  });

  it('EOAs[0] should be whitelisted', async () => {
    let res = await RelayableIdentityRewarderContract.whitelist(EOAs[0].address)
    assert.isTrue(res)
  });

  it('first relay should pass with 100 000 gas', async () => {
    let res = await dumbRelayTransaction(EOAs[0])

    let gasPrice = (await web3.eth.getTransaction(res.receipt.tx)).gasPrice
    assert.isAbove(res.gasUsed, 50000)
    assert.isBelow(res.gasUsed, 100000)
    assert.isTrue(res.relayed)
    assert.isAbove(res.paymentGas, res.gasUsed)
  });

  it('second relay should pass with 50 000 gas', async () => {
    let res = await dumbRelayTransaction(EOAs[0])
    let gasPrice = (await web3.eth.getTransaction(res.receipt.tx)).gasPrice

    assert.isBelow(res.gasUsed, 70000)
    assert.isTrue(res.relayed)
    assert.isAbove(res.paymentGas, res.gasUsed)
  });

  it('should whitelist EOAs[1]', async () => {
    await addToWhiteList(EOAs[1].address)
    assert.isTrue(await RelayableIdentityRewarderContract.whitelist(EOAs[1].address))
  });

  it('first relay with new whitelisted should pass with 100 000 gas', async () => {
    let res = await dumbRelayTransaction(EOAs[1])

    assert.isAbove(res.gasUsed, 50000)
    assert.isBelow(res.gasUsed, 100000)
    assert.isTrue(res.relayed)
    assert.isAbove(res.paymentGas, res.gasUsed)
  });

  it('should order transactions inside the same batch', async () => {
    const signer = EOAs[0];
    await addToWhiteList(signer.address)


    const nonce = 100n;

    const sendTx = async (batchNonce) => {
      const nonceValue = BigInt(batchNonce) + (nonce * (2n ** 128n));

      return await relayTransaction(
        signer,
        RelayableIdentityRewarderContract.address,
        0,
        '0x',
        0,
        1,
        100000,
        '0x' + nonceValue.toString(16)
      )
    }
    let res = await sendTx(0);
    assert.isTrue(res.relayed)
    let didCatch = false;
    try {
      res = await sendTx(2);
    } catch (err) {
      didCatch = true
    }
    assert.isTrue(didCatch);
    res = await sendTx(1);
    assert.isTrue(res.relayed)
    res = await sendTx(2);
    assert.isTrue(res.relayed)
  });

  it('we should estimate the gas properly', async () => {
    const signer = EOAs[2]
    await addToWhiteList(signer.address)
    const destination = LogSomethingContract.address
    const value = 0

    for (var i = 0; i <= 2; i = i + 1) {
      const data = await dataForLogSomething(Array(i).fill(randomBytes32()))

      let gas = 40000 + 21000 // for our deterministic code + 21 000 for tx
      gas += 15000 // for our safe exit
      let hashGas = await estimatedGasForHash(signer, destination, value, data, 100000, 1, getRandomNonce()) - 21000 // for hash calculation
      let internalGas = await estimatedGasInternal(destination, value, data) - 21000 // for internal

      gas = gas + hashGas + internalGas
      let res = await relayTransaction(signer, destination, value, data, 0, 1, gas, getRandomNonce())
      assert.isTrue(res.relayed)
      assert.isAbove(res.paymentGas, res.gasUsed)
    }
  });

  it('should be possible to add address to whitelist with metatx', async () => {
    const signer = EOAs[0]
    const newWL = EOAs[4]

    let whitelisted = await RelayableIdentityRewarderContract.whitelist(signer.address)
    assert.isTrue(whitelisted)
    whitelisted = await RelayableIdentityRewarderContract.whitelist(newWL.address)
    assert.isFalse(whitelisted)

    let res = await relayTransaction(
      signer,
      RelayableIdentityRewarderContract.address,
      0,
      await RelayableIdentityRewarderContract.contract.methods.updateWhitelist(newWL.address, true).encodeABI(),
      0,
      1,
      MAXGAS,
      getRandomNonce(),
    )
    assert.isTrue(res.relayed)

    whitelisted = await RelayableIdentityRewarderContract.whitelist(newWL.address)
    assert.isTrue(whitelisted)
    assert.isAbove(res.paymentGas, res.gasUsed)
  });


  it('should deploy a contract', async () => {
    const signer = EOAs[0]

    let res = await relayDeployTransaction(signer, 0, web3.utils.fromAscii("salt"), ERC20.bytecode, 0, 1, getRandomNonce())
    assert.isAbove(res.paymentGas, res.gasUsed)
  });

  describe('batch', async () => {
    const buildCall = ({ to, value, data }) => {
      return [to, value, data];
    };

    it('should relay a batch call', async () => {
      const signer = EOAs[0]

      const data = [];
      const destination = '0x0000000000000000000000000000000000000000';
      const firstCall = buildCall({ to: destination, value: 0, data });
      const secondCall = buildCall({ to: destination, value: 0, data });

      const res = await relayTransaction(
        signer,
        RelayableIdentityRewarderContract.address,
        0,
        await RelayableIdentityRewarderContract.contract.methods.batch([firstCall, secondCall]).encodeABI(),
        0,
        1,
        MAXGAS,
        getRandomNonce(),
      )

      assert.isTrue(res.relayed)
    });

    it('it should fail relay if one of the transaction fails', async () => {
      const signer = EOAs[0]

      const data = [];
      const destination = '0x0000000000000000000000000000000000000000';
      const tooMuchEther = getRandomNonce()
      const firstCall = buildCall({ to: destination, value: tooMuchEther, data });
      const secondCall = buildCall({ to: destination, value: 0, data });

      const res = await relayTransaction(
        signer,
        RelayableIdentityRewarderContract.address,
        0,
        await RelayableIdentityRewarderContract.contract.methods.batch([firstCall, secondCall]).encodeABI(),
        0,
        1,
        MAXGAS,
        getRandomNonce(),
      )

      assert.isFalse(res.relayed)
    })

  });

  function randomBytes32() {
    var result = '';
    var characters = '1234567890abcdef';
    var charactersLength = characters.length;
    for (var i = 0; i < 64; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return '0x' + result;
  }

  async function dataForLogSomething(data) {
    return await LogSomethingContract.contract.methods.logThis(data).encodeABI()
  }

  async function dataForDoDumbStuff(data) {
    return await LogSomethingContract.contract.methods.doDumbStuff(data).encodeABI()
  }

  async function dumbRelayTransaction(signer) {
    return await relayTransaction(signer, '0x0000000000000000000000000000000000000000', 0, '0x', 0, 1, 0, getRandomNonce())
  }

  function getRandomNonce() {
    const channel = Math.ceil(Math.random() * 1000000);
    const nonce = BigInt(channel) * 2n**218n;
    return '0x' + nonce.toString(16);
  }

  async function estimatedGasInternal(destination, value, data) {
    return await web3.eth.estimateGas({
      from: RelayableIdentityRewarderContract.address,
      to: destination,
      value: value,
      data: data,
    })
  }
  async function estimatedGasForHash(signer, destination, value, data, gasLimit, gasPrice, nonce) {
    return await RelayableIdentityRewarderContract.contract.methods.hashTxMessage(signer.address, destination, value, data, gasLimit, gasPrice, nonce).estimateGas()
  }

  async function relayTransaction(signer, destination, value, data, gasLimit, gasPrice, gas, nonce) {
    let relayed = false
    let payment = 0
    let message = await RelayableIdentityRewarderContract.hashTxMessage(signer.address, destination, value, data, gasLimit, gasPrice, nonce)

    const chainID = await web3.eth.net.getId();
    const domain = {
      chainId: chainID,
      verifyingContract: RelayableIdentityRewarderContract.address,
    };

    const hashBuf = new Buffer(message.substring(2), 'hex');
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

    let res = await RelayableIdentityRewarderContract.relayExecute(signature, signer.address, destination, value, data, gasLimit, gasPrice, nonce, {
      from: RELAYER,
      gas: gas,
      gasPrice: gasPrice
    })
    let paymentBN
    for (var i = 0; i < res.logs.length; i++) {
      if (res.logs[i].event == 'RelayedExecute') {
        relayed = res.logs[i].args.success
        paymentBN = res.logs[i].args.payment
      }
    }
    let actualGasPrice = (await web3.eth.getTransaction(res.tx)).gasPrice
    payment = paymentBN.div(new web3.utils.BN(actualGasPrice))
    let result = {
      relayed: relayed,
      payment: paymentBN.toString(10),
      paymentGas: payment.toNumber(10),
      gasPrice: actualGasPrice,
      gasUsed: res.receipt.gasUsed,
      receipt: res,
    }

    return result
  }

  async function relayDeployTransaction(signer, value, salt, initCode, gasLimit, gasPrice, nonce) {
    let address = false
    let payment = 0
    let message = await RelayableIdentityRewarderContract.hashCreateMessage(signer.address, value, salt, initCode, gasLimit, gasPrice, nonce)

    const chainID = await web3.eth.net.getId();
    const domain = {
      chainId: chainID,
      verifyingContract: RelayableIdentityRewarderContract.address,
    };

    const hashBuf = new Buffer(message.substring(2), 'hex');
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

    let res = await RelayableIdentityRewarderContract.relayDeploy(signature, signer.address, value, salt, initCode, gasLimit, gasPrice, nonce, {
      from: RELAYER,
    })
    let paymentBN
    for (var i = 0; i < res.logs.length; i++) {
      if (res.logs[i].event == 'RelayedDeploy') {
        address = res.logs[i].args.contractAddress
        paymentBN = res.logs[i].args.payment
      }
    }
    let actualGasPrice = (await web3.eth.getTransaction(res.tx)).gasPrice
    payment = paymentBN.div(new web3.utils.BN(actualGasPrice))
    let result = {
      address: address,
      payment: paymentBN.toString(10),
      paymentGas: payment.toNumber(10),
      gasPrice: actualGasPrice,
      gasUsed: res.receipt.gasUsed,
      receipt: res,
    }

    return result
  }

  async function addToWhiteList(address) {
    let signer = EOAs[0]
    let data = RelayableIdentityRewarderContract.contract.methods.updateWhitelist(address, true).encodeABI()
    let res = await signer.signTransaction({
      to: RelayableIdentityRewarderContract.address,
      value: '0',
      gas: 200000,
      gasPrice: 0,
      data: data
    })
    await web3.eth.sendSignedTransaction(res.rawTransaction)
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

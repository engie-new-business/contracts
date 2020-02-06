const RelayableIdentity = artifacts.require("RelayableIdentity");
const LogSomething = artifacts.require("LogSomething");

// web3 injected by truffle

contract('RelayableIdentity contract', (accounts) => {
  let RelayableIdentityContract
  let LogSomethingContract

  const RELAYER = accounts[0];

  let EOAs = []

  before(async () => {
    for (var i = 0; i < 5; i++) {
      EOAs[i] = web3.eth.accounts.create();
    }
    RelayableIdentityContract = await RelayableIdentity.new(EOAs[0].address, {
      from: RELAYER
    });
    LogSomethingContract = await LogSomething.new({
      from: RELAYER
    });
  });

  it('EOAs[0] should be whitelisted', async () => {
    let res = await RelayableIdentityContract.whitelist(EOAs[0].address)
    assert.isTrue(res)
  });

  it('first relay should pass with 60 000 gas', async () => {
    let res = await dumbRelayTransaction(EOAs[0])

    assert.isAbove(res.gasUsed, 50000)
    assert.isBelow(res.gasUsed, 60000)
    assert.isTrue(res.relayed)
    console.log('consumed : ' + res.gasUsed);
  });

  it('second relay should pass with 50 000 gas', async () => {
    let res = await dumbRelayTransaction(EOAs[0])

    assert.isBelow(res.gasUsed, 50000)
    assert.isTrue(res.relayed)
    console.log('consumed : ' + res.gasUsed);
  });

  it('should whitelist EOAs[1]', async () => {
    await addToWhiteList(EOAs[1].address)
    assert.isTrue(await RelayableIdentityContract.whitelist(EOAs[1].address))
  });

  it('first relay with new whitelisted should pass with 60 000 gas', async () => {
    let res = await dumbRelayTransaction(EOAs[1])

    assert.isAbove(res.gasUsed, 50000)
    assert.isBelow(res.gasUsed, 60000)
    assert.isTrue(res.relayed)
    console.log('consumed : ' + res.gasUsed);
  });

  it('we should estimate the gas properly', async () => {
    const signer = EOAs[2]
    await addToWhiteList(signer.address)
    const destination = LogSomethingContract.address
    const value = 0
    let dumbData = "0x1c1d1e1f0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"

    for (var i = 0; i <= 20; i = i + 1) {
      const data = await dataForLogSomething(Array(i * 5).fill(randomBytes32()))

      let gas = 40000 // for our deterministic code + 21 000 for tx
      if (await getNonce(signer.address) == 0) {
        gas += 20000 // for mapping entry creation, around 15000
      }
      gas += 5000 // for our safe exit
      let hashGas = await estimatedGasForHash(signer, destination, value, data) - 21000 // for hash calculation
      let internalGas = await estimatedGasInternal(destination, value, data) - 21000 // for internal

      gas = gas + hashGas + internalGas

      let res = await relayTransaction(signer, destination, value, data, gas)
      assert.isTrue(res.relayed)
    }
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

  async function getNonce(address) {
    return await RelayableIdentityContract.relayNonce(address)
  }

  async function dumbRelayTransaction(signer) {
    return await relayTransaction(signer, '0x0000000000000000000000000000000000000000', 0, '0x', 0)
  }

  async function estimatedGasInternal(destination, value, data) {
    return await web3.eth.estimateGas({
      from: RelayableIdentityContract.address,
      to: destination,
      value: value,
      data: data,
    })
  }
  async function estimatedGasForHash(signer, destination, value, data) {
    return await RelayableIdentityContract.contract.methods.hashTxMessage(signer.address, destination, value, data).estimateGas()
  }

  async function relayTransaction(signer, destination, value, data, gas) {
    let relayed = false
    let message = await RelayableIdentityContract.hashTxMessage(signer.address, destination, value, data)

    const sig = await signer.sign(message);

    let res = await RelayableIdentityContract.relayExecute(sig.signature, signer.address, destination, value, data, {
      from: RELAYER,
      gas: gas
    })
    for (var i = 0; i < res.logs.length; i++) {
      if (res.logs[i].event == 'RelayedExecute') {
        relayed = res.logs[i].args.success
      }
    }
    let result = {
      relayed: relayed,
      gasUsed: res.receipt.gasUsed,
    }

    return result
  }

  async function addToWhiteList(address) {
    let signer = EOAs[0]
    let data = RelayableIdentityContract.contract.methods.updateWhitelist(address, true).encodeABI()
    let res = await signer.signTransaction({
      to: RelayableIdentityContract.address,
      value: '0',
      gas: 200000,
      gasPrice: 0,
      data: data
    })
    await web3.eth.sendSignedTransaction(res.rawTransaction)
  }
});

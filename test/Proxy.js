const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const { structHash } = require('./eip712.js');

const Proxy = artifacts.require("Proxy");
const ProxyFactory = artifacts.require("ProxyFactory");
const Forwarder = artifacts.require("Forwarder");
const SmartWallet = artifacts.require("SmartWallet");
const DummyForwarder = artifacts.require("DummyForwarder");
const AuthorizedRelayers = artifacts.require("AuthorizedRelayers");

contract('Proxy', (accounts) => {
  const RELAYER = accounts[0];
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  let EOAs = []

  let authorizedRelayersContract;
  let smartWalletContract
  let forwarderContract;
  let proxyFactoryContract;
  let dummyForwarderContract;

  before(async () => {
    for (var i = 0; i < 5; i++) {
      EOAs[i] = web3.eth.accounts.create();
    }
    Proxy.setWallet(web3.eth.accounts.wallet.add(EOAs[1]));

    authorizedRelayersContract = await AuthorizedRelayers.new([RELAYER], { from: RELAYER });
    smartWalletContract = await SmartWallet.new(ZERO_ADDRESS, ZERO_ADDRESS, { from: RELAYER });
    forwarderContract = await Forwarder.new(ZERO_ADDRESS, [ZERO_ADDRESS], { from: RELAYER });
    proxyFactoryContract = await ProxyFactory.new({ from: RELAYER })
    dummyForwarderContract = await DummyForwarder.new(ZERO_ADDRESS, [ZERO_ADDRESS], { from: RELAYER });
  });

  describe('ProxyFactory', async () => {
    it('should have transfert the value to the proxy at creation with nonce', async () => {
      const res = await proxyFactoryContract.createProxyWithNonce(
        "0x0000000000000000000000000000000000000000", "0x", getRandomNonce(),
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
        "0x0000000000000000000000000000000000000000", "0x",
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

    beforeEach(async () => {
      proxyForwarder = await deployProxy(forwarderContract.address, forwarderContract.contract.methods.initialize(EOAs[1].address, authorizedRelayersContract.address, []).encodeABI(), { from: RELAYER });
      forwarder = await Forwarder.at(proxyForwarder.address)
      proxySmartWallet = await deployProxy(smartWalletContract.address, smartWalletContract.contract.methods.initialize(EOAs[1].address, forwarder.address).encodeABI(), { from: RELAYER });
      smartWallet = await SmartWallet.at(proxySmartWallet.address)

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

    it('should have an implementation', async () => {
      assert.equal(await proxyForwarder.implementation(), forwarderContract.address)
    });

    it('should forward a meta tx to an smart wallet', async () => {
      const signer = EOAs[1];
      const metatx = {
        to: proxySmartWallet.address,
        data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
        gasLimit: 0,
        gasPrice: 1,
        nonce: await getNonceForChannel(forwarder, signer.address, 0),
      };

      const hash = await forwarder.hashTxMessage(
        signer.address, metatx.to, metatx.data, metatx.nonce
      );
      const signature = await signMetaTx(forwarder.address, hash, signer);

      const res = await forwarder.forward(
        signature, signer.address,
        metatx.to, metatx.data, metatx.gasPrice,
        metatx.nonce,
        { from: RELAYER }
      );
    });

    it('should not be possible to send transaction to estimateForward', async () => {
      const signer = EOAs[1];
      const metatx = {
        to: proxySmartWallet.address,
        data: smartWalletContract.contract.methods.execute('0x0000000000000000000000000000000000000000', '0x0', '0x').encodeABI(),
        gasLimit: 0,
        gasPrice: 1,
        nonce: await getNonceForChannel(forwarder, signer.address, 0),
      };

      const hash = await forwarder.hashTxMessage(
        signer.address, metatx.to, metatx.data, metatx.nonce
      );
      const signature = await signMetaTx(forwarder.address, hash, signer);

      try {
        const res = await forwarder.estimateForward(
          signature, signer.address,
          metatx.to, metatx.data, metatx.gasPrice,
          metatx.nonce,
          { from: RELAYER }
        );
        assert.ok(false);
      } catch (e) {
        assert.ok(true);
      }
    });

    it('should change implementation', async () => {
      const signer = EOAs[1];

      let tx = await signer.signTransaction({
        from: signer.address,
        to: proxyForwarder.address,
        value: 0,
        gas: 300000,
        gasPrice: 0,
        data: await forwarder.contract.methods.upgradeTo(dummyForwarderContract.address).encodeABI(),
      })

      const result = await web3.eth.sendSignedTransaction(tx.rawTransaction)

      forwarder = await DummyForwarder.at(proxyForwarder.address)
      assert.equal(await forwarder.implementation(), dummyForwarderContract.address)
      assert.equal(await forwarder.dummyFunction(), "dummy")
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

  const deployProxy = async (implementation, data) => {
    const res = await proxyFactoryContract.createProxyWithNonce(implementation, data, getRandomNonce(), { from: RELAYER });
    let address
    for (var i = 0; i < res.logs.length; i++) {
      if (res.logs[i].event == 'ProxyCreation') {
        address = res.logs[i].args.proxy
      }
    }
    return await Proxy.at(address)
  }
});

function getRandomNonce() {
  const channel = Math.ceil(Math.random() * 1000000);
  const nonce = BigInt(channel) * 2n**218n;
  return '0x' + nonce.toString(16);
}

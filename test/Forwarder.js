const { assertRevertWith } = require('./utils');
const { signMetaTx, getNonce } = require('./metatx');

const AuthorizedRelayers = artifacts.require("AuthorizedRelayers");
const Forwarder = artifacts.require("Forwarder");
const SmartWallet = artifacts.require("SmartWallet");

const zeroAddress = '0x0000000000000000000000000000000000000000';

contract('Forwarder', async (accounts) => {
  const faucet = accounts[0];

  let rocksideAdmin;
  let rocksideRelayer;
  let randomAccount;

  let authorizedRelayers;
  let forwarder;

  const createAccount = async (eth = '10') => {
    const account = await web3.eth.personal.newAccount();
    await web3.eth.personal.unlockAccount(account);
    await web3.eth.sendTransaction({
      from: faucet,
      to: account,
      value: web3.utils.toWei(eth),
    });

    return account;
  }

  before(async () => {
    rocksideAdmin = await createAccount();
    rocksideRelayer = await createAccount();
    randomAccount = await createAccount();

    authorizedRelayers =
      await AuthorizedRelayers.new([rocksideRelayer], { from: rocksideAdmin });
  });

  beforeEach(async () => {
    forwarder = await
      Forwarder.new(
        authorizedRelayers.address, [zeroAddress],
        { from: rocksideAdmin },
      );

    await web3.eth.sendTransaction({
      from: faucet,
      to: forwarder.address,
      value: web3.utils.toWei('1'),
    });
  });

  describe('constructor', async () => {
    it('should initialize the Forwarder', async () => {
      const forwarder = await
        Forwarder.new(authorizedRelayers.address, [zeroAddress], { from: rocksideAdmin });

      assert.equal(await forwarder.relayers(), authorizedRelayers.address);
      assert.equal(await forwarder.trustedContracts(zeroAddress), true);
      assert.equal(await forwarder.initialized(), true);
    });

    it('should not reinitialize the Forwarder if we call initialize twice', async () => {

      const forwarder = await
        Forwarder.new(authorizedRelayers.address, [zeroAddress], { from: rocksideAdmin });

      await assertRevertWith(
        forwarder.initialize(rocksideAdmin, authorizedRelayers.address, [zeroAddress], { from: rocksideAdmin }),
        'Contract already initialized'
      );
    });
  });

  describe('updateTrustedContracts', async () => {
    let forwarder;

    beforeEach(async () => {
      forwarder = await
        Forwarder.new(authorizedRelayers.address, [zeroAddress], { from: rocksideAdmin });
    });

    it('should not allow a random person to update trusted contracts', async () => {
      await assertRevertWith(
        forwarder.updateTrustedContracts([zeroAddress], { from: randomAccount }),
        'Sender is not an owner'
      );
    });

    it('should update trusted contracts if sender is admin', async () => {
      const trusted = web3.eth.accounts.create().address;

      await forwarder.updateTrustedContracts([trusted], { from: rocksideAdmin });

      assert.equal(await forwarder.trustedContracts(trusted), true);
    });
  });

  describe('changeRelayersSource', async () => {

    it('should not allow a random person to update authorized relayers', async () => {
      await assertRevertWith(
        forwarder.changeRelayersSource(zeroAddress, { from: randomAccount }),
        'Sender is not an owner'
      );
    });

    it('should update trusted contracts if sender is admin', async () => {
      const newAuthorized = web3.eth.accounts.create().address;

      await forwarder.changeRelayersSource(newAuthorized, { from: rocksideAdmin });

      assert.equal(await forwarder.relayers(), newAuthorized);
    });
  });

  describe('withdraw', async () => {
    it('should not allow a random person to withdraw funds', async () => {
      await assertRevertWith(
        forwarder.withdraw(1, { from: randomAccount }),
        'Sender is not an owner'
      );
    });

    it('should not allow an amount greater than the Forwarder balance', async () => {
      const balance = await web3.eth.getBalance(forwarder.address);
      await assertRevertWith(
        forwarder.withdraw(balance+1, { from: rocksideAdmin }),
        'Amount is too high'
      );
    });

    it('should withdraw amount from Forwarder balance', async () => {
      await forwarder.send(10, { from: rocksideAdmin });

      const oldForwarderBalance = await web3.eth.getBalance(forwarder.address);
      const oldOwnerBalance = await web3.eth.getBalance(rocksideAdmin);

      // gasPrice to 0 so that we don't have to count gas usage in the assertion part
      result = await forwarder.withdraw(5, { from: rocksideAdmin, gasPrice: 0 })

      const forwarderBalance = await web3.eth.getBalance(forwarder.address);
      const ownerBalance = await web3.eth.getBalance(rocksideAdmin);

      assert.equal(BigInt(forwarderBalance).toString(), (BigInt(oldForwarderBalance) - 5n).toString());
      assert.equal(BigInt(ownerBalance).toString(), (BigInt(oldOwnerBalance)+5n).toString());
    });
  });

  describe('forward', async () => {
    const user = web3.eth.accounts.create();
    const defaultMetaTx = {
      to: zeroAddress,
      data: '0x',
    };
    const defaultGasPrice = 100;

    it('should refuse a relayer that is not allowed', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      await assertRevertWith(
        forwarder.forward(
          signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
          { from: rocksideAdmin }
        ),
        'Invalid sender'
      );
    });

    it('should refuse a destination contract if it is not a trusted contract', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),

        to: randomAccount,
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      await assertRevertWith(
        forwarder.forward(
          signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
          { from: rocksideRelayer }
        ),
        'Unauthorized destination'
      );
    });

    it('should refuse a meta tx with a nonce too low', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      await forwarder.forward(
        signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
        { from: rocksideRelayer }
      );
      
      await assertRevertWith(
        forwarder.forward(
          signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
          { from: rocksideRelayer }
        ),
        'Nonce is invalid',
      );
    });

    it('should refuse a meta tx with a nonce too high', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: 1,
      };
      const signature = await signMetaTx(forwarder, user, metaTx);
      
      await assertRevertWith(
        forwarder.forward(
          signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
          { from: rocksideRelayer }
        ),
        'Nonce is invalid',
      );
    });

    it('should forward the meta tx', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      const result = await forwarder.forward(
        signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
        { from: rocksideRelayer }
      );

      const forwardedEvent = result.logs.find(log => log.event === 'Forwarded');
      assert.exists(forwardedEvent);
    });

    it('should forward the meta tx on another channel', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      await forwarder.forward(
        signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
        { from: rocksideRelayer }
      );

      const otherChannel = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user, '1'),
      }

      const otherChannelSig = await signMetaTx(forwarder, user, otherChannel);

      await forwarder.forward(
        otherChannelSig, user.address, otherChannel.to, otherChannel.data, defaultGasPrice, otherChannel.nonce,
        { from: rocksideRelayer }
      );
    });

    it('should refund the relayer', async () => {
      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      const forwarderBalance = BigInt(await web3.eth.getBalance(forwarder.address));
      const relayerBalance = BigInt(await web3.eth.getBalance(rocksideRelayer));

      const result = await forwarder.forward(
        signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
        { from: rocksideRelayer, gasPrice: defaultGasPrice }
      );

      const endForwarderBalance = BigInt(await web3.eth.getBalance(forwarder.address));
      const endRelayerBalance = BigInt(await web3.eth.getBalance(rocksideRelayer));

      const forwarderPaid = forwarderBalance-endForwarderBalance
      const relayerPaid = relayerBalance-endRelayerBalance

      const forwardedEvent = result.logs.find(log => log.event === 'Forwarded');
      assert.exists(forwardedEvent);

      const refund = BigInt(forwardedEvent.args.gasUsed) * BigInt(defaultGasPrice);

      const txCost = BigInt(result.receipt.gasUsed) * BigInt(defaultGasPrice)

      const expectedForwardedBalance = forwarderBalance - refund;
      assert.equal(endForwarderBalance, expectedForwardedBalance);

      const expectedRelayerBalance = relayerBalance - txCost + refund
      assert.equal(endRelayerBalance, expectedRelayerBalance);
    });

    it('should refund at most gasPriceLimit as gas price', async () => {
      const lowGasPrice = 100;
      const highGasPrice = 1000;

      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      const forwarderBalance = BigInt(await web3.eth.getBalance(forwarder.address));
      const relayerBalance = BigInt(await web3.eth.getBalance(rocksideRelayer));

      const result = await forwarder.forward(
        signature, user.address, metaTx.to, metaTx.data, lowGasPrice, metaTx.nonce,
        { from: rocksideRelayer, gasPrice: highGasPrice }
      );

      const endForwarderBalance = BigInt(await web3.eth.getBalance(forwarder.address));
      const endRelayerBalance = BigInt(await web3.eth.getBalance(rocksideRelayer));

      const forwarderPaid = forwarderBalance-endForwarderBalance
      const relayerPaid = relayerBalance-endRelayerBalance

      const forwardedEvent = result.logs.find(log => log.event === 'Forwarded');
      assert.exists(forwardedEvent);

      const refund = BigInt(forwardedEvent.args.gasUsed) * BigInt(lowGasPrice);

      const txCost = BigInt(result.receipt.gasUsed) * BigInt(highGasPrice)

      const expectedForwardedBalance = forwarderBalance - refund;
      assert.equal(endForwarderBalance, expectedForwardedBalance);

      const expectedRelayerBalance = relayerBalance - txCost + refund
      assert.equal(endRelayerBalance, expectedRelayerBalance);
    });

    it('should refund at tx.gasPrice if it is lower than gasPriceLimit', async () => {
      const lowGasPrice = 100;
      const highGasPrice = 1000;

      const metaTx = {
        ...defaultMetaTx,
        nonce: await getNonce(forwarder, user),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      const forwarderBalance = BigInt(await web3.eth.getBalance(forwarder.address));
      const relayerBalance = BigInt(await web3.eth.getBalance(rocksideRelayer));

      const result = await forwarder.forward(
        signature, user.address, metaTx.to, metaTx.data, highGasPrice, metaTx.nonce,
        { from: rocksideRelayer, gasPrice: lowGasPrice }
      );

      const endForwarderBalance = BigInt(await web3.eth.getBalance(forwarder.address));
      const endRelayerBalance = BigInt(await web3.eth.getBalance(rocksideRelayer));

      const forwarderPaid = forwarderBalance-endForwarderBalance
      const relayerPaid = relayerBalance-endRelayerBalance

      const forwardedEvent = result.logs.find(log => log.event === 'Forwarded');
      assert.exists(forwardedEvent);

      const refund = BigInt(forwardedEvent.args.gasUsed) * BigInt(lowGasPrice);

      const txCost = BigInt(result.receipt.gasUsed) * BigInt(lowGasPrice)

      const expectedForwardedBalance = forwarderBalance - refund;
      assert.equal(endForwarderBalance, expectedForwardedBalance);

      const expectedRelayerBalance = relayerBalance - txCost + refund
      assert.equal(endRelayerBalance, expectedRelayerBalance);
    });

    it('should not be possible to upgrade the implementation using a forward', async () => {
      const forwarder = await
        Forwarder.new(authorizedRelayers.address, [], { from: rocksideAdmin });

      await forwarder.updateOwners(user.address, true, { from: rocksideAdmin });

      const metaTx = {
        nonce: await getNonce(forwarder, user),

        to: forwarder.address,
        data: await forwarder.contract.methods.upgradeTo(randomAccount).encodeABI(),
      };
      const signature = await signMetaTx(forwarder, user, metaTx);

      await assertRevertWith(
        forwarder.forward(
          signature, user.address, metaTx.to, metaTx.data, defaultGasPrice, metaTx.nonce,
          { from: rocksideRelayer }
        ),
        'Sender is not an owner'
      );
    });

  });

  describe('upgradeTo', async () => {
    const newImplementation = '0x0000000000000000000000000000000000000001';

    it('should refuse a sender that is not owner', async () => {
      await assertRevertWith(
        forwarder.upgradeTo(newImplementation, { from: randomAccount }),
        'Sender is not an owner'
      );
    });

    it('should change the implementation address if sender is a owner', async () => {
      await forwarder.upgradeTo(newImplementation, { from: rocksideAdmin })
      assert.equal(await forwarder.implementation(), newImplementation);
    });

    it('should revert if address is the current implementation', async () => {
      await assertRevertWith(
        forwarder.upgradeTo(zeroAddress, { from: rocksideAdmin }),
        'Implementation already used'
      );
    });
  });

  describe('updateOwners', async () => {
    const newOwner = '0x0000000000000000000000000000000000000001';

    it('should refuse a sender that is not owner', async () => {
      await assertRevertWith(
        forwarder.updateOwners(newOwner, true,{ from: randomAccount }),
        'Sender is not an owner'
      );
    });

    it('should update the owner if sender is a owner itself', async () => {
      await forwarder.updateOwners(newOwner, true, { from: rocksideAdmin })
      assert.equal(await forwarder.owners(newOwner), true);
    });
  });
});

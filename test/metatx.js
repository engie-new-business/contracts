const { executeMessageHash } = require('@rocksideio/rockside-wallet-sdk'); 
const ethUtil = require('ethereumjs-util');

const { structHash } = require('./eip712');

async function hashMetaTx(forwarder, signer, { to, data, nonce }) {
  const chainID = await web3.eth.net.getId();
  const domain = {
    chainId: chainID,
    verifyingContract: forwarder.address,
  };

  return executeMessageHash(domain, { signer: signer.address, to, data, nonce });
}

const twoExp128 = 1n ** 128n;

function computeNonce(channel, channelNonce) {
    return (BigInt(channel) * twoExp128 + BigInt(channelNonce)).toString();
}

async function getNonce(forwarder, signer, channel = 0) {
  const channelNonce = await forwarder.getNonce(signer.address, channel);
  nonce = computeNonce(channel, channelNonce);

  return nonce;
}

async function signMetaTx(forwarder, signer, { to, data, nonce }) {
  const hash = await hashMetaTx(forwarder, signer, { to, data, nonce });

  const privateKey = new Buffer(signer.privateKey.substring(2), 'hex');
  const sig = await ethUtil.ecsign(hash, privateKey);
  const signature = ethUtil.toRpcSig(sig.v, sig.r, sig.s);

  return signature;
}

module.exports = {
  signMetaTx,
  getNonce,
  computeNonce,
};

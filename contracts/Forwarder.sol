pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./IRelayer.sol";
import "./SafeMath.sol";

contract Forwarder {
	using SafeMath for uint256;

	receive() external payable { }

	/// @dev Forwards a meta transaction to a relayer contract.
	/// @param relayerContract Address of the relayer contract that must relay the transaction
	/// @param signature Signature by the signer of the other params.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction .
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	/// @param gasLimit Execution gas limit that the signer agreed to pay.
	/// @param gasPrice Gas price limit that the signer agreed to pay.
	/// @param nonce Nonce of the internal transaction.
	function forward(
		IRelayer relayerContract,
		bytes memory signature,
		address relayer,
		address signer,
		address to ,
		uint value,
		bytes memory data,
		uint gasLimit,
		uint gasPrice,
		uint256 nonce
	)
		public
	{
		require(
			relayer == msg.sender || relayer == address(0),
			"Invalid relayer"
		);

		uint256 startGas = gasleft();

		relayerContract.relayExecute(
			signature, relayer, signer, to, value, data, gasLimit, gasPrice, nonce
		);

		uint256 endGas = gasleft();
		uint256 forwardGasPrice = gasPrice > tx.gasprice ? tx.gasprice : gasPrice;
		uint256 consumedGas = startGas.sub(endGas);
		uint256 payment = forwardGasPrice * consumedGas;

		require(msg.sender.send(payment), "Could not pay relayer gas costs with ether");
	}
}

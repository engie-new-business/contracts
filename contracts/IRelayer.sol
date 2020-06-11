pragma solidity >=0.6.0 <0.7.0;

interface IRelayer {
	event RelayedExecute (bool success, uint256 payment);

	function relayExecute(
		bytes calldata signature,
		address relayer,
		address signer,
		address to ,
		uint value,
		bytes calldata data,
		uint gasLimit,
		uint gasPrice,
		uint256 nonce
	) external;
}

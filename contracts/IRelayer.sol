pragma solidity >=0.6.0 <0.7.0;

interface IRelayer {
	event RelayedExecute (bool success, uint256 payment);
	event RelayedDeploy (address contractAddress, uint256 payment);

	function relayExecute(bytes calldata signature, address signer, address to , uint value, bytes calldata data, uint gasLimit, uint gasPrice, uint256 nonce) external;
	function relayDeploy(bytes calldata signature, address signer, uint256 value, bytes32 salt, bytes calldata initCode, uint gasLimit, uint gasPrice, uint256 nonce) external;
}

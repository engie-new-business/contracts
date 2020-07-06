pragma solidity >=0.6.0 <0.7.0;

/// @dev Interface implemented by destination contracts that are called by the Forwarder to execute given transactions
interface IRelayDestination {
	function relayExecute(
		address signer,
		address to ,
		uint value,
		bytes calldata data
	) external;
}

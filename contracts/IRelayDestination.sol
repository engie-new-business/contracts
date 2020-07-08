pragma solidity >=0.6.0 <0.7.0;

/// @dev Interface implemented by destination contracts that are called by the Forwarder to execute given transactions
interface IRelayDestination {
	/// @dev execute a relayed transaction. The signer address is appended at the end of data
	function relayExecute(address signer, bytes calldata data) external;
}

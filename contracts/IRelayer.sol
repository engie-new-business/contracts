pragma solidity >=0.6.0 <0.7.0;

interface IRelayer {
	function relayExecute(
		address signer,
		address to ,
		uint value,
		bytes calldata data
	) external;
}

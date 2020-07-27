// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.7.0;

interface ISmartWallet {
	event Received (address indexed sender, uint value);
	event DataChanged(bytes32 indexed key, bytes value);
	event Executed(address destination, uint256 value, bytes data);
	event Deployed(uint256 value, bytes32 salt, bytes initCode);

	function getData(bytes32 _key) external view returns (bytes memory _value);
	function setData(bytes32 _key, bytes calldata _value) external;
	function execute(address destination, uint value, bytes calldata data) external;
	function deploy(uint256 value, bytes32 salt, bytes calldata initCode) external returns (address);
}

pragma solidity >=0.6.0 <0.7.0;

import "./IIdentity.sol";

contract Identity is IIdentity {
	mapping(bytes32 => bytes) store;
	mapping(address => bool) public whitelist;

	event UpdateWhitelist(address _account, bool _value);

	constructor(address customerAccount) public {
		whitelist[customerAccount] = true;
	}

	modifier onlyWhitelisted() virtual {
		require(whitelist[msg.sender],"Account Not Whitelisted");
		_;
	}

	function updateWhitelist(address _account, bool _value) onlyWhitelisted public returns(bool) {
		whitelist[_account] = _value;
		emit UpdateWhitelist(_account,_value);
		return true;
	}

	receive() external payable virtual { emit Received(msg.sender, msg.value); }

	function getData(bytes32 _key) override external view returns (bytes memory _value) {
		return store[_key];
	}

	function setData(bytes32 _key, bytes calldata _value) override external onlyWhitelisted {
		store[_key] = _value;
		emit DataChanged(_key, _value);
	}

	function execute(address destination, uint value, bytes calldata data) override onlyWhitelisted external {
		require(executeCall(gasleft(), destination, value, data), "call failed");
	}

	function deploy(uint256 value, bytes32 salt, bytes calldata initCode) override onlyWhitelisted external returns (address) {
		address addr = executeCreate2(value, salt, initCode);
		require(addr != address(0x0), "create2 failed");
		return addr;
	}

	function executeCall(uint gasLimit, address to, uint256 value, bytes memory data) internal returns (bool success) {
		assembly {
			success := call(gasLimit, to, value, add(data, 0x20), mload(data), 0, 0)
		}
	}

	function executeCreate2(uint256 value, bytes32 salt, bytes memory bytecode) internal returns (address addr) {
		// solhint-disable-next-line no-inline-assembly
		assembly {
			addr := create2(value, add(bytecode, 0x20), mload(bytecode), salt)
		}
	}
}

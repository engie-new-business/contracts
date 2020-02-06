pragma solidity >=0.5.0 <0.7.0;

interface IIdentity {
	event Received (address indexed sender, uint value);
	event DataChanged(bytes32 indexed key, bytes value);
	event Executed(address destination, uint256 value, bytes data);
	event Deployed(uint256 value, bytes32 salt, bytes initCode);

	function getData(bytes32 _key) external view returns (bytes memory _value);
	function setData(bytes32 _key, bytes calldata _value) external;
	function execute(address destination, uint value, bytes calldata data) external;
	function deploy(uint256 value, bytes32 salt, bytes calldata initCode) external returns (address);
}

contract Identity is IIdentity {
	mapping(bytes32 => bytes) store;
	mapping(address => bool) public whitelist;

	event UpdateWhitelist(address _account, bool _value);

	constructor(address customerAccount) public {
		whitelist[customerAccount] = true;
	}

	modifier onlyWhitelisted() {
		require(whitelist[msg.sender],"Account Not Whitelisted");
		_;
	}

	function updateWhitelist(address _account, bool _value) onlyWhitelisted public returns(bool) {
		whitelist[_account] = _value;
		emit UpdateWhitelist(_account,_value);
		return true;
	}

	function() external payable { emit Received(msg.sender, msg.value); }

	function getData(bytes32 _key) external view returns (bytes memory _value) {
		return store[_key];
	}

	function setData(bytes32 _key, bytes calldata _value) external onlyWhitelisted {
		store[_key] = _value;
		emit DataChanged(_key, _value);
	}

	function execute(address destination, uint value, bytes calldata data) onlyWhitelisted external {
		require(executeCall(gasleft(), destination, value, data));
	}

	function deploy(uint256 value, bytes32 salt, bytes calldata initCode) onlyWhitelisted external returns (address) {
		address addr = executeCreate2(value, salt, initCode);
		require(addr != address(0x0));
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

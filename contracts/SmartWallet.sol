pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./ISmartWallet.sol";
import "./OwnersMap.sol";
import "./SafeMath.sol";
import "./ERC165/ERC165.sol";
import "./IRelayer.sol";

contract SmartWallet is OwnersMap, ISmartWallet, IRelayer, ERC165 {
	using SafeMath for uint256;

	mapping(bytes32 => bytes) store;

	bool public initialized;

	event UpdateOwners(address account, bool value);

	modifier onlyOwners() virtual {
		require(owners[msg.sender], "Account not an owner");
		_;
	}

	address public authorizedForwarder;

	bytes4 private constant _INTERFACE_ID_SMART_WALLET = 0xfb07fcd2;
	bytes4 private constant _INTERFACE_ID_RELAYER = 0xd9fb9e4a;

	event RelayedExecute (bool success);

	/// @dev Whitelist the owner and the contract itself.
	/// @param owner Address of the owner.
	constructor(address owner, address forwarder) public {
		owners[owner] = true;
		owners[address(this)] = true;
		initialize(forwarder);
	}

	function initialize(address forwarder) public {
		require(!initialized, "Contract already initialized");
		initialized = true;

		authorizedForwarder = forwarder;
		_registerInterface(_INTERFACE_ID_SMART_WALLET);
		_registerInterface(_INTERFACE_ID_RELAYER);
	}

	/// @dev Fallback function for receiving Ether, emit an event.
	receive() external virtual payable {
		emit Received(msg.sender, msg.value);
	}

	/// @dev Execute a call if the sender is an owner.
	/// @param to Destination address for the call .
	/// @param value Ether value for the call.
	/// @param data Data payload for the call.
	function execute(address to, uint value, bytes memory data)
		public
		override
		onlyOwners
	{
		require(
			executeCall(gasleft(), to, value, data),
			"call failed"
		);
	}

	/// @dev Execute a deplaoy call if the sender is an owner.
	/// @param value Ether value for the call.
	/// @param salt Salt used for create2.
	/// @param initCode Code of the smart contract.
	function deploy(uint256 value, bytes32 salt, bytes calldata initCode)
		external
		override
		onlyOwners
		returns (address)
	{
		address addr = executeCreate2(value, salt, initCode);
		require(addr != address(0x0), "create2 failed");
		return addr;
	}

	struct Call {
		address to;
		uint256 value;
		bytes data;
	}

	/// @dev Batch meta transactions to be executed as a single atomic transaction
	/// @param calls list of calls to execute
	function batch(Call[] memory calls)
		public
		onlyOwners
	{
		for (uint i = 0; i < calls.length; i++) {
			execute(
				calls[i].to,
				calls[i].value,
				calls[i].data
			);
		}
	}

	/// @dev Store some data if the the sender is an owner.
	/// @param key Key for the data.
	/// @param value Value to store.
	function setData(bytes32 key, bytes calldata value)
		external
		override
		onlyOwners
	{
		store[key] = value;
		emit DataChanged(key, value);
	}

	/// @dev Get data stored for a key.
	/// @param key Key for the data.
	function getData(bytes32 key)
		external
		view
		override
		returns (bytes memory value)
	{
		return store[key];
	}

	/// @dev Add or remove an address from the owners
	/// @param account Address to change.
	/// @param value Action to do (true to add and false to remove).
	function updateOwners(address account, bool value)
		public
		onlyOwners
		returns(bool)
	{
		owners[account] = value;
		emit UpdateOwners(account, value);
		return true;
	}

	/// @dev Execute a call and returns its status
	/// @param gasLimit Gas to use for the call.
	/// @param to Call destination.
	/// @param value Call value.
	/// @param data Call data.
	function executeCall(
		uint gasLimit,
		address to,
		uint256 value,
		bytes memory data
	)
		internal
		returns (bool success)
	{
		assembly {
			success := call(
				gasLimit,
				to,
				value,
				add(data, 0x20),
				mload(data),
				0,
				0
			)
		}
	}


	/// @dev Execute a create2 and returns the created smart contract address.
	/// @param value Value for create2.
	/// @param salt Salt for create2.
	/// @param bytecode Smart contract bytecode to deploy create2.
	function executeCreate2(
		uint256 value,
		bytes32 salt,
		bytes memory bytecode
	)
		internal
		returns (address addr)
	{
		// solhint-disable-next-line no-inline-assembly
		assembly {
			addr := create2(value, add(bytecode, 0x20), mload(bytecode), salt)
		}
	}

	/// @dev Relay a transaction sended by the authorized forwarder.
	/// @param signer Signer of the signature received by the forwarder.
	/// @param to Destination address of internal transaction .
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	function relayExecute(
		address signer,
		address to,
		uint value,
		bytes memory data
	)
		public
		override
	{
		require(
			msg.sender == authorizedForwarder,
			"Sender is not the allowed forwarder"
		);

		require(
			owners[signer],
			"Signer is not owner"
		);

		bool success = executeCall(
			gasleft(),
			to,
			value,
			data
		);
		emit RelayedExecute(success);
	}
}

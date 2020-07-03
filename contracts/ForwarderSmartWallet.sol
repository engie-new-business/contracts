pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./SmartWallet.sol";
import "./IRelayer.sol";
import "./SafeMath.sol";
import "./ERC165/ERC165.sol";

/// @title On chain Smart Wallet capable to receive relayed transaction
/// @author Rockside dev team (tech@rockside.io)
contract ForwarderSmartWallet is SmartWallet, IRelayer, ERC165 {
	using SafeMath for uint256;

	bool public initialized;

	address public authorizedForwarder;

	bytes4 private constant _INTERFACE_ID_SMART_WALLET = 0xfb07fcd2;
	bytes4 private constant _INTERFACE_ID_RELAYER = 0xd9fb9e4a;

	event RelayedExecute (bool success);

	/// @dev Initializes the contract and whitelist the owner and itself.
	/// @param owner Address of the owner.
	constructor(address owner, address forwarder) SmartWallet(owner) public {
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

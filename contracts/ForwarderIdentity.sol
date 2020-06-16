pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./Identity.sol";
import "./IRelayer.sol";
import "./SafeMath.sol";
import "./ERC165/ERC165.sol";

/// @title On chain identity capable to receive relayed transaction
/// @author Rockside dev team (tech@rockside.io)
contract ForwarderIdentity is Identity, IRelayer, ERC165 {
	using SafeMath for uint256;

	bool public initialized;

	address public authorizedForwarder;

	bytes4 private constant _INTERFACE_ID_IDENTITY = 0xfb07fcd2;
	bytes4 private constant _INTERFACE_ID_RELAYER = 0x89dae43a;

	event RelayedExecute (bool success);

	/// @dev Initializes the contract and whitelist the owner and itself.
	/// @param owner Address of the owner.
	constructor(address owner, address forwarder) Identity(owner) public {
		owners[address(this)] = true;
		initialize(forwarder);
	}

	function initialize(address forwarder) public {
		require(!initialized, "Contract already initialized");
		initialized = true;

		authorizedForwarder = forwarder;
		_registerInterface(_INTERFACE_ID_IDENTITY);
		_registerInterface(_INTERFACE_ID_RELAYER);
	}

	/// @dev Relay a transaction and then pays the relayer.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction .
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	function relayExecute(
		address signer,
		address to ,
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

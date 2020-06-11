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

	// gas required to finish execution of relay and payment after internal call
	uint constant REQUIRE_GAS_LEFT_AFTER_EXEC = 15000;

	event RelayedExecute (bool success, uint256 payment);

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
	/// @param gasLimit Execution gas limit that the signer agreed to pay.
	/// @param gasPrice Gas price limit that the signer agreed to pay.
	function relayExecute(
		bytes memory /* signature */,
		address relayer,
		address signer,
		address to ,
		uint value,
		bytes memory data,
		uint gasLimit,
		uint gasPrice,
		uint256 /* nonce */
	)
	public
	override
	{
		uint _initialGas = gasleft();

		require(
			msg.sender == authorizedForwarder,
			"Sender is not the allowed forwarder"
		);

		require(
			owners[signer],
			"Signer is not whitelisted"
		);
		require(
			relayer == tx.origin || relayer == address(0),
			"Invalid relayer"
		);

		uint _remainingGas = gasleft();
		require(
			_remainingGas > REQUIRE_GAS_LEFT_AFTER_EXEC,
			"Execution cost exceeded gas limit"
		);
		bool success = executeCall(
			_remainingGas - REQUIRE_GAS_LEFT_AFTER_EXEC,
			to,
			value,
			data
		);

		if(gasPrice == 0) {
			emit RelayedExecute(success, 0);
			return;
		}

		// _txSendCost = 21000 (transaction) + 68/4 (we assume that the quarter of data bytes are non zero) * msg.data.length
		uint256 _txSendCost = msg.data.length.mul(17).add(21000);
		uint256 gasUsed = _initialGas.sub(gasleft())
		.add(_txSendCost)
		.add(REQUIRE_GAS_LEFT_AFTER_EXEC);
		require(
			gasUsed <= gasLimit || gasLimit == 0 || gasPrice == 0,
			"Execution cost exceeded agreed gasLimit"
		);

		uint256 payment = handlePayment(gasUsed, gasPrice);
		emit RelayedExecute(success, payment);
	}

	/// @dev Calculate and send refund for the relayer.
	/// @param consumed Gas consumed by the execution.
	/// @param gasPrice Gas price limit that the signer agreed to pay.
	function handlePayment(
		uint256 consumed,
		uint256 gasPrice
	)
	internal
	returns (uint256)
	{
		uint256 payment = consumed.mul(tx.gasprice < gasPrice ? tx.gasprice : gasPrice);

		require(msg.sender.send(payment), "Could not pay gas costs with ether");

		return payment;
	}
}

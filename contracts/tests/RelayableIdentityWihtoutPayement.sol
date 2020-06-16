pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "../Identity.sol";
import "../IRelayer.sol";
import "../SafeMath.sol";
import "../ERC165/ERC165.sol";

/// @title On chain identity capable to receive relayed transaction
/// @author Rockside dev team (tech@rockside.io)
contract RelayableIdentityWihtoutPayement is Identity, ERC165 {
	using SafeMath for uint256;

	// keccak256("EIP712Domain(address verifyingContract,uint256 chainId)")
	bytes32 constant EIP712DOMAIN_TYPEHASH =
		0xa1f4e2f207746c24e01c8e10e467322f5fea4cccab3cd2f1c95d700b6a0c218b;

	// keccak256("TxMessage(address relayer,address signer,address to,uint256 value,bytes data,uint256 nonce)")
	bytes32 constant TXMESSAGE_TYPEHASH =
		0x59595364b96b35e3749eebfe67b9c61949071063826bc26621675fe7b4fa3927;

	// keccak256("Create2Message(address relayer,address signer,uint256 value,uint256 salt,bytes initCode,uint256 nonce)")
	bytes32 constant CREATE2MESSAGE_TYPEHASH =
		0xfe3db1070f9278d020d75b38708e5c0487d150c83b3e97f348b6a0b4ee672827;

	bytes32 DOMAIN_SEPARATOR;

	bytes4 private constant _INTERFACE_ID_IDENTITY = 0xfb07fcd2;
	bytes4 private constant _INTERFACE_ID_RELAYER = 0x89dae43a;

	// gas required to finish execution of relay and payment after internal call
	uint constant REQUIRE_GAS_LEFT_AFTER_EXEC = 15000;

	mapping(address => mapping(uint128 => uint128)) public channels;
	/* bool initialised; */

	event RelayedExecute (bool success, uint256 payment);
	event RelayedDeploy (address contractAddress, uint256 payment);

    /// @dev Initializes the contract and whitelist the owner and itself.
	/// @param owner Address of the owner.
	constructor(address owner) Identity(owner) public {
		owners[address(this)] = true;
		initialise();
	}

	function initialise() public {
		uint256 id;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			id := chainid()
		}
		DOMAIN_SEPARATOR = hashEIP712Domain(address(this), id);
		_registerInterface(_INTERFACE_ID_IDENTITY);
		_registerInterface(_INTERFACE_ID_RELAYER);
	}

	/// @dev Relay a transaction and then pays the relayer.
	/// @param signature Signature by the signer of the other params.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction .
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	/// @param nonce Nonce of the internal transaction.
	function relayExecute(
		bytes memory signature,
		address relayer,
		address signer,
		address to ,
		uint value,
		bytes memory data,
		uint256 nonce
	)
		public
	{
		bytes32 _hash = hashTxMessage(
			relayer,
			signer,
			to,
			value,
			data,
			nonce
		);

		require(
			signerIsOwner(_hash, signature),
			"Signer is not whitelisted"
		);
		require(checkAndUpdateNonce(signer, nonce), "Nonce is invalid");
		require(
			relayer == msg.sender || relayer != address(0),
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

		emit RelayedExecute(success, 0);
	}

	/// @dev Relay a deploy transaction and then pays the relayer.
	/// @param signature Signature by the signer of the other params
	/// @param signer Signer of the signature.
	/// @param value Ether value of internal transaction.
	/// @param salt Salt used for create2.
	/// @param initCode Code of the smart contract.
	/// @param nonce Nonce of the internal transaction.
	function relayDeploy(
		bytes memory signature,
		address relayer,
		address signer,
		uint256 value,
		bytes32 salt,
		bytes memory initCode,
		uint256 nonce
	)
		public
	{
		bytes32 _hash = hashCreateMessage(
			relayer,
			signer,
			value,
			salt,
			initCode,
			nonce
		);

		require(
			signerIsOwner(_hash, signature),
			"Signer is not whitelisted"
		);
		require(checkAndUpdateNonce(signer, nonce), "Nonce is invalid");
		require(
			relayer == msg.sender || relayer != address(0),
			"Invalid relayer"
		);

		address addr = executeCreate2(value, salt, initCode);

		emit RelayedDeploy(addr, 0);
	}

	/// @dev Message to sign expected for relay transaction.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction.
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	/// @param nonce Nonce of the internal transaction.
	function hashTxMessage(
		address relayer,
		address signer,
		address to,
		uint value,
		bytes memory data,
		uint256 nonce
	)
		public
		pure
		returns (bytes32)
	{
		return keccak256(abi.encode(
			TXMESSAGE_TYPEHASH,
			relayer,
			signer,
			to,
			value,
			keccak256(bytes(data)),
			nonce
		));
	}

	/// @dev Message to sign expected for relay deploy transaction.
	/// @param signer Signer of the signature.
	/// @param value Ether value of internal transaction.
	/// @param salt Salt used for create2.
	/// @param initCode Code of the smart contract.
	/// @param nonce Nonce of the internal transaction.
	function hashCreateMessage(
		address relayer,
		address signer,
		uint256 value,
		bytes32 salt,
		bytes memory initCode,
		uint256 nonce
	)
		public
		pure
		returns (bytes32)
	{
		return keccak256(abi.encode(
			CREATE2MESSAGE_TYPEHASH,
			relayer,
			signer,
			value,
			salt,
			keccak256(bytes(initCode)),
			nonce
		));
	}

	/// @dev Verify if the nonce is good and then update it.
	/// @param signer Signer of the signature.
	/// @param nonce Nonce of the internal transaction.
	function checkAndUpdateNonce(address signer, uint256 nonce)
		internal
		returns (bool)
	{
		uint128 _channelId = uint128(nonce / 2**128);
		uint128 _channelNonce = uint128(nonce % 2**128);

		uint128 _currentNonce = channels[signer][_channelId];
		if (_channelNonce == _currentNonce) {
			channels[signer][_channelId]++;
			return true;
		}
		return false;
	}

	/// @dev Find the signer of signature and check if he is an owner.
	/// @param message Message without signature.
	/// @param signature Signature to verify.
	function signerIsOwner(bytes32 message, bytes memory signature)
		internal
		view
		returns (bool)
	{
		bytes32 r;
		bytes32 s;
		uint8 v;
		// Check the signature length
		if (signature.length != 65) {
			return false;
		}
		// Divide the signature in r, s and v variables
		// ecrecover takes the signature parameters, and the only way to get them
		// currently is to use assembly.
		// solium-disable-next-line security/no-inline-assembly
		assembly {
			r := mload(add(signature, 32))
			s := mload(add(signature, 64))
			v := byte(0, mload(add(signature, 96)))
		}
		// Version of signature should be 27 or 28, but 0 and 1 are also possible versions
		if (v < 27) {
			v += 27;
		}
		// If the version is correct return the signer address
		if (v != 27 && v != 28) {
			return false;
		} else {
			bytes32 digest = keccak256(abi.encodePacked(
				"\x19\x01",
				DOMAIN_SEPARATOR,
				message
			));
			// solium-disable-next-line arg-overflow
			return owners[ecrecover(digest, v, r, s)];
		}
	}

	/// @dev Calculate the DOMAIN_SEPARATOR, used only at construction.
	/// @param _verifyingContract Contract address.
	/// @param _chainId Blockchain chain id.
	function hashEIP712Domain(address _verifyingContract, uint256 _chainId)
		internal
		pure
		returns (bytes32)
	{
		return keccak256(abi.encode(
			EIP712DOMAIN_TYPEHASH,
			_verifyingContract,
			_chainId
		));
	}
}
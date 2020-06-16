pragma solidity >=0.6.0 <0.7.0;

import "./IRelayer.sol";
import "./SafeMath.sol";
import "./Relayers.sol";
import "./OwnersMap.sol";

contract Forwarder is OwnersMap {
	using SafeMath for uint256;
	Relayers public relayers;
	mapping(address => bool) public trustedContracts;
	bool internal hasTrustedContracts;
	bool public initialized;

	// keccak256("EIP712Domain(address verifyingContract,uint256 chainId)")
	bytes32 constant EIP712DOMAIN_TYPEHASH =
		0xa1f4e2f207746c24e01c8e10e467322f5fea4cccab3cd2f1c95d700b6a0c218b;

	// keccak256("TxMessage(address signer,address to,uint256 value,bytes data,uint256 nonce)")
	bytes32 constant TXMESSAGE_TYPEHASH =
		0xd3a5dbc47f098f34f663b1d3b74bd4df78ba7e6428e04914120023dfcd11b99b;

	mapping(address => mapping(uint128 => uint128)) public channels;

	modifier isWhitelisted {
		require(relayers.verify(msg.sender), "Invalid sender");
		_;
	}

	constructor(address relayersAddress, address[] memory contracts) public {
		initialize(relayersAddress, contracts);
	}

	function initialize(address relayersAddress, address[] memory contracts) public {
		require(!initialized, "Contract already initialized");
		initialized = true;

		relayers = Relayers(relayersAddress);
		hasTrustedContracts = contracts.length > 0;
		for(uint256 i = 0; i < contracts.length; i++) {
			trustedContracts[contracts[i]] = true;
		}
	}

	function getNonce(address signer, uint128 channel) external view returns (uint128) {
		return channels[signer][channel];
	}

	function updateTrustedContracts(address[] memory contracts) public {
		require(owners[msg.sender], "Sender is not an owner");
		hasTrustedContracts = true;
		for(uint256 i = 0; i < contracts.length; i++) {
			trustedContracts[contracts[i]] = !trustedContracts[contracts[i]];
		}
	}

	function changeRelayersSource(address relayersAddress) public {
		require(owners[msg.sender], "Sender is not an owner");
		relayers = Relayers(relayersAddress);
	}

	receive() external payable { }

	/// @dev Forwards a meta transaction to a relayer contract.
	/// @param relayerContract Address of the relayer contract that must relay the transaction
	/// @param signature Signature by the signer of the other params.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction .
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	/// @param gasPriceLimit Gas price limit that the signer agreed to pay.
	/// @param nonce Nonce of the internal transaction.
	function forward(
		IRelayer relayerContract,
		bytes memory signature,
		address signer,
		address to ,
		uint value,
		bytes memory data,
		uint gasPriceLimit,
		uint256 nonce
	)
	isWhitelisted
	public
	{
		require(
			!hasTrustedContracts || trustedContracts[address(relayerContract)],
			"Unauthorized destination"
		);

		uint256 startGas = gasleft();

		bytes32 _hash = hashTxMessage(
			signer,
			to,
			value,
			data,
			nonce
		);

		uint256 id;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			id := chainid()
		}
		bytes32 domainSeparator = hashEIP712Domain(address(relayerContract), id);

		require(
			signerIsValid(_hash, signature, domainSeparator, signer),
			"Signer is not valid"
		);
		require(checkAndUpdateNonce(signer, nonce), "Nonce is invalid");

		relayerContract.relayExecute(
			signer, to, value, data
		);

		uint256 endGas = gasleft();
		uint256 forwardGasPrice = tx.gasprice < gasPriceLimit ? tx.gasprice : gasPriceLimit;
		uint256 consumedGas = startGas.sub(endGas);
		uint256 payment = forwardGasPrice * consumedGas;

		require(msg.sender.send(payment), "Could not pay relayer gas costs with ether");
	}

	/// @dev Message to sign expected for relay transaction.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction.
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	/// @param nonce Nonce of the internal transaction.
	function hashTxMessage(
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
			signer,
			to,
			value,
			keccak256(bytes(data)),
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
	function signerIsValid(bytes32 message, bytes memory signature, bytes32 domainSeparator, address expectedSigner)
	internal
	pure
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
				domainSeparator,
				message
			));
			// solium-disable-next-line arg-overflow
			return ecrecover(digest, v, r, s) == expectedSigner;
		}
	}

	/// @dev Calculate the domain separator of a EIP-712 signature
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

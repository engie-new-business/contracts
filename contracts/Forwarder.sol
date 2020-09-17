// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.7.0;

import "./SafeMath.sol";
import "./Implementation.sol";
import "./AuthorizedRelayers.sol";
import "./OwnersMap.sol";

contract Forwarder is Implementation, OwnersMap {
	using SafeMath for uint256;

	AuthorizedRelayers public relayers;
	mapping(address => bool) public trustedContracts;
	bool internal hasTrustedContracts;
	bool public initialized;

	// keccak256("EIP712Domain(address verifyingContract,uint256 chainId)")
	bytes32 constant EIP712DOMAIN_TYPEHASH =
		0xa1f4e2f207746c24e01c8e10e467322f5fea4cccab3cd2f1c95d700b6a0c218b;

	// TxMessage(address signer,address to,bytes data,uint256 nonce)
	bytes32 constant TXMESSAGE_TYPEHASH =
		0x5d3fdf13ba0a9438136f3f1e14d979bd76392edb80432892f8758dbeee524292;

	bytes32 eip712DomainSeparator;
	mapping(address => mapping(uint128 => uint128)) public channels;


	modifier isWhitelisted {
		require(relayers.verify(msg.sender), "Invalid sender");
		_;
	}

	constructor(address relayersAddress, address[] memory _trustedContracts) public {
		initialize(msg.sender, relayersAddress, _trustedContracts);
	}

	/// @dev Initialize function sets initial storage of contract. Should be call when instancied from factory
	/// @param owner owner of the forwarder
    	/// @param relayersAddress address of the contract that provide authorized relayer adresses
	/// @param _trustedContracts List of authorized destination for forward. Empty array to authorize all destinations
	// If deployed with a Factory, this method must be called in the same transaction to avoid a possible front-running attack
    function initialize(address owner, address relayersAddress, address[] memory _trustedContracts) public {
		require(!initialized, "Contract already initialized");
		initialized = true;

		owners[owner] = true;

		relayers = AuthorizedRelayers(relayersAddress);
		hasTrustedContracts = _trustedContracts.length > 0;
		for(uint256 i = 0; i < _trustedContracts.length; i++) {
			trustedContracts[_trustedContracts[i]] = true;
		}

		uint256 chainId;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			chainId := chainid()
		}
		eip712DomainSeparator = hashEIP712Domain(address(this), chainId);
	}

	function getNonce(address signer, uint128 channel) external view returns (uint128) {
		return channels[signer][channel];
	}

	function updateTrustedContracts(address[] memory contracts) external {
		require(owners[msg.sender], "Sender is not an owner");
		hasTrustedContracts = true;
		for(uint256 i = 0; i < contracts.length; i++) {
			trustedContracts[contracts[i]] = !trustedContracts[contracts[i]];
		}
	}

	function changeRelayersSource(address relayersAddress) external {
		require(owners[msg.sender], "Sender is not an owner");
		relayers = AuthorizedRelayers(relayersAddress);
	}

	/// @dev Owners of this Forwarder can withdraw funds
	function withdraw(uint amount) external {
		require(owners[msg.sender], "Sender is not an owner");
		require(amount <= address(this).balance, "Amount is too high");
		msg.sender.transfer(amount);
	}

	receive() external payable { }

	/// @dev Forwards a meta transaction to a destination contract
	/// @param signature Signature by the signer of the other params.
	/// @param signer Signer of the signature.
	/// @param to The the internal transaction destination.
	/// @param data Data payload of internal transaction.
	/// @param gasPriceLimit Gas price limit that the signer agreed to pay.
	/// @param nonce Nonce of the internal transaction.
	function forward(
		bytes memory signature,
		address signer,
		address to,
		bytes memory data,
		uint gasPriceLimit,
		uint256 nonce
	)
		isWhitelisted
		external
	{
		require(
			!hasTrustedContracts || trustedContracts[address(to)],
			"Unauthorized destination"
		);

		uint256 startGas = gasleft();

		bytes32 _hash = hashTxMessage(
			signer,
			to,
			data,
			nonce
		);

		require(
			signerIsValid(_hash, signature, eip712DomainSeparator, signer),
			"Signer is not valid"
		);
		require(checkAndUpdateNonce(signer, nonce), "Nonce is invalid");

		(bool success,) = to.call(abi.encodePacked(data, signer));
		if (!success) {
			assembly {
				returndatacopy(0, 0, returndatasize())
				revert(0, returndatasize())
			}
		}

		uint256 endGas = gasleft();
		uint256 forwardGasPrice = tx.gasprice < gasPriceLimit ? tx.gasprice : gasPriceLimit;
		uint256 consumedGas = startGas.sub(endGas);
		uint256 payment = forwardGasPrice * consumedGas;

		require(msg.sender.send(payment), "Could not refund gas to relayer");
	}

	/// @dev Estimate the gas require for forwading a meta transaction
	///      This method is only meant for estimation purpose, therefore two different protection mechanism against execution in a transaction have been made:
    ///      1.) The method can only be called from the safe itself
    ///      2.) The response is returned with a revert
	/// @param signature Signature by the signer of the other params.
	/// @param signer Signer of the signature.
	/// @param to The the internal transaction destination.
	/// @param data Data payload of internal transaction.
	/// @param gasPriceLimit Gas price limit that the signer agreed to pay.
	/// @param nonce Nonce of the internal transaction.
	function estimateForward(
		bytes calldata signature,
		address signer,
		address to,
		bytes calldata data,
		uint gasPriceLimit,
		uint256 nonce
	)
		external
	{
	    require(msg.sender == address(this));
		require(
			!hasTrustedContracts || trustedContracts[address(to)],
			"Unauthorized destination"
		);

		uint256 startGas = gasleft();

		bytes32 _hash = hashTxMessage(
			signer,
			to,
			data,
			nonce
		);

		require(
			signerIsValid(_hash, signature, eip712DomainSeparator, signer),
			"Signer is not valid"
		);

		// check the nonce but don't revert if invalid
		checkAndUpdateNonce(signer, nonce);

		(bool success,) = to.call(abi.encodePacked(data, signer));
		require(success);

		uint256 endGas = gasleft();
		uint256 forwardGasPrice = tx.gasprice < gasPriceLimit ? tx.gasprice : gasPriceLimit;
		uint256 consumedGas = startGas.sub(endGas);
		uint256 payment = forwardGasPrice * consumedGas;

		require(msg.sender.send(payment), "Could not refund gas to relayer");

		revert(string(abi.encodePacked(consumedGas)));
	}

	/// @dev Message to sign expected for relay transaction.
	/// @param signer Signer of the signature.
	/// @param to Address of the destination
	/// @param data Data payload of internal transaction.
	/// @param nonce Nonce of the internal transaction.
	function hashTxMessage(
		address signer,
		address to,
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
			keccak256(bytes(data)),
			nonce
		));
	}

	/// @dev Verify the nonce and then update it.
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

	function upgradeTo(address newImplementation) public {
		require(owners[msg.sender], "Sender is not an owner");
		updateImplementation(newImplementation);
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

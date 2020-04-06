pragma solidity >=0.6.0 <0.7.0;

import "./Identity.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract RelayableIdentityRewarder is Identity {
	using SafeMath for uint256;

	/* keccak256("EIP712Domain(address verifyingContract,uint256 chainId)"); */
	bytes32 constant EIP712DOMAIN_TYPEHASH = 0xa1f4e2f207746c24e01c8e10e467322f5fea4cccab3cd2f1c95d700b6a0c218b;

	/* keccak256("TxMessage(address signer,address to,uint256 value,bytes data,uint256 nonce)"); */
	bytes32 constant TXMESSAGE_TYPEHASH = 0xd3a5dbc47f098f34f663b1d3b74bd4df78ba7e6428e04914120023dfcd11b99b;

	/* keccak256("Create2Message(address signer,uint256 value,uint256 salt,bytes initCode,uint256 nonce)"); */
	bytes32 constant CREATE2MESSAGE_TYPEHASH = 0xc13a5d7d915160f35b84a9d8067ce023df85669f794516ca525ded719106da5b;

	bytes32 DOMAIN_SEPARATOR;

	// gas required to finish execution of relay and payment after internal call
	uint constant REQUIRE_GAS_LEFT_AFTER_EXEC = 15000;

	mapping(address => uint) public relayNonce;

	event RelayedExecute (bool success, uint256 payment);
	event RelayedDeploy (address contractAddress, uint256 payment);

	constructor(address customerAccount) Identity(customerAccount) public {
		uint256 id;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			id := chainid()
		}

		DOMAIN_SEPARATOR = hashEIP712Domain(address(this), id);
		whitelist[address(this)] = true;
	}

	function hashEIP712Domain(address verifyingContract, uint256 chainId) internal pure returns (bytes32) {
		return keccak256(abi.encode(
			EIP712DOMAIN_TYPEHASH,
			verifyingContract,
			chainId
		));
	}

	function hashTxMessage(address signer, address destination, uint value, bytes memory data, uint256 gasLimit, uint256 gasPrice) public view returns (bytes32) {
		return keccak256(abi.encode(
			TXMESSAGE_TYPEHASH,
			signer,
			destination,
			value,
			keccak256(bytes(data)),
			gasLimit,
			gasPrice,
			relayNonce[signer]
		));
	}

	function hashCreateMessage(address signer, uint256 value, bytes32 salt, bytes memory initCode, uint256 gasLimit, uint256 gasPrice) public view returns (bytes32) {
		return keccak256(abi.encode(
			CREATE2MESSAGE_TYPEHASH,
			signer,
			value,
			salt,
			keccak256(bytes(initCode)),
			gasLimit,
			gasPrice,
			relayNonce[signer]
		));
	}

	function relayExecute(bytes memory sig, address signer, address destination, uint value, bytes memory data, uint gasLimit, uint gasPrice) public {
		uint initialGas = gasleft();
		require(tx.gasprice <= gasPrice || gasPrice == 0, "Tx gasPrice higher than agreed gasPrice");

		bytes32 _hash = hashTxMessage(signer, destination, value, data, gasLimit, gasPrice);

		require(signerIsWhitelisted(_hash,sig),"Signer is not whitelisted");

		relayNonce[signer]++;

		uint remainingGas = gasleft();
		require(remainingGas > REQUIRE_GAS_LEFT_AFTER_EXEC, "Execution cost exceeded gas limit");
		bool success = executeCall(remainingGas - REQUIRE_GAS_LEFT_AFTER_EXEC, destination, value, data);

		if(gasPrice == 0) {
			emit RelayedExecute(success, 0);
			return;
		}

		uint256 txSendCost = msg.data.length.mul(16).add(21000); // 21000 (transaction) + 64/4 (we assume that the quarter of data bytes are non zero) * msg.data.length
		uint256 gasUsed = initialGas.sub(gasleft()).add(txSendCost).add(REQUIRE_GAS_LEFT_AFTER_EXEC);
		require(gasUsed <=  gasLimit || gasLimit == 0, "Execution cost exceeded agreed gasLimit");
		uint256 payment = handlePayment(gasUsed, gasPrice);

		emit RelayedExecute(success, payment);
	}

	function relayDeploy(bytes memory sig, address signer, uint256 value, bytes32 salt, bytes memory initCode, uint gasLimit, uint gasPrice) public {
		uint initialGas = gasleft();
		require(tx.gasprice <=  gasPrice || gasPrice == 0, "Tx gasPrice higher than agreed gasPrice");

		bytes32 _hash = hashCreateMessage(signer, value, salt, initCode, gasLimit, gasPrice);

		require(signerIsWhitelisted(_hash,sig),"Signer is not whitelisted");

		relayNonce[signer]++;

		address addr = executeCreate2(value, salt, initCode);

		if(gasPrice == 0) {
			emit RelayedDeploy(addr, 0);
			return;
		}

		uint256 txSendCost = msg.data.length.mul(64).add(21000); // 21000 (transaction) + 64 (we assume that all data bytes are non zero) * msg.data.length
		uint256 gasUsed = initialGas.sub(gasleft()).add(txSendCost).add(REQUIRE_GAS_LEFT_AFTER_EXEC);
		require(gasUsed <=  gasLimit || gasLimit == 0, "Execution cost exceeded agreed gasLimit");
		uint256 payment = handlePayment(gasUsed.add(txSendCost).add(REQUIRE_GAS_LEFT_AFTER_EXEC), gasPrice);

		emit RelayedDeploy(addr, payment);
	}

	function handlePayment(
		uint256 consumed,
		uint256 gasPrice
	)
		private
		returns (uint256)
	{
		uint256 payment = consumed.mul(gasPrice);

		require(msg.sender.send(payment), "Could not pay gas costs with ether");

	    return payment;
	}

	function signerIsWhitelisted(bytes32 _hash, bytes memory _signature) internal view returns (bool){
		bytes32 r;
		bytes32 s;
		uint8 v;
		// Check the signature length
		if (_signature.length != 65) {
			return false;
		}
		// Divide the signature in r, s and v variables
		// ecrecover takes the signature parameters, and the only way to get them
		// currently is to use assembly.
		// solium-disable-next-line security/no-inline-assembly
		assembly {
			r := mload(add(_signature, 32))
			s := mload(add(_signature, 64))
			v := byte(0, mload(add(_signature, 96)))
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
				_hash
			));
			// solium-disable-next-line arg-overflow
			return whitelist[ecrecover(digest, v, r, s)];
		}
	}
}

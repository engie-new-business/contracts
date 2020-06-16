pragma solidity >=0.6.0 <0.7.0;

import "../IRelayer.sol";
import "../SafeMath.sol";
import "../Relayers.sol";
import "../OwnersMap.sol";

contract DummyForwarder is OwnersMap {
	using SafeMath for uint256;
	Relayers public relayers;
	mapping(address => bool) public trustedContracts;
	bool public initialized;

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
		for(uint256 i = 0; i < contracts.length; i++) {
			trustedContracts[contracts[i]] = true;
		}
	}

	function updateTrustedContracts(address[] memory contracts) public {
		require(owners[msg.sender], "Sender is not an owner");
		for(uint256 i = 0; i < contracts.length; i++) {
			trustedContracts[contracts[i]] = !trustedContracts[contracts[i]];
		}
	}

	function changeRelayersSource(address relayersAddress) public {
		require(owners[msg.sender], "Sender is not an owner");
        relayers = Relayers(relayersAddress);
	}

	receive() external payable { }

	function dummyFunction() public pure returns (string memory) {
		return "dummy";
	}

	/// @dev Forwards a meta transaction to a relayer contract.
	/// @param relayerContract Address of the relayer contract that must relay the transaction
	/// @param signature Signature by the signer of the other params.
	/// @param signer Signer of the signature.
	/// @param to Destination address of internal transaction .
	/// @param value Ether value of internal transaction.
	/// @param data Data payload of internal transaction.
	/// @param gasLimit Execution gas limit that the signer agreed to pay.
	/// @param gasPrice Gas price limit that the signer agreed to pay.
	/// @param nonce Nonce of the internal transaction.
	function forward(
		IRelayer relayerContract,
		bytes memory signature,
		address relayer,
		address signer,
		address to ,
		uint value,
		bytes memory data,
		uint gasLimit,
		uint gasPrice,
		uint256 nonce
	)
	    isWhitelisted
		public
	{
		require(
			relayer == msg.sender || relayer == address(0),
			"Invalid relayer"
		);
		require(trustedContracts[address(relayerContract)], "Unauthorized destination");

		uint256 startGas = gasleft();

		relayerContract.relayExecute(
			signer, to, value, data
		);

		uint256 endGas = gasleft();
		uint256 forwardGasPrice = gasPrice > tx.gasprice ? tx.gasprice : gasPrice;
		uint256 consumedGas = startGas.sub(endGas);
		uint256 payment = forwardGasPrice * consumedGas;

		require(msg.sender.send(payment), "Could not pay relayer gas costs with ether");
	}
}

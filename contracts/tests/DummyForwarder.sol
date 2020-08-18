// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.7.0;

import "../SafeMath.sol";
import "../Implementation.sol";
import "../AuthorizedRelayers.sol";
import "../OwnersMap.sol";

contract DummyForwarder is Implementation, OwnersMap {
	using SafeMath for uint256;

	AuthorizedRelayers public relayers;
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
		relayers = AuthorizedRelayers(relayersAddress);
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
		relayers = AuthorizedRelayers(relayersAddress);
	}

	receive() external payable { }

	function dummyFunction() public pure returns (string memory) {
		return "dummy";
	}
}

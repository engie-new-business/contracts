// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.7.0;

contract AuthorizedRelayers {
	mapping(address => bool) public whitelist;
	address public owner;

	modifier onlyOwner() {
		require(msg.sender == owner, "caller is not the owner");
		_;
	}

	constructor(address[] memory senders) public {
		owner = msg.sender;
		for(uint64 i; i < senders.length; i++) {
			whitelist[senders[i]] = true;
		}
	}

	function add(address[] memory senders) external onlyOwner {
		for(uint16 i; i < senders.length; i++) {
			whitelist[senders[i]] = true;
		}
	}

	function remove(address[] memory senders) external onlyOwner {
		for(uint16 i; i < senders.length; i++) {
			whitelist[senders[i]] = false;
		}
	}

	function transferOwnership(address newOwner) external onlyOwner {
		require(newOwner != address(0), "new owner is the zero address");
		owner = newOwner;
	}

	function verify(address sender) external view returns (bool) {
		return whitelist[sender];
	}
}

pragma solidity >=0.6.0 <0.7.0;

contract Whitelist {
	mapping(address => bool) public whitelist;

	constructor(address[] memory senders) public {
		for(uint64 i; i < senders.length; i++) {
			whitelist[senders[i]] = true;
		}
	}

	function add(address[] memory senders) public {
		require(whitelist[msg.sender]);
		for(uint16 i; i < senders.length; i++) {
			whitelist[senders[i]] = true;
		}
	}

	function remove(address[] memory senders) public {
		require(whitelist[msg.sender]);
		for(uint16 i; i < senders.length; i++) {
			whitelist[senders[i]] = false;
		}
	}

	function verify(address sender) public view returns (bool) {
		return whitelist[sender];
	}
}

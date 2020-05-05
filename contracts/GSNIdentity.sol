pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./Identity.sol";
import "@openzeppelin/contracts/GSN/GSNRecipient.sol";
import "@openzeppelin/contracts/GSN/IRelayHub.sol";

contract GSNIdentity is Identity, GSNRecipient {
	modifier onlyWhitelisted() override {
		require(whitelist[_msgSender()], "Account Not Whitelisted");
		_;
	}

	constructor(address customerAccount) Identity(customerAccount) public {
		whitelist[address(this)] = true;
	}

	receive() external override payable { emit Received(_msgSender(), msg.value); }

	function acceptRelayedCall(address, address from, bytes calldata, uint256, uint256, uint256, uint256, bytes calldata, uint256)
	external view override returns (uint256, bytes memory) {
		if(!whitelist[from]) {
			return (0, bytes("signer not whitelisted"));
		}

		return (1, "");
	}

	function deposit() public payable {
		require(msg.value != 0, "Value required for deposit");
		IRelayHub(getHubAddr()).depositFor{value: msg.value}(address(this));
	}

	function withdrawDeposits(uint256 amount, address payable payee) public onlyWhitelisted {
		_withdrawDeposits(amount, payee);
	}

	function _preRelayedCall(bytes memory context) internal override returns (bytes32) {
	}

	function _postRelayedCall(bytes memory context, bool, uint256 actualCharge, bytes32) internal override {
	}
}

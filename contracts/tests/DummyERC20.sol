pragma solidity >=0.4.22 <0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DummyERC20 is ERC20 {
	constructor (string memory name, string memory symbol) ERC20(name, symbol) public {
	}
}

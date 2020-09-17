// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.7.0;

/// @dev Proxy implementation based on https://blog.openzeppelin.com/proxy-patterns/
contract Proxy {

    // implementation always needs to be first declared variable, to ensure that it is at the same location in the contracts to which calls are delegated.
    // For this purpose, these contracts must first inherit from Implementation class (Implementation.sol)
    // Storage slots are blindly used by implementation. Do not declare any storage variable here.
    address public implementation;

    /// @dev Constructor function sets address of implementation contract.
    /// @param _implementation Implemation address.
    constructor(address _implementation) payable public {
        implementation = _implementation;
    }

    /// @dev Fallback function forwards all transactions and returns all received return data.
    fallback() external payable {
        address _impl = implementation;

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let result := delegatecall(gas(), _impl, ptr, calldatasize(), 0, 0)
            let size := returndatasize()
            returndatacopy(ptr, 0, size)

            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }
    }

    receive() external payable {}
}

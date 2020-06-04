pragma solidity >=0.6.0 <0.7.0;

import "./OwnersMap.sol";

contract Proxy is OwnersMap {
    string public version;
    address public implementation;

    event Upgraded(string version, address implementation);

    constructor(address owner, string memory _version, address _implementation) public {
        owners[owner] = true;
        owners[address(this)] = true;
        version = _version;
        implementation = _implementation;
    }

    function upgradeTo(string memory newVersion, address newImplementation) public {
        require(owners[msg.sender], "Sender is not an owner");
        require(implementation != newImplementation, "Implementation already used");
        version = newVersion;
        implementation = newImplementation;
        emit Upgraded(newVersion, newImplementation);
    }

    function upgradeToAndCall(string memory newVersion, address newImplementation, bytes memory data) payable public {
        upgradeTo(newVersion, newImplementation);
        (bool success,) = address(this).call.value(msg.value)(data);
        require(success, "Failing call after upgrade");
    }

    fallback() external payable {
        address _impl = implementation;
        require(_impl != address(0), "No implementation provided");

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

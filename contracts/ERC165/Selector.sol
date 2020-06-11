pragma solidity >=0.6.0 <0.7.0;

import "../IIdentity.sol";
import "../IRelayer.sol";

contract Selector {
    // 0xfb07fcd2
    function getIdentityEIP165ID() external pure returns (bytes4) {
        IIdentity i;
        return  i.getData.selector ^ i.setData.selector ^ i.execute.selector ^ i.deploy.selector;
    }

    // 0x89dae43a
    function getRelayerEIP165ID() external pure returns (bytes4) {
        IRelayer i;
        return  i.relayExecute.selector;
    }
}

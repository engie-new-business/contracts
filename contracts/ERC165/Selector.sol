pragma solidity >=0.6.0 <0.7.0;

import "../ISmartWallet.sol";
import "../IRelayer.sol";

contract Selector {
    // 0xfb07fcd2
    function getSmartWalletEIP165ID() external pure returns (bytes4) {
        ISmartWallet i;
        return  i.getData.selector ^ i.setData.selector ^ i.execute.selector ^ i.deploy.selector;
    }

    // 0xd9fb9e4a
    function getRelayerEIP165ID() external pure returns (bytes4) {
        IRelayer i;
        return  i.relayExecute.selector;
    }
}

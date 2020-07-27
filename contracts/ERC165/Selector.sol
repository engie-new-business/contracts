// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.6.0 <0.7.0;

import "../SmartWallet.sol";

contract Selector {
    // 0xfb07fcd2
    function getSmartWalletEIP165ID() external pure returns (bytes4) {
        SmartWallet i;
        return  i.getData.selector ^ i.setData.selector ^ i.execute.selector ^ i.deploy.selector;
    }
}

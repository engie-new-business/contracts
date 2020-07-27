// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.22 <0.7.0;

contract LogSomething {
  event rememberThis(bytes32 _iMember);
  uint256 public dummy;
  mapping(uint256 => bytes32) public dummmyMap;

  function logThis(bytes32[] memory _thingsToRemember) public
  {
    for (uint i = 0; i < _thingsToRemember.length; i++)
    {
      emit rememberThis(_thingsToRemember[i]);
    }
  }

  function doDumbStuff(bytes32[] memory _thingsToRemember) public
  {
    for (uint i = 0; i < _thingsToRemember.length; i++)
    {
        dummmyMap[dummy] = _thingsToRemember[i];
        dummy++;
    }
  }
}

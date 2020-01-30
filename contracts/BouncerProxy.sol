pragma solidity >=0.5.0 <0.7.0;

contract BouncerProxy {
	// gas required to finish execution of relay() after internal call
	uint constant REQUIRE_GAS_LEFT_AFTER_EXEC = 5000;

	//to avoid replay
	mapping(address => uint) public relayNonce;

	// allow for third party metatx account to make transactions through this
	// contract like an identity but make sure the owner has whitelisted the tx
	mapping(address => bool) public whitelist;

	event UpdateWhitelist(address _account, bool _value);
	event Received (address indexed sender, uint value);
	event Relayed (bool success);
	event RelayedCreate2 (address contractAddress);

	event Called(address destination, uint256 value, bytes data);
	event Created2(uint256 value, bytes32 salt, bytes initCode);

	constructor(address customerAccount) public {
		whitelist[customerAccount] = true;
	}

	modifier onlyWhitelisted() {
		require(whitelist[msg.sender],"Account Not Whitelisted");
		_;
	}

	function updateWhitelist(address _account, bool _value) onlyWhitelisted public returns(bool) {
		whitelist[_account] = _value;
		emit UpdateWhitelist(_account,_value);
		return true;
	}

	// copied from https://github.com/uport-project/uport-identity/blob/develop/contracts/Proxy.sol
	function() external payable { emit Received(msg.sender, msg.value); }

	function getCallHash(address signer, address destination, uint value, bytes memory data) public view returns(bytes32){
		return keccak256(abi.encode(address(this), signer, destination, value, data, relayNonce[signer]));
	}

	function relay(bytes memory sig, address signer, address destination, uint value, bytes memory data) public {
		//the hash contains all of the information about the meta transaction to be called
		bytes32 _hash = getCallHash(signer, destination, value, data);

		//this makes sure signer signed correctly AND signer is a valid bouncer
		require(signerIsWhitelisted(_hash,sig),"Signer is not whitelisted");

		//increment the hash so this tx can't run again
		relayNonce[signer]++;

		uint remainingGas = gasleft();
		require(remainingGas > REQUIRE_GAS_LEFT_AFTER_EXEC);
		bool success = executeCall(remainingGas - REQUIRE_GAS_LEFT_AFTER_EXEC, destination, value, data);
		emit Relayed(success);
	}

	function doCall(address destination, uint value, bytes memory data) onlyWhitelisted public {
		require(executeCall(gasleft(), destination, value, data));
	}

	function doCreate2(uint256 value, bytes32 salt, bytes memory initCode) onlyWhitelisted public returns (address) {
		address addr = executeCreate2(value, salt, initCode);
		require(addr != address(0x0));
		return addr;
	}

	// copied from https://github.com/uport-project/uport-identity/blob/develop/contracts/Proxy.sol
	// which was copied from GnosisSafe
	// https://github.com/gnosis/gnosis-safe-contracts/blob/master/contracts/GnosisSafe.sol
	function executeCall(uint gasLimit, address to, uint256 value, bytes memory data) internal returns (bool success) {
		assembly {
			success := call(gasLimit, to, value, add(data, 0x20), mload(data), 0, 0)
		}
	}

	function getCreate2Hash(address signer, uint256 value, bytes32 salt, bytes memory initCode) public view returns(bytes32){
		return keccak256(abi.encode(address(this), signer, value, salt, initCode, relayNonce[signer]));
	}

	function relayCreate2(bytes memory sig, address signer, uint256 value, bytes32 salt, bytes memory initCode) public {
		//the hash contains all of the information about the meta transaction to be called
		bytes32 _hash = getCreate2Hash(signer, value, salt, initCode);

		//this makes sure signer signed correctly AND signer is a valid bouncer
		require(signerIsWhitelisted(_hash,sig),"Signer is not whitelisted");

		//increment the hash so this tx can't run again
		relayNonce[signer]++;

		address addr = executeCreate2(value, salt, initCode);
		emit RelayedCreate2(addr);
	}

	function executeCreate2(uint256 value, bytes32 salt, bytes memory bytecode) internal returns (address addr) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            addr := create2(value, add(bytecode, 0x20), mload(bytecode), salt)
        }
	}

	//borrowed from OpenZeppelin's ESDA stuff:
	//https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/cryptography/ECDSA.sol
	function signerIsWhitelisted(bytes32 _hash, bytes memory _signature) internal view returns (bool){
		bytes32 r;
		bytes32 s;
		uint8 v;
		// Check the signature length
		if (_signature.length != 65) {
			return false;
		}
		// Divide the signature in r, s and v variables
		// ecrecover takes the signature parameters, and the only way to get them
		// currently is to use assembly.
		// solium-disable-next-line security/no-inline-assembly
		assembly {
			r := mload(add(_signature, 32))
			s := mload(add(_signature, 64))
			v := byte(0, mload(add(_signature, 96)))
		}
		// Version of signature should be 27 or 28, but 0 and 1 are also possible versions
		if (v < 27) {
			v += 27;
		}
		// If the version is correct return the signer address
		if (v != 27 && v != 28) {
			return false;
		} else {
			// solium-disable-next-line arg-overflow
			return whitelist[ecrecover(keccak256(
				abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)
			), v, r, s)];
		}
	}
}

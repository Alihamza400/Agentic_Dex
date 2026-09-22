// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./DexPair.sol";

contract DexFactory is Ownable, Pausable {
    // Mapping to track pairs
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    // Event emitted when a new pair is created
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    constructor(address _owner) Ownable(_owner) {
    }

    // -------- Emergency Controls --------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Create a new DexPair for tokenA and tokenB
     * @param tokenA Address of token A
     * @param tokenB Address of token B
     * @return pair Address of the newly created DexPair
     */
    function createPair(address tokenA, address tokenB) external whenNotPaused returns (address pair) {
        require(tokenA != tokenB, "DexFactory: Identical tokens");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "DexFactory: Zero address");
        require(getPair[token0][token1] == address(0), "DexFactory: Pair exists");

        // Create new DexPair using CREATE2
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new DexPair{salt: salt}());

        // Initialize the pair with tokens
        DexPair(pair).initialize(token0, token1);

        // Store in mapping
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;

        // Add to array of all pairs
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /**
     * @notice Returns the total number of pairs created
     */
    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }
}

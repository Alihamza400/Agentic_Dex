// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DexPair.sol";

contract DexFactory is Ownable {
    // Mapping to track pairs
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    // Event emitted when a new pair is created
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    constructor() Ownable(msg.sender) {
    }

    /**
     * @notice Create a new DexPair for tokenA and tokenB
     * @param tokenA Address of token A
     * @param tokenB Address of token B
     * @return pair Address of the newly created DexPair
     */
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "DexFactory: Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "DexFactory: Zero address");
        require(getPair[tokenA][tokenB] == address(0), "DexFactory: Pair exists");

        // Create new DexPair using CREATE2
        bytes32 salt = keccak256(abi.encodePacked(tokenA, tokenB));
        pair = address(new DexPair{salt: salt}());

        // Initialize the pair with tokens
        DexPair(pair).initialize(tokenA, tokenB);

        // Store in mapping
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;

        // Add to array of all pairs
        allPairs.push(pair);

        emit PairCreated(tokenA, tokenB, pair, allPairs.length);
    }

    /**
     * @notice Returns the total number of pairs created
     */
    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }
}

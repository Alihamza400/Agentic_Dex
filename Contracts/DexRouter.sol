// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DexFactory.sol";
import "./DexPair.sol";
import "./interfaces/IERC20.sol";

contract DexRouter {
    DexFactory public factory;

    constructor(address _factory) {
        factory = DexFactory(_factory);
    }

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "DexRouter: EXPIRED");
        _;
    }

    // ---------------- Add Liquidity ----------------
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint deadline
    ) external ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        address pair = factory.getPair(tokenA, tokenB);

        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
        }

        // Pull tokens from user
        IERC20(tokenA).transferFrom(msg.sender, pair, amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountBDesired);

        // Sort tokens and amounts to match Pair's internal token0/token1
        (uint amount0, uint amount1) = tokenA < tokenB ? (amountADesired, amountBDesired) : (amountBDesired, amountADesired);

        // Add liquidity
        liquidity = DexPair(pair).addLiquidity(amount0, amount1, msg.sender);
        amountA = amountADesired;
        amountB = amountBDesired;
    }

    // ---------------- Remove Liquidity ----------------
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        uint deadline
    ) external ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = factory.getPair(tokenA, tokenB);
        require(pair != address(0), "Pair doesn't exist");

        // Transfer LP tokens from user to pair
        IERC20(DexPair(pair).lpToken()).transferFrom(msg.sender, pair, liquidity);

        // Remove liquidity
        (amountA, amountB) = DexPair(pair).removeLiquidity(liquidity);

        require(amountA >= amountAMin, "DexRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "DexRouter: INSUFFICIENT_B_AMOUNT");
    }

    // ---------------- Single Hop Swap ----------------
    function swapExactTokensForTokensSingle(
        address tokenIn,
        address tokenOut,
        uint amountIn,
        uint minAmountOut,
        uint deadline
    ) external ensure(deadline) returns (uint amountOut) {
        address pair = factory.getPair(tokenIn, tokenOut);
        require(pair != address(0), "Pair doesn't exist");

        // Pull tokens from user
        IERC20(tokenIn).transferFrom(msg.sender, pair, amountIn);

        // Swap (The pair handles the transfer out to the user)
        amountOut = DexPair(pair).swap(amountIn, tokenIn, msg.sender);
        require(amountOut >= minAmountOut, "Slippage exceeded");
    }

    // ---------------- Multi-Hop Swap ----------------
    function swapExactTokensForTokens(
        uint amountIn,
        uint minAmountOut,
        address[] calldata path,
        uint deadline
    ) external ensure(deadline) returns (uint[] memory amounts) {
        require(path.length >= 2, "Invalid path");

        amounts = new uint[](path.length);
        amounts[0] = amountIn;

        // Pull first token from user to first pair
        address firstPair = factory.getPair(path[0], path[1]);
        require(firstPair != address(0), "First pair doesn't exist");
        IERC20(path[0]).transferFrom(msg.sender, firstPair, amountIn);

        for (uint i = 0; i < path.length - 1; i++) {
            address tokenIn = path[i];
            address tokenOut = path[i + 1];
            address pair = factory.getPair(tokenIn, tokenOut);
            require(pair != address(0), "Pair doesn't exist");

            // Destination for the swap output
            // If it's the last hop, send to user. Otherwise send to next pair.
            address to = i < path.length - 2 
                ? factory.getPair(path[i + 1], path[i + 2]) 
                : msg.sender;

            uint amountOut = DexPair(pair).swap(amounts[i], tokenIn, to);
            amounts[i + 1] = amountOut;
        }

        require(amounts[amounts.length - 1] >= minAmountOut, "Slippage exceeded");

        // Swap successful - tokens already transferred during loop
    }

    // ---------------- TWAP Getter ----------------
    function getTWAP(address tokenA, address tokenB) external view returns (uint price0Cum, uint price1Cum) {
        address pair = factory.getPair(tokenA, tokenB);
        require(pair != address(0), "Pair doesn't exist");
        return DexPair(pair).getTWAP();
    }

    // ---------------- Utility ----------------
    function quote(
        uint amountIn,
        uint reserveIn,
        uint reserveOut
    ) external pure returns (uint amountOut) {
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");
        return (amountIn * reserveOut) / reserveIn;
    }
}

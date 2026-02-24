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

    // ---------------- Add Liquidity ----------------
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired
    ) external returns (uint amountA, uint amountB, uint liquidity) {
        address pair = factory.getPair(tokenA, tokenB);

        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
        }

        // Pull tokens from user
        IERC20(tokenA).transferFrom(msg.sender, pair, amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountBDesired);

        // Add liquidity
        liquidity = DexPair(pair).addLiquidity(amountADesired, amountBDesired);
        amountA = amountADesired;
        amountB = amountBDesired;
    }

    // ---------------- Single Hop Swap ----------------
    function swapExactTokensForTokensSingle(
        address tokenIn,
        address tokenOut,
        uint amountIn,
        uint minAmountOut
    ) external returns (uint amountOut) {
        address pair = factory.getPair(tokenIn, tokenOut);
        require(pair != address(0), "Pair doesn't exist");

        // Pull tokens from user
        IERC20(tokenIn).transferFrom(msg.sender, pair, amountIn);

        // Swap
        amountOut = DexPair(pair).swap(amountIn, tokenIn);
        require(amountOut >= minAmountOut, "Slippage exceeded");

        // Transfer output to user
        IERC20(tokenOut).transfer(msg.sender, amountOut);
    }

    // ---------------- Multi-Hop Swap ----------------
    function swapExactTokensForTokens(
        uint amountIn,
        uint minAmountOut,
        address[] calldata path
    ) external returns (uint[] memory amounts) {
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

            // Swap amount
            uint amountOut = DexPair(pair).swap(amounts[i], tokenIn);
            amounts[i + 1] = amountOut;

            // For all intermediate hops, the output is already in the pair, no need to transfer
            // The next pair will pull its input during swap if required
        }

        require(amounts[amounts.length - 1] >= minAmountOut, "Slippage exceeded");

        // Transfer final token to user
        IERC20(path[path.length - 1]).transfer(msg.sender, amounts[amounts.length - 1]);
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DexFactory.sol";
import "./DexPair.sol";
import "./interfaces/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract DexRouter is Ownable, Pausable {
    DexFactory public factory;

    constructor(address _factory, address _owner) Ownable(_owner) {
        factory = DexFactory(_factory);
    }

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "DexRouter: EXPIRED");
        _;
    }

    // -------- Emergency Controls --------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------- Add Liquidity ----------------
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint deadline
    ) external ensure(deadline) whenNotPaused returns (uint amountA, uint amountB, uint liquidity) {
        require(tokenA != tokenB, "DexRouter: IDENTICAL_TOKENS");
        require(amountADesired > 0 && amountBDesired > 0, "DexRouter: ZERO_AMOUNT");

        address pair = factory.getPair(tokenA, tokenB);

        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
        }

        bool isToken0A = tokenA < tokenB;
        (uint amount0, uint amount1) = isToken0A
            ? (amountADesired, amountBDesired)
            : (amountBDesired, amountADesired);

        // Match the existing pool ratio so no value is donated to existing LPs.
        (uint112 r0, uint112 r1) = DexPair(pair).getReserves();
        if (r0 > 0 && r1 > 0) {
            uint amount1Optimal = (amount0 * r1) / r0;
            if (amount1Optimal <= amount1) {
                amount1 = amount1Optimal;
            } else {
                uint amount0Optimal = (amount1 * r0) / r1;
                require(amount0Optimal <= amount0, "DexRouter: INSUFFICIENT_A_AMOUNT");
                amount0 = amount0Optimal;
            }
        }

        (amountA, amountB) = isToken0A ? (amount0, amount1) : (amount1, amount0);

        // Pull only the amounts that will actually be used
        IERC20(tokenA).transferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountB);

        // Add liquidity
        liquidity = DexPair(pair).addLiquidity(amount0, amount1, msg.sender);
    }

    // ---------------- Remove Liquidity ----------------
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        uint deadline
    ) external ensure(deadline) whenNotPaused returns (uint amountA, uint amountB) {
        address pair = factory.getPair(tokenA, tokenB);
        require(pair != address(0), "Pair doesn't exist");
        require(liquidity > 0, "DexRouter: ZERO_LIQUIDITY");

        // Transfer LP tokens from user to pair
        IERC20(DexPair(pair).lpToken()).transferFrom(msg.sender, pair, liquidity);

        // Remove liquidity - the pair always returns (amount0, amount1)
        // and forwards the underlying tokens directly to the user.
        (uint amount0, uint amount1) = DexPair(pair).removeLiquidity(liquidity, msg.sender);

        // Map back to the caller's (tokenA, tokenB) ordering before slippage checks
        (amountA, amountB) = tokenA < tokenB ? (amount0, amount1) : (amount1, amount0);

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
    ) external ensure(deadline) whenNotPaused returns (uint amountOut) {
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
    ) external ensure(deadline) whenNotPaused returns (uint[] memory amounts) {
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

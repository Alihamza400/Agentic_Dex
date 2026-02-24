// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Token/LP_Token.sol";
import "./interfaces/IERC20.sol";

contract DexPair {
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;

    LPToken public lpToken;

    event Mint(address indexed provider, uint amount0, uint amount1, uint liquidity);
    event Burn(address indexed provider, uint amount0, uint amount1, uint liquidity);
    event Swap(address indexed sender, uint amountIn, uint amountOut);

    bool initialized = false;

    function initialize(address _token0, address _token1) external {
        require(!initialized, "Already initialized");
        token0 = _token0;
        token1 = _token1;

        lpToken = new LPToken("LP Token", "LPT");

        initialized = true;
    }

    // -------- Internal Helpers --------
    function _update(uint112 _res0, uint112 _res1) private {
        reserve0 = _res0;
        reserve1 = _res1;
    }

    function getReserves() public view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    // -------- Add Liquidity --------
    function addLiquidity(uint amount0, uint amount1) external returns (uint liquidity) {
        IERC20(token0).transferFrom(msg.sender, address(this), amount0);
        IERC20(token1).transferFrom(msg.sender, address(this), amount1);

        (uint112 _r0, uint112 _r1) = getReserves();

        if (_r0 == 0 && _r1 == 0) {
            liquidity = sqrt(amount0 * amount1);
        } else {
            liquidity = min((amount0 * lpToken.totalSupply()) / _r0,
                            (amount1 * lpToken.totalSupply()) / _r1);
        }

        require(liquidity > 0, "Insufficient liquidity");
        lpToken._mint(msg.sender, liquidity);

        _update(_r0 + uint112(amount0), _r1 + uint112(amount1));

        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    // -------- Remove Liquidity --------
    function removeLiquidity(uint liquidity) external returns (uint amount0, uint amount1) {
        uint _totalSupply = lpToken.totalSupply();

        (uint112 _r0, uint112 _r1) = getReserves();

        amount0 = (liquidity * _r0) / _totalSupply;
        amount1 = (liquidity * _r1) / _totalSupply;

        lpToken._burn(msg.sender, liquidity);

        _update(_r0 - uint112(amount0), _r1 - uint112(amount1));

        IERC20(token0).transfer(msg.sender, amount0);
        IERC20(token1).transfer(msg.sender, amount1);

        emit Burn(msg.sender, amount0, amount1, liquidity);
    }

    // -------- Swap --------
    function swap(uint amountIn, address tokenIn) external returns(uint amountOut) {
        require(tokenIn == token0 || tokenIn == token1, "Invalid token");

        bool isToken0 = tokenIn == token0;
        (uint112 r0, uint112 r1) = getReserves();

        if (isToken0) {
            amountOut = getAmountOut(amountIn, r0, r1);
            IERC20(token0).transferFrom(msg.sender, address(this), amountIn);
            IERC20(token1).transfer(msg.sender, amountOut);
            _update(r0 + uint112(amountIn), r1 - uint112(amountOut));
        } 
        else {
            amountOut = getAmountOut(amountIn, r1, r0);
            IERC20(token1).transferFrom(msg.sender, address(this), amountIn);
            IERC20(token0).transfer(msg.sender, amountOut);
            _update(r0 - uint112(amountOut), r1 + uint112(amountIn));
        }

        emit Swap(msg.sender, amountIn, amountOut);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) public pure returns(uint) {
        uint amountInWithFee = amountIn * 997; 
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = reserveIn * 1000 + amountInWithFee;
        return numerator / denominator;
    }

    // -------- Utils --------
    function min(uint x, uint y) private pure returns (uint) {
        return x < y ? x : y;
    }

    function sqrt(uint y) private pure returns(uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

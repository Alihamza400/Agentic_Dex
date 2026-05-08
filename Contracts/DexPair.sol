// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Token/LP_Token.sol";
import "./interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ------------------------------------------------------------- */
/* ----------- Fixed Point Library (from Uniswap V2) ----------- */
/* ------------------------------------------------------------- */
library UQ112x112 {
    uint224 constant Q112 = 2**112;

    function encode(uint112 y) internal pure returns (uint224 z) {
        z = uint224(y) * Q112;
    }

    function uqdiv(uint224 x, uint112 y) internal pure returns (uint224 z) {
        z = x / uint224(y);
    }
}

contract DexPair is ReentrancyGuard {
    address public token0;
    address public token1;
    LPToken public lpToken;

    uint112 private reserve0;
    uint112 private reserve1;

    bool private initialized = false;

    // -------- Oracle Variables --------
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32  public blockTimestampLast;

    event Mint(address indexed provider, uint amount0, uint amount1, uint liquidity);
    event Burn(address indexed provider, uint amount0, uint amount1, uint liquidity);
    event Swap(address indexed sender, uint amountIn, uint amountOut);
    event Sync(uint112 reserve0, uint112 reserve1, uint256 price0Cumulative, uint256 price1Cumulative);

    // -------- Initialize Pair --------
    function initialize(address _token0, address _token1) external {
        require(!initialized, "Already initialized");
        require(_token0 != address(0) && _token1 != address(0), "Zero address");
        require(_token0 != _token1, "Identical tokens");

        token0 = _token0;
        token1 = _token1;

        lpToken = new LPToken("LP Token", "LPT");

        initialized = true;

        // initialize timestamp
        blockTimestampLast = uint32(block.timestamp % 2**32);
    }

    // -------- Get Reserves --------
    function getReserves() public view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    // -------- Internal Update (Oracle Logic Added) --------
    function _update(uint112 _r0, uint112 _r1) private {
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast;

        if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
            // Use library function correctly
            price0CumulativeLast += uint(
                UQ112x112.uqdiv(UQ112x112.encode(reserve1), reserve0)
            ) * timeElapsed;

            price1CumulativeLast += uint(
                UQ112x112.uqdiv(UQ112x112.encode(reserve0), reserve1)
            ) * timeElapsed;
        }

        reserve0 = _r0;
        reserve1 = _r1;
        blockTimestampLast = blockTimestamp;
        
        emit Sync(reserve0, reserve1, price0CumulativeLast, price1CumulativeLast);
    }

    // -------- Add Liquidity --------
    function addLiquidity(uint amount0, uint amount1, address to) external nonReentrant returns (uint liquidity) {
        require(initialized, "Not initialized");
        require(amount0 > 0 && amount1 > 0, "Invalid amounts");

        (uint112 _r0, uint112 _r1) = getReserves();

        if (_r0 == 0 && _r1 == 0) {
            liquidity = sqrt(amount0 * amount1);
        } else {
            uint _totalSupply = lpToken.totalSupply();
            uint liquidity0 = (amount0 * _totalSupply) / _r0;
            uint liquidity1 = (amount1 * _totalSupply) / _r1;
            liquidity = min(liquidity0, liquidity1);
        }

        require(liquidity > 0, "Insufficient liquidity");

        lpToken._mint(to, liquidity);

        _update(_r0 + uint112(amount0), _r1 + uint112(amount1));

        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    // -------- Remove Liquidity --------
    function removeLiquidity(uint liquidity)
        external 
        nonReentrant
        returns (uint amount0, uint amount1) 
    {
        require(initialized, "Not initialized");
        require(liquidity > 0, "Invalid liquidity");

        uint _totalSupply = lpToken.totalSupply();
        (uint112 _r0, uint112 _r1) = getReserves();

        amount0 = (liquidity * _r0) / _totalSupply;
        amount1 = (liquidity * _r1) / _totalSupply;

        lpToken._burn(address(this), liquidity);

        _update(_r0 - uint112(amount0), _r1 - uint112(amount1));

        IERC20(token0).transfer(msg.sender, amount0);
        IERC20(token1).transfer(msg.sender, amount1);

        emit Burn(msg.sender, amount0, amount1, liquidity);
    }

    // -------- Swap --------
    function swap(uint amountIn, address tokenIn, address to)
        external 
        nonReentrant
        returns (uint amountOut) 
    {
        require(initialized, "Not initialized");
        require(amountIn > 0, "Invalid input");
        require(tokenIn == token0 || tokenIn == token1, "Invalid token");

        (uint112 r0, uint112 r1) = getReserves();
        bool isToken0 = tokenIn == token0;

        if (isToken0) {
            amountOut = getAmountOut(amountIn, uint(r0), uint(r1));
            IERC20(token1).transfer(to, amountOut);
            _update(r0 + uint112(amountIn), r1 - uint112(amountOut));
        } else {
            amountOut = getAmountOut(amountIn, uint(r1), uint(r0));
            IERC20(token0).transfer(to, amountOut);
            _update(r0 - uint112(amountOut), r1 + uint112(amountIn));
        }

        emit Swap(msg.sender, amountIn, amountOut);
    }

    // -------- Pricing Formula --------
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public pure 
        returns (uint) 
    {
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        uint amountInWithFee = amountIn * 997;
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = reserveIn * 1000 + amountInWithFee;
        return numerator / denominator;
    }

    // -------- Oracle Getters --------
    function getSpotPrice() external view returns (uint price0, uint price1) {
        require(reserve0 > 0 && reserve1 > 0, "No liquidity");
        price0 = (uint(reserve1) * 1e18) / reserve0;
        price1 = (uint(reserve0) * 1e18) / reserve1;
    }

    function getTWAP() external view returns (uint price0Cum, uint price1Cum) {
        return (price0CumulativeLast, price1CumulativeLast);
    }

    // -------- Utils --------
    function min(uint x, uint y) private pure returns (uint) {
        return x < y ? x : y;
    }

    function sqrt(uint y) private pure returns (uint z) {
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

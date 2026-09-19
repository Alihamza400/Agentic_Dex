/**
 * End-to-end tests for the Agentic DEX smart-contract layer.
 * Covers: pair creation -> liquidity -> single-hop swap -> multi-hop swap ->
 * slippage protection -> liquidity removal -> TWAP oracle.
 */
import pkg from "hardhat";
const { ethers } = pkg;
import { expect } from "chai";

const E18 = 10n ** 18n;
const e = (n) => ethers.parseUnits(n.toString(), 18);

/** Uniswap-style x*y=k with a 0.3% fee, mirrors DexPair.getAmountOut */
function getAmountOut(amountIn, reserveIn, reserveOut) {
  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

async function deadline(offset = 3600) {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp + offset;
}

describe("Agentic DEX end-to-end", function () {
  let deployer, lp, trader, other;
  let factory, router, tokenA, tokenB, tokenC;
  let tokenAAddr, tokenBAddr, tokenCAddr;

  beforeEach(async function () {
    [deployer, lp, trader, other] = await ethers.getSigners();

    factory = await ethers.deployContract("DexFactory");
    await factory.waitForDeployment();
    router = await ethers.deployContract("DexRouter", [await factory.getAddress()]);
    await router.waitForDeployment();

    tokenA = await ethers.deployContract("TestToken", ["Token A", "TKA", e(10_000_000)]);
    tokenB = await ethers.deployContract("TestToken", ["Token B", "TKB", e(10_000_000)]);
    tokenC = await ethers.deployContract("TestToken", ["Token C", "TKC", e(10_000_000)]);
    await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment(), tokenC.waitForDeployment()]);

    tokenAAddr = await tokenA.getAddress();
    tokenBAddr = await tokenB.getAddress();
    tokenCAddr = await tokenC.getAddress();

    // Fund the test actors and let the router move their tokens
    for (const signer of [lp, trader, other]) {
      await tokenA.transfer(signer.address, e(100_000));
      await tokenB.transfer(signer.address, e(100_000));
      await tokenC.transfer(signer.address, e(100_000));
      await tokenA.connect(signer).approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.connect(signer).approve(await router.getAddress(), ethers.MaxUint256);
      await tokenC.connect(signer).approve(await router.getAddress(), ethers.MaxUint256);
    }
  });

  describe("Factory", function () {
    it("creates a pair, sorts tokens and initializes the pair", async function () {
      const [t0, t1] = tokenAAddr.toLowerCase() < tokenBAddr.toLowerCase()
        ? [tokenAAddr, tokenBAddr]
        : [tokenBAddr, tokenAAddr];

      await expect(factory.createPair(tokenAAddr, tokenBAddr))
        .to.emit(factory, "PairCreated");

      const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);
      // Lookups are order independent
      expect(await factory.getPair(tokenBAddr, tokenAAddr)).to.equal(pairAddr);
      expect(await factory.allPairsLength()).to.equal(1n);
      expect(await factory.allPairs(0)).to.equal(pairAddr);

      const pair = await ethers.getContractAt("DexPair", pairAddr);
      expect(await pair.token0()).to.equal(t0);
      expect(await pair.token1()).to.equal(t1);
      expect(await pair.lpToken()).to.not.equal(ethers.ZeroAddress);
    });

    it("rejects duplicate and identical pairs", async function () {
      await factory.createPair(tokenAAddr, tokenBAddr);
      await expect(factory.createPair(tokenAAddr, tokenBAddr)).to.be.revertedWith("DexFactory: Pair exists");
      await expect(factory.createPair(tokenAAddr, tokenAAddr)).to.be.revertedWith("DexFactory: Identical tokens");
    });
  });

  describe("Liquidity", function () {
    it("adds liquidity through the router and mints LP tokens", async function () {
      const pairAddrBefore = await factory.getPair(tokenAAddr, tokenBAddr);
      expect(pairAddrBefore).to.equal(ethers.ZeroAddress);

      await router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(1000), e(1000), await deadline());

      const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);

      const pair = await ethers.getContractAt("DexPair", pairAddr);
      const [r0, r1] = await pair.getReserves();
      expect(r0).to.equal(e(1000));
      expect(r1).to.equal(e(1000));

      // sqrt(1000 * 1000) = 1000 LP tokens for the first provider
      const lpToken = await ethers.getContractAt("LPToken", await pair.lpToken());
      expect(await lpToken.balanceOf(lp.address)).to.equal(e(1000));
      expect(await lpToken.totalSupply()).to.equal(e(1000));
    });

    it("only pulls the pool-ratio amounts when the deposit is off-ratio", async function () {
      await router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(1000), e(1000), await deadline());
      const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      const balABefore = await tokenA.balanceOf(trader.address);
      const balBBefore = await tokenB.balanceOf(trader.address);

      // Desired 100 A / 200 B against a 1:1 pool -> only 100 of each should be used
      await router.connect(trader).addLiquidity(tokenAAddr, tokenBAddr, e(100), e(200), await deadline());

      const spentA = balABefore - (await tokenA.balanceOf(trader.address));
      const spentB = balBBefore - (await tokenB.balanceOf(trader.address));
      expect(spentA).to.equal(e(100));
      expect(spentB).to.equal(e(100));

      const pair = await ethers.getContractAt("DexPair", pairAddr);
      const [r0, r1] = await pair.getReserves();
      expect(r0).to.equal(e(1100));
      expect(r1).to.equal(e(1100));
    });

    it("removes liquidity and returns both tokens", async function () {
      await router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(1000), e(1000), await deadline());
      const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      const pair = await ethers.getContractAt("DexPair", pairAddr);
      const lpTokenAddr = await pair.lpToken();
      const lpToken = await ethers.getContractAt("LPToken", lpTokenAddr);

      await lpToken.connect(lp).approve(await router.getAddress(), e(500));
      const balABefore = await tokenA.balanceOf(lp.address);

      await router.connect(lp).removeLiquidity(tokenAAddr, tokenBAddr, e(500), 0, 0, await deadline());

      expect(await lpToken.balanceOf(lp.address)).to.equal(e(500));
      expect(await tokenA.balanceOf(lp.address)).to.equal(balABefore + e(500));
      expect(await lpToken.totalSupply()).to.equal(e(500));

      const [r0, r1] = await pair.getReserves();
      expect(r0).to.equal(e(500));
      expect(r1).to.equal(e(500));
    });

    it("enforces removeLiquidity slippage minimums regardless of token ordering", async function () {
      await router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(1000), e(1000), await deadline());
      const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      const pair = await ethers.getContractAt("DexPair", pairAddr);
      const lpToken = await ethers.getContractAt("LPToken", await pair.lpToken());
      await lpToken.connect(lp).approve(await router.getAddress(), e(500));

      // Ask for more than the pool can pay out on the B side -> must revert
      await expect(
        router.connect(lp).removeLiquidity(tokenAAddr, tokenBAddr, e(500), 0, e(600), await deadline())
      ).to.be.revertedWith("DexRouter: INSUFFICIENT_B_AMOUNT");
    });

    it("reverts on an expired deadline", async function () {
      const block = await ethers.provider.getBlock("latest");
      await expect(
        router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(10), e(10), block.timestamp - 1)
      ).to.be.revertedWith("DexRouter: EXPIRED");
    });
  });

  describe("Swaps", function () {
    let pair, pairAddr, isToken0A;

    beforeEach(async function () {
      await router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(1000), e(1000), await deadline());
      pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      pair = await ethers.getContractAt("DexPair", pairAddr);
      isToken0A = (await pair.token0()) === tokenAAddr;
    });

    it("swaps exact tokens for tokens with the 0.3% fee applied", async function () {
      const amountIn = e(10);
      const [r0, r1] = await pair.getReserves();
      const resIn = isToken0A ? r0 : r1;
      const resOut = isToken0A ? r1 : r0;
      const expectedOut = getAmountOut(amountIn, resIn, resOut);

      const before = await tokenB.balanceOf(trader.address);
      await router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, tokenBAddr, amountIn, 1, await deadline());
      const received = (await tokenB.balanceOf(trader.address)) - before;

      expect(received).to.equal(expectedOut);
      // Fee makes the effective price strictly worse than the spot price
      expect(received).to.be.lessThan((amountIn * resOut) / resIn);

      const [nr0, nr1] = await pair.getReserves();
      expect(isToken0A ? nr0 : nr1).to.equal(resIn + amountIn);
      expect(isToken0A ? nr1 : nr0).to.equal(resOut - expectedOut);
    });

    it("moves the spot price and keeps k non-decreasing", async function () {
      const [r0Before, r1Before] = await pair.getReserves();
      await router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, tokenBAddr, e(50), 0, await deadline());
      const [r0, r1] = await pair.getReserves();
      expect(r0 * r1).to.be.greaterThanOrEqual(r0Before * r1Before);
      const [spotA, spotB] = await pair.getSpotPrice();
      expect(spotA).to.be.greaterThan(0n);
      expect(spotB).to.be.greaterThan(0n);
    });

    it("reverts when the slippage limit is not met", async function () {
      await expect(
        router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, tokenBAddr, e(10), e(100), await deadline())
      ).to.be.revertedWith("Slippage exceeded");
    });

    it("blocks direct swap() calls that do not deliver the input tokens", async function () {
      // No transfer happened, so the pair must reject the swap
      await expect(
        pair.connect(other).swap(e(10), tokenAAddr, other.address)
      ).to.be.revertedWith("DexPair: INSUFFICIENT_INPUT_AMOUNT");
    });

    it("executes a multi-hop A -> B -> C path", async function () {
      await router.connect(lp).addLiquidity(tokenBAddr, tokenCAddr, e(1000), e(1000), await deadline());

      const amountIn = e(10);
      const beforeC = await tokenC.balanceOf(trader.address);
      const beforeA = await tokenA.balanceOf(trader.address);

      await router.connect(trader).swapExactTokensForTokens(
        amountIn, 1, [tokenAAddr, tokenBAddr, tokenCAddr], await deadline()
      );

      const receivedC = (await tokenC.balanceOf(trader.address)) - beforeC;
      expect(receivedC).to.be.greaterThan(0n);
      expect(beforeA - (await tokenA.balanceOf(trader.address))).to.equal(amountIn);

      const pairAB = await ethers.getContractAt("DexPair", pairAddr);
      const pairBC = await ethers.getContractAt("DexPair", await factory.getPair(tokenBAddr, tokenCAddr));
      const [rab0, rab1] = await pairAB.getReserves();
      const [rbc0, rbc1] = await pairBC.getReserves();
      // Both pools keep the 0.3% fee, so the reserve sum grows
      expect(rab0 + rab1).to.be.greaterThan(e(2000));
      expect(rbc0 + rbc1).to.be.greaterThan(e(2000));
    });

    it("supports three-hop round trips used by the arbitrage agent", async function () {
      await router.connect(lp).addLiquidity(tokenBAddr, tokenCAddr, e(1000), e(1000), await deadline());
      await router.connect(lp).addLiquidity(tokenAAddr, tokenCAddr, e(1000), e(1000), await deadline());

      const amountIn = e(5);
      const before = await tokenA.balanceOf(trader.address);
      await router.connect(trader).swapExactTokensForTokens(
        amountIn, 1, [tokenAAddr, tokenBAddr, tokenCAddr, tokenAAddr], await deadline()
      );
      const after = await tokenA.balanceOf(trader.address);
      // Round trip loses fees but must not revert
      expect(after).to.be.lessThan(before);
      expect(before - after).to.be.lessThan(amountIn);
    });

    it("reverts for unknown pairs and identical tokens", async function () {
      await expect(
        router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, other.address, e(1), 0, await deadline())
      ).to.be.revertedWith("Pair doesn't exist");
      await expect(
        router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, tokenAAddr, e(1), 0, await deadline())
      ).to.be.revertedWith("Pair doesn't exist");
    });

    it("exposes a router quote helper", async function () {
      const q = await router.quote(e(10), e(1000), e(1000));
      expect(q).to.equal(e(10));
    });
  });

  describe("TWAP oracle", function () {
    it("accumulates time-weighted prices over blocks", async function () {
      await router.connect(lp).addLiquidity(tokenAAddr, tokenBAddr, e(1000), e(1000), await deadline());
      const pairAddr = await factory.getPair(tokenAAddr, tokenBAddr);
      const pair = await ethers.getContractAt("DexPair", pairAddr);

      const [p0Before] = await pair.getTWAP();
      await router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, tokenBAddr, e(100), 0, await deadline());
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      await router.connect(trader).swapExactTokensForTokensSingle(tokenAAddr, tokenBAddr, e(10), 0, await deadline());

      const [p0After] = await pair.getTWAP();
      expect(p0After).to.be.greaterThan(p0Before);
    });
  });
});

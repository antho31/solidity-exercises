# Solidity Exercises

## Exercise 1 - Redeemable Vault

The idea is to create an application that allows users to deposit tokens and later receive dividend payouts (proceeds) proportional to their tokens deposited initially. The business logic that governs how these proceeds are generated is out of scope for this exercise, the focus is mainly on token deposits and proceeds dispersion.

As a base structure, we expect 2 token contracts:

- The first one represents an underlying asset (USD token).
- The second represents the pool into which the first token can be deposited.

### Functionality expected of the USD token

- Any user should be able to mint any amount of USD tokens.

### Functionality expected of the pool

The pool should be a token contract, which USD tokens can be deposited and withdrawn in exchange for pool tokens.

#### 1. Deposits

- Depositing USD tokens should grant the user with pool tokens (through a **1:1** conversion).
- The contract should hold onto the USD tokens for now.
- This method should be executable by any user.

#### 2. Deposit proceeds

- Proceeds are essentially USD tokens that should be dispersed to the pool token holders.
- Proceeds should be newly minted tokens from the USD token smart-contract.

#### 3. Proceeds withdrawal/distribution

- A mechanism for users to withdraw proceeds, or for the contract to distribute proceeds to the user.
- The proceeds should be distributed based on each user's relative share of the total supply of pool tokens at that time.

#### 4. Withdrawals

- The user should be able to convert their tokens back to USD tokens.
- The user shouldn't have any outstanding proceed withdrawals after withdrawing, if withdrawals were the chosen method.

### Bonuses

1. Upgradeable vault contract with diamond storage pattern
2. Tests to demonstrate that it is not prone to attacks or bad debt.

### Solution #1

- Contract: [`Vault`](./contracts/Vault.sol)
- Tests: `npx hardhat test test/Exercise1.ts`

## Exercise 2 - Vault Attack

The objective is to find a way to empty a [deployed vault on the Sepolia Optimism network](https://sepolia-optimism.etherscan.io/address/0x5f1b1316D1cB4f497c0409Ae86153DE215A238C7).

The code of the contract is as follows:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract BananaVault {
    uint256 private hiddenPassword_HWFGG = 123_456_789;
    uint256 private salt_HNGMID;

    error IncorrectPassword();

    constructor(uint256 initialSeed) {
        salt_HNGMID = block.timestamp;
        hiddenPassword_HWFGG |= initialSeed;
    }

    function updateHiddenPassword_HNJLLE(uint256 newSeed) external {
        hiddenPassword_HWFGG |= newSeed;
    }

    function claimBanana_QTBNFS(uint256 password) external {
        if (
            password
                != uint256(
                    keccak256(abi.encode(hiddenPassword_HWFGG + salt_HNGMID))
                )
        ) {
            revert IncorrectPassword();
        }
        (bool success,) = msg.sender.call{value: address(this).balance}("");
        if (!success) {
            revert();
        }
    }

    fallback() external payable {}

    receive() external payable {}
}
```

This exercise is considered complete if the contract at address `0x5f1b1316D1cB4f497c0409Ae86153DE215A238C7` is entirely emptied.

### Solution #2

- Script in [`Exercise2`](./test/Exercise2.ts) test file
- Simulate the attack (test from Sepolia Optimism network fork): `npx hardhat test test/Exercise2.ts`

## Exercise 3 - Blind Vault Attack

The objective of this exercise is to find a way to empty a [deployed vault on the Sepolia Optimism network](https://sepolia-optimism.etherscan.io/address/0x65dcd95cf3aaafa432aBb2b7DcACc68911635349) but this time without the code of the contract or any ABI.

This exercise will be considered complete if the contract at address `0x65dcd95cf3aaafa432aBb2b7DcACc68911635349`.  

### Solution #3

- Script in [`Exercise3`](./test/Exercise3.ts) test file
- Simulate the attack (test from Sepolia Optimism network fork): `npx hardhat test test/Exercise3.ts`

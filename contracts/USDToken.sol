// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title USD Token Contract
 * @notice This is a mock USD token contract for testing purposes.
 *         This contract allows anyone to mint any amount of tokens.
 */
contract USDToken is ERC20 {
    constructor() ERC20("USD Token", "USD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

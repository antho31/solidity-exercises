// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vault Contract 
 * @notice A vault that allows users to deposit tokens and earn proportional rewards from proceeds.
 * 
 * Key Observations:
 * 1. Front-running/"Flash" Deposit-Withdraw Attacks:
 *    The exercise specifies that proceeds should be distributed at the time of deposit proceeds based on current holdings.
 *    However, this makes the contract prone to manipulation. 
 *    For example, a user can make a large deposit just before `depositProceeds`, claim rewards, and immediately withdraw,
 *    disproportionately benefiting from rewards.
 *    Suggested Improvement: Implement time-weighted rewards or minimal lock period to prevent short-term deposits from exploiting the system.

 * 2. ERC4626 standard not used:
 *    The ERC4626 tokenized vault standard is not suitable here because it operates on share-based vault mechanics, while
 *    this contract implements **1:1 conversion** of deposited tokens. 
 *    Additionally, ERC4626 expects automatic accrual or reinvestment of rewards, while this implementation allows for
 *    proceeds to be distributed only at specific times via `depositProceeds`, which is a custom logic. 
 * 
 * 4. Rounding Issues:
 *    User may "lose" rewards due to rounding when distributing proceeds, but we consider this acceptable as the amounts are small.
 *
 * 5. Reentrancy protections:
 *   Even if checks-effects patterns are used, the contract uses `ReentrancyGuardUpgradeable` to add extra security layer against ERC-777 reentrancy issues.
 */
contract Vault is ERC20Upgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    event Deposit(address indexed account, uint256 amount);
    event DepositProceeds(uint256 amount);
    event Claim(address indexed account, uint256 amount);
    event Withdraw(address indexed account, uint256 amount);

    error InvalidAmount();
    error NoDeposits();

    /// @custom:storage-location erc7201:solidity-exercises.storage.Vault
    struct VaultStorage {
        IERC20 underlayingToken; // Token deposited and withdrawn (USD Token)
        uint256 totalDeposited; // Total deposited tokens in the vault
        uint256 rewardIndex; // Cumulative reward index, updated on deposit proceeds
        mapping(address => uint256) rewardIndexOf; // Reward index by user, updated when the user deposit, withdraw, or receive rewards
        mapping(address => uint256) unclaimedEarned; // Tracks unclaimed rewards after user reward index update
    }

    /// @dev Storage slot for VaultStorage (custom implementation for upgradable contracts)
    ///      keccak256(abi.encode(uint256(keccak256("solidity-exercises.storage.Vault")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant VaultStorageLocation =
        0x9365019789062162993745014897bbd5b16b2db21493221a4aa551fa5605f200;

    /// @dev To handle decimal precision
    uint256 private constant MULTIPLIER = 1e18;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _getVaultStorage() private pure returns (VaultStorage storage $) {
        assembly {
            $.slot := VaultStorageLocation
        }
    }

    /**
     * @notice Initializes the vault with the underlying token.
     * @dev This function is called only once during deployment via a proxy.
     * @param underlayingToken_ The address of the token to be deposited and withdrawn.
     */
    function initialize(address underlayingToken_) external initializer {
        VaultStorage storage $ = _getVaultStorage();

        __ERC20_init_unchained("Vault", "VAULT");
        __ReentrancyGuard_init_unchained();

        /// @dev We expect the deployer to provide a valid ERC20 token, no need to check
        $.underlayingToken = IERC20(underlayingToken_);
    }

    /**
     * @notice Deposits a specified amount of tokens into the vault.
     * @dev Mints 1:1 pool tokens to the depositor.
     * @param amount The amount of tokens to deposit.
     *
     * Emits a {Deposit} event.
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        VaultStorage storage $ = _getVaultStorage();

        $.totalDeposited += amount;

        $.underlayingToken.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount); // it updates user rewards via `_update` function called

        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice Deposits proceeds into the vault for distribution to token holders.
     * @dev Calculates proportional rewards using `rewardIndex`:
     *      - rewardIndex += (reward * MULTIPLIER) / totalDeposited
     *      - Each user's rewards are updated lazily based on this index.
     * @param reward The amount of proceeds to distribute.
     *
     * Emits a {DepositProceeds} event.
     */
    function depositProceeds(uint256 reward) external nonReentrant {
        if (reward == 0) revert InvalidAmount();

        VaultStorage storage $ = _getVaultStorage();

        if ($.totalDeposited == 0) revert NoDeposits();

        $.rewardIndex += (reward * MULTIPLIER) / $.totalDeposited;
        $.underlayingToken.safeTransferFrom(msg.sender, address(this), reward);

        emit DepositProceeds(reward);
    }

    /**
     * @notice Claims all unclaimed rewards for the specified user.
     * @dev This function allows anyone to claim rewards on behalf of a user.
     *      This design supports automatic redistribution of rewards without requiring user action.
     * @param account The address of the user whose rewards are being claimed.
     * @return The amount of rewards claimed for the user.
     *
     * Emits a {Claim} event.
     */
    function claimRewards(
        address account
    ) external nonReentrant returns (uint256) {
        VaultStorage storage $ = _getVaultStorage();

        _updateRewards(account);

        uint256 reward = $.unclaimedEarned[account];
        $.unclaimedEarned[account] = 0;
        $.underlayingToken.safeTransfer(account, reward);

        emit Claim(account, reward);

        return reward;
    }

    /**
     * @notice Withdraws a specified amount of tokens from the vault.
     * @param amount The amount of tokens to withdraw.
     *
     * Emits a {Withdraw} event.
     */
    function withdraw(uint256 amount) external nonReentrant {
        VaultStorage storage $ = _getVaultStorage();

        if (balanceOf(msg.sender) < amount) revert InvalidAmount();

        $.totalDeposited -= amount;

        _burn(msg.sender, amount); // update user rewards via `_update` function called
        $.underlayingToken.safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Returns the total claimable rewards for a user.
     * @param account The address of the user.
     * @return The total claimable rewards.
     */
    function claimableAmount(address account) external view returns (uint256) {
        VaultStorage storage $ = _getVaultStorage();
        return $.unclaimedEarned[account] + _calculateRewards(account);
    }

    /**
     * @notice Returns the number of decimals for the vault token.
     * @dev Attempts to fetch decimals from the underlying token.
     *      Defaults to 18 if not implemented, but it does not guarantee a strict 1:1 conversion.
     * @return The number of decimals.
     */
    function decimals() public view override returns (uint8) {
        VaultStorage storage $ = _getVaultStorage();

        (bool success, bytes memory data) = address($.underlayingToken)
            .staticcall(abi.encodeWithSignature("decimals()"));

        if (success && data.length == 32) {
            return abi.decode(data, (uint8)); // Decode and return decimals
        } else {
            return 18; // Default to 18 decimals if not implemented
        }
    }

    /// @dev called on any transfer: need to update rewards
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        if (from != address(0)) {
            _updateRewards(from);
        }
        if (to != address(0)) {
            _updateRewards(to);
        }

        super._update(from, to, value);
    }

    /**
     * @dev Updates rewards for a specific account.
     *      - Adds unclaimed rewards to `unclaimedEarned`.
     *      - Updates the user's `rewardIndexOf` to the global `rewardIndex`.
     * @param account The address of the user whose rewards are being updated.
     */
    function _updateRewards(address account) private {
        VaultStorage storage $ = _getVaultStorage();

        uint256 rewards = _calculateRewards(account);

        $.unclaimedEarned[account] += rewards;
        $.rewardIndexOf[account] = $.rewardIndex;
    }

    function _calculateRewards(address account) private view returns (uint256) {
        VaultStorage storage $ = _getVaultStorage();

        return
            (balanceOf(account) * ($.rewardIndex - $.rewardIndexOf[account])) /
            MULTIPLIER;
    }
}

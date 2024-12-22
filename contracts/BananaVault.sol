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
            password !=
            uint256(keccak256(abi.encode(hiddenPassword_HWFGG + salt_HNGMID)))
        ) {
            revert IncorrectPassword();
        }
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        if (!success) {
            revert();
        }
    }

    fallback() external payable {}

    receive() external payable {}
}

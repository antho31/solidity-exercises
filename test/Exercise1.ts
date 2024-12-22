import { ethers, upgrades } from 'hardhat'
import { expect } from 'chai'
import { Contract, parseEther } from 'ethers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { USDToken, Vault } from '../typechain-types'

/**
 * Vault contract code coverage: 100% (excluding the decimals() function).
 *
 * Further tests needed:
 * - Edge cases: Identify and address potential edge scenarios
 * - Complex scenarios: Test the contract with more intricate conditions and interactions.
 * - Upgrade behavior: Verify functionality and state consistency with an updated Vault implementation.
 */
describe('Exercise 1', function () {
  let beacon: Contract
  let beaconAddress: string
  let usdToken: USDToken
  let usdTokenAddress: string
  let vault: Vault
  let vaultAddress: string

  let owner: HardhatEthersSigner,
    user1: HardhatEthersSigner,
    user2: HardhatEthersSigner,
    user3: HardhatEthersSigner

  async function deployFixture() {
    ;[owner, user1, user2, user3] = await ethers.getSigners()

    usdToken = await ethers.deployContract('USDToken')
    await usdToken.waitForDeployment()
    usdTokenAddress = await usdToken.getAddress()

    /**
     * Key Design Choice: Beacon Proxy
     * A Beacon Proxy allows us to deploy multiple Vault instances with the same implementation logic,
     * while retaining the ability to update the implementation for all deployed Vaults in a single operation.
     */
    const VaultFactory = await ethers.getContractFactory('Vault')
    const beacon = await upgrades.deployBeacon(VaultFactory)
    await beacon.waitForDeployment()
    beaconAddress = await beacon.getAddress()
    vault = await upgrades.deployBeaconProxy(
      beaconAddress,
      VaultFactory,
      [usdTokenAddress],
      {
        initializer: 'initialize'
      }
    )
    await vault.waitForDeployment()
    vaultAddress = await vault.getAddress()
  }

  it('should allow deposits and mint pool tokens 1:1', async () => {
    await deployFixture()
    await usdToken.mint(user1.address, parseEther('50'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('50'))

    await expect(vault.connect(user1).deposit(parseEther('50')))
      .to.emit(vault, 'Deposit')
      .withArgs(user1.address, parseEther('50'))

    expect(await vault.balanceOf(user1.address)).to.equal(parseEther('50'))
    expect(await vault.totalSupply()).to.equal(parseEther('50'))
    expect(await usdToken.balanceOf(user1.address)).to.equal(0)

    await vault.connect(user1).withdraw(parseEther('50'))
    expect(await vault.balanceOf(user1.address)).to.equal(0)
    expect(await usdToken.balanceOf(user1.address)).to.equal(parseEther('50'))
  })

  it('should revert if no deposits', async () => {
    await deployFixture()
    await usdToken.mint(owner.address, parseEther('50'))
    await usdToken.approve(vaultAddress, parseEther('50'))

    await expect(
      vault.depositProceeds(parseEther('50'))
    ).to.be.revertedWithCustomError(vault, 'NoDeposits')
  })

  it('should distribute rewards proportionally based on user balances', async () => {
    await deployFixture()

    await usdToken.mint(user1.address, parseEther('50'))
    await usdToken.mint(user2.address, parseEther('100'))

    await usdToken.connect(user1).approve(vaultAddress, parseEther('50'))
    await usdToken.connect(user2).approve(vaultAddress, parseEther('100'))

    await vault.connect(user1).deposit(parseEther('50'))
    await vault.connect(user2).deposit(parseEther('100'))

    await usdToken.mint(owner.address, parseEther('30'))
    await usdToken.approve(vaultAddress, parseEther('30'))

    await expect(vault.depositProceeds(parseEther('30')))
      .to.emit(vault, 'DepositProceeds')
      .withArgs(parseEther('30'))

    await expect(vault.connect(user1).claimRewards(user1.address))
      .to.emit(vault, 'Claim')
      .withArgs(user1.address, parseEther('10')) // 50/(50+100) * 30

    await expect(vault.connect(user2).claimRewards(user2.address))
      .to.emit(vault, 'Claim')
      .withArgs(user2.address, parseEther('20')) // 100/(50+100) * 30

    expect(await usdToken.balanceOf(user1.address)).to.equal(parseEther('10'))
    expect(await usdToken.balanceOf(user2.address)).to.equal(parseEther('20'))

    const user1Rewards = await vault.claimableAmount(user1.address)
    const user2Rewards = await vault.claimableAmount(user2.address)
    expect(user1Rewards).to.equal(0)
    expect(user2Rewards).to.equal(0)
  })

  it('should allow users to claim separately across multiple proceeds', async () => {
    await deployFixture()

    // User1 deposits
    await usdToken.mint(user1.address, parseEther('50'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('50'))
    await vault.connect(user1).deposit(parseEther('50'))

    // Distribute first proceeds
    await usdToken.mint(owner.address, parseEther('20'))
    await usdToken.approve(vaultAddress, parseEther('20'))
    await vault.depositProceeds(parseEther('20'))

    // User1 claims the first rewards
    await expect(vault.connect(user1).claimRewards(user1.address))
      .to.emit(vault, 'Claim')
      .withArgs(user1.address, parseEther('20'))

    // Distribute second proceeds
    await usdToken.mint(owner.address, parseEther('10'))
    await usdToken.approve(vaultAddress, parseEther('10'))
    await vault.depositProceeds(parseEther('10'))

    // User1 claims the second rewards
    await expect(vault.connect(user1).claimRewards(user1.address))
      .to.emit(vault, 'Claim')
      .withArgs(user1.address, parseEther('10'))

    // Check balances
    const user1FinalBalance = await usdToken.balanceOf(user1.address)
    expect(user1FinalBalance).to.equal(parseEther('30')) // 20 + 10 rewards

    // No more rewards to claim
    await expect(
      vault.connect(user1).claimRewards(user1.address)
    ).to.changeTokenBalances(usdToken, [user1, vault], [0, 0])
  })

  it('should allow withdrawals and then unclaimed rewards', async () => {
    await deployFixture()

    await usdToken.mint(user1.address, parseEther('50'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('50'))

    // User1 deposits
    await vault.connect(user1).deposit(parseEther('50'))

    // Distribute proceeds
    await usdToken.mint(owner.address, parseEther('20'))
    await usdToken.approve(vaultAddress, parseEther('20'))
    await vault.depositProceeds(parseEther('20'))

    // Withdraw and claim rewards
    await expect(vault.connect(user1).withdraw(parseEther('50')))
      .to.emit(vault, 'Withdraw')
      .withArgs(user1.address, parseEther('50'))
    await expect(vault.connect(user1).claimRewards(user1.address))
      .to.emit(vault, 'Claim')
      .withArgs(user1.address, parseEther('20'))

    expect(await usdToken.balanceOf(user1.address)).to.equal(parseEther('70')) // 50 deposit + 20 reward
  })

  it('should handle small deposits', async () => {
    await deployFixture()

    // User1 deposits 3 wei + 1 ether
    await usdToken.mint(user1.address, '3')
    await usdToken.connect(user1).approve(vaultAddress, '3')
    await vault.connect(user1).deposit('3')
    await usdToken.mint(user1.address, parseEther('1'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('1'))
    await vault.connect(user1).deposit(parseEther('1'))

    // User2 deposits 1 ether
    await usdToken.mint(user2.address, parseEther('1'))
    await usdToken.connect(user2).approve(vaultAddress, parseEther('1'))
    await vault.connect(user2).deposit(parseEther('1'))

    // Distribute proceeds (1 ether)
    await usdToken.mint(owner.address, parseEther('1'))
    await usdToken.approve(vaultAddress, parseEther('1'))
    await vault.depositProceeds(parseEther('1'))

    // User1 has negligible rewards compared to User2
    await expect(vault.connect(user1).claimRewards(user1.address))
      .to.emit(vault, 'Claim')
      .withArgs(user1.address, parseEther('0.5'))
    await expect(vault.connect(user2).claimRewards(user2.address))
      .to.emit(vault, 'Claim')
      .withArgs(user2.address, parseEther('0.499999999999999999'))

    // No more rewards to claim
    const user1Rewards = await vault.claimableAmount(user1.address)
    const user2Rewards = await vault.claimableAmount(user2.address)
    expect(user1Rewards).to.equal(0)
    expect(user2Rewards).to.equal(0)
  })

  it('should handle multiple proceeds with rounding and ensure no bad debt', async () => {
    await deployFixture()

    // Users deposit varying amounts
    await usdToken.mint(user1.address, parseEther('50'))
    await usdToken.mint(user2.address, parseEther('100'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('50'))
    await usdToken.connect(user2).approve(vaultAddress, parseEther('100'))
    await vault.connect(user1).deposit(parseEther('50'))
    await vault.connect(user2).deposit(parseEther('100'))

    // First proceed distribution
    const firstProceeds = parseEther('13') // Causes rounding issues
    await usdToken.mint(owner.address, firstProceeds)
    await usdToken.approve(vaultAddress, firstProceeds)
    await vault.depositProceeds(firstProceeds)

    // Second proceed distribution
    const secondProceeds = parseEther('7') // Another rounding case
    await usdToken.mint(owner.address, secondProceeds)
    await usdToken.approve(vaultAddress, secondProceeds)
    await vault.depositProceeds(secondProceeds)

    // Ensure no bad debt after users withdraw and claim rewards
    const user1Rewards = await vault.claimableAmount(user1.address)
    const user1Balance = await vault.balanceOf(user1.address)
    const user2Rewards = await vault.claimableAmount(user2.address)
    const user2Balance = await vault.balanceOf(user2.address)
    const vaultBalance = await usdToken.balanceOf(vaultAddress)
    expect(user1Rewards).to.closeTo(parseEther('6.66'), parseEther('0.01')) // 1/3 * 13 + 1/3 * 7
    expect(user2Rewards).to.closeTo(parseEther('13.33'), parseEther('0.01')) // 2/3 * 13 + 2/3 * 7
    expect(user1Rewards + user1Balance + user2Rewards + user2Balance).to.lte(
      vaultBalance
    )
    await expect(vault.connect(user1).withdraw(parseEther('50')))
      .to.emit(vault, 'Withdraw')
      .withArgs(user1.address, parseEther('50'))
    await expect(vault.connect(user2).withdraw(parseEther('100')))
      .to.emit(vault, 'Withdraw')
      .withArgs(user2.address, parseEther('100'))
    await vault.connect(user1).claimRewards(user1.address)
    await vault.connect(user2).claimRewards(user2.address)
    expect(await usdToken.balanceOf(vaultAddress)).to.gte(0)
  })

  it('should handle transfers', async () => {
    await deployFixture()

    await usdToken.mint(user1.address, parseEther('60'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('60'))
    await usdToken.mint(owner.address, parseEther('35'))
    await usdToken.approve(vaultAddress, parseEther('35'))

    await vault.connect(user1).deposit(parseEther('50'))
    await vault.depositProceeds(parseEther('10'))
    expect(await vault.claimableAmount(user1.address)).to.equal(
      parseEther('10')
    )

    // After a transfer 20 tokens from User1 to User2,
    // 10 rewards are still claimable by User1, but nothing for User2
    // since the rewards are based on the balance at the time of the proceeds distribution
    await vault.connect(user1).transfer(user2.address, parseEther('20'))
    expect(await vault.claimableAmount(user2.address)).to.equal(parseEther('0'))
    expect(await vault.claimableAmount(user1.address)).to.equal(
      parseEther('10')
    )

    // After deposit proceeds, users claim rewards according to their balances
    // at the time of the distribution
    await vault.connect(user2).transfer(user1.address, parseEther('5'))
    await vault.connect(user1).deposit(parseEther('10'))
    await vault.depositProceeds(parseEther('20'))
    await vault.depositProceeds(parseEther('5'))
    expect(await vault.balanceOf(user1.address)).to.equal(parseEther('45'))
    expect(await vault.balanceOf(user2.address)).to.equal(parseEther('15'))
    expect(await vault.claimableAmount(user1.address)).to.closeTo(
      parseEther('28.75'), // 10 + 45/60 * 25
      parseEther('0.01')
    )
    expect(await vault.claimableAmount(user2.address)).to.closeTo(
      parseEther('6.25'), // 15/60 * 25
      parseEther('0.01')
    )
  })

  it('should handle a complex scenario: multiple proceeds with a user partially withdrawing after the first proceeds and another user depositing after the first proceeds', async () => {
    await deployFixture()

    // User1 and User2 make initial deposits
    await usdToken.mint(user1.address, parseEther('10'))
    await usdToken.mint(user2.address, parseEther('20'))
    await usdToken.connect(user1).approve(vaultAddress, parseEther('10'))
    await usdToken.connect(user2).approve(vaultAddress, parseEther('20'))
    await vault.connect(user1).deposit(parseEther('10'))
    await vault.connect(user2).deposit(parseEther('20'))

    // Distribute first proceeds
    await usdToken.mint(owner.address, parseEther('30'))
    await usdToken.approve(vaultAddress, parseEther('30'))
    await vault.depositProceeds(parseEther('30'))

    // User2 withdraw half of its deposit (it claims rewards)
    let tx = await expect(vault.connect(user2).withdraw(parseEther('10')))
    expect(tx)
      .to.emit(vault, 'Withdraw')
      .withArgs(user2.address, parseEther('10'))
    expect(tx).to.changeTokenBalances(
      usdToken,
      [user2, vault],
      [parseEther('30'), parseEther('-30')]
    )
    tx = await expect(vault.connect(user2).claimRewards(user2.address))
    expect(tx).to.emit(vault, 'Claim').withArgs(user2.address, parseEther('20'))
    expect(tx).to.changeTokenBalances(
      usdToken,
      [user2, vault],
      [parseEther('20'), parseEther('-20')]
    )

    // User3 joins later
    await usdToken.mint(user3.address, parseEther('60'))
    await usdToken.connect(user3).approve(vaultAddress, parseEther('60'))
    await vault.connect(user3).deposit(parseEther('60'))

    // Distribute second proceeds
    await usdToken.mint(owner.address, parseEther('45'))
    await usdToken.approve(vaultAddress, parseEther('45'))
    await vault.depositProceeds(parseEther('45'))

    // Users claim rewards
    const user1Rewards = await vault.claimableAmount(user1.address)
    const user2Rewards = await vault.claimableAmount(user2.address)
    const user3Rewards = await vault.claimableAmount(user3.address)

    expect(user1Rewards).to.equal(parseEther('15.625')) // 1/3*30 (share of first proceeds) + 1/8*45 (share of second)
    expect(user2Rewards).to.equal(parseEther('5.625')) // 1/8 * 45 (share of second proceeds)
    expect(user3Rewards).to.equal(parseEther('33.75')) // 3/4 * 45 (share of second proceeds)
  })
})

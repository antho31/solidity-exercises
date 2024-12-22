import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@openzeppelin/hardhat-upgrades'

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  networks: {
    hardhat: {
      forking: {
        url: 'https://sepolia.optimism.io',
        blockNumber: 21537002
      }
    }
  }
}

export default config

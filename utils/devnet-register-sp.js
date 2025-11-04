#!/usr/bin/env node

/**
 * Simple devnet service provider registration script
 * Works with custom devnet contract deployments
 */

import { ethers } from 'ethers'

// Simple ABI for the functions we need
const SP_REGISTRY_ABI = [
  'function registerProvider(address payee, string name, string description, uint8 productType, string[] capabilityKeys, bytes[] capabilityValues) payable returns (uint256)',
  'function addProduct(uint8 productType, string[] capabilityKeys, bytes[] capabilityValues)',
  'function REGISTRATION_FEE() view returns (uint256)',
  'function addressToProviderId(address) view returns (uint256)',
]

const WARM_STORAGE_ABI = [
  'function addApprovedProvider(uint256 providerId)',
  'function isProviderIdApproved(uint256 providerId) view returns (bool)',
]

async function main() {
  // Get environment variables
  const rpcUrl = process.env.RPC_URL || 'http://lotus-1:1234/rpc/v1'
  const spPrivateKey = process.env.SP_PRIVATE_KEY
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY
  const spRegistryAddress = process.env.SP_REGISTRY_ADDRESS
  const warmStorageAddress = process.env.WARM_STORAGE_CONTRACT_ADDRESS
  
  if (!spPrivateKey || !deployerPrivateKey || !spRegistryAddress || !warmStorageAddress) {
    console.error('❌ Missing required environment variables:')
    console.error('   SP_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY, SP_REGISTRY_ADDRESS, WARM_STORAGE_CONTRACT_ADDRESS')
    process.exit(1)
  }

  // Setup provider and signers
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const spSigner = new ethers.Wallet(spPrivateKey, provider)
  const deployerSigner = new ethers.Wallet(deployerPrivateKey, provider)
  
  const spAddress = await spSigner.getAddress()
  const deployerAddress = await deployerSigner.getAddress()
  
  console.log(`🚀 Registering Service Provider on devnet`)
  console.log(`SP Address: ${spAddress}`)
  console.log(`Deployer Address: ${deployerAddress}`)
  console.log(`Registry: ${spRegistryAddress}`)
  console.log(`WarmStorage: ${warmStorageAddress}`)

  // Create contract instances
  const spRegistry = new ethers.Contract(spRegistryAddress, SP_REGISTRY_ABI, spSigner)
  const warmStorage = new ethers.Contract(warmStorageAddress, WARM_STORAGE_ABI, deployerSigner)

  try {
    // Step 1: Check if already registered
    let providerId
    try {
      providerId = await spRegistry.addressToProviderId(spAddress)
      if (providerId > 0) {
        console.log(`✅ Provider already registered with ID: ${providerId}`)
      } else {
        console.log(`Provider not yet registered (ID: ${providerId})`)
      }
    } catch (error) {
      console.log(`Error checking registration, assuming not registered: ${error.message}`)
      providerId = 0
    }

    // Step 2: Register if not already registered
    if (providerId === 0 || providerId === 0n) {
      console.log(`\n📋 Step 1: Registering Provider`)
      
      const registrationFee = await spRegistry.REGISTRATION_FEE()
      console.log(`Registration fee: ${ethers.formatEther(registrationFee)} FIL`)
      
      // Check SP balance
      const spBalance = await provider.getBalance(spAddress)
      if (spBalance < registrationFee) {
        console.error(`❌ Insufficient balance. Need ${ethers.formatEther(registrationFee)} FIL, have ${ethers.formatEther(spBalance)} FIL`)
        process.exit(1)
      }

      const registerTx = await spRegistry.registerProvider(
        spAddress, // payee
        'Devnet Test Provider', // name
        'Test provider for devnet development', // description
        0, // ProductType.PDP
        [], // capability keys
        [], // capability values
        { value: registrationFee }
      )

      console.log(`Transaction sent: ${registerTx.hash}`)
      const receipt = await registerTx.wait()
      console.log(`✅ Provider registered in block ${receipt.blockNumber}`)
      
      // Get provider ID
      providerId = await spRegistry.addressToProviderId(spAddress)
      console.log(`Provider ID: ${providerId}`)
    }

    // Step 3: Add to WarmStorage approved list
    console.log(`\n✅ Step 2: Adding to WarmStorage approved list`)
    
    const isApproved = await warmStorage.isProviderIdApproved(providerId)
    if (isApproved) {
      console.log(`✅ Provider ${providerId} already approved in WarmStorage`)
    } else {
      console.log(`Adding provider ${providerId} to WarmStorage approved list...`)
      const approveTx = await warmStorage.addApprovedProvider(providerId)
      console.log(`Transaction sent: ${approveTx.hash}`)
      await approveTx.wait()
      console.log(`✅ Provider approved in WarmStorage`)
    }

    console.log(`\n🎉 Service Provider setup complete!`)
    console.log(`Provider ID: ${providerId}`)
    console.log(`Provider Address: ${spAddress}`)
    console.log(`Status: Registered and approved for storage`)

  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
}

main().catch(console.error)

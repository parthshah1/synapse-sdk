#!/usr/bin/env node

/**
 * Simple devnet service provider registration script
 * Works with custom devnet contract deployments
 */

import { ethers } from 'ethers'

// Simple ABI for the functions we need
// Use the actual ABI from your devnet contract
const SP_REGISTRY_ABI = [
  'function registerProvider(address payee, string name, string description, uint8 productType, string[] capabilityKeys, bytes[] capabilityValues) payable returns (uint256)',
  'function addProduct(uint8 productType, string[] capabilityKeys, bytes[] capabilityValues)',
  'function REGISTRATION_FEE() view returns (uint256)',
  'function addressToProviderId(address) view returns (uint256)',
  'function getProviderIdByAddress(address) view returns (uint256)',
  'function isRegisteredProvider(address) view returns (bool)',
  'function getProviderCount() view returns (uint256)',
  'function getProvider(uint256 providerId) view returns (tuple(uint256 providerId, tuple(address serviceProvider, address payee, string name, string description, bool isActive) info))',
  'function initialize()',
  'function owner() view returns (address)',
  // Custom errors from your devnet contract
  'error InsufficientCapabilitiesForProduct(uint8 productType)',
  'error OwnableUnauthorizedAccount(address account)',
  'error InvalidInitialization()',
  'error NotInitializing()',
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

  // Create contract instances - try using deployer as the caller for registration
  const spRegistry = new ethers.Contract(spRegistryAddress, SP_REGISTRY_ABI, deployerSigner)
  const spRegistryWithSP = new ethers.Contract(spRegistryAddress, SP_REGISTRY_ABI, spSigner)
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

      // Debug: Check contract state and initialization
      try {
        const providerCount = await spRegistry.getProviderCount()
        console.log(`Total providers in registry: ${providerCount}`)
      } catch (error) {
        console.log(`Could not get provider count: ${error.message}`)
      }

      // Check if contract is initialized by checking if it has an owner
      try {
        const owner = await spRegistry.owner()
        console.log(`Contract owner: ${owner}`)
        if (owner === ethers.ZeroAddress) {
          console.log(`⚠️  Contract might not be initialized (owner is zero address)`)
        }
      } catch (error) {
        console.log(`Could not get contract owner: ${error.message}`)
      }

      // Double-check if already registered using different method
      try {
        const isRegistered = await spRegistry.isRegisteredProvider(spAddress)
        if (isRegistered) {
          console.log(`❌ Provider is already registered according to isRegisteredProvider()`)
          process.exit(1)
        }
        console.log(`isRegisteredProvider() returned: ${isRegistered}`)
      } catch (error) {
        console.log(`Note: isRegisteredProvider() not available: ${error.message}`)
      }

      // Check if the address has any existing provider ID (even if 0)
      try {
        const existingId = await spRegistry.addressToProviderId(spAddress)
        console.log(`addressToProviderId() returned: ${existingId}`)
        if (existingId > 0) {
          console.log(`❌ Address already has provider ID: ${existingId}`)
          // Let's check if this provider exists
          try {
            const provider = await spRegistry.getProvider(existingId)
            console.log(`Existing provider:`, provider)
          } catch (e) {
            console.log(`Could not get provider details: ${e.message}`)
          }
          process.exit(1)
        }
      } catch (error) {
        console.log(`addressToProviderId() error: ${error.message}`)
      }

      console.log(`Calling registerProvider with:`)
      console.log(`  caller: ${deployerAddress} (deployer)`)
      console.log(`  payee: ${spAddress}`)
      console.log(`  name: "Devnet Test Provider"`)
      console.log(`  description: "Test provider for devnet development"`)
      console.log(`  productType: 0`)
      console.log(`  capabilityKeys: []`)
      console.log(`  capabilityValues: []`)
      console.log(`  value: ${ethers.formatEther(registrationFee)} FIL`)

      // Try different signatures to find the one your devnet contract expects
      let registerTx
      
      try {
        console.log(`Trying signature 1: registerProvider(string, string)...`)
        registerTx = await spRegistry['registerProvider(string,string)'](
          'Devnet Test Provider', // name
          'Test provider for devnet development', // description
          { value: registrationFee }
        )
      } catch (error1) {
        console.log(`Signature 1 failed: ${error1.message}`)
        
        try {
          console.log(`Trying signature 2: registerProvider(address, string, string)...`)
          registerTx = await spRegistry['registerProvider(address,string,string)'](
            spAddress, // payee
            'Devnet Test Provider', // name
            'Test provider for devnet development', // description
            { value: registrationFee }
          )
        } catch (error2) {
          console.log(`Signature 2 failed: ${error2.message}`)
          
          // Let's try different approaches to resolve the 0xdd978c4f error
          
          try {
            console.log(`Trying signature 3a: registerProvider without any product first...`)
            
            // Maybe devnet requires registering without a product first, then adding products separately
            // This would explain why InsufficientCapabilitiesForProduct is thrown - maybe no capabilities are sufficient for registration
            console.log(`Registering without product (productType might be ignored)...`)
            
            registerTx = await spRegistry.registerProvider(
              spAddress, // payee
              'Devnet Test Provider', // name
              'Test provider for devnet development', // description
              255, // Try an invalid/ignored productType to see if it's ignored
              [], // empty capability keys
              [], // empty capability values
              { value: registrationFee }
            )
          } catch (error3a) {
            console.log(`Signature 3a failed: ${error3a.message}`)
            
            try {
              console.log(`Trying signature 3b: registerProvider with different productType (1)...`)
              registerTx = await spRegistry.registerProvider(
                spAddress, // payee
                'Devnet Test Provider', // name
                'Test provider for devnet development', // description
                1, // Try productType = 1
                [], // empty capability keys
                [], // empty capability values
                { value: registrationFee }
              )
            } catch (error3b) {
              console.log(`Signature 3b failed: ${error3b.message}`)
              
              console.log(`Trying signature 3c: SP as caller instead of deployer...`)
              registerTx = await spRegistryWithSP.registerProvider(
                spAddress, // payee
                'Devnet Test Provider', // name
                'Test provider for devnet development', // description
                0, // ProductType.PDP
                [], // empty capability keys
                [], // empty capability values
                { value: registrationFee }
              )
            }
          }
        }
      }

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

#!/usr/bin/env node

/**
 * Debug script to test data set creation with Curio PDP
 * This helps identify why data set creation is failing
 */

import { ethers } from 'ethers'
import { Synapse } from '../packages/synapse-sdk/dist/src/index.js'

const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.CLIENT_PRIVATE_KEY
const RPC_URL = process.env.RPC_URL || 'http://lotus-1:1234/rpc/v1'
const WARM_STORAGE_ADDRESS = process.env.WARM_STORAGE_CONTRACT_ADDRESS
const WARM_STORAGE_VIEW_ADDRESS = process.env.WARM_STORAGE_VIEW_ADDRESS
const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS
const USDFC_ADDRESS = process.env.USDFC_ADDRESS
const GENESIS_TIMESTAMP = process.env.GENESIS_TIMESTAMP ? Number(process.env.GENESIS_TIMESTAMP) : undefined

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY or CLIENT_PRIVATE_KEY environment variable is required')
  process.exit(1)
}

async function debugCreateDataSet() {
  console.log('='.repeat(80))
  console.log('Debug: Data Set Creation Test')
  console.log('='.repeat(80))
  console.log(`\nRPC URL: ${RPC_URL}`)
  console.log(`Warm Storage Address: ${WARM_STORAGE_ADDRESS}`)
  console.log(`Warm Storage View Address: ${WARM_STORAGE_VIEW_ADDRESS}`)
  console.log(`Multicall3 Address: ${MULTICALL3_ADDRESS}`)
  console.log(`USDFC Address: ${USDFC_ADDRESS}`)
  console.log(`Genesis Timestamp: ${GENESIS_TIMESTAMP}\n`)

  try {
    // Create Synapse instance
    const synapseOptions = {
      privateKey: PRIVATE_KEY,
      rpcURL: RPC_URL,
    }

    if (WARM_STORAGE_ADDRESS) {
      synapseOptions.warmStorageAddress = WARM_STORAGE_ADDRESS
    }
    if (MULTICALL3_ADDRESS) {
      synapseOptions.multicall3Address = MULTICALL3_ADDRESS
    }
    if (WARM_STORAGE_VIEW_ADDRESS) {
      synapseOptions.warmStorageViewAddress = WARM_STORAGE_VIEW_ADDRESS
    }
    if (USDFC_ADDRESS) {
      synapseOptions.usdfcAddress = USDFC_ADDRESS
    }
    if (GENESIS_TIMESTAMP !== undefined) {
      synapseOptions.genesisTimestamp = GENESIS_TIMESTAMP
    }

    const synapse = await Synapse.create(synapseOptions)
    console.log('✓ Synapse instance created')
    
    const clientAddress = await synapse.getClient().getAddress()
    console.log(`Client address: ${clientAddress}`)
    
    const warmStorageAddress = synapse.getWarmStorageAddress()
    console.log(`Warm Storage Address (recordKeeper): ${warmStorageAddress}`)
    console.log(`Chain ID: ${synapse.getChainId()}\n`)

    // Get provider info
    const providers = await synapse.storage.getStorageInfo()
    if (providers.length === 0) {
      console.error('❌ No providers available')
      process.exit(1)
    }

    const provider = providers[0]
    console.log(`Using Provider:`)
    console.log(`  ID: ${provider.id}`)
    console.log(`  Address: ${provider.serviceProvider}`)
    console.log(`  Payee: ${provider.payee}`)
    console.log(`  Service URL: ${provider.products.PDP?.data.serviceURL}\n`)

    // Create storage context
    console.log('Creating storage context...')
    const storageContext = await synapse.storage.createContext({
      providerId: provider.id,
      withCDN: false,
    })

    console.log(`Data set ID: ${storageContext.dataSetId || 'undefined (will create new)'}\n`)

    // Try to create a data set manually to see the error
    console.log('Attempting to create data set...')
    console.log('This will show the exact error from Curio.\n')

    // The error happens in _processPendingPieces when dataSetId is undefined
    // Let's try to trigger it with a small piece
    const testData = new Uint8Array(127).fill(42)
    
    try {
      await storageContext.upload(testData)
      console.log('✓ Upload succeeded!')
    } catch (error) {
      console.error('\n❌ Upload failed with error:')
      console.error(`Error: ${error.message}`)
      if (error.cause) {
        console.error(`Cause: ${error.cause.message || error.cause}`)
      }
      if (error.stack) {
        console.error(`\nStack trace:`)
        console.error(error.stack)
      }
      
      // Try to extract more details
      if (error.message.includes('Failed to create data set')) {
        console.error('\n🔍 Data Set Creation Failed')
        console.error('\nPossible issues:')
        console.error('1. Curio may not recognize the WarmStorage contract address')
        console.error(`   Current recordKeeper: ${warmStorageAddress}`)
        console.error('2. The signature may be invalid')
        console.error('3. Curio may need the PDPVerifier address instead of WarmStorage')
        console.error('4. Check Curio logs for detailed error messages')
        console.error('\nTo debug further:')
        console.error(`- Check Curio logs when this request is made`)
        console.error(`- Verify the WarmStorage address matches what Curio expects`)
        console.error(`- Try manually calling: curl -X POST http://curio:80/pdp/data-sets/create-and-add`)
      }
    }
  } catch (error) {
    console.error('\n❌ Fatal error:')
    console.error(`Error: ${error.message}`)
    if (error.stack) {
      console.error(`\nStack trace:`)
      console.error(error.stack)
    }
    process.exit(1)
  }
}

debugCreateDataSet().catch(console.error)


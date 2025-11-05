#!/usr/bin/env node

/**
 * Debug script to test Curio PDP service connectivity
 */

const SERVICE_URL = process.env.SERVICE_URL || process.env.CURIO_URL || 'http://curio:80'

async function testCurio() {
  console.log(`Testing Curio service at: ${SERVICE_URL}\n`)

  // Test 1: Ping endpoint
  console.log('1. Testing ping endpoint...')
  try {
    const pingResponse = await fetch(`${SERVICE_URL}/pdp/ping`)
    if (pingResponse.status === 200) {
      console.log('   ✓ Ping successful')
    } else {
      console.log(`   ✗ Ping failed: ${pingResponse.status} ${pingResponse.statusText}`)
    }
  } catch (error) {
    console.log(`   ✗ Ping failed: ${error.message}`)
    console.log(`   Error details:`, error)
    return
  }

  // Test 2: Test piece query endpoint (with a dummy piece CID)
  console.log('\n2. Testing piece query endpoint...')
  const dummyPieceCid = 'bafkzcibeqcad6efnpwn62p5vvs5x3nh3j7xkzfgb3xtitcdm2hulmty3xx4tl3wace'
  try {
    const pieceResponse = await fetch(`${SERVICE_URL}/pdp/piece?pieceCid=${dummyPieceCid}`)
    if (pieceResponse.status === 404) {
      console.log('   ✓ Endpoint accessible (404 expected for dummy piece)')
    } else if (pieceResponse.status === 200) {
      console.log('   ✓ Endpoint accessible (piece found - unexpected for dummy)')
    } else {
      console.log(`   ✗ Unexpected status: ${pieceResponse.status} ${pieceResponse.statusText}`)
    }
  } catch (error) {
    console.log(`   ✗ Request failed: ${error.message}`)
    console.log(`   Error details:`, error)
  }

  // Test 3: Try to create a piece upload session
  console.log('\n3. Testing piece upload endpoint...')
  try {
    const uploadResponse = await fetch(`${SERVICE_URL}/pdp/piece`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pieceCid: dummyPieceCid,
      }),
    })
    if (uploadResponse.status === 200 || uploadResponse.status === 201) {
      console.log('   ✓ Upload endpoint accessible')
      const location = uploadResponse.headers.get('Location')
      if (location) {
        console.log(`   Upload UUID: ${location}`)
      }
    } else {
      const text = await uploadResponse.text().catch(() => 'Unknown error')
      console.log(`   ✗ Upload endpoint returned: ${uploadResponse.status} ${uploadResponse.statusText}`)
      console.log(`   Response: ${text}`)
    }
  } catch (error) {
    console.log(`   ✗ Request failed: ${error.message}`)
    console.log(`   Error details:`, error)
  }

  console.log('\n--- Summary ---')
  console.log(`If all tests show ✓, the Curio service is accessible.`)
  console.log(`If you see ✗, check:`)
  console.log(`  1. Is Curio running? (docker ps or systemctl status)`)
  console.log(`  2. Is the service URL correct? (currently: ${SERVICE_URL})`)
  console.log(`  3. Can you reach it from this container? (try: curl ${SERVICE_URL}/pdp/ping)`)
  console.log(`  4. Check Curio logs for errors`)
}

testCurio().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})


#!/usr/bin/env node

/**
 * Test the complete piece upload flow to Curio
 * This helps debug why pieces aren't being found after upload
 */

const SERVICE_URL = process.env.SERVICE_URL || process.env.CURIO_URL || 'http://curio:80'

async function testUploadFlow() {
  console.log(`Testing complete piece upload flow to: ${SERVICE_URL}\n`)

  // Create test data (154 bytes, matching the e2e test file)
  const testData = new Uint8Array(154)
  for (let i = 0; i < testData.length; i++) {
    testData[i] = i % 256
  }

  // Calculate PieceCID
  const { calculate } = await import('../packages/synapse-sdk/dist/src/piece/index.js')
  const pieceCid = calculate(testData)
  console.log(`Test data size: ${testData.length} bytes`)
  console.log(`Calculated PieceCID: ${pieceCid.toString()}\n`)

  // Step 1: Create upload session
  console.log('1. Creating upload session (POST /pdp/piece)...')
  let uploadUuid
  try {
    const createResponse = await fetch(`${SERVICE_URL}/pdp/piece`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pieceCid: pieceCid.toString(),
      }),
    })

    if (createResponse.status === 200) {
      console.log('   ✓ Piece already exists on server')
      console.log('   Testing query endpoint...')
      const queryResponse = await fetch(`${SERVICE_URL}/pdp/piece?pieceCid=${pieceCid.toString()}`)
      if (queryResponse.status === 200) {
        console.log('   ✓ Piece is queryable')
        return
      } else {
        console.log(`   ✗ Piece exists but not queryable: ${queryResponse.status}`)
      }
      return
    }

    if (createResponse.status !== 201 && createResponse.status !== 202) {
      const text = await createResponse.text()
      console.log(`   ✗ Failed: ${createResponse.status} ${createResponse.statusText}`)
      console.log(`   Response: ${text}`)
      return
    }

    const location = createResponse.headers.get('Location')
    if (!location) {
      console.log('   ✗ No Location header in response')
      return
    }
    uploadUuid = location.split('/').pop()
    console.log(`   ✓ Upload session created: ${uploadUuid}`)
  } catch (error) {
    console.log(`   ✗ Failed: ${error.message}`)
    return
  }

  // Step 2: Upload piece data
  console.log('\n2. Uploading piece data (PUT /pdp/piece/upload/{uuid})...')
  try {
    const uploadResponse = await fetch(`${SERVICE_URL}/pdp/piece/upload/${uploadUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': testData.length.toString(),
      },
      body: testData,
    })

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text()
      console.log(`   ✗ Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
      console.log(`   Response: ${text}`)
      return
    }
    console.log(`   ✓ Data uploaded successfully (${uploadResponse.status})`)
  } catch (error) {
    console.log(`   ✗ Upload failed: ${error.message}`)
    return
  }

  // Step 3: Poll for piece to be available
  console.log('\n3. Polling for piece to be available (GET /pdp/piece?pieceCid=...)...')
  const maxAttempts = 60 // 5 minutes at 5 second intervals
  const pollInterval = 5000 // 5 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const queryResponse = await fetch(`${SERVICE_URL}/pdp/piece?pieceCid=${pieceCid.toString()}`)
      
      if (queryResponse.status === 200) {
        const data = await queryResponse.json()
        console.log(`   ✓ Piece found after ${attempt} attempt(s) (${(attempt * pollInterval) / 1000}s)`)
        console.log(`   Response: ${JSON.stringify(data, null, 2)}`)
        return
      } else if (queryResponse.status === 404) {
        if (attempt % 12 === 0) { // Log every minute
          console.log(`   ... Still waiting (attempt ${attempt}/${maxAttempts}, ${(attempt * pollInterval) / 1000}s elapsed)`)
        }
      } else {
        const text = await queryResponse.text()
        console.log(`   ✗ Unexpected status: ${queryResponse.status} ${queryResponse.statusText}`)
        console.log(`   Response: ${text}`)
        return
      }
    } catch (error) {
      console.log(`   ✗ Query failed: ${error.message}`)
      return
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }
  }

  console.log(`\n   ✗ Timeout: Piece not found after ${maxAttempts} attempts (${(maxAttempts * pollInterval) / 1000}s)`)
  console.log(`\n   This suggests:`)
  console.log(`   1. Curio is not processing/indexing the piece after upload`)
  console.log(`   2. Check Curio logs for errors during upload/processing`)
  console.log(`   3. Verify Curio's database and indexing services are running`)
  console.log(`   4. Check if Curio needs additional configuration for devnet`)
}

testUploadFlow().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})


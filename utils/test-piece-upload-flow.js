#!/usr/bin/env node

/**
 * Test the complete piece upload flow to Curio
 * This helps debug why pieces aren't being found after upload
 */

const SERVICE_URL = process.env.SERVICE_URL || process.env.CURIO_URL || 'http://curio:80'

async function testUploadFlow() {
  console.log('='.repeat(80))
  console.log('Curio PDP Service Upload Flow Debug Test')
  console.log('='.repeat(80))
  console.log(`\nService URL: ${SERVICE_URL}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // Create test data (154 bytes, matching the e2e test file)
  const testData = new Uint8Array(154)
  for (let i = 0; i < testData.length; i++) {
    testData[i] = i % 256
  }

  // Calculate PieceCID
  const { calculate } = await import('../packages/synapse-sdk/dist/src/piece/index.js')
  const pieceCid = calculate(testData)
  console.log('--- Test Data ---')
  console.log(`Data size: ${testData.length} bytes`)
  console.log(`PieceCID: ${pieceCid.toString()}`)
  console.log(`PieceCID bytes (last 32): ${Array.from(pieceCid.bytes.slice(-32)).map(b => b.toString(16).padStart(2, '0')).join('')}`)
  console.log(`First 20 bytes: ${Array.from(testData.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
  console.log('')

  // Step 1: Create upload session
  console.log('='.repeat(80))
  console.log('STEP 1: Creating Upload Session')
  console.log('='.repeat(80))
  const step1Start = Date.now()
  const createUrl = `${SERVICE_URL}/pdp/piece`
  console.log(`\nRequest Details:`)
  console.log(`  Method: POST`)
  console.log(`  URL: ${createUrl}`)
  console.log(`  Headers: Content-Type: application/json`)
  console.log(`  Body: ${JSON.stringify({ pieceCid: pieceCid.toString() })}`)
  
  let uploadUuid
  try {
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pieceCid: pieceCid.toString(),
      }),
    })

    const step1Duration = Date.now() - step1Start
    console.log(`\nResponse Details:`)
    console.log(`  Status: ${createResponse.status} ${createResponse.statusText}`)
    console.log(`  Duration: ${step1Duration}ms`)
    console.log(`  Headers:`)
    for (const [key, value] of createResponse.headers.entries()) {
      console.log(`    ${key}: ${value}`)
    }

    if (createResponse.status === 200) {
      console.log(`\n  ✓ Piece already exists on server`)
      const responseText = await createResponse.text()
      console.log(`  Response body: ${responseText || '(empty)'}`)
      console.log(`\n  Testing query endpoint...`)
      const queryUrl = `${SERVICE_URL}/pdp/piece?pieceCid=${pieceCid.toString()}`
      console.log(`  GET ${queryUrl}`)
      const queryResponse = await fetch(queryUrl)
      console.log(`  Query status: ${queryResponse.status} ${queryResponse.statusText}`)
      if (queryResponse.status === 200) {
        const queryData = await queryResponse.json()
        console.log(`  ✓ Piece is queryable`)
        console.log(`  Query response: ${JSON.stringify(queryData, null, 2)}`)
        return
      } else {
        const queryText = await queryResponse.text()
        console.log(`  ✗ Piece exists but not queryable: ${queryResponse.status}`)
        console.log(`  Query response: ${queryText}`)
      }
      return
    }

    if (createResponse.status !== 201 && createResponse.status !== 202) {
      const text = await createResponse.text()
      console.log(`\n  ✗ Failed: ${createResponse.status} ${createResponse.statusText}`)
      console.log(`  Response body: ${text || '(empty)'}`)
      console.log(`\n  Possible issues:`)
      console.log(`    - Service is not accepting new pieces`)
      console.log(`    - Invalid PieceCID format`)
      console.log(`    - Authentication/authorization issue`)
      console.log(`    - Service error (check Curio logs)`)
      return
    }

    const location = createResponse.headers.get('Location')
    if (!location) {
      console.log(`\n  ✗ No Location header in response`)
      console.log(`  Response body: ${await createResponse.text() || '(empty)'}`)
      console.log(`\n  Issue: Upload session created but no Location header returned`)
      console.log(`  This indicates a problem with Curio's response format`)
      return
    }
    uploadUuid = location.split('/').pop()
    console.log(`\n  ✓ Upload session created successfully`)
    console.log(`  Location header: ${location}`)
    console.log(`  Upload UUID: ${uploadUuid}`)
    const responseBody = await createResponse.text()
    if (responseBody) {
      console.log(`  Response body: ${responseBody}`)
    }
  } catch (error) {
    const step1Duration = Date.now() - step1Start
    console.log(`\n  ✗ Request failed after ${step1Duration}ms`)
    console.log(`  Error: ${error.message}`)
    console.log(`  Error type: ${error.constructor.name}`)
    if (error.cause) {
      console.log(`  Error cause: ${error.cause.message || error.cause}`)
    }
    if (error.stack) {
      console.log(`\n  Stack trace:`)
      console.log(`  ${error.stack}`)
    }
    console.log(`\n  Possible issues:`)
    console.log(`    - Network connectivity problem`)
    console.log(`    - DNS resolution failure (cannot resolve 'curio' hostname)`)
    console.log(`    - Service is not running or not accessible`)
    console.log(`    - Firewall blocking the connection`)
    console.log(`    - SSL/TLS certificate issue (if using HTTPS)`)
    return
  }

  // Step 2: Upload piece data
  console.log('\n' + '='.repeat(80))
  console.log('STEP 2: Uploading Piece Data')
  console.log('='.repeat(80))
  const step2Start = Date.now()
  const uploadUrl = `${SERVICE_URL}/pdp/piece/upload/${uploadUuid}`
  console.log(`\nRequest Details:`)
  console.log(`  Method: PUT`)
  console.log(`  URL: ${uploadUrl}`)
  console.log(`  Headers:`)
  console.log(`    Content-Type: application/octet-stream`)
  console.log(`    Content-Length: ${testData.length}`)
  console.log(`  Body size: ${testData.length} bytes`)
  console.log(`  Body hash (first 32 bytes): ${Array.from(testData.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('')}...`)
  
  try {
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': testData.length.toString(),
      },
      body: testData,
    })

    const step2Duration = Date.now() - step2Start
    console.log(`\nResponse Details:`)
    console.log(`  Status: ${uploadResponse.status} ${uploadResponse.statusText}`)
    console.log(`  Duration: ${step2Duration}ms`)
    console.log(`  Upload rate: ${(testData.length / 1024 / (step2Duration / 1000)).toFixed(2)} KB/s`)
    console.log(`  Headers:`)
    for (const [key, value] of uploadResponse.headers.entries()) {
      console.log(`    ${key}: ${value}`)
    }

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text()
      console.log(`\n  ✗ Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
      console.log(`  Response body: ${text || '(empty)'}`)
      console.log(`\n  Possible issues:`)
      if (uploadResponse.status === 404) {
        console.log(`    - Upload UUID not found (session may have expired)`)
      } else if (uploadResponse.status === 413) {
        console.log(`    - Payload too large`)
      } else if (uploadResponse.status === 400) {
        console.log(`    - Invalid request format`)
      } else if (uploadResponse.status >= 500) {
        console.log(`    - Server error (check Curio logs)`)
      }
      return
    }
    
    const responseBody = await uploadResponse.text()
    console.log(`\n  ✓ Data uploaded successfully`)
    if (responseBody) {
      console.log(`  Response body: ${responseBody}`)
    }
  } catch (error) {
    const step2Duration = Date.now() - step2Start
    console.log(`\n  ✗ Upload failed after ${step2Duration}ms`)
    console.log(`  Error: ${error.message}`)
    console.log(`  Error type: ${error.constructor.name}`)
    if (error.cause) {
      console.log(`  Error cause: ${error.cause.message || error.cause}`)
    }
    if (error.stack) {
      console.log(`\n  Stack trace:`)
      console.log(`  ${error.stack}`)
    }
    console.log(`\n  Possible issues:`)
    console.log(`    - Network timeout during upload`)
    console.log(`    - Connection reset during transfer`)
    console.log(`    - Service is not accepting the data`)
    return
  }

  // Step 3: Poll for piece to be available
  console.log('\n' + '='.repeat(80))
  console.log('STEP 3: Polling for Piece Availability')
  console.log('='.repeat(80))
  const step3Start = Date.now()
  const maxAttempts = 60 // 5 minutes at 5 second intervals
  const pollInterval = 5000 // 5 seconds
  const queryUrl = `${SERVICE_URL}/pdp/piece?pieceCid=${pieceCid.toString()}`
  
  console.log(`\nPolling Configuration:`)
  console.log(`  Query URL: ${queryUrl}`)
  console.log(`  Max attempts: ${maxAttempts}`)
  console.log(`  Poll interval: ${pollInterval}ms (${pollInterval / 1000}s)`)
  console.log(`  Max wait time: ${(maxAttempts * pollInterval) / 1000}s (${(maxAttempts * pollInterval) / 60000} minutes)`)
  console.log(`\nStarting polling...\n`)

  let lastQueryTime = 0
  let queryDurations = []

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const queryStart = Date.now()
    try {
      const queryResponse = await fetch(queryUrl)
      const queryDuration = Date.now() - queryStart
      queryDurations.push(queryDuration)
      lastQueryTime = Date.now()
      
      if (queryResponse.status === 200) {
        const totalWaitTime = (Date.now() - step3Start) / 1000
        const data = await queryResponse.json()
        console.log(`  ✓ Piece found after ${attempt} attempt(s)`)
        console.log(`  Total wait time: ${totalWaitTime.toFixed(2)}s (${(totalWaitTime / 60).toFixed(2)} minutes)`)
        console.log(`  Average query duration: ${(queryDurations.reduce((a, b) => a + b, 0) / queryDurations.length).toFixed(2)}ms`)
        console.log(`\n  Response Details:`)
        console.log(`    Status: ${queryResponse.status} ${queryResponse.statusText}`)
        console.log(`    Headers:`)
        for (const [key, value] of queryResponse.headers.entries()) {
          console.log(`      ${key}: ${value}`)
        }
        console.log(`    Body: ${JSON.stringify(data, null, 2)}`)
        return
      } else if (queryResponse.status === 404) {
        if (attempt === 1) {
          console.log(`  Attempt ${attempt}: Piece not found (404) - waiting for processing...`)
        } else if (attempt % 12 === 0) { // Log every minute
          const elapsed = (attempt * pollInterval) / 1000
          const avgQueryTime = queryDurations.reduce((a, b) => a + b, 0) / queryDurations.length
          console.log(`  Attempt ${attempt}/${maxAttempts}: Still waiting...`)
          console.log(`    Elapsed: ${elapsed.toFixed(0)}s (${(elapsed / 60).toFixed(1)} minutes)`)
          console.log(`    Avg query time: ${avgQueryTime.toFixed(2)}ms`)
          console.log(`    Last query duration: ${queryDuration}ms`)
        }
      } else {
        const text = await queryResponse.text()
        console.log(`\n  ✗ Unexpected status: ${queryResponse.status} ${queryResponse.statusText}`)
        console.log(`  Response body: ${text || '(empty)'}`)
        console.log(`  Headers:`)
        for (const [key, value] of queryResponse.headers.entries()) {
          console.log(`    ${key}: ${value}`)
        }
        console.log(`\n  Possible issues:`)
        if (queryResponse.status === 401) {
          console.log(`    - Authentication required`)
        } else if (queryResponse.status === 403) {
          console.log(`    - Access forbidden`)
        } else if (queryResponse.status === 500) {
          console.log(`    - Server error (check Curio logs)`)
        }
        return
      }
    } catch (error) {
      const queryDuration = Date.now() - queryStart
      console.log(`\n  ✗ Query failed after ${queryDuration}ms`)
      console.log(`  Attempt: ${attempt}/${maxAttempts}`)
      console.log(`  Error: ${error.message}`)
      console.log(`  Error type: ${error.constructor.name}`)
      if (error.cause) {
        console.log(`  Error cause: ${error.cause.message || error.cause}`)
      }
      if (error.stack) {
        console.log(`\n  Stack trace:`)
        console.log(`  ${error.stack}`)
      }
      console.log(`\n  Possible issues:`)
      console.log(`    - Network connectivity issue`)
      console.log(`    - Service became unavailable`)
      console.log(`    - Request timeout`)
      return
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }
  }

  const totalWaitTime = (Date.now() - step3Start) / 1000
  const avgQueryTime = queryDurations.length > 0 
    ? (queryDurations.reduce((a, b) => a + b, 0) / queryDurations.length).toFixed(2)
    : 'N/A'
  
  console.log(`\n  ✗ Timeout: Piece not found after ${maxAttempts} attempts`)
  console.log(`  Total wait time: ${totalWaitTime.toFixed(2)}s (${(totalWaitTime / 60).toFixed(2)} minutes)`)
  console.log(`  Average query duration: ${avgQueryTime}ms`)
  console.log(`  Last successful query: ${lastQueryTime > 0 ? new Date(lastQueryTime).toISOString() : 'Never'}`)
  
  console.log(`\n  This suggests:`)
  console.log(`    1. Curio is not processing/indexing the piece after upload`)
  console.log(`    2. There's a delay between upload completion and piece indexing`)
  console.log(`    3. The piece indexing service may be down or misconfigured`)
  console.log(`    4. Database connectivity issue preventing piece indexing`)
  console.log(`\n  Debugging steps:`)
  console.log(`    1. Check Curio logs for errors during upload/processing`)
  console.log(`    2. Verify Curio's database and indexing services are running`)
  console.log(`    3. Check if Curio needs additional configuration for devnet`)
  console.log(`    4. Verify the piece was actually uploaded (check storage backend)`)
  console.log(`    5. Check Curio's piece processing queue/worker status`)
  console.log(`    6. Verify the PieceCID format matches what Curio expects`)
  console.log(`\n  Manual verification:`)
  console.log(`    curl -v "${queryUrl}"`)
  console.log(`    curl -v "${SERVICE_URL}/pdp/ping"`)
}

testUploadFlow().catch((error) => {
  console.error('\n' + '='.repeat(80))
  console.error('FATAL ERROR')
  console.error('='.repeat(80))
  console.error(`Error: ${error.message}`)
  console.error(`Type: ${error.constructor.name}`)
  if (error.cause) {
    console.error(`Cause: ${error.cause.message || error.cause}`)
  }
  if (error.stack) {
    console.error(`\nStack trace:`)
    console.error(error.stack)
  }
  process.exit(1)
})


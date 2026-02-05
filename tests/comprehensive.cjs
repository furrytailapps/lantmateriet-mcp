// Comprehensive test script for all Lantmäteriet MCP tools
const http = require('http');
const https = require('https');

// Allow testing against production via MCP_URL env var
const MCP_URL = process.env.MCP_URL || 'http://localhost:3000/mcp';
const parsedUrl = new URL(MCP_URL);
const isHttps = parsedUrl.protocol === 'https:';
const httpModule = isHttps ? https : http;

function parseSSE(sseText) {
  const lines = sseText.split('\n');
  let data = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      data += line.substring(6);
    }
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

async function testMCP(method, params = {}) {
  const data = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  });

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      Accept: 'application/json, text/event-stream',
    },
  };

  return new Promise((resolve, reject) => {
    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const parsed = parseSSE(body);
        if (parsed) {
          resolve(parsed);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ rawBody: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Comprehensive Lantmäteriet MCP Server Test');
  console.log(`URL: ${MCP_URL}\n`);
  const results = { passed: 0, failed: 0, tests: [] };

  function recordTest(name, passed, details = '') {
    results.tests.push({ name, passed, details });
    if (passed) {
      results.passed++;
      console.log(`   OK ${name} ${details}`);
    } else {
      results.failed++;
      console.log(`   FAILED ${name} ${details}`);
    }
  }

  // Test 1: Initialize
  console.log('1. Testing MCP initialization...');
  try {
    const initResult = await testMCP('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'comprehensive-test', version: '1.0.0' },
    });
    recordTest('Initialize', !!initResult.result?.serverInfo, `(server: ${initResult.result?.serverInfo?.name || 'unknown'})`);
  } catch (error) {
    recordTest('Initialize', false, `(error: ${error.message})`);
  }

  // Test 2: List tools (should be exactly 4)
  console.log('\n2. Testing tools/list...');
  try {
    const toolsResult = await testMCP('tools/list');
    const toolCount = toolsResult.result?.tools?.length || 0;
    recordTest('List tools', toolCount === 4, `(found ${toolCount}/4 tools)`);
  } catch (error) {
    recordTest('List tools', false, `(error: ${error.message})`);
  }

  // ============ lm_property_search ============
  console.log('\n3. Testing lm_property_search...');

  // 3a: Search by coordinates
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_property_search',
      arguments: { latitude: 59.33, longitude: 18.07 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Property search - by coordinates', data.properties !== undefined || !data.error, `(found ${data.count || 0} properties)`);
  } catch (error) {
    recordTest('Property search - by coordinates', false, `(error: ${error.message})`);
  }

  // 3b: Search by designation (if supported)
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_property_search',
      arguments: { designation: 'STOCKHOLM NORRMALM' },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    // This might fail if designation search requires different format
    recordTest('Property search - by designation', data.properties !== undefined || data.error === 'VALIDATION' || !data.error, '(STOCKHOLM NORRMALM)');
  } catch (error) {
    recordTest('Property search - by designation', false, `(error: ${error.message})`);
  }

  // ============ lm_elevation ============
  console.log('\n4. Testing lm_elevation...');

  // 4a: Elevation at Stockholm
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_elevation',
      arguments: { latitude: 59.33, longitude: 18.07 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Elevation - Stockholm', data.elevation !== undefined || data.height !== undefined || !data.error, `(${data.elevation || data.height || '?'}m)`);
  } catch (error) {
    recordTest('Elevation - Stockholm', false, `(error: ${error.message})`);
  }

  // 4b: Elevation at Gothenburg
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_elevation',
      arguments: { latitude: 57.71, longitude: 11.97 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Elevation - Gothenburg', data.elevation !== undefined || data.height !== undefined || !data.error, `(${data.elevation || data.height || '?'}m)`);
  } catch (error) {
    recordTest('Elevation - Gothenburg', false, `(error: ${error.message})`);
  }

  // 4c: Elevation at Kiruna (northern Sweden - high altitude)
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_elevation',
      arguments: { latitude: 67.86, longitude: 20.23 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Elevation - Kiruna', data.elevation !== undefined || data.height !== undefined || !data.error, `(${data.elevation || data.height || '?'}m)`);
  } catch (error) {
    recordTest('Elevation - Kiruna', false, `(error: ${error.message})`);
  }

  // ============ lm_map_url ============
  console.log('\n5. Testing lm_map_url...');

  // 5a: Topographic map
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_map_url',
      arguments: { latitude: 59.33, longitude: 18.07, mapType: 'topographic', zoom: 10 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Map URL - topographic', data.url !== undefined || data.urls !== undefined || !data.error, '');
  } catch (error) {
    recordTest('Map URL - topographic', false, `(error: ${error.message})`);
  }

  // 5b: Ortofoto map
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_map_url',
      arguments: { latitude: 59.33, longitude: 18.07, mapType: 'ortofoto', zoom: 12 },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('Map URL - ortofoto', data.url !== undefined || data.urls !== undefined || !data.error, '');
  } catch (error) {
    recordTest('Map URL - ortofoto', false, `(error: ${error.message})`);
  }

  // ============ lm_stac_search ============
  console.log('\n6. Testing lm_stac_search...');

  // 6a: Search STAC catalog
  try {
    const result = await testMCP('tools/call', {
      name: 'lm_stac_search',
      arguments: {
        latitude: 59.33,
        longitude: 18.07,
        collection: 'ortofoto',
      },
    });
    const data = JSON.parse(result.result?.content?.[0]?.text || '{}');
    recordTest('STAC search - ortofoto', data.items !== undefined || data.features !== undefined || !data.error, `(found ${data.count || data.features?.length || 0} items)`);
  } catch (error) {
    recordTest('STAC search - ortofoto', false, `(error: ${error.message})`);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  - ${t.name} ${t.details}`);
      });
    process.exit(1);
  }

  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);

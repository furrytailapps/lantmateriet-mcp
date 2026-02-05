// Basic test script for the Lantmäteriet MCP server
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
  console.log('Testing Lantmäteriet MCP Server');
  console.log(`URL: ${MCP_URL}\n`);

  // Test 1: Initialize
  console.log('1. Testing initialization...');
  const initResult = await testMCP('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });
  console.log('   ' + (initResult.result ? 'OK' : 'FAILED') + ' Initialize');
  if (initResult.result?.serverInfo) {
    console.log(`   Server: ${initResult.result.serverInfo.name}`);
  }

  // Test 2: List tools
  console.log('\n2. Listing available tools...');
  const toolsResult = await testMCP('tools/list');
  if (toolsResult.result?.tools) {
    const toolCount = toolsResult.result.tools.length;
    console.log(`   ${toolCount === 4 ? 'OK' : 'FAILED'} Found ${toolCount}/4 tools:`);
    toolsResult.result.tools.forEach((t) => console.log(`      - ${t.name}`));
  } else {
    console.log('   FAILED to list tools');
  }

  // Test 3: Call lm_map_url tool
  console.log('\n3. Testing lm_map_url...');
  const mapUrlResult = await testMCP('tools/call', {
    name: 'lm_map_url',
    arguments: {
      latitude: 59.33,
      longitude: 18.07,
      mapType: 'topographic',
      zoom: 10,
    },
  });

  if (mapUrlResult.result?.content?.[0]?.text) {
    const data = JSON.parse(mapUrlResult.result.content[0].text);
    if (data.url || data.urls) {
      console.log(`   OK Map URL generated`);
    } else if (data.error) {
      console.log('   FAILED:', data.message);
    }
  } else {
    console.log('   FAILED:', mapUrlResult.error?.message || 'Unknown error');
  }

  // Test 4: Call lm_elevation tool
  console.log('\n4. Testing lm_elevation at Stockholm (59.33, 18.07)...');
  const elevationResult = await testMCP('tools/call', {
    name: 'lm_elevation',
    arguments: {
      latitude: 59.33,
      longitude: 18.07,
    },
  });

  if (elevationResult.result?.content?.[0]?.text) {
    const data = JSON.parse(elevationResult.result.content[0].text);
    if (data.elevation !== undefined || data.height !== undefined) {
      console.log(`   OK Elevation: ${data.elevation || data.height}m`);
    } else if (data.error) {
      console.log('   FAILED:', data.message);
    }
  } else {
    console.log('   FAILED:', elevationResult.error?.message || 'Unknown error');
  }

  console.log('\nTests complete!\n');
}

main().catch(console.error);

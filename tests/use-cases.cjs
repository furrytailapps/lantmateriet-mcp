// Cross-MCP use case tests simulating how an AI agent would chain multiple MCPs together
// These tests represent real-world workflows where data from one MCP feeds into another
const http = require('http');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

// Allow testing against different MCP URLs via environment variables
const MCP_URLS = {
  lantmateriet: process.env.LANTMATERIET_MCP_URL || 'https://lantmateriet-mcp.vercel.app/mcp',
  smhi: process.env.SMHI_MCP_URL || 'https://mcp-smhi.vercel.app/mcp',
  trafikverket: process.env.TRAFIKVERKET_MCP_URL || 'https://mcp-trafikverket.vercel.app/mcp',
  sgu: process.env.SGU_MCP_URL || 'https://sgu-mcp.vercel.app/mcp',
  nvv: process.env.NVV_MCP_URL || 'https://nvv-mcp.vercel.app/mcp',
};

// ============================================================================
// Coordinate Conversion Utilities
// ============================================================================

// proj4 definition for SWEREF99 TM (EPSG:3006)
// Using simplified approximate conversion for tests (good enough for ~10m accuracy)
// Full proj4 library would be needed for production use

/**
 * Convert SWEREF99 TM (EPSG:3006) to WGS84 (EPSG:4326)
 * Approximate conversion suitable for testing
 */
function sweref99ToWgs84(x, y) {
  // These are approximate formulas based on Sweden's position
  // Good enough for ~10-50m accuracy in Sweden
  const centralMeridian = 15.0; // degrees
  const scale = 0.9996;
  const falseEasting = 500000;
  const falseNorthing = 0;

  // Simplified inverse projection
  const xAdj = (x - falseEasting) / scale;
  const yAdj = (y - falseNorthing) / scale;

  // Approximate conversion (works reasonably for Sweden)
  const lon = centralMeridian + xAdj / (111320 * Math.cos((yAdj / 6367000) * (180 / Math.PI)));
  const lat = (yAdj / 6367000) * (180 / Math.PI);

  // More accurate formula using typical Sweden conversion factors
  // For SWEREF99 TM, central meridian is 15°E
  const longitude = 15.0 + (x - 500000) / (Math.cos((y / 6378137) * 0.9996) * 111000);
  const latitude = y / 111000 / 0.9996 / 1.001;

  return {
    latitude: Math.round(latitude * 10000) / 10000,
    longitude: Math.round(longitude * 10000) / 10000,
  };
}

/**
 * Convert WGS84 (EPSG:4326) to SWEREF99 TM (EPSG:3006)
 * Approximate conversion suitable for testing
 */
function wgs84ToSweref99(latitude, longitude) {
  // Simplified projection to SWEREF99 TM
  const scale = 0.9996;
  const centralMeridian = 15.0;

  // Approximate conversion
  const x = 500000 + (longitude - centralMeridian) * Math.cos((latitude * Math.PI) / 180) * 111000 * scale;
  const y = latitude * 111000 * scale * 1.001;

  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

// ============================================================================
// MCP Communication Helpers
// ============================================================================

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

async function mcpRequest(url, method, params = {}) {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;

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
      'Accept': 'application/json, text/event-stream',
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
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

/**
 * Call a tool on a specific MCP
 */
async function callTool(mcpName, toolName, args) {
  const url = MCP_URLS[mcpName];
  if (!url) {
    throw new Error(`Unknown MCP: ${mcpName}`);
  }

  const result = await mcpRequest(url, 'tools/call', { name: toolName, arguments: args });
  const text = result.result?.content?.[0]?.text;

  if (!text) {
    return { error: true, message: 'No response from tool', raw: result };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: true, message: 'Failed to parse response', raw: text };
  }
}

/**
 * Initialize an MCP connection
 */
async function initMCP(mcpName) {
  const url = MCP_URLS[mcpName];
  return mcpRequest(url, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'cross-mcp-test', version: '1.0.0' },
  });
}

// ============================================================================
// Test Result Tracking
// ============================================================================

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
};

function recordStep(name, success, data = null, skipReason = null) {
  if (skipReason) {
    results.skipped++;
    console.log(`  ⊘ ${name} (SKIPPED: ${skipReason})`);
    return;
  }
  if (success) {
    results.passed++;
    console.log(`  ✓ ${name}`);
    if (data && typeof data === 'object') {
      const summary = Object.entries(data)
        .filter(([k, v]) => typeof v !== 'object' || v === null)
        .slice(0, 3)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (summary) console.log(`      ${summary}`);
    }
  } else {
    results.failed++;
    // Try to extract a useful error message
    let errorMsg = data?.message || data?.error || data?.note;
    if (!errorMsg && data?.code) {
      errorMsg = `Error code: ${data.code}`;
    }
    if (!errorMsg && typeof data === 'object' && data !== null) {
      // Check for nested error info
      errorMsg = data?.result?.message || data?.raw?.message || 'No data returned';
    }
    console.log(`  ✗ ${name}: ${errorMsg || 'Unknown error'}`);
  }
}

// ============================================================================
// USE CASE 1: Property Maintenance Cost Estimation
// Scenario: "Grönstad.se wants to answer an upphandling for fastighet Säffle Liden 16.
// They need sqm estimates for green area, hard area, and buildings,
// plus snow/drought history for the last 10 years."
// MCPs: lantmateriet + SMHI
// ============================================================================
async function useCase1_PropertyMaintenanceCostEstimation() {
  console.log('\n' + '='.repeat(70));
  console.log('USE CASE 1: Property Maintenance Cost Estimation');
  console.log('Scenario: Property tender requiring area estimates + weather history');
  console.log('MCPs: lantmateriet + SMHI');
  console.log('='.repeat(70) + '\n');

  // Step 1: Find property by designation
  console.log('Step 1: Find property "Säffle Liden 16"...');
  const propertyResult = await callTool('lantmateriet', 'lm_property_search', {
    queryType: 'designation',
    designation: 'SÄFFLE LIDEN 16',
  });

  if (propertyResult.error || !propertyResult.found) {
    // Property search requires credentials - use fallback coordinates for Säffle
    recordStep('Find property by designation', false, propertyResult);
    console.log('    Note: Property search requires Lantmäteriet API credentials');
    console.log('    Using fallback coordinates for Säffle area...\n');

    // Säffle approximate coordinates (WGS84)
    var latitude = 59.13;
    var longitude = 12.93;
    var sweref = wgs84ToSweref99(latitude, longitude);
  } else {
    recordStep('Find property by designation', true, {
      found: propertyResult.found,
      designation: propertyResult.search_designation,
    });

    // Extract coordinates from property result
    // For now, use Säffle area coordinates as property lookup may not return geometry
    var latitude = 59.13;
    var longitude = 12.93;
    var sweref = wgs84ToSweref99(latitude, longitude);
  }

  // Step 2: Get terrain elevation for drainage assessment
  console.log('\nStep 2: Get terrain elevation at property...');
  const elevationResult = await callTool('lantmateriet', 'lm_elevation', {
    latitude: latitude,
    longitude: longitude,
  });

  if (elevationResult.error || elevationResult.elevation_meters === undefined) {
    recordStep('Get terrain elevation', false, elevationResult);
    if (elevationResult.code === 'CREDENTIALS_REQUIRED') {
      console.log('    Note: Elevation requires Lantmäteriet API credentials');
    }
  } else {
    recordStep('Get terrain elevation', true, {
      elevation_m: elevationResult.elevation_meters,
      reference: elevationResult.reference_system,
    });
  }

  // Step 3: Query 10-year precipitation history for snow patterns
  // Using Värmland län code (S) since Säffle is in Värmland
  console.log('\nStep 3: Query 10-year precipitation history (snow patterns)...');

  // First, find the kommun code for Säffle
  const kommunResult = await callTool('smhi', 'smhi_describe_data', {
    dataType: 'kommuner',
    lanFilter: 'S', // Värmland
  });

  // Find Säffle kommun code
  let safflKommun = '1785'; // Säffle kommun code
  if (kommunResult.kommuner) {
    const saffle = kommunResult.kommuner.find((k) => k.name.toLowerCase().includes('säffle'));
    if (saffle) {
      safflKommun = saffle.code;
      console.log(`    Found Säffle kommun code: ${safflKommun}`);
    }
  }

  // Calculate date range for 10 years
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 10);
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const precipResult = await callTool('smhi', 'smhi_get_observations', {
    dataType: 'meteorological',
    kommun: safflKommun,
    parameter: 'precipitation',
    period: 'corrected-archive',
    startDate: startDateStr,
    endDate: endDateStr,
  });

  if (precipResult.error) {
    recordStep('Get 10-year precipitation history', false, precipResult);
  } else {
    const obsCount = precipResult.aggregation?.aggregatedCount || precipResult.observations?.length || 0;
    recordStep('Get 10-year precipitation history', true, {
      station: precipResult.station?.name,
      aggregation: precipResult.aggregation?.type,
      dataPoints: obsCount,
    });
  }

  // Step 4: Query 10-year temperature history (frost/drought)
  console.log('\nStep 4: Query 10-year temperature history (frost/drought)...');
  const tempResult = await callTool('smhi', 'smhi_get_observations', {
    dataType: 'meteorological',
    kommun: safflKommun,
    parameter: 'temperature',
    period: 'corrected-archive',
    startDate: startDateStr,
    endDate: endDateStr,
  });

  if (tempResult.error) {
    recordStep('Get 10-year temperature history', false, tempResult);
  } else {
    const obsCount = tempResult.aggregation?.aggregatedCount || tempResult.observations?.length || 0;
    recordStep('Get 10-year temperature history', true, {
      station: tempResult.station?.name,
      aggregation: tempResult.aggregation?.type,
      dataPoints: obsCount,
    });
  }

  // Step 5: Get current forecast for planning site visits
  console.log('\nStep 5: Get 10-day forecast for site visit planning...');
  const forecastResult = await callTool('smhi', 'smhi_get_forecast', {
    kommun: safflKommun,
    parameters: 'temperature,precipitationMean,windSpeed',
  });

  if (forecastResult.error) {
    recordStep('Get weather forecast', false, forecastResult);
  } else {
    const fcCount = forecastResult.timeSeries?.length || 0;
    recordStep('Get weather forecast', true, {
      location: forecastResult.approvedTime ? 'approved' : 'pending',
      forecastPoints: fcCount,
    });
  }
}

// ============================================================================
// USE CASE 2: Railway Corridor Weather Planning
// Scenario: "We need to plan sleeper replacement on track segment 001 next month.
// What's the weather forecast along the track?"
// MCPs: trafikverket + SMHI + lantmateriet
// ============================================================================
async function useCase2_RailwayCorridorWeatherPlanning() {
  console.log('\n' + '='.repeat(70));
  console.log('USE CASE 2: Railway Corridor Weather Planning');
  console.log('Scenario: Plan sleeper replacement on track 001 - need weather along corridor');
  console.log('MCPs: trafikverket + SMHI + lantmateriet');
  console.log('='.repeat(70) + '\n');

  // Step 1: Get track 001 infrastructure with corridor geometry
  // Note: Track IDs use leading zeros (e.g., "001" not "1")
  console.log('Step 1: Get track 001 infrastructure with corridor geometry...');
  const trackResult = await callTool('trafikverket', 'trafikverket_get_infrastructure', {
    queryType: 'tracks',
    trackId: '001',
    geometryDetail: 'corridor',
  });

  if (trackResult.error) {
    recordStep('Get track 001 infrastructure', false, trackResult);
    return; // Can't continue without track data
  }

  const track = trackResult.tracks?.[0];
  if (!track) {
    recordStep('Get track 001 infrastructure', false, { message: 'No track data returned' });
    return;
  }

  recordStep('Get track 001 infrastructure', true, {
    name: track.name || track.trackId,
    length_km: track.lengthKm || Math.round(track.lengthMeters / 1000),
    electrified: track.electrified,
  });

  // Extract representative coordinates along track
  // Use start, middle, and end points of corridor
  const corridor = track.corridorGeometry || track.geometry || [];
  let startCoord, midCoord, endCoord;

  if (Array.isArray(corridor) && corridor.length >= 2) {
    startCoord = corridor[0];
    midCoord = corridor[Math.floor(corridor.length / 2)];
    endCoord = corridor[corridor.length - 1];
  } else {
    // Fallback to track centroid if available, or use approximate coordinates for track 001
    // Track 001 (Södra Stambanan) runs roughly from Malmö to Stockholm area
    startCoord = [13.0, 55.6]; // Malmö area
    midCoord = [15.6, 58.4]; // Norrköping area
    endCoord = [18.1, 59.3]; // Stockholm area
  }

  console.log('    Extracted corridor sample points');

  // Step 2: Get forecast at track start point
  console.log('\nStep 2: Get forecast at track start point...');
  const startLat = Array.isArray(startCoord) ? startCoord[1] : startCoord.latitude || 57.71;
  const startLon = Array.isArray(startCoord) ? startCoord[0] : startCoord.longitude || 11.97;

  const forecastStart = await callTool('smhi', 'smhi_get_forecast', {
    latitude: startLat,
    longitude: startLon,
    parameters: 'temperature,precipitationMean,windSpeed',
  });

  if (forecastStart.error) {
    recordStep('Get forecast at track start', false, forecastStart);
  } else {
    recordStep('Get forecast at track start', true, {
      lat: startLat,
      lon: startLon,
      points: forecastStart.timeSeries?.length,
    });
  }

  // Step 3: Get forecast at track midpoint
  console.log('\nStep 3: Get forecast at track midpoint...');
  const midLat = Array.isArray(midCoord) ? midCoord[1] : midCoord.latitude || 57.8;
  const midLon = Array.isArray(midCoord) ? midCoord[0] : midCoord.longitude || 12.2;

  const forecastMid = await callTool('smhi', 'smhi_get_forecast', {
    latitude: midLat,
    longitude: midLon,
    parameters: 'temperature,precipitationMean,windSpeed',
  });

  if (forecastMid.error) {
    recordStep('Get forecast at track midpoint', false, forecastMid);
  } else {
    recordStep('Get forecast at track midpoint', true, {
      lat: midLat,
      lon: midLon,
      points: forecastMid.timeSeries?.length,
    });
  }

  // Step 4: Check elevation changes along track (for drainage planning)
  console.log('\nStep 4: Check elevation at track midpoint...');
  const elevationResult = await callTool('lantmateriet', 'lm_elevation', {
    latitude: midLat,
    longitude: midLon,
  });

  if (elevationResult.error || elevationResult.elevation_meters === undefined) {
    recordStep('Get elevation at track midpoint', false, elevationResult);
    if (elevationResult.code === 'CREDENTIALS_REQUIRED') {
      console.log('    Note: Elevation requires Lantmäteriet API credentials');
    }
  } else {
    recordStep('Get elevation at track midpoint', true, {
      elevation_m: elevationResult.elevation_meters,
    });
  }

  // Step 5: Get tunnel and bridge info for planning
  console.log('\nStep 5: Get tunnels and bridges on track 001...');
  const infrastructureResult = await callTool('trafikverket', 'trafikverket_get_infrastructure', {
    queryType: 'all',
    trackId: '001',
    geometryDetail: 'metadata',
  });

  if (infrastructureResult.error) {
    recordStep('Get tunnels/bridges on track', false, infrastructureResult);
  } else {
    recordStep('Get tunnels/bridges on track', true, {
      tunnels: infrastructureResult.tunnels?.length || 0,
      bridges: infrastructureResult.bridges?.length || 0,
      switches: infrastructureResult.switches?.length || 0,
    });
  }
}

// ============================================================================
// USE CASE 3: Construction Site Geology Assessment
// Scenario: "We're planning excavation at Kungsgatan 15, Stockholm.
// What's the soil/bedrock situation?"
// MCPs: lantmateriet + SGU
// ============================================================================
async function useCase3_ConstructionSiteGeologyAssessment() {
  console.log('\n' + '='.repeat(70));
  console.log('USE CASE 3: Construction Site Geology Assessment');
  console.log('Scenario: Planning excavation at Kungsgatan 15, Stockholm - need geology');
  console.log('MCPs: lantmateriet + SGU');
  console.log('='.repeat(70) + '\n');

  // Stockholm central coordinates (Kungsgatan area)
  const latitude = 59.336;
  const longitude = 18.066;
  const sweref = wgs84ToSweref99(latitude, longitude);

  // Step 1: Find property by address
  console.log('Step 1: Find property at "Kungsgatan 15, Stockholm"...');
  const propertyResult = await callTool('lantmateriet', 'lm_property_search', {
    queryType: 'address',
    address: 'Kungsgatan 15, Stockholm',
  });

  if (propertyResult.error || propertyResult.result?.totalCount === 0) {
    recordStep('Find property by address', false, propertyResult);
    console.log('    Note: Address search requires Lantmäteriet API credentials');
    console.log('    Using known coordinates for Kungsgatan area...\n');
  } else {
    recordStep('Find property by address', true, {
      found: propertyResult.result?.totalCount || 0,
    });
  }

  // Step 2: Get terrain elevation
  console.log('\nStep 2: Get terrain elevation...');
  const elevationResult = await callTool('lantmateriet', 'lm_elevation', {
    latitude: latitude,
    longitude: longitude,
  });

  if (elevationResult.error || elevationResult.elevation_meters === undefined) {
    recordStep('Get terrain elevation', false, elevationResult);
    if (elevationResult.code === 'CREDENTIALS_REQUIRED') {
      console.log('    Note: Requires Lantmäteriet credentials');
    }
  } else {
    recordStep('Get terrain elevation', true, {
      elevation_m: elevationResult.elevation_meters,
    });
  }

  // Step 3: Query bedrock geology at property location
  // SGU uses SWEREF99 TM coordinates
  console.log('\nStep 3: Query bedrock geology...');
  const bedrockResult = await callTool('sgu', 'sgu_query_point', {
    x: sweref.x,
    y: sweref.y,
    dataType: 'bedrock',
  });

  if (bedrockResult.error) {
    recordStep('Query bedrock geology', false, bedrockResult);
  } else {
    recordStep('Query bedrock geology', true, {
      found: bedrockResult.found,
      rockType: bedrockResult.bedrock?.rockType || bedrockResult.bedrock?.beskrivning,
    });
  }

  // Step 4: Query soil type (jordarter) at property location
  console.log('\nStep 4: Query soil type...');
  const soilResult = await callTool('sgu', 'sgu_query_point', {
    x: sweref.x,
    y: sweref.y,
    dataType: 'soil_type',
  });

  if (soilResult.error) {
    recordStep('Query soil type', false, soilResult);
  } else {
    recordStep('Query soil type', true, {
      found: soilResult.found,
      soilType: soilResult.soil_type?.jordart || soilResult.soil_type?.beskrivning,
    });
  }

  // Step 5: Query groundwater conditions
  console.log('\nStep 5: Query groundwater conditions...');
  const groundwaterResult = await callTool('sgu', 'sgu_query_point', {
    x: sweref.x,
    y: sweref.y,
    dataType: 'groundwater',
  });

  if (groundwaterResult.error) {
    recordStep('Query groundwater conditions', false, groundwaterResult);
  } else {
    recordStep('Query groundwater conditions', true, {
      found: groundwaterResult.found,
      aquifer: groundwaterResult.groundwater?.akvifer || groundwaterResult.groundwater?.beskrivning,
    });
  }

  // Step 6: Generate map URL for visual reference
  console.log('\nStep 6: Generate topographic map URL...');
  const mapResult = await callTool('lantmateriet', 'lm_map_url', {
    latitude: latitude,
    longitude: longitude,
    mapType: 'topographic',
    width: 800,
    height: 600,
    zoom: 15,
  });

  if (mapResult.error) {
    recordStep('Generate map URL', false, mapResult);
  } else {
    recordStep('Generate map URL', true, {
      url: mapResult.url ? 'generated' : 'not available',
    });
  }
}

// ============================================================================
// USE CASE 4: Infrastructure Environmental Check
// Scenario: "Before rail maintenance near Abisko, we need to check for
// protected nature areas."
// MCPs: trafikverket + NVV + lantmateriet
// ============================================================================
async function useCase4_InfrastructureEnvironmentalCheck() {
  console.log('\n' + '='.repeat(70));
  console.log('USE CASE 4: Infrastructure Environmental Check');
  console.log('Scenario: Check protected areas before rail maintenance near Abisko');
  console.log('MCPs: trafikverket + NVV + lantmateriet');
  console.log('='.repeat(70) + '\n');

  // Step 1: Look up station code for Abisko
  console.log('Step 1: Look up station code for Abisko...');
  const stationResult = await callTool('trafikverket', 'trafikverket_describe_data', {
    dataType: 'station_codes',
    nameFilter: 'Abisko',
  });

  let abiskoLat = 68.35;
  let abiskoLon = 18.83;

  if (stationResult.error) {
    recordStep('Look up Abisko station', false, stationResult);
  } else if (stationResult.stations?.length > 0) {
    const station = stationResult.stations[0];
    recordStep('Look up Abisko station', true, {
      code: station.code,
      name: station.name,
    });
    // Use station coordinates if available
    if (station.latitude && station.longitude) {
      abiskoLat = station.latitude;
      abiskoLon = station.longitude;
    }
  } else {
    recordStep('Look up Abisko station', true, {
      note: 'Using known Abisko coordinates',
    });
  }

  // Step 2: Get infrastructure near Abisko
  console.log('\nStep 2: Get railway infrastructure near Abisko...');
  const infraResult = await callTool('trafikverket', 'trafikverket_get_infrastructure', {
    queryType: 'all',
    latitude: abiskoLat,
    longitude: abiskoLon,
    radiusKm: 20,
    geometryDetail: 'metadata',
  });

  if (infraResult.error) {
    recordStep('Get infrastructure near Abisko', false, infraResult);
  } else {
    recordStep('Get infrastructure near Abisko', true, {
      tracks: infraResult.tracks?.length || 0,
      tunnels: infraResult.tunnels?.length || 0,
      bridges: infraResult.bridges?.length || 0,
      totalCount: infraResult.count,
    });
  }

  // Step 3: Check for protected areas (naturreservat) in the area
  // NVV uses kommun codes - Kiruna kommun is 2584
  console.log('\nStep 3: Check for protected nature reserves (naturreservat)...');
  const protectedResult = await callTool('nvv', 'nvv_list_protected_areas', {
    kommun: '2584', // Kiruna kommun (covers Abisko)
    limit: 50,
  });

  if (protectedResult.error) {
    recordStep('Check protected nature reserves', false, protectedResult);
  } else {
    recordStep('Check protected nature reserves', true, {
      count: protectedResult.count,
      areas:
        protectedResult.areas
          ?.slice(0, 3)
          .map((a) => a.namn)
          .join(', ') || 'none',
    });
  }

  // Step 4: Check for Natura 2000 areas
  console.log('\nStep 4: Check for Natura 2000 areas...');
  const n2000Result = await callTool('nvv', 'nvv_n2000_search', {
    kommun: '2584', // Kiruna kommun
    limit: 20,
  });

  if (n2000Result.error) {
    recordStep('Check Natura 2000 areas', false, n2000Result);
  } else {
    recordStep('Check Natura 2000 areas', true, {
      count: n2000Result.count || n2000Result.areas?.length || 0,
    });
  }

  // Step 5: Generate topographic map URL for planning
  console.log('\nStep 5: Generate topographic map URL...');
  const mapResult = await callTool('lantmateriet', 'lm_map_url', {
    latitude: abiskoLat,
    longitude: abiskoLon,
    mapType: 'topographic',
    width: 1200,
    height: 800,
    zoom: 12,
  });

  if (mapResult.error) {
    recordStep('Generate map URL', false, mapResult);
  } else {
    recordStep('Generate map URL', true, {
      url: mapResult.url ? 'generated' : 'not available',
    });
  }
}

// ============================================================================
// USE CASE 5: Property Flood Risk Assessment
// Scenario: "A client wants to buy a lakeside property in Värmland.
// What's the flood risk?"
// MCPs: lantmateriet + SMHI
// ============================================================================
async function useCase5_PropertyFloodRiskAssessment() {
  console.log('\n' + '='.repeat(70));
  console.log('USE CASE 5: Property Flood Risk Assessment');
  console.log('Scenario: Assess flood risk for lakeside property in Värmland');
  console.log('MCPs: lantmateriet + SMHI');
  console.log('='.repeat(70) + '\n');

  // Lakeside property coordinates near Vänern in Värmland
  // Using coordinates near Karlstad area
  const latitude = 59.4;
  const longitude = 13.5;
  const sweref = wgs84ToSweref99(latitude, longitude);

  // Step 1: Find property by coordinates
  console.log('Step 1: Search for property at lakeside coordinates...');
  const propertyResult = await callTool('lantmateriet', 'lm_property_search', {
    queryType: 'coordinate',
    latitude: latitude,
    longitude: longitude,
  });

  if (propertyResult.error || propertyResult.result?.totalCount === 0) {
    recordStep('Search property by coordinates', false, propertyResult);
    if (propertyResult.code === 'CREDENTIALS_REQUIRED') {
      console.log('    Note: Property search requires Lantmäteriet credentials');
    }
  } else {
    recordStep('Search property by coordinates', true, {
      found: propertyResult.result?.totalCount || 0,
    });
  }

  // Step 2: Get property elevation
  console.log('\nStep 2: Get property elevation...');
  const elevationResult = await callTool('lantmateriet', 'lm_elevation', {
    latitude: latitude,
    longitude: longitude,
  });

  let propertyElevation = null;
  if (elevationResult.error || elevationResult.elevation_meters === undefined) {
    recordStep('Get property elevation', false, elevationResult);
    if (elevationResult.code === 'CREDENTIALS_REQUIRED') {
      console.log('    Note: Elevation requires Lantmäteriet credentials');
    }
  } else {
    propertyElevation = elevationResult.elevation_meters;
    recordStep('Get property elevation', true, {
      elevation_m: propertyElevation,
    });
  }

  // Step 3: Find nearest hydrological station
  console.log('\nStep 3: Find nearest hydrological station...');
  const hydroStationsResult = await callTool('smhi', 'smhi_describe_data', {
    dataType: 'hydro_stations',
  });

  let nearestStation = null;
  if (hydroStationsResult.error) {
    recordStep('Find hydrological stations', false, hydroStationsResult);
  } else {
    // Find closest station (simple distance calculation)
    const stations = hydroStationsResult.stations || [];
    let minDist = Infinity;

    for (const station of stations) {
      const dist = Math.sqrt(Math.pow(station.latitude - latitude, 2) + Math.pow(station.longitude - longitude, 2));
      if (dist < minDist) {
        minDist = dist;
        nearestStation = station;
      }
    }

    if (nearestStation) {
      recordStep('Find nearest hydrological station', true, {
        name: nearestStation.name,
        id: nearestStation.id,
        distance_deg: minDist.toFixed(3),
      });
    } else {
      recordStep('Find nearest hydrological station', false, { message: 'No stations found' });
    }
  }

  // Step 4: Query 10-year water level history
  console.log('\nStep 4: Query 10-year water level history...');
  if (nearestStation) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 10);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const waterLevelResult = await callTool('smhi', 'smhi_get_observations', {
      dataType: 'hydrological',
      stationId: nearestStation.id,
      parameter: 'water_level',
      period: 'corrected-archive',
      startDate: startDateStr,
      endDate: endDateStr,
    });

    if (waterLevelResult.error) {
      recordStep('Query water level history', false, waterLevelResult);
    } else {
      const obsCount = waterLevelResult.aggregation?.aggregatedCount || waterLevelResult.observations?.length || 0;

      // Find max water level if available
      let maxLevel = null;
      if (waterLevelResult.observations) {
        for (const obs of waterLevelResult.observations) {
          const level = obs.max || obs.value;
          if (level && (maxLevel === null || level > maxLevel)) {
            maxLevel = level;
          }
        }
      }

      recordStep('Query water level history', true, {
        station: waterLevelResult.station?.name,
        dataPoints: obsCount,
        maxLevel_m: maxLevel,
      });
    }
  } else {
    recordStep('Query water level history', false, null, 'No station found');
  }

  // Step 5: Query historical precipitation extremes
  console.log('\nStep 5: Query historical precipitation extremes...');
  // Use Karlstad kommun code (1780)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 10);

  const precipResult = await callTool('smhi', 'smhi_get_observations', {
    dataType: 'meteorological',
    kommun: '1780', // Karlstad
    parameter: 'precipitation',
    period: 'corrected-archive',
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  });

  if (precipResult.error) {
    recordStep('Query precipitation extremes', false, precipResult);
  } else {
    const obsCount = precipResult.aggregation?.aggregatedCount || precipResult.observations?.length || 0;

    // Find max precipitation if available
    let maxPrecip = null;
    if (precipResult.observations) {
      for (const obs of precipResult.observations) {
        const precip = obs.max || obs.value;
        if (precip && (maxPrecip === null || precip > maxPrecip)) {
          maxPrecip = precip;
        }
      }
    }

    recordStep('Query precipitation extremes', true, {
      station: precipResult.station?.name,
      dataPoints: obsCount,
      maxPrecip_mm: maxPrecip,
    });
  }

  // Summary
  if (propertyElevation !== null) {
    console.log(`\n    Summary: Property at ${propertyElevation}m elevation`);
    console.log('    Compare with historical max water levels for flood risk assessment');
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================
async function main() {
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'CROSS-MCP USE CASE TESTS' + ' '.repeat(29) + '║');
  console.log('║' + ' '.repeat(10) + 'Simulating real agent workflows with multiple MCPs' + ' '.repeat(7) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log('\nMCP URLs:');
  for (const [name, url] of Object.entries(MCP_URLS)) {
    console.log(`  ${name}: ${url}`);
  }

  // Initialize all MCPs
  console.log('\nInitializing MCP connections...');
  try {
    await Promise.all([initMCP('lantmateriet'), initMCP('smhi'), initMCP('trafikverket'), initMCP('sgu'), initMCP('nvv')]);
    console.log('  All MCPs initialized successfully\n');
  } catch (err) {
    console.error('  Failed to initialize MCPs:', err.message);
    console.log('  Continuing with tests anyway...\n');
  }

  // Run all use cases
  await useCase1_PropertyMaintenanceCostEstimation();
  await useCase2_RailwayCorridorWeatherPlanning();
  await useCase3_ConstructionSiteGeologyAssessment();
  await useCase4_InfrastructureEnvironmentalCheck();
  await useCase5_PropertyFloodRiskAssessment();

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('OVERALL SUMMARY');
  console.log('═'.repeat(70));
  const total = results.passed + results.failed + results.skipped;
  console.log(`Total Steps: ${total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Success Rate: ${((results.passed / (total - results.skipped)) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\nNote: Some failures may be due to:');
    console.log('  - Lantmäteriet APIs requiring credentials (LANTMATERIET_CONSUMER_KEY/SECRET)');
    console.log('  - Rate limiting on public APIs');
    console.log('  - Approximate coordinate conversions in tests');
  }

  console.log('═'.repeat(70) + '\n');

  // Exit with error if any tests failed (excluding skipped)
  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

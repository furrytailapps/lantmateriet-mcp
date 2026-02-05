# Lantmäteriet MCP Test Suite

Cross-MCP integration tests that verify real agent workflows where data from one MCP feeds into another.

## Prerequisites

No local server required - tests run against production MCPs by default.

For local development testing:

```bash
npm run dev  # Start lantmateriet MCP at localhost:3000
```

## Running Tests

```bash
# Run against production MCPs
node tests/use-cases.cjs

# Run against local lantmateriet + production others
LANTMATERIET_MCP_URL=http://localhost:3000/mcp node tests/use-cases.cjs

# Run against all local MCPs
LANTMATERIET_MCP_URL=http://localhost:3000/mcp \
SMHI_MCP_URL=http://localhost:3001/mcp \
TRAFIKVERKET_MCP_URL=http://localhost:3002/mcp \
SGU_MCP_URL=http://localhost:3003/mcp \
NVV_MCP_URL=http://localhost:3004/mcp \
node tests/use-cases.cjs
```

## Test Files

### use-cases.cjs

Cross-MCP integration tests simulating real AI agent workflows. Each use case chains multiple MCPs together.

**Use Cases:**

1. **Property Maintenance Cost Estimation** (lantmateriet + SMHI)
   - Find property by designation
   - Get terrain elevation
   - Query 10-year weather history for maintenance planning

2. **Railway Corridor Weather Planning** (trafikverket + SMHI + lantmateriet)
   - Get track 001 corridor geometry (track IDs use leading zeros)
   - Get weather forecasts at multiple points along track
   - Check elevation for drainage planning

3. **Construction Site Geology Assessment** (lantmateriet + SGU)
   - Find property by address
   - Query bedrock, soil, and groundwater conditions
   - Generate map URL for reference

4. **Infrastructure Environmental Check** (trafikverket + NVV + lantmateriet)
   - Look up railway station
   - Get infrastructure near station
   - Check for protected nature areas (Natura 2000, naturreservat)

5. **Property Flood Risk Assessment** (lantmateriet + SMHI)
   - Get property elevation
   - Find nearest hydrological station
   - Query 10-year water level history

## Environment Variables

| Variable               | Default                                   | Description          |
| ---------------------- | ----------------------------------------- | -------------------- |
| `LANTMATERIET_MCP_URL` | `https://lantmateriet-mcp.vercel.app/mcp` | Lantmäteriet MCP URL |
| `SMHI_MCP_URL`         | `https://mcp-smhi.vercel.app/mcp`         | SMHI MCP URL         |
| `TRAFIKVERKET_MCP_URL` | `https://mcp-trafikverket.vercel.app/mcp` | Trafikverket MCP URL |
| `SGU_MCP_URL`          | `https://sgu-mcp.vercel.app/mcp`          | SGU MCP URL          |
| `NVV_MCP_URL`          | `https://nvv-mcp.vercel.app/mcp`          | NVV MCP URL          |

## Expected Output

```
╔══════════════════════════════════════════════════════════════════════╗
║               CROSS-MCP USE CASE TESTS                               ║
║          Simulating real agent workflows with multiple MCPs          ║
╚══════════════════════════════════════════════════════════════════════╝

MCP URLs:
  lantmateriet: https://lantmateriet-mcp.vercel.app/mcp
  smhi: https://mcp-smhi.vercel.app/mcp
  trafikverket: https://mcp-trafikverket.vercel.app/mcp
  sgu: https://sgu-mcp.vercel.app/mcp
  nvv: https://nvv-mcp.vercel.app/mcp

======================================================================
USE CASE 1: Property Maintenance Cost Estimation
Scenario: Property tender requiring area estimates + weather history
MCPs: lantmateriet + SMHI
======================================================================

Step 1: Find property "Säffle Liden 16"...
  ✓ Find property by designation
...

═══════════════════════════════════════════════════════════════════════
OVERALL SUMMARY
═══════════════════════════════════════════════════════════════════════
Total Steps: 25
Passed: 20
Failed: 2
Skipped: 3
Success Rate: 90.9%
```

## Coordinate Systems

The tests handle coordinate conversion between MCPs:

| MCP          | Coordinate System   | Notes                        |
| ------------ | ------------------- | ---------------------------- |
| lantmateriet | SWEREF99TM or WGS84 | Accepts both, auto-converts  |
| SMHI         | WGS84               | Lat/lon or kommun/län codes  |
| trafikverket | WGS84               | Infrastructure returns WGS84 |
| SGU          | SWEREF99TM          | Requires EPSG:3006           |
| NVV          | Kommun/län codes    | Uses Swedish admin codes     |

Tests include approximate SWEREF99TM ↔ WGS84 conversion (good enough for ~50m accuracy in Sweden).

## Known Limitations

- **Lantmäteriet APIs require credentials**: Property search and elevation APIs require `LANTMATERIET_CONSUMER_KEY` and `LANTMATERIET_CONSUMER_SECRET` environment variables
- **Coordinate conversion is approximate**: Tests use simplified conversion formulas instead of full proj4
- **Historical data availability**: Some SMHI stations may have gaps in historical records
- **Rate limiting**: Running tests too frequently may trigger rate limits on public APIs

## Cross-MCP Data Flows

### SWEREF99TM → WGS84 (SGU → SMHI)

```javascript
// Property coordinates from lantmateriet (SWEREF99TM)
const swerefCoord = { x: 674000, y: 6580000 };

// Convert to WGS84 for SMHI queries
const wgs84 = sweref99ToWgs84(swerefCoord.x, swerefCoord.y);
// { latitude: 59.33, longitude: 18.07 }
```

### WGS84 → SWEREF99TM (trafikverket → SGU)

```javascript
// Track coordinates from trafikverket (WGS84)
const trackPoint = { latitude: 59.33, longitude: 18.07 };

// Convert to SWEREF99TM for SGU queries
const sweref = wgs84ToSweref99(trackPoint.latitude, trackPoint.longitude);
// { x: 674000, y: 6580000 }
```

## Adding New Tests

When adding cross-MCP test scenarios:

1. Define the user scenario clearly
2. List which MCPs are involved
3. Document the data flow between MCPs
4. Handle coordinate conversion where needed
5. Use `recordStep()` for consistent output formatting

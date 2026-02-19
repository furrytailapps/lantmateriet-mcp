# mcp-lantmateriet - Claude Code Guide

> **Keep this file up to date.** When tools, API endpoints, or project structure change, update this file. For shared patterns and design decisions, see `../CLAUDE.md`.

MCP server wrapping Lantmäteriet (Swedish Land Survey) APIs for property, elevation, and map data. Uses the High Value Datasets (HVD) that became free in February 2025.

## Production URL

```
https://mcp-lantmateriet.vercel.app/mcp
```

## Available Tools (<!-- AUTO:tool_count -->4<!-- /AUTO -->)

| Tool                 | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `lm_property_search` | Find properties by coordinate, address, or designation       |
| `lm_elevation`       | Get terrain height at coordinates                            |
| `lm_map_url`         | Generate WMS/WMTS URLs for map display                       |
| `lm_stac_search`     | Search STAC catalog for downloadable ortofoto/elevation data |

## Project Structure

```
src/
├── app/[transport]/route.ts    # MCP endpoint
├── clients/lantmateriet-client.ts  # API client with OAuth2 + STAC
├── lib/
│   ├── auth.ts                 # OAuth2 token management
│   ├── coordinates.ts          # SWEREF99↔WGS84 conversion
│   ├── errors.ts               # Error classes
│   └── response.ts             # Response formatting
├── tools/
│   ├── index.ts                # Tool registry
│   ├── property-search.ts      # lm_property_search
│   ├── elevation.ts            # lm_elevation
│   ├── map-url.ts              # lm_map_url
│   └── stac-search.ts          # lm_stac_search
└── types/
    └── lantmateriet.ts         # API response types + STAC types
```

## High Value Datasets (HVD)

Free datasets available (Feb 2025+):

- **Fastighetsindelning** - Property boundaries
- **Byggnad** - Buildings
- **Höjddata** - Elevation data (DEM)
- **Ortofoto** - Aerial imagery
- **Ortnamn** - Place names
- **Adress** - Addresses
- **Marktäcke** - Land cover
- **Hydrografi** - Hydrography
- **Administrativ indelning** - Administrative boundaries

## Coordinate System

**Input:** WGS84 (EPSG:4326) — latitude/longitude
**Internal:** SWEREF99TM (EPSG:3006) — converted automatically
**Valid range:** 55-69N, 11-24E. City examples: see parent CLAUDE.md (Coordinate System table).

## Environment Variables

```env
# Required for authenticated APIs
LANTMATERIET_CONSUMER_KEY=
LANTMATERIET_CONSUMER_SECRET=

# Optional
LANTMATERIET_API_URL=https://api.lantmateriet.se
```

## Authentication

OAuth2 Client Credentials flow:

1. Register app in Lantmäteriet API Portal (Geotorget)
2. Get consumer key/secret
3. Token endpoint returns bearer token (1hr lifetime)
4. Client auto-refreshes tokens

## Development

```bash
npm run dev   # Start dev server (localhost:3000)
```

Quality commands (typecheck, lint, prettier:fix): see parent CLAUDE.md (Code Quality section).

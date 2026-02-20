import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { propertySearchTool, propertySearchHandler } from './property-search';
import { elevationTool, elevationHandler } from './elevation';
import { mapUrlTool, mapUrlHandler } from './map-url';
import { stacSearchTool, stacSearchHandler } from './stac-search';

const tools = [
  { definition: propertySearchTool, handler: propertySearchHandler },
  { definition: elevationTool, handler: elevationHandler },
  { definition: mapUrlTool, handler: mapUrlHandler },
  { definition: stacSearchTool, handler: stacSearchHandler },
];

export function registerAllTools(server: McpServer): void {
  for (const { definition, handler } of tools) {
    server.tool(definition.name, definition.description, definition.inputSchema, handler);
  }
}

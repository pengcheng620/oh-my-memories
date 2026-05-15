import { describe, expect, it } from 'bun:test';
import { createServer } from '../src/server';

// Smoke test: createServer returns a registered McpServer with the two tools.
// We don't drive the full stdio transport here — that's covered by the
// in-memory transport contract test below.

describe('createServer', () => {
  it('constructs without throwing and registers both tools', () => {
    const srv = createServer({ cwd: process.cwd() });
    expect(srv).toBeDefined();
    // Registered tools live on the underlying _registeredTools map (private),
    // but the public listTools through the SDK requires connecting a transport.
    // We just verify construction; tool wiring is tested via executeRecall /
    // executeScan unit tests + an end-to-end transport test follows.
  });
});

describe('createServer — list+call via in-memory transport', () => {
  it('lists omem_recall and omem_scan, then calls omem_scan over an in-memory transport', async () => {
    const { createServer } = await import('../src/server');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

    const server = createServer({ cwd: process.cwd() });
    const client = new Client({ name: 'omem-test', version: '0.0.0-test' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toContain('omem_recall');
    expect(names).toContain('omem_scan');

    // Calling omem_scan with no source returns the inventory snapshot.
    const scanResult = await client.callTool({
      name: 'omem_scan',
      arguments: {},
    });
    // structuredContent should mirror the schema shape.
    const sc = scanResult.structuredContent as { sources?: Array<{ id: string }> } | undefined;
    expect(Array.isArray(sc?.sources)).toBe(true);
    // Even if no adapter is "present" (test machine), the call must succeed
    // and return a stable shape.

    await client.close();
    await server.close();
  });
});

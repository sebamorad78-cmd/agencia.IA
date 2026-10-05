import { test } from "node:test";
import assert from "node:assert/strict";

const { default: handler } = await import("../api/chat.js");

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

test("rechaza métodos que no son POST", async () => {
  const res = mockRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test("sin API key responde offline para usar el motor local", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: { messages: [{ role: "user", content: "hola" }] } }, res);
  assert.deepEqual(res.body, { offline: true });
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});

test("valida la conversación antes de llamar a la API", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  for (const body of [{}, { messages: "x" }, { messages: [{ role: "assistant", content: "hola" }] }]) {
    const res = mockRes();
    await handler({ method: "POST", headers: {}, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved;
});

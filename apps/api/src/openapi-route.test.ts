import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine the API test server address.");
  }
  const addressInfo: AddressInfo = address;
  baseUrl = `http://127.0.0.1:${addressInfo.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("OpenAPI HTTP routes", () => {
  it("serves the OpenAPI document and links to it from the API root", async () => {
    const [documentResponse, rootResponse] = await Promise.all([
      fetch(`${baseUrl}/openapi.json`),
      fetch(baseUrl)
    ]);

    expect(documentResponse.status).toBe(200);
    expect(documentResponse.headers.get("content-type")).toContain("application/json");
    const document = await documentResponse.json();
    expect(document).toHaveProperty("openapi", "3.0.3");
    expect(document).toHaveProperty("paths./api/v1/auth/login");

    expect(rootResponse.status).toBe(200);
    await expect(rootResponse.json()).resolves.toHaveProperty("documentation", "/openapi.json");
  });
});

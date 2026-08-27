import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateWithAtlas, parseArgs } from "../tools/generate.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function atlasArgs(overrides = {}) {
  return {
    prompt: "A clean product photo",
    referenceImages: [],
    output: "./output.png",
    size: "1024x1024",
    quality: "high",
    n: 1,
    ...overrides,
  };
}

test("OpenAI remains the default provider", () => {
  const args = parseArgs(["node", "generate.js", "--prompt", "hello"]);
  assert.equal(args.provider, "openai");
});

test("Atlas submits once, polls, and writes the completed image", async (t) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-image-atlas-"));
  const output = path.join(temporaryDirectory, "result.png");
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

  const previousKey = process.env.ATLASCLOUD_API_KEY;
  process.env.ATLASCLOUD_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = previousKey;
  });

  let generatePosts = 0;
  let predictionGets = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith("/model/generateImage")) {
      generatePosts++;
      const body = JSON.parse(options.body);
      assert.equal(body.model, "openai/gpt-image-2/text-to-image");
      assert.equal(body.output_format, "png");
      return jsonResponse({ code: 200, data: { id: "prediction-1" } });
    }
    if (url.endsWith("/model/prediction/prediction-1")) {
      predictionGets++;
      return predictionGets === 1
        ? jsonResponse({ code: 200, data: { status: "processing" } })
        : jsonResponse({ code: 200, data: { status: "completed", outputs: ["https://cdn.example/image.png"] } });
    }
    if (url === "https://cdn.example/image.png") {
      return new Response(Buffer.from("image-bytes"), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const written = await generateWithAtlas(atlasArgs({ output }), {
    fetchImpl,
    sleepFn: async () => {},
  });

  assert.equal(generatePosts, 1);
  assert.equal(predictionGets, 2);
  assert.deepEqual(written, [output]);
  assert.equal(fs.readFileSync(output, "utf8"), "image-bytes");
});

test("Atlas uploads references and selects the edit model", async (t) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-image-atlas-edit-"));
  const reference = path.join(temporaryDirectory, "reference.png");
  const output = path.join(temporaryDirectory, "result.png");
  fs.writeFileSync(reference, "reference-bytes");
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

  const previousKey = process.env.ATLASCLOUD_API_KEY;
  process.env.ATLASCLOUD_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = previousKey;
  });

  let requestBody;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith("/model/uploadMedia")) {
      assert.equal(options.method, "POST");
      return jsonResponse({ code: 200, data: { download_url: "https://cdn.example/reference.png" } });
    }
    if (url.endsWith("/model/generateImage")) {
      requestBody = JSON.parse(options.body);
      return jsonResponse({ code: 200, data: { id: "prediction-edit" } });
    }
    if (url.endsWith("/model/prediction/prediction-edit")) {
      return jsonResponse({ code: 200, data: { status: "completed", outputs: ["https://cdn.example/result.png"] } });
    }
    if (url === "https://cdn.example/result.png") {
      return new Response(Buffer.from("edited-image"), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await generateWithAtlas(atlasArgs({ output, referenceImages: [reference] }), {
    fetchImpl,
    sleepFn: async () => {},
  });

  assert.equal(requestBody.model, "openai/gpt-image-2/edit");
  assert.deepEqual(requestBody.images, ["https://cdn.example/reference.png"]);
});

test("Atlas never retries a failed generation POST", async (t) => {
  const previousKey = process.env.ATLASCLOUD_API_KEY;
  process.env.ATLASCLOUD_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = previousKey;
  });

  let generatePosts = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith("/model/generateImage")) {
      generatePosts++;
      return jsonResponse({ message: "temporary failure" }, 503);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await assert.rejects(
    generateWithAtlas(atlasArgs(), { fetchImpl, sleepFn: async () => {} }),
    /Atlas Cloud request failed \(503\)/,
  );
  assert.equal(generatePosts, 1);
});

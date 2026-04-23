#!/usr/bin/env node
/**
 * chatgpt-image / generate.js
 *
 * Generate or compose images using OpenAI's gpt-image-2.
 *
 * Modes:
 *   - No --reference-image flags  -> Image Generations endpoint (text-to-image)
 *   - 1+ --reference-image flags  -> Image Edits endpoint (multi-reference composition)
 *
 * Requires: OPENAI_API_KEY in env (or in ~/.claude/.env if dotenv finds it).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import OpenAI from "openai";
import { toFile } from "openai";
import dotenv from "dotenv";

// Load .env from a few well-known locations without overriding existing env vars.
const candidateEnvPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(os.homedir(), ".claude", ".env"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"),
];
for (const p of candidateEnvPaths) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

function parseArgs(argv) {
  const args = {
    prompt: null,
    referenceImages: [],
    output: "./output.png",
    size: "auto",
    quality: "high",
    model: "gpt-image-2",
    moderation: "auto",
    n: 1,
  };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--prompt":           args.prompt = next; i++; break;
      case "--reference-image":  args.referenceImages.push(next); i++; break;
      case "--output":           args.output = next; i++; break;
      case "--size":             args.size = next; i++; break;
      case "--quality":          args.quality = next; i++; break;
      case "--model":            args.model = next; i++; break;
      case "--moderation":       args.moderation = next; i++; break;
      case "--n":                args.n = parseInt(next, 10); i++; break;
      case "-h":
      case "--help":             printUsage(); process.exit(0);
      default:
        if (flag.startsWith("--")) {
          console.error(`Unknown flag: ${flag}`);
          printUsage();
          process.exit(2);
        }
    }
  }
  return args;
}

function printUsage() {
  console.log(`Usage: node generate.js --prompt "<text>" [options]

Required:
  --prompt "<text>"            Image description.

Optional:
  --reference-image <path>     Repeatable. Adds a reference. Triggers Edits endpoint.
  --output <path>              Output path. Default: ./output.png
  --size <size>                Any WxH satisfying: max edge ≤ 3840, multiples of 16,
                               long:short ratio ≤ 3:1. Popular: 1024x1024, 1536x1024,
                               1024x1536, 2048x2048, 3840x2160 (4K landscape),
                               2160x3840 (4K portrait), auto. Default: auto
  --quality <quality>          low | medium | high | auto. Default: high
  --model <model>              gpt-image-2 | gpt-image-1.5 | gpt-image-1 | gpt-image-1-mini.
                               Default: gpt-image-2
  --moderation <level>         auto | low. Default: auto
  --n <count>                  Images to generate (1-4). Default: 1
  -h, --help                   Show this message.

Examples:
  # Single editorial poster
  node generate.js --prompt "Bauhaus poster, 'Precision', red/black/cream" \\
    --size 1024x1536 --output ./poster.png

  # Multi-image composition
  node generate.js --prompt "Gift basket containing items from the references" \\
    --reference-image ./lotion.png --reference-image ./candle.png \\
    --output ./gift.png
`);
}

function ensureOutputDir(outputPath) {
  const dir = path.dirname(path.resolve(outputPath));
  fs.mkdirSync(dir, { recursive: true });
}

function writeBase64Png(b64, outputPath, suffix = "") {
  ensureOutputDir(outputPath);
  const finalPath = suffix
    ? outputPath.replace(/(\.[a-z0-9]+)?$/i, `${suffix}$1`)
    : outputPath;
  fs.writeFileSync(finalPath, Buffer.from(b64, "base64"));
  return finalPath;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.prompt) {
    console.error("ERROR: --prompt is required.\n");
    printUsage();
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY not set. Add it to your env or to ~/.claude/.env");
    process.exit(2);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const isEdit = args.referenceImages.length > 0;

  console.log(
    `[chatgpt-image] mode=${isEdit ? "edit" : "generate"} ` +
    `model=${args.model} size=${args.size} quality=${args.quality} ` +
    `n=${args.n}${isEdit ? ` refs=${args.referenceImages.length}` : ""}`
  );

  const t0 = Date.now();
  let response;

  try {
    if (isEdit) {
      // Multi-image edit / compose
      const images = await Promise.all(
        args.referenceImages.map(async (p) => {
          const abs = path.resolve(p);
          if (!fs.existsSync(abs)) throw new Error(`Reference image not found: ${abs}`);
          return toFile(fs.createReadStream(abs), path.basename(abs));
        })
      );

      response = await client.images.edit({
        model: args.model,
        prompt: args.prompt,
        image: images,
        size: args.size,
        quality: args.quality,
        moderation: args.moderation,
        n: args.n,
      });
    } else {
      response = await client.images.generate({
        model: args.model,
        prompt: args.prompt,
        size: args.size,
        quality: args.quality,
        moderation: args.moderation,
        n: args.n,
      });
    }
  } catch (err) {
    console.error(`[chatgpt-image] API error: ${err?.message || err}`);
    if (err?.status === 403) {
      console.error("→ Likely cause: organization not verified for gpt-image-2.");
      console.error("  Verify at: https://platform.openai.com/settings/organization/general");
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = response?.data || [];
  if (data.length === 0) {
    console.error("[chatgpt-image] No images returned.");
    process.exit(1);
  }

  const written = data.map((img, i) => {
    if (!img.b64_json) throw new Error("Response missing b64_json — unexpected SDK format.");
    const suffix = data.length > 1 ? `-${String(i + 1).padStart(2, "0")}` : "";
    return writeBase64Png(img.b64_json, args.output, suffix);
  });

  console.log(`[chatgpt-image] done in ${elapsed}s. Wrote:`);
  for (const f of written) console.log(`  ${f}`);
}

main().catch((err) => {
  console.error("[chatgpt-image] fatal:", err);
  process.exit(1);
});

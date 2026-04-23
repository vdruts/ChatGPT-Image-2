---
name: chatgpt-image
description: |
  Generate and compose images using OpenAI's gpt-image-2 model. Best-in-class for editorial typography,
  multi-image composition (combine 2+ reference images into one scene), and text-heavy layouts.
  USE WHEN user wants editorial/magazine/poster-style images with precise typography.
  USE WHEN user wants to combine MULTIPLE reference images into one composition (gpt-image-2's killer feature).
  USE WHEN user mentions ChatGPT Images, gpt-image-2, infographic, meta ad creative, or viral LinkedIn image.
  DO NOT USE for multi-slide carousel decks or realtime/streaming generation.
user-invocable: true
triggers:
  - USE WHEN user wants to create an editorial/magazine/poster-style image with rich typography
  - USE WHEN user wants to combine 2+ reference images into one composition
  - USE WHEN user mentions ChatGPT Images 2.0, gpt-image-2, or asks for "ChatGPT aesthetic"
  - USE WHEN user wants an infographic, meta-ad creative, or viral LinkedIn scroll-stop image
---

# ChatGPT Image (gpt-image-2)

Image generation skill built on OpenAI's `gpt-image-2`. Optimized for three high-leverage use cases:
infographics, meta-ad creative, and viral LinkedIn images. Multi-image composition is the
distinguishing capability — pass 2 or more reference images to produce one combined scene.

## When to use this skill

- **Editorial / magazine / poster layouts** — typography precision is gpt-image-2's strength
- **Multi-reference compositing** — combine product + lifestyle + brand assets in one image
- **Text-heavy infographics** — stats, headlines, sections rendered legibly inside the image
- **Meta ad creative** — hook overlay + product shot + lifestyle context in a single composition
- **Viral LinkedIn scroll-stops** — bold typographic posters with high contrast

## When NOT to use this skill

- Multi-slide carousel decks → `gpt-image-2` generates one image at a time and cannot hold layout continuity across slides
- Realtime / streaming generation → not supported by `gpt-image-2`
- Transparent PNGs → not supported by `gpt-image-2`

## Setup

Requires `OPENAI_API_KEY` environment variable and OpenAI organization verification.
See `README.md` for full setup. One-time install:

```bash
cd ~/.claude/skills/chatgpt-image
npm install
```

## Single-shot generation

```bash
node ~/.claude/skills/chatgpt-image/tools/generate.js \
  --prompt "Editorial magazine poster: 'Greater Precision and Control'. Bold serif typography, geometric shapes in black, red, cream. Bauhaus-inspired." \
  --size 1024x1536 \
  --quality high \
  --output ./poster.png
```

## Multi-image composition (the killer feature)

Pass `--reference-image` multiple times to combine references into one scene:

```bash
node ~/.claude/skills/chatgpt-image/tools/generate.js \
  --prompt "A premium gift basket on a white studio background with the items from the reference images arranged inside. Add a ribbon and 'Relax & Unwind' label in handwritten script." \
  --reference-image ./body-lotion.png \
  --reference-image ./candle.png \
  --reference-image ./soap.png \
  --output ./giftbasket.png
```

When references are provided, the tool calls the **Edits endpoint**. Without references, it
calls the **Generations endpoint**. Same flag surface, different backend.

## CLI options

```
--prompt "<text>"               Required. Image description.
--reference-image <path>        Repeatable. Adds a reference image. Triggers Edits endpoint.
--output <path>                 Output path. Default: ./output.png
--size <size>                   Any WxH where max edge ≤ 3840px, both edges multiples of 16,
                                long:short ratio ≤ 3:1. Popular: 1024x1024, 1536x1024,
                                1024x1536, 2048x2048, 3840x2160 (4K landscape),
                                2160x3840 (4K portrait), auto. Default: auto
--quality <quality>             low | medium | high | auto. Default: high
--model <model>                 gpt-image-2 | gpt-image-1.5 | gpt-image-1 | gpt-image-1-mini.
                                Default: gpt-image-2
--moderation <level>            auto | low. Default: auto
--n <count>                     Number of images to generate (1-4). Default: 1
```

## Recipes (top use cases)

Three battle-tested prompt skeletons live in `recipes/`. Read the relevant one before composing
prompts — they encode composition rules, ratio defaults, and gotchas.

| Recipe | Use when |
|---|---|
| [infographic.md](recipes/infographic.md) | Stats, frameworks, magazine-spread educational visuals |
| [meta-ad.md](recipes/meta-ad.md) | FB/IG ad creative with hook overlay + product/lifestyle context |
| [viral-linkedin.md](recipes/viral-linkedin.md) | High-contrast typographic scroll-stop for LinkedIn feed |

## Aesthetic baseline (optional)

`aesthetic.md` ships an editorial baseline (clean, typographic, cream/black palette).
Override or replace it for your brand. The tool does NOT auto-load aesthetic — recipes
inline the relevant style cues into the prompt.

## Routing

Reach for this skill when the job is one of:

- Multi-reference composition (2+ reference images merged into one scene)
- Editorial / heavy typography (posters, magazine spreads, infographics)
- Text-accurate layouts where letter-perfect rendering matters

## Gotchas

- `gpt-image-2` does NOT support transparent backgrounds. Omit `background: transparent`.
- Edits endpoint always processes references at high fidelity → input tokens stack fast with multiple references.
- Complex prompts can take up to 2 minutes. Plan for it.
- Org verification (https://platform.openai.com/settings/organization/general) is required before first call.
- Rate limits depend on your OpenAI tier. Batch carefully.

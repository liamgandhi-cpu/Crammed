#!/usr/bin/env node
// Downloads the latest production deployment source for the Vercel `frontend`
// project into ./frontend. Backend is intentionally skipped — it's already in git.
//
// Usage (run from /Users/liamgandhi/Crammed):
//   VERCEL_TOKEN=xxx node recover-frontend.mjs
//
// Get a token at https://vercel.com/account/tokens (any scope is fine).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error("Missing VERCEL_TOKEN. Get one at https://vercel.com/account/tokens");
  process.exit(1);
}

// Skip these files/dirs — they're either secrets, build output, or huge.
const SKIP = new Set([".env", "node_modules", "dist", ".next", ".vercel", ".turbo"]);

const PROJECTS = [
  { name: "frontend", alias: "www.crammed.app", outDir: "frontend" },
];

async function api(path) {
  const r = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function downloadFile(deploymentId, fileId, outPath) {
  const r = await fetch(
    `https://api.vercel.com/v7/deployments/${deploymentId}/files/${fileId}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  if (!r.ok) throw new Error(`file ${fileId} -> ${r.status}`);
  const json = await r.json();
  const buf = Buffer.from(json.data ?? "", "base64");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  process.stdout.write(".");
}

async function walk(deploymentId, tree, basePath, outRoot) {
  for (const node of tree) {
    if (SKIP.has(node.name)) continue;
    const childPath = join(basePath, node.name);
    if (node.type === "directory") {
      await walk(deploymentId, node.children || [], childPath, outRoot);
    } else {
      await downloadFile(deploymentId, node.uid, join(outRoot, childPath));
    }
  }
}

for (const proj of PROJECTS) {
  console.log(`\n${proj.name}: resolving ${proj.alias} ...`);
  const dep = await api(`/v13/deployments/${proj.alias}`);
  console.log(`  deployment ${dep.id} (${dep.readyState}) -> ${proj.outDir}`);
  const tree = await api(`/v6/deployments/${dep.id}/files`);
  await walk(dep.id, tree, "", proj.outDir);
  console.log(" done");
}

console.log("\nFrontend source written to ./frontend");

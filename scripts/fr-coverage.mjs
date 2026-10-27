import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testCodes } from './test-codes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function findFiles(dir, matchExt = /\.(test|spec)\.(ts|js|tsx|jsx)$/) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === "node_modules" || file === ".next" || file.startsWith(".")) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, matchExt));
    } else if (matchExt.test(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = findFiles(rootDir);
console.log(`\n==================================================`);
console.log(`        BÁO CÁO ĐỘ PHỦ KIỂM THỬ FR & HG          `);
console.log(`==================================================`);
console.log(`Tìm thấy ${testFiles.length} tệp kiểm thử.\n`);

const frMap = new Map();
const hgMap = new Map();

for (let i = 1; i <= 100; i++) {
  const code = `FR-${String(i).padStart(2, "0")}`;
  frMap.set(code, []);
}

for (let i = 1; i <= 8; i++) {
  hgMap.set(`HG${i}`, []);
}

for (const f of testFiles) {
  const content = fs.readFileSync(f, "utf8");
  const relPath = path.relative(rootDir, f);

  // Check FR-xx
  const frMatches = testCodes(content).filter(code=>code.startsWith('FR-'));
  for (const m of frMatches) {
    if (frMap.has(m)) {
      if (!frMap.get(m).includes(relPath)) frMap.get(m).push(relPath);
    }
  }

  // Check HGx
  const hgMatches = testCodes(content).filter(code=>code.startsWith('HG'));
  for (const m of hgMatches) {
    if (hgMap.has(m)) {
      if (!hgMap.get(m).includes(relPath)) hgMap.get(m).push(relPath);
    }
  }
}

let coveredFr = 0;
for (const files of frMap.values()) {
  if (files.length > 0) coveredFr++;
}

let coveredHg = 0;
for (const files of hgMap.values()) {
  if (files.length > 0) coveredHg++;
}

console.log(`[+] Độ phủ FR: ${coveredFr}/100 (${((coveredFr / 100) * 100).toFixed(1)}%)`);
console.log(`[+] Độ phủ HG: ${coveredHg}/8 (${((coveredHg / 8) * 100).toFixed(1)}%)\n`);

console.log(`Chi tiết các FR đã có test:`);
for (const [code, files] of frMap.entries()) {
  if (files.length > 0) {
    console.log(`  - [x] ${code}: ${files.join(", ")}`);
  }
}

if (coveredFr === 0) {
  console.log(`  (Chưa có bài kiểm thử FR nào được tạo. WP-00 đang mở đường cho WP-11 và các WP sau).`);
}

console.log(`\n==================================================\n`);

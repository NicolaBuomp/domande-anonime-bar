// Cerca nel bundle mandato al browser (.next/static) nomi e valori che non devono
// mai uscire dal server. Da lanciare dopo `npm run build`. Exit 1 se trova qualcosa.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = ".next/static";

const FORBIDDEN_NAMES = [
  "submit_log",
  "device_hash",
  "ip_hash",
  "SUBMIT_SALT",
  "SUPABASE_SERVICE_ROLE_KEY",
  "purge_expired",
  "retention_status",
];
// anche i VALORI dei segreti, se presenti nell'ambiente del build
const FORBIDDEN_VALUES = ["SUPABASE_SERVICE_ROLE_KEY", "SUBMIT_SALT"]
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 16);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|css|json|html|txt|map)$/.test(name)) yield p;
  }
}

let found = 0;
let scanned = 0;
try {
  statSync(ROOT);
} catch {
  console.error(`${ROOT} non esiste: lancia prima npm run build`);
  process.exit(1);
}
for (const file of files(ROOT)) {
  scanned++;
  const content = readFileSync(file, "utf8");
  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(name)) {
      console.error(`✗ "${name}" in ${file}`);
      found++;
    }
  }
  for (const value of FORBIDDEN_VALUES) {
    if (content.includes(value)) {
      console.error(`✗ valore segreto in ${file}`);
      found++;
    }
  }
}

if (found > 0) {
  console.error(`\n✗ ${found} occorrenze vietate nel bundle client`);
  process.exit(1);
}
console.log(`✓ bundle client pulito (${scanned} file controllati)`);

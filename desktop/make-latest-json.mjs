import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

const nsisDir = join(here, "src-tauri", "target", "release", "bundle", "nsis");
const installerName = `AdsSync_${version}_x64-setup.exe`;
const sigPath = join(nsisDir, `${installerName}.sig`);
const outputPath = join(nsisDir, "latest.json");

if (!existsSync(sigPath)) {
  console.error(`[updater] Không tìm thấy signature: ${sigPath}. Hãy chạy build Tauri trước.`);
  process.exit(1);
}

const signature = readFileSync(sigPath, "utf8").trim();

const manifest = {
  version,
  notes: `Bản phát hành AdsSync Desktop v${version} tự động cập nhật qua GitHub Releases.`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/Edeys/ads/releases/download/v${version}/${installerName}`,
    },
  },
};

writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`[updater] Đã tạo file ${outputPath}`);

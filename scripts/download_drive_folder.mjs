import fs from 'fs';
import path from 'path';

const FILES = [
  { name: 'tong-hop-lo-dak-nia.md', id: '13_3WWG2cunjOUZ3m01ZUjCrkIhSCcdk1' },
  { name: 'video-dak-nia-1ha2-goc.mp4', id: '1cDUpYh0y8IVLa3Xr6ifgvHhZDE7cfUS4' },
  { name: '01.jpg', id: '1u0kVygFco3ANvHBFa4EW9ZuBopG0SQfp' },
  { name: '02.jpg', id: '1nLqelyswO7emfSCuv-NC_mC5Dyj0vrEl' },
  { name: '03.jpg', id: '1Kb_vcMdRwZCMOW0ukfqTlfHKU6TakIWc' },
  { name: '04.jpg', id: '1EAzwqdHZGEmUxeNhTnyyvsbk1mhqG28Q' },
  { name: '05.jpg', id: '1ejwE1y7UN6pQmMmYez9N7-vTtULfve7v' },
  { name: '06.jpg', id: '1fi2Ju4jrsvuaX3u1VHll0bWpaxaVyHI0' },
  { name: '07.jpg', id: '1TjpRcHMUtHNtRPhAlqLkh036vUj0LCt5' },
  { name: '09.jpg', id: '1M7UgbHOviuFmCkDp2HHKFZRCWRrbt_nr' },
  { name: '10.jpg', id: '1dQp76Z6p7WDZVnNyh8xjI6qnyDb-E66X' },
  { name: '11.jpg', id: '1CbLTtIFPvFpImVryZrq1Q84kQn389r78' },
  { name: '12.jpg', id: '1mwLa1nTSXd4bvzqH8yLgTuqvHnvw93S6' },
  { name: '13.jpg', id: '1i5NKnfvVvvL10sDsSIn8-hMeBjwBCicD' },
  { name: '14.jpg', id: '1DMCdij2p3i2E77i7a7shZjLDNY8dNh4K' },
  { name: '15.jpg', id: '1UiSUXCPYw1PbsWUOSTGiF-IHNOVL70nS' },
  { name: '16.jpg', id: '1eyxo08phE95govfMkauuPR6zTtFkuUy5' },
  { name: '17.jpg', id: '1nN9K-sn5Ngsb8PWPh0RziyX5l9Y0Ij6b' },
  { name: '18.jpg', id: '1Cy-1LCwd6L-Pn_pVnYCPY2_9r4pKe56s' },
  { name: '20.jpg', id: '12-JeFLsJwDkDg-R-iXRU5HQrfKKdPE8E' },
  { name: '25.jpg', id: '1ev_prCEji9ZoqUXkmOOf2sKaVzIJJ_qf' },
  { name: '26.jpg', id: '1YuN98WPmrkYpRptvDZsXXl0csgUhD1fv' },
  { name: '27.jpg', id: '1czypiPdyvPoxfpYdiJtqORmh4gWy3xas' },
  { name: '28.jpg', id: '1-zHJYvOLCL-ZEoogDsRqY_BbdmWCMM1L' },
  { name: '29.jpg', id: '1sEjvwCJv7X8Er3bEpwCtPcMB2T26iUs-' },
  { name: '31.jpg', id: '1L-jFaMczQvvKk63M_lDofHjRUn_R_qeW' },
  { name: '32.jpg', id: '13vyl4uShuVDpxjJ91sbIv-KPIC9-vIkU' },
  { name: '33.jpg', id: '1nNrZwKP7kqM9YIZz0jswhYWyPi5AlCDW' },
  { name: '34.jpg', id: '1NH71j9Gq9V_xPEeO8QfoZDWi0H-1jERJ' },
  { name: '36.jpg', id: '1pgC4zo0HqT4Mt_SNpkn-afGyWwvjV0pc' },
  { name: '37.jpg', id: '1WthTkan9orjZ1fnthOgHypNjnUXuDHKT' },
  { name: '39.jpg', id: '1_FXFu2_9TdUc87GR_jtjw7nJ1B9dSC1-' },
];

const OUT_DIR = 'D:/ADS MCP APP/media/lo-dak-nia';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function downloadFile(item) {
  const dest = path.join(OUT_DIR, item.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`[SKIP] ${item.name} đã tồn tại (${fs.statSync(dest).size} bytes)`);
    return;
  }
  const url = `https://drive.usercontent.google.com/download?id=${item.id}&export=download&authuser=0`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`[OK] Đã tải ${item.name} (${buf.length} bytes)`);
  } catch (err) {
    console.error(`[ERR] Lỗi tải ${item.name}:`, err.message);
  }
}

async function main() {
  console.log(`Bắt đầu tải ${FILES.length} tệp từ Google Drive về ${OUT_DIR}...`);
  for (let i = 0; i < FILES.length; i++) {
    process.stdout.write(`(${i + 1}/${FILES.length}) `);
    await downloadFile(FILES[i]);
  }
  console.log('Hoàn thành tải toàn bộ tệp!');
}

main();

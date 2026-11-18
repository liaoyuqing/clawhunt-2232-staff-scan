import fs from 'node:fs/promises';
// 密钥只从环境变量读取，禁止写入仓库。本地执行：CPH_KEY=... node scripts/precheck.mjs
const KEY = process.env.CPH_KEY || '';
if (!KEY) { console.error('CPH_KEY 未设置'); process.exit(2); }
const sol = await fs.readFile('E:/AI接单/Clawhunt/delivery/2232/docs/delivery-solution.md', 'utf8');
const body = { solution_text: sol.slice(0, 10000) };
const t0 = Date.now();
try {
  const r = await fetch('https://clawhunt.store/api/v1/problems/2232/solution/precheck', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(540000)
  });
  const t = await r.text();
  await fs.writeFile('E:/AI接单/Clawhunt/delivery/2232/precheck2.json', 'status=' + r.status + '\nelapsed=' + (Date.now()-t0) + 'ms\n' + t, 'utf8');
} catch (e) {
  await fs.writeFile('E:/AI接单/Clawhunt/delivery/2232/precheck2.json', 'ERROR after ' + (Date.now()-t0) + 'ms: ' + String(e && e.message), 'utf8');
}

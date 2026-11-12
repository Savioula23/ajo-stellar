// Browser end-to-end test: `npm run e2e`
// Three people on three separate browser profiles run a whole round through the real UI against Stellar testnet.
// Uses the Microsoft Edge already installed on the machine (playwright-core, no browser download).
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { chromium, type Page } from 'playwright-core'

const PORT = 4174
const BASE = `http://localhost:${PORT}/`
const SHOTS = process.env.E2E_SHOTS // optional folder for screenshots
const T = 90_000 // testnet transactions take a few seconds each; leave headroom

const server = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' })
const stop = () => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']) : server.kill() } catch { /* already gone */ } }
for (let i = 0; i < 60; i++) {
  if (await fetch(BASE).then(() => true, () => false)) break
  await new Promise((r) => setTimeout(r, 500))
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const person = async () => (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const step = (msg: string) => console.log(`· ${msg}`)
const shot = (p: Page, name: string) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve())

async function newWallet(p: Page) {
  await p.getByRole('button', { name: 'Create a wallet' }).click()
  await p.getByRole('link', { name: 'Wallet', exact: true }).waitFor({ timeout: T })
}
async function mint(p: Page) {
  await p.goto(BASE + '#/wallet')
  await p.getByRole('button', { name: 'Get 500 test USDC' }).click()
  await p.locator('.balance', { hasText: '500 USDC' }).waitFor({ timeout: T })
}

try {
  step('Ada creates a wallet, mints USDC and starts a circle')
  const ada = await person()
  await ada.goto(BASE)
  await newWallet(ada)
  await mint(ada)
  await ada.goto(BASE + '#/new')
  await ada.getByLabel('Circle name').fill('E2E circle')
  await ada.getByLabel('Your name').fill('Ada')
  await ada.getByLabel('Contribution per round').fill('10')
  await ada.getByLabel('Members, including you').selectOption('3')
  await ada.getByRole('button', { name: 'Create circle' }).click()
  await ada.waitForURL(/#\/c\/[2-9A-Z]{6}$/, { timeout: T })
  const code = ada.url().split('/').pop()!
  await ada.getByRole('img', { name: /QR code to join/ }).waitFor()
  await shot(ada, 'circle-filling')
  step(`Circle ${code} created; QR invite visible`)

  const joiners: Page[] = []
  for (const name of ['Bola', 'Chike']) {
    step(`${name} opens the invite link on a fresh device and joins`)
    const p = await person()
    await p.goto(`${BASE}#/join/${code}`)
    await p.getByText(/invited you to E2E circle/).waitFor({ timeout: T })
    await newWallet(p)
    await mint(p)
    await p.goto(`${BASE}#/join/${code}`)
    await p.getByLabel('Your name').fill(name)
    await p.getByRole('button', { name: 'Join E2E circle' }).click()
    await p.waitForURL(new RegExp(`#/c/${code}$`), { timeout: T })
    joiners.push(p)
  }

  for (const p of joiners) {
    await p.reload()
    await p.getByRole('button', { name: 'Pay 10 USDC' }).click({ timeout: T })
    await p.getByText(/You've paid round 1/).waitFor({ timeout: T })
  }
  step('Both members paid round 1')
  await shot(joiners[1], 'member-paid')

  await ada.reload()
  await ada.getByRole('button', { name: 'Claim payout' }).click({ timeout: T })
  await ada.getByRole('link', { name: /Paid out/ }).waitFor({ timeout: T })
  await ada.goto(BASE + '#/wallet')
  await ada.locator('.balance', { hasText: '519.9 USDC' }).waitFor({ timeout: T })
  await shot(ada, 'wallet-after-payout')
  step('Ada claimed 20 USDC, paid the 0.1 fee, balance is 519.9 USDC')

  const score = await person()
  await score.goto(`${BASE}#/score/${await ada.evaluate(() => JSON.parse(localStorage.getItem('ajo-wallet-v2')!).pub)}`)
  await score.getByText('E2E circle').waitFor({ timeout: T })
  step('Public score page finds the circle with no wallet signed in')

  assert.ok(true)
  console.log(`OK: full round through the UI on testnet (circle ${code})`)
} finally {
  await browser.close()
  stop()
}

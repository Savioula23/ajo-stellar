import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
const BASE = 'http://localhost:4177/'
const srv = spawn('npx vite preview --port 4177 --strictPort', { shell: true, stdio: 'ignore' })
for (let i = 0; i < 60; i++) { if (await fetch(BASE).then(() => true, () => false)) break; await new Promise((r) => setTimeout(r, 500)) }
const b = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await b.newContext()
const p = await ctx.newPage()
p.on('console', (m) => { if (m.type() === 'error') console.log('browser:', m.text().slice(0, 400)) })
try {
  await p.goto(BASE)
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  await p.getByRole('button', { name: 'Create wallet with passkey' }).click()
  await p.getByRole('link', { name: 'Wallet', exact: true }).waitFor({ timeout: 120000 })
  await p.goto(BASE + '#/wallet')
  const popupP = ctx.waitForEvent('page', { timeout: 120000 })
  await p.getByRole('button', { name: 'Add money' }).click()
  const pop = await popupP
  await p.locator('[role=status], .error').first().waitFor({ timeout: 120000 })
  for (let i = 0; i < 40 && !(await pop.url()).startsWith('http'); i++) await new Promise((r) => setTimeout(r, 500))
  await pop.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
  const form = async (pg: any, kind: string, amount = '20') => {
    await pg.locator('input[name=amount]').waitFor({ timeout: 60000 })
    await pg.fill('input[name=amount]', amount)
    for (const [n, v] of [['name', 'Test'], ['surname', 'Member'], ['email', 'member@example.test']]) if (await pg.locator(`input[name=${n}]`).count()) await pg.fill(`input[name=${n}]`, v)
    await pg.getByRole('button', { name: 'Submit' }).click()
    for (let i = 0; i < 6; i++) {
      await pg.waitForTimeout(2500)
      const inputs = await pg.$$eval('input:not([type=hidden])', (els: any[]) => els.map((e) => e.name)).catch(() => [])
      console.log(kind, 'popup:', pg.url().split('?')[0], inputs.join(','), (await pg.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200))
      if (pg.isClosed() || !inputs.length) break
      for (const n of inputs) if (!(await pg.inputValue(`input[name=${n}]`).catch(() => 'x'))) await pg.fill(`input[name=${n}]`, n.includes('email') ? 'member@example.test' : /amount/.test(n) ? '20' : /number|account|routing|bank/i.test(n) ? '123456789' : 'Test')
      await pg.getByRole('button', { name: /Submit|Continue|Confirm/ }).first().click().catch(() => {})
    }
  }
  const status = () => p.locator('[role=status], .error').first().innerText().catch(() => '')
  await form(pop, 'deposit')
  for (let i = 0; i < 60 && !/added to your balance|error|reported/i.test(await status()); i++) await p.waitForTimeout(3000)
  console.log('deposit status:', await status())
  await p.reload(); await p.waitForTimeout(6000)
  console.log('balance after deposit:', await p.locator('.balance').innerText())

  await pop.close() // the app reuses one named anchor window; start fresh as a user would
  const pop2P = ctx.waitForEvent('page', { timeout: 120000 })
  await p.getByRole('button', { name: 'Cash out' }).click()
  const pop2 = await pop2P
  await form(pop2, 'withdraw', '10')
  for (let i = 0; i < 80 && !/complete|error|reported/i.test(await status()); i++) { await p.waitForTimeout(3000); if (i % 5 === 0) console.log('  ', await status()) }
  console.log('withdraw status:', await status())
  await p.reload(); await p.waitForTimeout(6000)
  console.log('balance after cash-out:', await p.locator('.balance').innerText())
} finally { await b.close(); spawn('taskkill', ['/pid', String(srv.pid), '/T', '/F']) }

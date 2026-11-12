import { canClaim, dueAt, isDone, isFull, owes, pot, recipientOf, type Circle } from './ajo'
import { until, usdc } from './ui'

export type Tone = 'ok' | 'warn' | 'danger' | 'accent' | 'neutral'

/** One line that tells a member where they stand in a circle. */
export function statusOf(c: Circle, me: string): { tone: Tone; label: string; needsYou: boolean } {
  if (!isFull(c)) return { tone: 'neutral', label: `Filling · ${c.members.length} of ${c.size}`, needsYou: false }
  if (isDone(c)) return { tone: 'ok', label: 'Complete', needsYou: false }
  if (canClaim(c, me)) return { tone: 'accent', label: `Payout ready · ${usdc(pot(c))}`, needsYou: true }
  const due = dueAt(c, c.round)
  if (owes(c, me)) {
    const late = !!due && Date.now() > due
    return { tone: late ? 'danger' : 'warn', label: `Pay ${usdc(c.amount)} · ${until(due)}`, needsYou: true }
  }
  if (recipientOf(c) === me) return { tone: 'accent', label: `Your payout · ${c.paid[c.round].length} of ${c.size - 1} paid`, needsYou: false }
  if (c.members.includes(me)) return { tone: 'ok', label: `Paid round ${c.round + 1}`, needsYou: false }
  return { tone: 'neutral', label: `Round ${c.round + 1} of ${c.size}`, needsYou: false }
}

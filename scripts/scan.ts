import { ClaudeScanner } from '../src/main/engine/scanner'
import { allTokens, summarize } from '../src/main/engine/aggregate'

const t0 = performance.now()
const sc = new ClaudeScanner()
sc.scan()
const s = summarize(sc.all(), sc.allSegments(), sc.recordedBySession())
console.log(`scanned ${sc.listFiles().length} files, ${sc.all().length} messages in ${(performance.now() - t0).toFixed(0)}ms`)
console.log('recorded', s.recorded)
console.log('tokens: month', allTokens(s.tokens.month), 'today', allTokens(s.tokens.today))
console.log('models', s.byModel.map((m) => `${m.model}: ${m.messages} msgs ${m.cost == null ? '—' : '$' + m.cost.toFixed(2)}`))
const sumDaily = s.daily.reduce((a, d) => a + d.cost, 0)
console.log('sum of daily bars $' + sumDaily.toFixed(2), '| recorded all-time $' + s.recorded.total.toFixed(2))

// Self-check: every recorded dollar must be accounted for.
const segTotal = sc.allSegments().reduce((a, x) => a + x.cost, 0)
const modelTotal = s.byModel.reduce((a, m) => a + (m.cost ?? 0), 0)
console.log('segments sum $' + segTotal.toFixed(4), '| by-model sum $' + modelTotal.toFixed(4), '| session sum $' + s.recorded.total.toFixed(4))
const t1 = performance.now()
sc.scan()
console.log(`rescan (no change): ${(performance.now() - t1).toFixed(0)}ms`)

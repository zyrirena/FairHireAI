const { getDB } = require('../database');

// Anthropic pricing (claude-3-haiku as of 2024)
const PRICING = {
  input_per_million: 0.25,   // $0.25 per 1M input tokens
  output_per_million: 1.25,  // $1.25 per 1M output tokens
};

const DEFAULT_MONTHLY_LIMIT = parseFloat(process.env.AI_MONTHLY_LIMIT || '5.00');

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7); // "2026-04"
}

async function getOrCreateMonthRecord(month) {
  const db = await getDB();
  let record = db.prepare('SELECT * FROM usage_tracking WHERE month = ?').get(month);
  if (!record) {
    db.prepare('INSERT INTO usage_tracking (month, input_tokens, output_tokens, total_tokens, estimated_cost, request_count) VALUES (?, 0, 0, 0, 0, 0)').run(month);
    record = db.prepare('SELECT * FROM usage_tracking WHERE month = ?').get(month);
  }
  return record;
}

async function checkBudget() {
  const month = getCurrentMonth();
  const record = await getOrCreateMonthRecord(month);
  const limit = DEFAULT_MONTHLY_LIMIT;
  const cost = record.estimated_cost || 0;
  return {
    allowed: cost < limit,
    current_cost: cost,
    limit,
    remaining: Math.max(0, limit - cost),
    month,
    request_count: record.request_count || 0,
    total_tokens: record.total_tokens || 0,
  };
}

async function recordUsage(inputTokens, outputTokens) {
  const month = getCurrentMonth();
  await getOrCreateMonthRecord(month);
  const cost = (inputTokens / 1_000_000) * PRICING.input_per_million + (outputTokens / 1_000_000) * PRICING.output_per_million;
  const db = await getDB();
  db.prepare(`
    UPDATE usage_tracking SET
      input_tokens = input_tokens + ?,
      output_tokens = output_tokens + ?,
      total_tokens = total_tokens + ?,
      estimated_cost = estimated_cost + ?,
      request_count = request_count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE month = ?
  `).run(inputTokens, outputTokens, inputTokens + outputTokens, cost, month);
  return { input_tokens: inputTokens, output_tokens: outputTokens, cost, month };
}

async function getUsageHistory() {
  const db = await getDB();
  return db.prepare('SELECT * FROM usage_tracking ORDER BY month DESC LIMIT 12').all();
}

async function resetMonthlyUsage(month) {
  const db = await getDB();
  const m = month || getCurrentMonth();
  db.prepare('UPDATE usage_tracking SET input_tokens = 0, output_tokens = 0, total_tokens = 0, estimated_cost = 0, request_count = 0, updated_at = CURRENT_TIMESTAMP WHERE month = ?').run(m);
  return { month: m, reset: true };
}

module.exports = { checkBudget, recordUsage, getUsageHistory, resetMonthlyUsage, getCurrentMonth };

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ledgerPath = process.env.LEDGER_TEST || path.join(__dirname, '..', 'remote', 'agenttube-job-ledger.json');
const BLOCKING = new Set(['QUEUED', 'RUNNING', 'PENDING', 'IN_PROGRESS', 'SUBMITTED']);

function fail(msg) {
  console.error(`BLOCKED: ${msg}`);
  process.exit(1);
}

try {
  if (!fs.existsSync(ledgerPath)) {
    fail('Missing job ledger');
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (!ledger.managedJobs || !Array.isArray(ledger.managedJobs)) {
    fail('Invalid ledger structure');
  }
  for (const job of ledger.managedJobs) {
    const status = (job.status || 'UNKNOWN').toUpperCase();
    if (BLOCKING.has(status)) {
      fail(`Job ${job.kernelSlug || job.jobKind} is ${status}`);
    }
    if (job.terminal !== true && !['COMPLETE', 'ERROR', 'FAILED', 'CANCELLED', 'STOPPED'].includes(status)) {
      fail(`Job ${job.kernelSlug || job.jobKind} in unresolved non-terminal state ${status}`);
    }
  }
  console.log('OK — all prior jobs terminal');
  process.exit(0);
} catch (e) {
  fail(`Preflight error: ${e.message}`);
}

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function transientJobStatusError(');
const end = source.indexOf('function captureJob(', start);
assert(start >= 0 && end > start, 'Actual polling functions must remain inspectable');
const functions = source.slice(start, end);

async function scenario({ failedGets, failureCode = 503, alwaysFail = false }) {
  let virtualNow = 0, attempts = 0, duplicatePosts = 0;
  const events = [], logs = [];
  const state = {
    progress: 46, stage: 'Semantic guidance delivered to vector engine',
    lastJobId: 'persistent-id', busy: true, artboardEvents: events,
    artboardEventKeys: new Set(), failedStage: '', failedFormats: [],
    activePipeline: '', artboardJob: null,
  };
  const sandbox = {
    state,
    Date: { now: () => virtualNow },
    setTimeout: (fn, ms) => { virtualNow += ms; fn(); },
    log: msg => logs.push(msg),
    updateMonitor: () => {},
    loadArtboardPreview: async () => {},
    call: async (engine, endpoint, request = {}) => {
      if (request.method && request.method !== 'GET') duplicatePosts++;
      attempts++;
      if (attempts > 1 && (alwaysFail || attempts <= failedGets)) {
        assert.equal(state.progress, 46, 'Preserve last verified percentage on 503');
      }
      if (alwaysFail || attempts <= failedGets) {
        const error = new Error('artboard: upstream failed (HTTP ' + failureCode + ')');
        error.httpStatus = failureCode;
        throw error;
      }
      return {
        job_id: 'persistent-id', project_id: 'project-id',
        status: 'completed', step: 'Completed', progress: 100,
        events: [], result: {},
      };
    },
  };
  const api = vm.runInNewContext(functions + '\n({jobPoll, transientJobStatusError})', sandbox);
  let response = null, error = null;
  try {
    response = await api.jobPoll('artboard', 'api/artboard/jobs/persistent-id', 'Production');
  } catch (failure) {
    error = failure;
  }
  return {response, error, state, attempts, duplicatePosts, virtualNow, logs};
}

(async () => {
  const reconnect = await scenario({ failedGets: 6 });
  assert(!reconnect.error);
  assert.equal(reconnect.response.status, 'completed');
  assert.equal(reconnect.attempts, 7);
  assert.equal(reconnect.duplicatePosts, 0, 'Never resubmit paid production on 503');
  assert.equal(reconnect.state.lastJobId, 'persistent-id');
  assert.equal(reconnect.state.progress, 100);
  assert(reconnect.logs.some(s => s.includes('reconnected')));

  const outage = await scenario({ failedGets: 500, alwaysFail: true });
  assert(outage.error?.message.includes('job may still be running'));
  assert(outage.error?.message.includes('Do not start a duplicate'));
  assert(outage.virtualNow >= 180000);
  assert.equal(outage.state.progress, 46);
  assert.equal(outage.state.lastJobId, 'persistent-id');
  assert.equal(outage.duplicatePosts, 0);

  const auth = await scenario({ failedGets: 1, failureCode: 401 });
  assert.equal(auth.attempts, 1, 'Authentication failures are not transient');
  assert(auth.error?.message.includes('HTTP 401'));
  console.log('Artboard transient 503 polling recovery and no-paid-retry checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

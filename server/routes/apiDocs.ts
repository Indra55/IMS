import { Router } from 'express';

const router = Router();

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IMS API Documentation</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      background: #0f172a;
      color: #e2e8f0;
    }
    h1 { color: #60a5fa; border-bottom: 2px solid #334155; padding-bottom: 0.5rem; }
    h2 { color: #94a3b8; margin-top: 2rem; }
    h3 { color: #cbd5e1; }
    .endpoint {
      background: #1e293b;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 1rem 0;
      border-left: 4px solid #60a5fa;
    }
    .method {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.875rem;
      margin-right: 0.5rem;
    }
    .get { background: #22c55e; color: #fff; }
    .post { background: #3b82f6; color: #fff; }
    .patch { background: #f59e0b; color: #fff; }
    .path {
      font-family: monospace;
      font-size: 1.1rem;
      color: #60a5fa;
    }
    pre {
      background: #0f172a;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      border: 1px solid #334155;
    }
    code {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9rem;
    }
    .param {
      margin: 0.5rem 0;
      padding: 0.5rem;
      background: #0f172a;
      border-radius: 4px;
    }
    .param-name { color: #f472b6; font-weight: bold; }
    .param-type { color: #94a3b8; font-size: 0.875rem; }
    .required { color: #ef4444; font-size: 0.75rem; }
    .optional { color: #94a3b8; font-size: 0.75rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    th { color: #94a3b8; font-weight: 600; }
    .section {
      margin: 3rem 0;
    }
    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }
    .badge-auth { background: #7c3aed; color: #fff; }
    a { color: #60a5fa; }
    a:hover { color: #93c5fd; }
  </style>
</head>
<body>
  <h1>Incident Management System (IMS) API</h1>
  <p>REST API documentation for the Incident Management System. Base URL: <code>/api</code> for most endpoints, with <code>/health</code> and <code>/api-docs</code> served at the root.</p>

  <div class="section">
    <h2>Health & Observability</h2>
    
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/health</span>
      <p>Health check endpoint returning system status, uptime, and throughput metrics.</p>
      <p><strong>Response:</strong></p>
      <pre><code>{
  "status": "ok",
  "timestamp": "2026-05-03T12:00:00.000Z",
  "uptime_s": 3600,
  "signals_total": 15420,
  "throughput_per_sec": 8.4
}</code></pre>
    </div>
  </div>

  <div class="section">
    <h2>Signal Ingestion</h2>
    
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/signals</span>
      <p>Ingest a failure signal. Rate limited (1000 req/min by default). Returns 503 if ring buffer is full.</p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "signal_id": "uuid-string",
  "component_id": "PG_PROD_01",
  "component_type": "RDBMS",  // RDBMS, API, QUEUE, CACHE, NOSQL, MCP_HOST
  "severity": "CRITICAL",      // CRITICAL, HIGH, MEDIUM, LOW
  "message": "Connection timeout error",
  "timestamp": "2026-05-03T10:00:00.000Z",
  "payload": { "source": "monitoring_agent" }
}</code></pre>

      <p><strong>Required Fields:</strong></p>
      <div class="param"><span class="param-name">signal_id</span> <span class="param-type">string (UUID)</span> <span class="required">required</span></div>
      <div class="param"><span class="param-name">component_id</span> <span class="param-type">string</span> <span class="required">required</span></div>
      <div class="param"><span class="param-name">component_type</span> <span class="param-type">enum</span> <span class="required">required</span> — RDBMS, API, QUEUE, CACHE, NOSQL, MCP_HOST</div>
      <div class="param"><span class="param-name">severity</span> <span class="param-type">enum</span> <span class="required">required</span> — CRITICAL, HIGH, MEDIUM, LOW</div>
      <div class="param"><span class="param-name">message</span> <span class="param-type">string</span> <span class="required">required</span></div>
      <div class="param"><span class="param-name">timestamp</span> <span class="param-type">ISO 8601</span> <span class="required">required</span></div>
      <div class="param"><span class="param-name">payload</span> <span class="param-type">object</span> <span class="optional">optional</span></div>

      <p><strong>Responses:</strong></p>
      <table>
        <tr><th>Status</th><th>Description</th></tr>
        <tr><td>202</td><td>Accepted — signal queued for processing</td></tr>
        <tr><td>400</td><td>Validation error (invalid payload)</td></tr>
        <tr><td>429</td><td>Rate limit exceeded</td></tr>
        <tr><td>503</td><td>Ring buffer full — backpressure active</td></tr>
      </table>
    </div>
  </div>

  <div class="section">
    <h2>Work Items (Incidents)</h2>
    
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/work-items</span>
      <p>List work items with pagination and optional filters.</p>
      
      <p><strong>Query Parameters:</strong></p>
      <div class="param"><span class="param-name">state</span> <span class="param-type">enum</span> <span class="optional">optional</span> — Filter by state: OPEN, INVESTIGATING, RESOLVED, CLOSED</div>
      <div class="param"><span class="param-name">priority</span> <span class="param-type">enum</span> <span class="optional">optional</span> — P0, P1, P2, P3</div>
      <div class="param"><span class="param-name">component_id</span> <span class="param-type">string</span> <span class="optional">optional</span></div>
      <div class="param"><span class="param-name">page</span> <span class="param-type">number</span> <span class="optional">optional</span> — Default: 1</div>
      <div class="param"><span class="param-name">limit</span> <span class="param-type">number</span> <span class="optional">optional</span> — Default: 20, Max: 100</div>
      <p><strong>Response:</strong> <code>{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 0, "total_pages": 0 } }</code></p>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/work-items/:id</span>
      <p>Get a single work item by ID, including linked signal count.</p>
      
      <p><strong>Path Parameters:</strong></p>
      <div class="param"><span class="param-name">id</span> <span class="param-type">UUID string</span> <span class="required">required</span></div>
      <p><strong>Response:</strong> work item fields plus <code>linked_signal_count</code>.</p>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/work-items/:id/signals</span>
      <p>Get raw signals linked to a work item (from MongoDB audit log).</p>
      
      <p><strong>Response:</strong> <code>{ "work_item_id": "...", "count": 0, "signals": [...] }</code></p>
    </div>

    <div class="endpoint">
      <span class="method patch">PATCH</span>
      <span class="path">/api/work-items/:id/transition</span>
      <p>Transition a work item to a new state. Uses State Pattern with validation.</p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "target_state": "INVESTIGATING"
}</code></pre>

      <p><strong>Valid Transitions:</strong></p>
      <pre><code>OPEN -> INVESTIGATING -> RESOLVED -> CLOSED
       ^                 |
       |-----------------|
       (re-open / re-investigate)</code></pre>

      <p><strong>Important Rules:</strong></p>
      <ul>
        <li>Cannot transition OPEN → CLOSED directly</li>
        <li>Cannot transition OPEN → RESOLVED directly</li>
        <li>CLOSED requires complete RCA (fix_applied + prevention_steps)</li>
      </ul>

      <p><strong>Responses:</strong></p>
      <table>
        <tr><th>Status</th><th>Description</th></tr>
        <tr><td>200</td><td>Transition successful</td></tr>
        <tr><td>400</td><td>Invalid transition requested</td></tr>
        <tr><td>404</td><td>Work item not found</td></tr>
        <tr><td>409</td><td>Invalid transition, conflict, or cannot close without RCA</td></tr>
      </table>
    </div>
  </div>

  <div class="section">
    <h2>Root Cause Analysis (RCA)</h2>
    
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/work-items/:id/rca</span>
      <p>Get the RCA record for a work item.</p>
      <p><strong>Response:</strong> <code>{ "data": { ... } }</code></p>
    </div>

    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/work-items/:id/rca</span>
      <p>Submit an RCA. Only allowed when work item is in RESOLVED state.</p>
      
      <p><strong>Request Body:</strong></p>
      <pre><code>{
  "incident_start": "2026-05-03T09:30:00.000Z",
  "incident_end": "2026-05-03T10:15:00.000Z",
  "root_cause_category": "INFRASTRUCTURE",  // APPLICATION, NETWORK, DATABASE, CACHE, HUMAN_ERROR, THIRD_PARTY, UNKNOWN
  "fix_applied": "Restarted database pool and increased max connections",
  "prevention_steps": "Add connection pool monitoring and alerting"
}</code></pre>

      <p><strong>Required Fields:</strong></p>
      <div class="param"><span class="param-name">incident_start</span> <span class="param-type">ISO 8601</span> <span class="required">required</span></div>
      <div class="param"><span class="param-name">incident_end</span> <span class="param-type">ISO 8601</span> <span class="required">required</span> — Must be after incident_start</div>
      <div class="param"><span class="param-name">root_cause_category</span> <span class="param-type">enum</span> <span class="required">required</span> — INFRASTRUCTURE, APPLICATION, NETWORK, DATABASE, CACHE, HUMAN_ERROR, THIRD_PARTY, UNKNOWN</div>
      <div class="param"><span class="param-name">fix_applied</span> <span class="param-type">string</span> <span class="required">required</span> — non-empty</div>
      <div class="param"><span class="param-name">prevention_steps</span> <span class="param-type">string</span> <span class="required">required</span> — non-empty</div>

      <p><strong>Notes:</strong></p>
      <ul>
        <li>MTTR is automatically calculated as <code>incident_end - incident_start</code></li>
        <li>Work item must be in RESOLVED state to submit RCA</li>
        <li>RCA is created once; duplicate submissions return 409</li>
      </ul>
    </div>

    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/work-items/:id/rca/draft</span>
      <p>Generate an AI-assisted RCA draft using OpenRouter (requires API key).</p>
      
      <p><strong>Request Body:</strong> None required</p>
      
      <p><strong>Response:</strong> AI-generated draft based on linked signals</p>
      
      <p><strong>Note:</strong> Returns 503 if OpenRouter API key is not configured</p>
    </div>
  </div>

  <div class="section">
    <h2>Dashboard & Analytics</h2>
    
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/dashboard/summary</span>
      <p>Get dashboard summary metrics including state counts, priority counts, MTTR, MTTA, and top affected components.</p>
      
      <p><strong>Response:</strong></p>
      <pre><code>{
  "data": {
    "state_counts": {
      "OPEN": 3,
      "INVESTIGATING": 2,
      "RESOLVED": 8,
      "CLOSED": 32
    },
    "priority_counts": {
      "P0": 2,
      "P1": 6,
      "P2": 20,
      "P3": 17
    },
    "total_work_items": 45,
    "avg_mttr_seconds": 1847,
    "avg_mtta_seconds": 342,
    "top_components": [
      { "component_id": "PG_PROD_01", "count": 12 }
    ],
    "generated_at": "2026-05-03T12:00:00.000Z"
  },
  "source": "database"
}</code></pre>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/dashboard/timeseries</span>
      <p>Get signal counts over time for charting (from MongoDB timeseries aggregation).</p>
      
      <p><strong>Query Parameters:</strong></p>
      <div class="param"><span class="param-name">interval</span> <span class="param-type">string</span> <span class="optional">optional</span> — 1m, 5m, 15m, 1h, 6h, 1d (default: 5m)</div>
      <div class="param"><span class="param-name">range</span> <span class="param-type">string</span> <span class="optional">optional</span> — 1h, 6h, 12h, 1d, 7d (default: 1h)</div>
      <p><strong>Response:</strong> <code>{ "interval": "...", "range": "...", "start": "...", "end": "...", "data": [...] }</code></p>
    </div>

    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/dashboard/ai-summary</span>
      <p>Generate AI summary of current incidents (requires OpenRouter API key).</p>
    </div>
  </div>

  <div class="section">
    <h2>WebSocket Events</h2>
    <p>Real-time updates are available via WebSocket at the root path.</p>
    
    <p><strong>Event Types:</strong></p>
    <table>
      <tr><th>Event</th><th>Description</th></tr>
      <tr><td><code>work-item:created</code></td><td>New work item created</td></tr>
      <tr><td><code>work-item:updated</code></td><td>Work item state changed</td></tr>
      <tr><td><code>signal:burst</code></td><td>Signal burst detected while draining the ring buffer</td></tr>
      <tr><td><code>metrics:throughput</code></td><td>Throughput metrics update</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Design Patterns Used</h2>
    <ul>
      <li><strong>State Pattern:</strong> Work item lifecycle management with transition validation</li>
      <li><strong>Strategy Pattern:</strong> P0-P3 alert routing based on component type</li>
      <li><strong>Ring Buffer:</strong> In-memory queue for high-throughput signal ingestion</li>
      <li><strong>Debouncing:</strong> Signal grouping by component (100 signals or 10s window)</li>
    </ul>
  </div>

  <footer style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #334155; color: #64748b; font-size: 0.875rem;">
    <p>IMS API Documentation | Built with Bun + Express + TypeScript</p>
  </footer>
</body>
</html>`;

router.get('/api-docs', (_, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML);
});

export { router as apiDocsRouter };

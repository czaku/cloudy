/**
 * Start the dashboard with realistic mock data so you can preview it in the browser.
 * Usage: npx tsx scripts/preview-dashboard.ts
 */
import { startDashboardServer } from '../src/dashboard/server.js';
import type { ProjectState, OrchestratorEvent } from '../src/core/types.js';

const mockState: ProjectState = {
  version: 1,
  createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  updatedAt: new Date().toISOString(),
  plan: {
    goal: 'Build a REST API with authentication, user management, and a PostgreSQL data layer',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [
      {
        id: 'task-1',
        title: 'Set up Express server',
        description: 'Create the base Express app with middleware, error handling, and health endpoint.',
        acceptanceCriteria: ['Server starts on port 3000', 'Health endpoint returns 200', 'Error handler returns JSON'],
        dependencies: [],
        contextPatterns: ['src/**/*.ts'],
        status: 'completed',
        retries: 0,
        maxRetries: 2,
        ifFailed: 'halt',
        timeout: 3600000,
        startedAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
        completedAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
        durationMs: 112_000,
        resultSummary: 'Created src/app.ts with Express setup, cors, helmet, and /health endpoint returning { status: "ok" }. Added global error handler.',
        checkpointSha: 'a1b2c3d',
        retryHistory: [],
      },
      {
        id: 'task-2',
        title: 'PostgreSQL schema and migrations',
        description: 'Design and implement the database schema for users and sessions using Knex migrations.',
        acceptanceCriteria: ['Users table with uuid, email, password_hash', 'Sessions table with token, expires_at', 'Migrations run without errors'],
        dependencies: ['task-1'],
        contextPatterns: ['src/**/*.ts', 'migrations/**'],
        status: 'completed',
        retries: 0,
        maxRetries: 2,
        ifFailed: 'halt',
        timeout: 3600000,
        startedAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
        completedAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
        durationMs: 183_000,
        resultSummary: 'Created 2 Knex migrations: 001_users (uuid PK, email unique, password_hash, timestamps) and 002_sessions (token, user_id FK, expires_at). Added db.ts connection pool.',
        checkpointSha: 'b2c3d4e',
        retryHistory: [],
      },
      {
        id: 'task-3',
        title: 'JWT authentication routes',
        description: 'Implement POST /auth/register, POST /auth/login, POST /auth/refresh using bcrypt and JWT.',
        acceptanceCriteria: ['Register hashes password with bcrypt', 'Login returns access + refresh tokens', 'Refresh endpoint validates and rotates tokens', 'Expired tokens return 401'],
        dependencies: ['task-1', 'task-2'],
        contextPatterns: ['src/**/*.ts'],
        status: 'in_progress',
        retries: 0,
        maxRetries: 2,
        ifFailed: 'halt',
        timeout: 3600000,
        startedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
        durationMs: undefined,
        retryHistory: [],
      },
      {
        id: 'task-4',
        title: 'User profile CRUD endpoints',
        description: 'Implement GET /users/:id, PUT /users/:id, DELETE /users/:id with auth middleware.',
        acceptanceCriteria: ['Auth middleware validates JWT', 'GET returns user profile (no password)', 'PUT validates and updates fields', 'DELETE soft-deletes the user'],
        dependencies: ['task-3'],
        contextPatterns: ['src/**/*.ts'],
        status: 'pending',
        retries: 0,
        maxRetries: 2,
        ifFailed: 'halt',
        timeout: 3600000,
        retryHistory: [],
      },
      {
        id: 'task-5',
        title: 'Integration tests',
        description: 'Write integration tests for the full auth flow using supertest.',
        acceptanceCriteria: ['Register → Login → Access protected route works', 'Token refresh works', 'Invalid token returns 401', 'All tests pass with npm test'],
        dependencies: ['task-4'],
        contextPatterns: ['src/**/*.ts', 'tests/**'],
        status: 'pending',
        retries: 0,
        maxRetries: 2,
        ifFailed: 'halt',
        timeout: 3600000,
        retryHistory: [],
      },
    ],
  },
};

const PORT = 3117;

async function main() {
  console.log('\n☁️  cloudy dashboard preview\n');
  console.log(`  Starting with mock data (5 tasks, 2 completed, 1 in-progress, 2 pending)...\n`);

  const { broadcast, close } = await startDashboardServer(PORT, mockState, {
    getState: () => mockState,
  });

  console.log(`  ✅ Dashboard running at http://localhost:${PORT}`);
  console.log(`\n  Open that URL in your browser to see the dashboard.`);
  console.log(`  Press Ctrl+C to stop.\n`);

  // Simulate live events every few seconds so the UI feels alive
  let tick = 0;
  const outputs = [
    'Writing POST /auth/register handler...\n',
    'Hashing password with bcrypt (10 rounds)...\n',
    'Creating JWT with 7-day expiry for refresh token...\n',
    'Signing access token (15 minute expiry)...\n',
    'Implementing POST /auth/login endpoint...\n',
    'Validating email + password against database...\n',
    'Writing POST /auth/refresh token rotation...\n',
    'Adding middleware to validate Authorization header...\n',
  ];

  const interval = setInterval(() => {
    tick++;
    const text = outputs[tick % outputs.length];
    const event: OrchestratorEvent = {
      type: 'task_output',
      taskId: 'task-3',
      text,
    };
    broadcast(event);
  }, 1500);

  process.on('SIGINT', async () => {
    clearInterval(interval);
    await close();
    console.log('\n  Dashboard stopped.\n');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

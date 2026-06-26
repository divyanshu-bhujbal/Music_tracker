import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { runVerify } from '../../../packages/platform/src/electron/__verify__/better-sqlite3-verify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    title: 'Collectio',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173');
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();

  // E-02 T-01: better-sqlite3 verification (temporary — revert after verification passes)
  const dbPath = app.getPath('userData');
  const report = runVerify(dbPath);
  console.log(`=== E-02 T-01: better-sqlite3 Verification ===`);
  console.log(`Package: ${report.packageName}@${report.packageVersion}`);
  console.log(`Electron: ${report.electronVersion}`);
  console.log(`Node: ${report.nodeVersion}`);
  console.log(`Database: ${report.dbPath}`);
  console.log('');
  for (const t of report.tests) {
    console.log(`${t.id}: ${t.status} — ${t.description} — ${t.durationMs.toFixed(1)}ms`);
  }
  console.log('');
  console.log(`Result: ${report.passed}/${report.tests.length} passed. ${report.failed} failed. ${report.errored} errors.`);
  console.log(`Critical FK test: ${report.criticalFailed ? 'FAIL' : 'PASS'}`);
  writeFileSync(join(dbPath, 'verify-report.json'), JSON.stringify(report, null, 2));
  console.log(`Report written to: ${join(dbPath, 'verify-report.json')}`);

  // E-04 T-04.6: Electron Auth + Storage integration tests (optional — requires VERIFY_AUTH=true)
  if (process.env.VERIFY_AUTH === 'true') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('VERIFY_AUTH=true but GOOGLE_CLIENT_ID is not set. Skipping auth verification.');
    } else {
      import('../../../packages/platform/src/electron/__tests__/electron-auth.test.js')
        .then(({ runAuthVerify }) => {
          console.log('');
          console.log('Running E-04 T-04.6: Electron Auth + Storage Integration Tests...');
          return runAuthVerify({
            oauth: {
              clientId,
              redirectUri: 'http://localhost',
              scopes: ['https://www.googleapis.com/auth/drive.appdata'],
            },
            userDataPath: dbPath,
          });
        })
        .then((authReport) => {
          console.log('');
          console.log(`Auth verification complete: ${authReport.passed}/${authReport.tests.length} passed.`);
        })
        .catch((err) => {
          console.error(`Auth verification failed to load: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

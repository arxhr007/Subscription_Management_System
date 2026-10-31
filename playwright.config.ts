import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', expect:{timeout:15000}, timeout:90_000, fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:3100',trace:'retain-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
  webServer:{command:'PORT=3100 HOST=127.0.0.1 node apps/web/.output/server/index.mjs',url:'http://127.0.0.1:3100/login',reuseExistingServer:false,timeout:120_000},
});

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.collectio.app',
  appName: 'Collectio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['com.collectio.app://*'],
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;

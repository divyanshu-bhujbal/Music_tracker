package com.collectio.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import com.whitestein.securestorage.SecureStoragePluginPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CapacitorSQLitePlugin.class);
    registerPlugin(SecureStoragePluginPlugin.class);
    super.onCreate(savedInstanceState);
  }
}

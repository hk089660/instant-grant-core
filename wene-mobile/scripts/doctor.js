#!/usr/bin/env node
/**
 * We-ne Mobile Doctor Script
 *
 * 一般的な問題を自動検出・修正するスクリプト。
 * ビルド時は --build で利用者UI・管理者UIの必須/禁止パターンのみチェックし、
 * アイコン・Android設定はスキップして「UIが壊れていない」ことを保証する。
 *
 * 使い方:
 *   node scripts/doctor.js          # 全チェック（完成形保護・Android含む）
 *   node scripts/doctor.js --fix    # 問題を自動修正
 *   node scripts/doctor.js --build  # ビルド用（UI保護＋依存関係のみ）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FIX_MODE = process.argv.includes('--fix');
/** ビルド時のみ: UI必須/禁止パターンと依存関係だけチェック（アイコン・Androidはスキップ） */
const BUILD_MODE = process.argv.includes('--build');

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
};

const log = {
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  fix: (msg) => console.log(`${colors.green}🔧 ${msg}${colors.reset}`),
  lock: (msg) => console.log(`${colors.magenta}🔒 ${msg}${colors.reset}`),
};

let issues = 0;
let fixed = 0;

// ========================================
// 完成形ファイルのハッシュ (変更検出用)
// ========================================
const LOCKED_FILES = {
  'assets/icon.png': 'b16d15261c57c8df5567574b0573ef20',
  'assets/adaptive-icon.png': 'b16d15261c57c8df5567574b0573ef20',
};

// 必須パターン (これらが含まれていないとエラー)
// 利用者UI・管理者UIが壊れないように必須の契約をチェック
const REQUIRED_PATTERNS = {
  'src/polyfills.ts': [
    "react-native-get-random-values",
    "buffer",
  ],
  'src/utils/phantom.ts': [
    "bs58.encode",
    "dappKeyBase58",
    "handlePhantomConnectRedirect",
  ],
  'app/_layout.tsx': [
    "SafeAreaProvider",
    "polyfills",
    'name="u"',
    'name="register"',
    'name="admin"',
  ],
  'src/screens/HomeScreen.tsx': [
    "SafeAreaView",
    "schoolRoutes",
    "参加を開始",
    "getStudentSession",
    "redirect_to_register",
  ],
  'src/screens/ReceiveScreen.tsx': [
    "SafeAreaView",
  ],
  'src/screens/WalletScreen.tsx': [
    "SafeAreaView",
  ],
  // 利用者UI: 学校申込・ユーザー画面
  'src/screens/SchoolClaimScreen.tsx': [
    "SafeAreaView",
    "useSchoolClaim",
    "schoolRoutes.home",
  ],
  'src/screens/user/UserScanScreen.tsx': [
    "SafeAreaView",
    "schoolRoutes",
    "Platform.OS",
    "handleContinueWithoutScan",
    "CameraView",
    "useCameraPermissions",
  ],
  'src/screens/user/UserEventsScreen.tsx': [
    "SafeAreaView",
    "schoolRoutes",
    "getParticipations",
    "addSharedParticipation",
  ],
  'src/screens/user/UserConfirmScreen.tsx': [
    "SafeAreaView",
    "useSchoolClaim",
    "schoolRoutes.success",
    "handleClaim",
    "完了画面へ",
    "参加済み",
  ],
  'src/screens/user/UserSuccessScreen.tsx': [
    "SafeAreaView",
    "schoolRoutes",
    "setCompleted",
    "リダイレクト中",
  ],
  'src/screens/user/JoinScreen.tsx': [
    "getStudentSession",
    "recordParticipation",
    "addSharedParticipation",
  ],
  // 管理者UI: 共通ラベル（日本語）の一元管理
  'src/types/ui.ts': [
    "roleLabel",
    "eventStateLabel",
  ],
  'src/ui/components/StatusBadge.tsx': [
    "eventStateLabel",
  ],
  'src/ui/components/AdminShell.tsx': [
    "roleLabel",
    "管理画面",
  ],
  // 利用者登録フロー: eventId とルートの契約
  'src/hooks/useEventIdFromParams.ts': [
    "parseEventId",
    "schoolRoutes.events",
  ],
  'src/lib/schoolRoutes.ts': [
    "confirm",
    "success",
    "scan",
  ],
  'src/lib/eventId.ts': [
    "parseEventId",
  ],
  'src/api/schoolClaim.ts': [
    "submitSchoolClaim",
  ],
  'src/api/schoolClaimClient.mock.ts': [
    "alreadyJoined",
    "isJoined",
    "addSharedParticipation",
  ],
  // 利用者・管理者連携: adminEventsStore の getEventsSync を単一ソースに、参加反映は adminMock
  'src/api/schoolEvents.ts': [
    "getEventsSync",
    "adminEventsStore",
    "getEventById",
    "getAllSchoolEvents",
  ],
  'src/data/adminMock.ts': [
    "mockEvents",
    "addSharedParticipation",
    "getDisplayRtCount",
    "getSharedParticipationsByEventId",
    "getSharedParticipations",
  ],
  'src/screens/admin/AdminEventsScreen.tsx': [
    "getDisplayRtCount",
    "tone=\"dark\"",
    "EventRow",
    "#ffffff",
  ],
  'src/ui/components/EventRow.tsx': [
    "tone",
    "#ffffff",
    "textStyle",
  ],
  'src/ui/components/Button.tsx': [
    "tone",
    "textDark",
  ],
  'src/screens/admin/AdminEventDetailScreen.tsx': [
    "eventStateLabel",
    "getDisplayRtCount",
    "getSharedParticipationsByEventId",
    "getEventScanUrl",
    "QRCode",
    "participantText",
  ],
  'src/screens/admin/AdminPrintScreen.tsx': [
    "getEventScanUrl",
    "QRCode",
  ],
  'src/utils/appUrl.ts': [
    "getBaseUrl",
    "getEventScanUrl",
  ],
  'src/screens/admin/AdminParticipantsScreen.tsx': [
    "getSharedParticipations",
  ],
  'src/store/recipientTicketStore.ts': [
    "isJoined",
    "addTicket",
  ],
  'src/config/claimMode.ts': [
    "getClaimMode",
  ],
  'app/u/_layout.tsx': [
    "Stack",
  ],
  'app/admin/_layout.tsx': [
    "Stack",
    "headerShown: false",
  ],
  'src/data/participationStore.ts': [
    "setStarted",
    "setCompleted",
  ],
};

// 禁止パターン (これらが含まれているとエラー) — デバッグ用・英語UIの混入防止
const FORBIDDEN_PATTERNS = {
  'src/polyfills.ts': [
    '/ingest/',
  ],
  'src/utils/phantom.ts': [
    '/ingest/',
  ],
  'app/_layout.tsx': [
    '/ingest/',
  ],
  'src/screens/HomeScreen.tsx': [
    '/ingest/',
  ],
  'src/screens/ReceiveScreen.tsx': [
    '/ingest/',
  ],
  'src/screens/WalletScreen.tsx': [
    '/ingest/',
  ],
  // 管理者UI: 英語ラベルの直書きを防ぎ eventStateLabel/roleLabel を使う設計を維持
  'src/ui/components/StatusBadge.tsx': [
    "draft: 'Draft'",
    "published: 'Published'",
    "ended: 'Ended'",
  ],
  'src/ui/components/AdminShell.tsx': [
    'we-ne Admin',
    'Events</AppText>',
    'Participants</AppText>',
    'Categories</AppText>',
    'Logout</AppText>',
  ],
  // 利用者UI: 無効時の白画面を防ぐ（リダイレクト表示必須）
  'src/screens/user/UserSuccessScreen.tsx': [
    'if (!isValid) return null',
  ],
  'src/screens/user/UserConfirmScreen.tsx': [
    'if (!isValid) return null',
  ],
};

// ========================================
// Utility Functions
// ========================================
function getFileMD5(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

// ========================================
// Check 0: Locked Files (完成形保護)
// ========================================
function checkLockedFiles() {
  log.info('Checking locked files (完成形保護)...');
  
  for (const [relativePath, expectedHash] of Object.entries(LOCKED_FILES)) {
    const fullPath = path.join(ROOT, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      log.error(`${relativePath} not found (LOCKED FILE MISSING!)`);
      issues++;
      continue;
    }
    
    const actualHash = getFileMD5(fullPath);
    
    if (actualHash === expectedHash) {
      log.lock(`${relativePath} is intact`);
    } else {
      log.error(`${relativePath} has been MODIFIED! (expected: ${expectedHash}, got: ${actualHash})`);
      log.warn(`  → This file should not be changed. Restore from backup or git.`);
      issues++;
    }
  }
}

// ========================================
// Check 1: Required Patterns
// ========================================
function checkRequiredPatterns() {
  log.info('Checking required code patterns...');
  
  for (const [relativePath, patterns] of Object.entries(REQUIRED_PATTERNS)) {
    const fullPath = path.join(ROOT, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      log.error(`${relativePath} not found`);
      issues++;
      continue;
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    let fileOk = true;
    
    for (const pattern of patterns) {
      if (!content.includes(pattern)) {
        log.error(`${relativePath} missing required pattern: "${pattern}"`);
        issues++;
        fileOk = false;
      }
    }
    
    if (fileOk) {
      log.success(`${relativePath} has all required patterns`);
    }
  }
}

// ========================================
// Check 2: Forbidden Patterns
// ========================================
function checkForbiddenPatterns() {
  log.info('Checking for forbidden patterns (debug code)...');
  
  for (const [relativePath, patterns] of Object.entries(FORBIDDEN_PATTERNS)) {
    const fullPath = path.join(ROOT, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      continue; // Skip if file doesn't exist (handled elsewhere)
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    let fileOk = true;
    
    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        log.error(`${relativePath} contains forbidden pattern: "${pattern}"`);
        issues++;
        fileOk = false;
        
        if (FIX_MODE) {
          // Remove agent log blocks
          let cleaned = content.replace(/\/\/ #region agent log[\s\S]*?\/\/ #endregion\n?/g, '');
          fs.writeFileSync(fullPath, cleaned);
          log.fix(`Removed debug code from ${relativePath}`);
          fixed++;
        }
      }
    }
    
    if (fileOk) {
      log.success(`${relativePath} has no forbidden patterns`);
    }
  }
}

// ========================================
// Check 3: Dependencies
// ========================================
function checkDependencies() {
  log.info('Checking required dependencies...');
  const packagePath = path.join(ROOT, 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    log.error('package.json not found');
    issues++;
    return;
  }
  
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  
  const required = [
    'react-native-get-random-values',
    'react-native-safe-area-context',
    'buffer',
    'bs58',
    'tweetnacl',
    'expo-camera',
    'react-native-qrcode-svg',
  ];
  
  const missing = [];
  for (const dep of required) {
    if (deps[dep]) {
      log.success(`${dep} is installed`);
    } else {
      log.error(`${dep} is missing`);
      missing.push(dep);
      issues++;
    }
  }
  
  if (FIX_MODE && missing.length > 0) {
    log.fix(`Installing missing dependencies: ${missing.join(', ')}`);
    try {
      execSync(`npm install ${missing.join(' ')} --legacy-peer-deps`, { 
        cwd: ROOT, 
        stdio: 'inherit' 
      });
      fixed += missing.length;
    } catch (e) {
      log.error('Failed to install dependencies');
    }
  }
}

// ========================================
// Check 4: Android local.properties
// ========================================
function checkAndroidConfig() {
  log.info('Checking Android configuration...');
  const androidDir = path.join(ROOT, 'android');
  const localPropsPath = path.join(androidDir, 'local.properties');
  
  if (!fs.existsSync(androidDir)) {
    log.warn('android directory not found (run prebuild first)');
    return;
  }
  
  if (!fs.existsSync(localPropsPath)) {
    log.error('android/local.properties not found');
    issues++;
    if (FIX_MODE) {
      const possibleSdkPaths = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        '/opt/homebrew/share/android-commandlinetools',
        `${process.env.HOME}/Library/Android/sdk`,
        `${process.env.HOME}/Android/Sdk`,
      ].filter(Boolean);
      
      let sdkPath = null;
      for (const p of possibleSdkPaths) {
        if (p && fs.existsSync(p)) {
          sdkPath = p;
          break;
        }
      }
      
      if (sdkPath) {
        fs.writeFileSync(localPropsPath, `sdk.dir=${sdkPath}\n`);
        log.fix(`Created local.properties with sdk.dir=${sdkPath}`);
        fixed++;
      } else {
        log.error('Could not find Android SDK path');
      }
    }
  } else {
    const content = fs.readFileSync(localPropsPath, 'utf8');
    if (content.includes('sdk.dir')) {
      log.success('local.properties has sdk.dir');
    } else {
      log.error('local.properties missing sdk.dir');
      issues++;
    }
  }
}

// ========================================
// Check 5: node_modules existence
// ========================================
function checkNodeModules() {
  log.info('Checking node_modules...');
  const nodeModulesPath = path.join(ROOT, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    log.error('node_modules not found');
    issues++;
    if (FIX_MODE) {
      log.fix('Running npm install...');
      try {
        execSync('npm install --legacy-peer-deps', { cwd: ROOT, stdio: 'inherit' });
        fixed++;
      } catch (e) {
        log.error('npm install failed');
      }
    }
  } else {
    log.success('node_modules exists');
  }
}

// ========================================
// Check 6: Assets
// ========================================
function checkAssets() {
  log.info('Checking assets...');
  const assetsDir = path.join(ROOT, 'assets');
  
  if (!fs.existsSync(assetsDir)) {
    log.error('assets directory not found');
    issues++;
    if (FIX_MODE) {
      fs.mkdirSync(assetsDir, { recursive: true });
      log.fix('Created assets directory');
      fixed++;
    }
    return;
  }
  
  const requiredAssets = ['icon.png', 'adaptive-icon.png'];
  for (const asset of requiredAssets) {
    const assetPath = path.join(assetsDir, asset);
    if (fs.existsSync(assetPath)) {
      log.success(`${asset} exists`);
    } else {
      log.error(`${asset} not found`);
      issues++;
    }
  }
}

// ========================================
// Main
// ========================================
console.log('\n🏥 We-ne Mobile Doctor\n');
console.log(`Mode: ${FIX_MODE ? 'FIX' : BUILD_MODE ? 'BUILD (UI保護)' : 'CHECK'}\n`);
console.log('─'.repeat(50));

if (!BUILD_MODE) {
  checkLockedFiles();
  console.log('');
}

checkNodeModules();
console.log('');

checkDependencies();
console.log('');

checkRequiredPatterns();
console.log('');

checkForbiddenPatterns();
console.log('');

if (!BUILD_MODE) {
  checkAndroidConfig();
  console.log('');

  checkAssets();
}

console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Summary: ${issues} issue(s) found`);
if (FIX_MODE) {
  console.log(`🔧 Fixed: ${fixed} issue(s)`);
}

if (issues > 0 && !FIX_MODE) {
  console.log(`\n💡 Run with --fix to auto-fix some issues:`);
  console.log(`   node scripts/doctor.js --fix\n`);
}

if (issues === 0) {
  console.log(`\n✨ All checks passed! App is in stable state.\n`);
}

process.exit(issues > 0 ? 1 : 0);

import { Markup } from 'telegraf';

export const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('💰 Create Position', 'create_position')],
  [Markup.button.callback('📊 View Positions', 'view_positions')],
  [Markup.button.callback('🔴 Close Position', 'close_position')],
  [Markup.button.callback('📜 Position History', 'view_history')],
  [Markup.button.callback('👛 Wallet Info', 'wallet_info')],
  [Markup.button.callback('🔄 Toggle Monitoring', 'toggle_monitoring')],
  [Markup.button.callback('📈 Pool Status', 'pool_status')]
]);

export const walletKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🆕 Create New Wallet', 'create_wallet')],
  [Markup.button.callback('📥 Import Wallet', 'import_wallet')],
  [Markup.button.callback('📤 Export Private Key', 'export_key')],
  [Markup.button.callback('⬅️ Back', 'main_menu')]
]);

export const backKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
]);
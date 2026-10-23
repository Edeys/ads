import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(here, 'data/donevn-field-catalog.json'), 'utf8'));
const presets = JSON.parse(fs.readFileSync(path.join(here, 'data/donevn-field-presets.json'), 'utf8'));

const PROVIDERS = [
  ['meta', 'Meta Ads', 'M'],
  ['tiktok', 'TikTok', 'T'],
  ['google_ads', 'Google Ads', 'G'],
  ['openai_ads', 'OpenAI Ads', 'O'],
  ['pancake', 'Pancake', 'P'],
  ['pancake_crm', 'Pancake CRM', 'C'],
  ['pancake_pages', 'Pancake Chat', 'P'],
  ['nhanhvn', 'Nhanh.vn', 'N'],
  ['nhanhvn_vpage', 'Nhanh Vpage', 'V'],
  ['sapo', 'Sapo', 'S'],
  ['shopify', 'Shopify', 'S'],
  ['woocommerce', 'WooCommerce', 'W'],
  ['getfly', 'GetFly CRM', 'G'],
  ['odoo', 'Odoo', 'O'],
];

// entity -> provider + Vietnamese label, recovered from the live field-presets chunk.
const ENTITY_MAP = {
  'meta.insights': ['meta', 'Chỉ số'],
  'meta.campaign_details': ['meta', 'Chiến dịch'],
  'tiktok.insights': ['tiktok', 'Chỉ số'],
  'tiktok.campaign_details': ['tiktok', 'Chiến dịch'],
  'tiktok.gmv_max': ['tiktok', 'GMV Max'],
  'google_ads.insights': ['google_ads', 'Chỉ số'],
  'openai_ads.insights': ['openai_ads', 'Chỉ số'],
  'pancake.orders': ['pancake', 'Đơn hàng'],
  'pancake.products': ['pancake', 'Sản phẩm'],
  'pancake.customers': ['pancake', 'Khách hàng'],
  'pancake.inventory': ['pancake', 'Tồn kho'],
  'pancake.statistics': ['pancake', 'Thống kê'],
  'pancake_crm.orders': ['pancake_crm', 'Đơn hàng'],
  'pancake_crm.products': ['pancake_crm', 'Sản phẩm'],
  'pancake_crm.deals': ['pancake_crm', 'Deal'],
  'pancake_crm.tickets': ['pancake_crm', 'Ticket'],
  'pancake_crm.sources': ['pancake_crm', 'Nguồn'],
  'pancake_crm.module_statuses': ['pancake_crm', 'Trạng thái'],
  'pancake_crm.tags': ['pancake_crm', 'Tag'],
  'pancake_pages.conversations': ['pancake_pages', 'Hội thoại'],
  'pancake_pages.messages': ['pancake_pages', 'Tin nhắn'],
  'pancake_pages.message_customers': ['pancake_pages', 'Khách (trong tin nhắn)'],
  'pancake_pages.customers': ['pancake_pages', 'Khách (danh bạ)'],
  'nhanhvn.orders': ['nhanhvn', 'Đơn hàng'],
  'nhanhvn.products': ['nhanhvn', 'Sản phẩm'],
  'nhanhvn.customers': ['nhanhvn', 'Khách hàng'],
  'nhanhvn.inventory': ['nhanhvn', 'Tồn kho'],
  'nhanhvn_vpage.pages': ['nhanhvn_vpage', 'Page'],
  'nhanhvn_vpage.conversations': ['nhanhvn_vpage', 'Hội thoại'],
  'nhanhvn_vpage.messages': ['nhanhvn_vpage', 'Tin nhắn'],
  'sapo.orders': ['sapo', 'Đơn hàng'],
  'sapo.products': ['sapo', 'Sản phẩm'],
  'sapo.customers': ['sapo', 'Khách hàng'],
  'shopify.orders': ['shopify', 'Đơn hàng'],
  'shopify.products': ['shopify', 'Sản phẩm'],
  'shopify.customers': ['shopify', 'Khách hàng'],
  'woocommerce.orders': ['woocommerce', 'Đơn hàng'],
  'woocommerce.products': ['woocommerce', 'Sản phẩm'],
  'woocommerce.customers': ['woocommerce', 'Khách hàng'],
  'getfly.customers': ['getfly', 'Khách hàng'],
  'getfly.orders': ['getfly', 'Đơn hàng'],
  'getfly.products': ['getfly', 'Sản phẩm'],
  'getfly.campaigns': ['getfly', 'Chiến dịch'],
  'getfly.opportunities': ['getfly', 'Cơ hội'],
  'getfly.quotes': ['getfly', 'Báo giá'],
  'getfly.contracts': ['getfly', 'Hợp đồng'],
  'getfly.warehouses': ['getfly', 'Kho'],
  'odoo.partners': ['odoo', 'Khách hàng'],
  'odoo.sale_orders': ['odoo', 'Đơn bán'],
  'odoo.products': ['odoo', 'Sản phẩm'],
  'odoo.leads': ['odoo', 'Cơ hội'],
  'odoo.purchase_orders': ['odoo', 'Đơn mua'],
  'odoo.invoices': ['odoo', 'Hóa đơn'],
  'odoo.stock': ['odoo', 'Tồn kho'],
};

const entities = [];
for (const c of catalog) {
  const meta = ENTITY_MAP[c.entity];
  if (!meta) continue;
  entities.push({
    entity: c.entity,
    provider: meta[0],
    label: meta[1],
    min: c.toi_gian,
    fields: c.fields.map((f) => [f.key, f.label]),
  });
}

const sysPresets = presets.filter((p) => p.is_system).map((p) => ({
  id: p.id,
  provider: p.provider,
  name: p.name,
  description: p.description,
  config: p.config,
}));

const lines = [];
lines.push('// AUTO-GENERATED — dữ liệu field catalog thật lấy từ app.done.vn');
lines.push('// GET /api/mcp-keys/field-catalog + GET /api/mcp-field-presets/ (reverse-engineered 2026-10-20).');
lines.push('// Không sửa tay: chạy lại scripts/generate-field-catalog.mjs khi cần cập nhật.');
lines.push('');
lines.push('export type FieldDef = { key: string; label: string };');
lines.push('export type EntityDef = { entity: string; provider: string; label: string; minimal: string[]; fields: FieldDef[] };');
lines.push('export type ProviderDef = { key: string; label: string; initial: string };');
lines.push('');
lines.push('export const PRESET_PROVIDERS: ProviderDef[] = ');
lines.push(JSON.stringify(PROVIDERS.map(([key, label, initial]) => ({ key, label, initial })), null, 2) + ';');
lines.push('');
lines.push('// [entity, provider, label, minimalFields, [[key,label],...]]');
lines.push('const RAW: [string, string, string, string[], [string, string][]][] = ');
lines.push(JSON.stringify(entities.map((e) => [e.entity, e.provider, e.label, e.min, e.fields])) + ';');
lines.push('');
lines.push('export const ENTITIES: EntityDef[] = RAW.map(([entity, provider, label, minimal, fields]) => ({');
lines.push('  entity, provider, label, minimal,');
lines.push('  fields: fields.map(([key, fieldLabel]) => ({ key, label: fieldLabel })),');
lines.push('}));');
lines.push('');
lines.push('export const ENTITY_BY_KEY: Record<string, EntityDef> = Object.fromEntries(ENTITIES.map((e) => [e.entity, e]));');
lines.push('export const ENTITIES_BY_PROVIDER: Record<string, EntityDef[]> = ENTITIES.reduce<Record<string, EntityDef[]>>((acc, e) => {');
lines.push('  (acc[e.provider] ??= []).push(e);');
lines.push('  return acc;');
lines.push('}, {});');
lines.push('');
lines.push('// Bộ "Hệ thống đề xuất" do Done.vn soạn sẵn — dùng chung, chỉ xem.');
lines.push('export const SYSTEM_PRESETS: { id: string; provider: string; name: string; description: string; config: Record<string, string[]> }[] = ');
lines.push(JSON.stringify(sysPresets) + ';');
lines.push('');

fs.writeFileSync('D:/ADS MCP APP/src/lib/field-catalog.ts', lines.join('\n'), 'utf8');
const size = fs.statSync('D:/ADS MCP APP/src/lib/field-catalog.ts').size;
console.log('entities', entities.length, 'providers', PROVIDERS.length, 'systemPresets', sysPresets.length, 'bytes', size);

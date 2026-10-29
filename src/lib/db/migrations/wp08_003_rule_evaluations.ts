import type { Migration } from './types';
import { SETTING_DEFAULTS } from '../../settings-defaults';

// AI_RULE_EVALUATION: mỗi dòng = một quy tắc được backend áp cho một lần chạy Agent (BR-28).
// Lưu kèm phiên bản + hash bộ quy tắc để biết bản nghiên cứu được tạo theo tham số nào.
export const wp08_003_rule_evaluations: Migration = {
  name: 'wp08_003_rule_evaluations',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_rule_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER REFERENCES ai_runs(id) ON DELETE SET NULL,
        research_id INTEGER REFERENCES opportunity_research(id) ON DELETE CASCADE,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        rule_id TEXT NOT NULL,
        br_ref TEXT NOT NULL,
        ruleset_version TEXT NOT NULL,
        ruleset_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PASSED','WARNING','HIT','NOT_EVALUABLE','NOT_APPLICABLE')),
        severity TEXT CHECK (severity IN ('LOW','MEDIUM','HIGH')),
        raw_value TEXT,
        threshold TEXT,
        rationale TEXT NOT NULL,
        limitation TEXT,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        required_action TEXT,
        human_gate TEXT CHECK (human_gate IN ('AE_VERIFY','MANAGER_REVIEW','EXPERT_REVIEW')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rule_eval_research ON ai_rule_evaluations(research_id);
      CREATE INDEX IF NOT EXISTS idx_rule_eval_opp_rule ON ai_rule_evaluations(opportunity_id, rule_id);
    `);
    const cols = (db.prepare('PRAGMA table_info(opportunity_research)').all() as { name: string }[]).map(c => c.name);
    const add = (name: string, ddl: string) => { if (cols.length && !cols.includes(name)) db.exec(`ALTER TABLE opportunity_research ADD COLUMN ${ddl}`); };
    add('ruleset_version', 'ruleset_version TEXT');
    add('ruleset_hash', 'ruleset_hash TEXT');
    add('confidence', 'confidence REAL');
    add('confidence_band', 'confidence_band TEXT');
    add('llm_importance', 'llm_importance TEXT');
    add('gates_json', "gates_json TEXT NOT NULL DEFAULT '[]'");
    // DB đã có dữ liệu sẽ không chạy lại seed: thêm 2 tham số BR-28 để trang Quản trị hiển thị và sửa được.
    // DB mới để trống: seed sẽ nạp toàn bộ mặc định sau migration.
    const hasSettings = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'").get();
    const seeded = hasSettings && (db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }).n > 0;
    if (seeded) {
      const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?,?,?)');
      for (const key of ['opp_close_warning_days', 'ai_min_confidence']) ins.run(key, SETTING_DEFAULTS[key].value, SETTING_DEFAULTS[key].description);
    }
  },
};

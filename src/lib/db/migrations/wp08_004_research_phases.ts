import type { Migration } from './types';

export const wp08_004_research_phases: Migration = {
  name: 'wp08_004_research_phases',
  up(db) {
    const add = (table: string, name: string, ddl: string) => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (cols.length && !cols.some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    };
    add('ai_runs', 'research_phase', "research_phase TEXT CHECK(research_phase IN ('INITIAL','POST_SURVEY','LEGACY'))");
    add('ai_runs', 'input_fingerprint', 'input_fingerprint TEXT');
    add('opportunity_research', 'research_phase', "research_phase TEXT NOT NULL DEFAULT 'LEGACY' CHECK(research_phase IN ('INITIAL','POST_SURVEY','LEGACY'))");
    add('opportunity_research', 'missing_info_json', "missing_info_json TEXT NOT NULL DEFAULT '[]'");
    for (const [name, ddl] of Object.entries({
      human_action: "human_action TEXT CHECK(human_action IN ('ACKNOWLEDGED','FLAGGED','RISK','TASK'))",
      acted_by: 'acted_by INTEGER REFERENCES users(id)', acted_at: 'acted_at TEXT', action_note: 'action_note TEXT',
      linked_risk_id: 'linked_risk_id INTEGER REFERENCES opportunity_risks(id)', linked_task_id: 'linked_task_id INTEGER REFERENCES tasks(id)',
    })) add('ai_rule_evaluations', name, ddl);
  },
};

import type {Migration} from './types';
export const wp10_001_integration_requests:Migration={
  name:'wp10_001_integration_requests',
  up(db){db.exec(`CREATE TABLE IF NOT EXISTS integration_requests(
    integration TEXT NOT NULL,idempotency_key TEXT NOT NULL,payload_hash TEXT NOT NULL,response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT(datetime('now')),PRIMARY KEY(integration,idempotency_key)
  ); CREATE UNIQUE INDEX IF NOT EXISTS payment_external_transaction ON payments(source,external_transaction_id) WHERE external_transaction_id IS NOT NULL;`);},
};

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

type QueryResult = [{ [key: string]: any }[], { affectedRows?: number; insertId?: number }];

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) in the environment.');
}

if (!supabaseKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY. Configure the server-only Supabase key before starting the API.',
  );
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function quoteParameter(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number.isFinite(Number(value)) ? String(value) : 'NULL';
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function toPostgresSql(sql: string, params: unknown[] = []): string {
  let parameterIndex = 0;
  const compiled = sql.replace(/\?/g, () => {
    const value = quoteParameter(params[parameterIndex]);
    parameterIndex += 1;
    return value;
  });

  return compiled
    .replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE')
    .replace(/\bRAND\(\)/gi, 'RANDOM()')
    .replace(/\bDATE\(([^()]+)\)/gi, '($1)::date')
    .replace(/\bMONTH\(([^()]+)\)/gi, 'EXTRACT(MONTH FROM $1)')
    .replace(/\bYEAR\(([^()]+)\)/gi, 'EXTRACT(YEAR FROM $1)')
    .replace(/\bIFNULL\(/gi, 'COALESCE(')
    .replace(/\s+FOR UPDATE\b/gi, '')
    .replace(/\bAUTO_INCREMENT\b/gi, '')
    .replace(/`/g, '"');
}

async function execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: toPostgresSql(sql, params).trim(),
  });

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  const result = data || { rows: [], affected_rows: 0, insert_id: null };
  return [
    Array.isArray(result.rows) ? result.rows : [],
    {
      affectedRows: Number(result.affected_rows || 0),
      insertId: result.insert_id === null ? undefined : Number(result.insert_id),
    },
  ];
}

const dbProxy = {
  query(sql: string, params: unknown[] = []) {
    return execute(sql, params);
  },

  async getConnection() {
    return {
      query: (sql: string, params: unknown[] = []) => execute(sql, params),
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
    };
  },

  isFallbackMode() {
    return false;
  },

  engine() {
    return 'Supabase PostgreSQL';
  },
};

module.exports = dbProxy;

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

/** Shape matching @supabase/supabase-js query responses. */
export type PgQueryError = {
  message: string;
  code?: string;
  details?: string;
};

export type PgQueryResult<T = unknown> = {
  data: T;
  error: PgQueryError | null;
  count: number | null;
};

type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'is'
  | 'not_is'
  | 'like'
  | 'ilike';

type Filter = {
  op: FilterOp;
  col: string;
  value: unknown;
};

type OrClause = {
  op: FilterOp;
  col: string;
  value: unknown;
};

type OrderClause = {
  col: string;
  ascending: boolean;
  nullsFirst?: boolean;
};

type WriteMode = 'insert' | 'update' | 'upsert' | 'delete';
type QueryMode = 'select' | WriteMode;

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Identifiant SQL invalide: ${name}`);
  }
  return `"${name}"`;
}

function parseSelectColumns(columns?: string): string {
  if (!columns || columns.trim() === '' || columns.trim() === '*') {
    return '*';
  }
  return columns
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => quoteIdent(c))
    .join(', ');
}

function mapPgError(err: unknown): PgQueryError {
  if (!err || typeof err !== 'object') {
    return { message: String(err ?? 'erreur inconnue') };
  }
  const e = err as { message?: string; code?: string; detail?: string };
  return {
    message: e.message ?? 'erreur PostgreSQL',
    code: e.code,
    details: e.detail,
  };
}

/**
 * Fluent query builder — API compatible with the subset of
 * @supabase/supabase-js used by this codebase (PostgREST-style).
 */
class QueryBuilder implements PromiseLike<PgQueryResult> {
  private mode: QueryMode = 'select';
  private selectCols = '*';
  private returningCols = '*';
  private countExact = false;
  private headOnly = false;
  private filters: Filter[] = [];
  private orClauses: OrClause[] = [];
  private orders: OrderClause[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private insertValues: object | object[] | null = null;
  private updatePatch: object | null = null;
  private upsertOnConflict: string | null = null;
  private terminal: 'none' | 'single' | 'maybeSingle' = 'none';

  constructor(
    private readonly pool: Pool,
    private readonly table: string,
  ) {
    // Validate table name early
    quoteIdent(table);
  }

  // ─── SELECT ─────────────────────────────────────────────

  select(
    columns?: string,
    opts?: { count?: 'exact'; head?: boolean },
  ): this {
    // After a write op, .select() means RETURNING columns (Supabase JS behaviour).
    if (this.mode !== 'select') {
      this.returningCols = parseSelectColumns(columns);
      return this;
    }
    this.mode = 'select';
    this.selectCols = parseSelectColumns(columns);
    this.countExact = opts?.count === 'exact';
    this.headOnly = opts?.head === true;
    return this;
  }

  // ─── WRITE ──────────────────────────────────────────────

  insert(values: object | object[]): this {
    this.mode = 'insert';
    this.insertValues = values;
    return this;
  }

  update(patch: object): this {
    this.mode = 'update';
    this.updatePatch = patch;
    return this;
  }

  upsert(
    values: object | object[],
    opts?: { onConflict?: string },
  ): this {
    this.mode = 'upsert';
    this.insertValues = values;
    this.upsertOnConflict = opts?.onConflict?.trim() || null;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  // ─── FILTERS ────────────────────────────────────────────

  eq(col: string, val: unknown): this {
    this.filters.push({ op: 'eq', col, value: val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this.filters.push({ op: 'neq', col, value: val });
    return this;
  }

  gt(col: string, val: unknown): this {
    this.filters.push({ op: 'gt', col, value: val });
    return this;
  }

  gte(col: string, val: unknown): this {
    this.filters.push({ op: 'gte', col, value: val });
    return this;
  }

  lt(col: string, val: unknown): this {
    this.filters.push({ op: 'lt', col, value: val });
    return this;
  }

  lte(col: string, val: unknown): this {
    this.filters.push({ op: 'lte', col, value: val });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this.filters.push({ op: 'in', col, value: vals });
    return this;
  }

  is(col: string, val: null | boolean): this {
    this.filters.push({ op: 'is', col, value: val });
    return this;
  }

  /** Supports at least not(col, 'is', null) → IS NOT NULL */
  not(col: string, operator: string, val: unknown): this {
    if (operator === 'is' && val === null) {
      this.filters.push({ op: 'not_is', col, value: null });
      return this;
    }
    throw new Error(
      `QueryBuilder.not: forme non supportée not(${col}, ${operator}, …)`,
    );
  }

  like(col: string, pattern: string): this {
    this.filters.push({ op: 'like', col, value: pattern });
    return this;
  }

  ilike(col: string, pattern: string): this {
    this.filters.push({ op: 'ilike', col, value: pattern });
    return this;
  }

  /**
   * PostgREST-style OR: "col.op.value,col.op.value"
   * op ∈ eq|neq|gt|gte|lt|lte|like|ilike|is
   */
  or(expr: string): this {
    const segments = expr.split(',').map((s) => s.trim()).filter(Boolean);
    for (const segment of segments) {
      const parsed = parseOrSegment(segment);
      if (parsed) this.orClauses.push(parsed);
    }
    return this;
  }

  // ─── MODIFIERS ──────────────────────────────────────────

  order(
    col: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean },
  ): this {
    this.orders.push({
      col,
      ascending: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  // ─── TERMINALS ──────────────────────────────────────────

  single(): Promise<PgQueryResult> {
    this.terminal = 'single';
    return this.execute();
  }

  maybeSingle(): Promise<PgQueryResult> {
    this.terminal = 'maybeSingle';
    return this.execute();
  }

  /** Makes the builder awaitable: `const { data, error } = await qb` */
  then<TResult1 = PgQueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: PgQueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // ─── SQL BUILD / EXEC ───────────────────────────────────

  private async execute(): Promise<PgQueryResult> {
    try {
      switch (this.mode) {
        case 'select':
          return await this.execSelect();
        case 'insert':
          return await this.execInsert();
        case 'update':
          return await this.execUpdate();
        case 'upsert':
          return await this.execUpsert();
        case 'delete':
          return await this.execDelete();
        default:
          return { data: null, error: { message: 'mode inconnu' }, count: null };
      }
    } catch (err) {
      return { data: null, error: mapPgError(err), count: null };
    }
  }

  private buildWhere(params: unknown[]): string {
    const parts: string[] = [];

    for (const f of this.filters) {
      parts.push(this.filterSql(f, params));
    }

    if (this.orClauses.length > 0) {
      const orParts = this.orClauses.map((c) => this.filterSql(c, params));
      parts.push(`(${orParts.join(' OR ')})`);
    }

    if (parts.length === 0) return '';
    return ` WHERE ${parts.join(' AND ')}`;
  }

  private filterSql(f: Filter | OrClause, params: unknown[]): string {
    const col = quoteIdent(f.col);
    switch (f.op) {
      case 'eq': {
        params.push(f.value);
        return `${col} = $${params.length}`;
      }
      case 'neq': {
        params.push(f.value);
        return `${col} <> $${params.length}`;
      }
      case 'gt': {
        params.push(f.value);
        return `${col} > $${params.length}`;
      }
      case 'gte': {
        params.push(f.value);
        return `${col} >= $${params.length}`;
      }
      case 'lt': {
        params.push(f.value);
        return `${col} < $${params.length}`;
      }
      case 'lte': {
        params.push(f.value);
        return `${col} <= $${params.length}`;
      }
      case 'in': {
        params.push(f.value);
        return `${col} = ANY($${params.length})`;
      }
      case 'is': {
        if (f.value === null) return `${col} IS NULL`;
        if (f.value === true) return `${col} IS TRUE`;
        if (f.value === false) return `${col} IS FALSE`;
        params.push(f.value);
        return `${col} IS $${params.length}`;
      }
      case 'not_is': {
        if (f.value === null) return `${col} IS NOT NULL`;
        params.push(f.value);
        return `${col} IS NOT $${params.length}`;
      }
      case 'like': {
        params.push(f.value);
        return `${col} LIKE $${params.length}`;
      }
      case 'ilike': {
        params.push(f.value);
        return `${col} ILIKE $${params.length}`;
      }
      default:
        throw new Error(`Opérateur filtre inconnu: ${(f as Filter).op}`);
    }
  }

  private buildOrderBy(): string {
    if (this.orders.length === 0) return '';
    const parts = this.orders.map((o) => {
      const dir = o.ascending ? 'ASC' : 'DESC';
      let nulls = '';
      if (o.nullsFirst === true) nulls = ' NULLS FIRST';
      else if (o.nullsFirst === false) nulls = ' NULLS LAST';
      return `${quoteIdent(o.col)} ${dir}${nulls}`;
    });
    return ` ORDER BY ${parts.join(', ')}`;
  }

  private buildLimitOffset(params: unknown[]): string {
    let sql = '';
    if (this.rangeFrom != null && this.rangeTo != null) {
      const limit = this.rangeTo - this.rangeFrom + 1;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(this.rangeFrom);
      sql += ` OFFSET $${params.length}`;
    } else if (this.limitN != null) {
      params.push(this.limitN);
      sql += ` LIMIT $${params.length}`;
    }
    return sql;
  }

  private applyTerminal(
    rows: Record<string, unknown>[],
    count: number | null,
  ): PgQueryResult {
    if (this.terminal === 'single') {
      if (rows.length === 0) {
        return {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
          },
          count,
        };
      }
      if (rows.length > 1) {
        return {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
          },
          count,
        };
      }
      return { data: rows[0], error: null, count };
    }

    if (this.terminal === 'maybeSingle') {
      if (rows.length === 0) {
        return { data: null, error: null, count };
      }
      if (rows.length > 1) {
        return {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
          },
          count,
        };
      }
      return { data: rows[0], error: null, count };
    }

    return { data: rows, error: null, count };
  }

  private async execSelect(): Promise<PgQueryResult> {
    const table = quoteIdent(this.table);
    const params: unknown[] = [];
    const where = this.buildWhere(params);

    let count: number | null = null;
    if (this.countExact) {
      const countSql = `SELECT COUNT(*)::int AS c FROM ${table}${where}`;
      const countRes = await this.pool.query(countSql, params);
      count = Number(countRes.rows[0]?.c ?? 0);
    }

    if (this.headOnly) {
      return { data: null, error: null, count };
    }

    // Fresh params for data query (same where values)
    const dataParams: unknown[] = [];
    const dataWhere = this.buildWhere(dataParams);
    const order = this.buildOrderBy();
    const limit = this.buildLimitOffset(dataParams);
    const sql = `SELECT ${this.selectCols} FROM ${table}${dataWhere}${order}${limit}`;
    const res = await this.pool.query(sql, dataParams);
    return this.applyTerminal(res.rows, count);
  }

  private async execInsert(): Promise<PgQueryResult> {
    const rows = normalizeRows(this.insertValues);
    if (rows.length === 0) {
      return { data: [], error: null, count: null };
    }
    const cols = Object.keys(rows[0]);
    for (const c of cols) quoteIdent(c);

    const table = quoteIdent(this.table);
    const colList = cols.map(quoteIdent).join(', ');
    const params: unknown[] = [];
    const valueGroups: string[] = [];

    for (const row of rows) {
      const placeholders: string[] = [];
      for (const c of cols) {
        params.push((row as Record<string, unknown>)[c] ?? null);
        placeholders.push(`$${params.length}`);
      }
      valueGroups.push(`(${placeholders.join(', ')})`);
    }

    const returning = this.returningCols || '*';
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${valueGroups.join(', ')} RETURNING ${returning}`;
    const res = await this.pool.query(sql, params);
    return this.applyTerminal(res.rows, null);
  }

  private async execUpdate(): Promise<PgQueryResult> {
    if (!this.updatePatch || Object.keys(this.updatePatch).length === 0) {
      return {
        data: null,
        error: { message: 'update: patch vide' },
        count: null,
      };
    }
    const table = quoteIdent(this.table);
    const params: unknown[] = [];
    const sets: string[] = [];
    for (const [k, v] of Object.entries(this.updatePatch)) {
      quoteIdent(k);
      params.push(v);
      sets.push(`${quoteIdent(k)} = $${params.length}`);
    }
    const where = this.buildWhere(params);
    const returning = this.returningCols || '*';
    const sql = `UPDATE ${table} SET ${sets.join(', ')}${where} RETURNING ${returning}`;
    const res = await this.pool.query(sql, params);
    return this.applyTerminal(res.rows, null);
  }

  private async execUpsert(): Promise<PgQueryResult> {
    const rows = normalizeRows(this.insertValues);
    if (rows.length === 0) {
      return { data: [], error: null, count: null };
    }
    const cols = Object.keys(rows[0]);
    for (const c of cols) quoteIdent(c);

    const conflictCols = (this.upsertOnConflict ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    for (const c of conflictCols) quoteIdent(c);

    const table = quoteIdent(this.table);
    const colList = cols.map(quoteIdent).join(', ');
    const params: unknown[] = [];
    const valueGroups: string[] = [];

    for (const row of rows) {
      const placeholders: string[] = [];
      for (const c of cols) {
        params.push((row as Record<string, unknown>)[c] ?? null);
        placeholders.push(`$${params.length}`);
      }
      valueGroups.push(`(${placeholders.join(', ')})`);
    }

    let conflictSql = '';
    if (conflictCols.length > 0) {
      const conflictList = conflictCols.map(quoteIdent).join(', ');
      const updateCols = cols.filter((c) => !conflictCols.includes(c));
      if (updateCols.length === 0) {
        conflictSql = ` ON CONFLICT (${conflictList}) DO NOTHING`;
      } else {
        const sets = updateCols
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
          .join(', ');
        conflictSql = ` ON CONFLICT (${conflictList}) DO UPDATE SET ${sets}`;
      }
    }

    const returning = this.returningCols || '*';
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${valueGroups.join(', ')}${conflictSql} RETURNING ${returning}`;
    const res = await this.pool.query(sql, params);
    return this.applyTerminal(res.rows, null);
  }

  private async execDelete(): Promise<PgQueryResult> {
    const table = quoteIdent(this.table);
    const params: unknown[] = [];
    const where = this.buildWhere(params);
    const returning = this.returningCols || '*';
    const sql = `DELETE FROM ${table}${where} RETURNING ${returning}`;
    const res = await this.pool.query(sql, params);
    return this.applyTerminal(res.rows, null);
  }
}

function normalizeRows(values: object | object[] | null): object[] {
  if (!values) return [];
  return Array.isArray(values) ? values : [values];
}

const OR_OPS = ['neq', 'gte', 'lte', 'gt', 'lt', 'like', 'ilike', 'eq', 'is'] as const;

function parseOrSegment(segment: string): OrClause | null {
  // Longest-op-first so "gte" wins over "gt" / "eq"
  for (const op of OR_OPS) {
    const token = `.${op}.`;
    const idx = segment.indexOf(token);
    if (idx <= 0) continue;
    const col = segment.slice(0, idx);
    const raw = segment.slice(idx + token.length);
    if (!IDENT_RE.test(col)) continue;

    if (op === 'is') {
      if (raw === 'null') return { op: 'is', col, value: null };
      if (raw === 'true') return { op: 'is', col, value: true };
      if (raw === 'false') return { op: 'is', col, value: false };
      return { op: 'is', col, value: raw };
    }
    return { op, col, value: raw };
  }
  return null;
}

/** Minimal fake client — only `.from()` is used by consumers. */
export type PgCompatClient = {
  from: (table: string) => QueryBuilder;
};

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly pool: Pool;
  private readonly client: PgCompatClient;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.get<string>('DATABASE_URL')?.trim();

    if (databaseUrl) {
      this.pool = new Pool({ connectionString: databaseUrl });
    } else {
      const host = this.config.get<string>('PGHOST')?.trim() || 'localhost';
      const portRaw = this.config.get<string>('PGPORT')?.trim();
      const user = this.config.get<string>('PGUSER')?.trim();
      const password = this.config.get<string>('PGPASSWORD') ?? '';
      const database = this.config.get<string>('PGDATABASE')?.trim();

      if (!user || !database) {
        throw new Error(
          'DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE requis dans .env',
        );
      }

      this.pool = new Pool({
        host,
        port: portRaw ? Number(portRaw) : 5432,
        user,
        password,
        database,
      });
    }

    this.client = {
      from: (table: string) => new QueryBuilder(this.pool, table),
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Vérification connexion PostgreSQL...');
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('PostgreSQL: CONNECTÉ (SELECT 1 OK).');

      const { error } = await this.client.from('users').select('id').limit(1);
      if (error) {
        const msg = error.message ?? '';
        if (
          msg.includes('users') ||
          msg.includes('does not exist') ||
          error.code === '42P01'
        ) {
          this.logger.warn(
            'Table public.users absente — exécute sql/001-users-for-nest-auth.sql.',
          );
        } else {
          this.logger.warn(`Test table users: ${msg}`);
        }
      } else {
        this.logger.log('Table public.users: accessible via PostgreSQL.');
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.logger.error(`PostgreSQL: erreur réseau — ${m}`);
    }
  }

  /** Same signature as before — consumers call getClient().from(...) */
  getClient(): PgCompatClient {
    return this.client;
  }
}

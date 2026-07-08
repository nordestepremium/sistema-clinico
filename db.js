// Conexão com o banco Postgres na nuvem (Supabase).
// A senha do banco NUNCA fica no código - vem de uma variável de ambiente (.env),
// que você configura no servidor (Render/Railway), não no app do cliente.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ex: postgresql://user:senha@host:5432/postgres
  ssl: { rejectUnauthorized: false } // conexão criptografada (obrigatório na nuvem)
});

// Executa uma query JÁ TRAVADA na clínica do usuário logado.
// Isso ativa a regra de segurança (RLS) do banco: mesmo que o código erre,
// o banco físicamente não deixa ver dados de outra clínica.
async function queryComoClinica(clinicaId, text, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.clinica_id = '${clinicaId}'`);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, queryComoClinica };

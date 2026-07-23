const { createClient } = require('@supabase/supabase-js');

// Cliente com a service_role key — só existe no servidor, nunca no app do cliente.
// Ele ignora RLS e tem acesso total ao Storage, por isso é tão sensível.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUCKET = 'arquivos-clinica';

async function uploadArquivo(caminho, buffer, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, buffer, {
    contentType,
    upsert: true
  });
  if (error) throw new Error(`Erro ao enviar arquivo: ${error.message}`);
  return caminho;
}

async function baixarArquivo(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error) throw new Error(`Erro ao baixar arquivo: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer;
}

async function excluirArquivo(caminho) {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) throw new Error(`Erro ao excluir arquivo: ${error.message}`);
}

async function listarArquivos(pasta) {
  const { data, error } = await supabase.storage.from(BUCKET).list(pasta, {
    sortBy: { column: 'created_at', order: 'desc' }
  });
  if (error) throw new Error(`Erro ao listar arquivos: ${error.message}`);
  return data;
}

module.exports = { uploadArquivo, baixarArquivo, excluirArquivo, listarArquivos };

const jwt = require('jsonwebtoken');

// Toda rota protegida passa por aqui primeiro.
// Confere o token e descobre A QUE CLÍNICA esse usuário pertence -
// é esse valor que trava todas as consultas ao banco (RLS).
function exigirLogin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioId = payload.usuarioId;
    req.clinicaId = payload.clinicaId;
    req.role = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sessão expirada, faça login novamente.' });
  }
}

module.exports = { exigirLogin };

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Banco de dados SQLite
const db = new sqlite3.Database('./votacoes.db');

// Função para obter data/hora do Brasil (UTC-3)
function getBrasilDateTime() {
    const now = new Date();
    // Ajustar para horário de Brasília (UTC-3)
    const brasilOffset = -3;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brasilTime = new Date(utc + (3600000 * brasilOffset));
    return brasilTime;
}

// Criar tabelas
db.serialize(() => {
  // Tabela de votos com nome
  db.run(`
    CREATE TABLE IF NOT EXISTS votos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      voto TEXT NOT NULL,
      ip TEXT NOT NULL,
      data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ip)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);
  
  // Inicializar contagem total se não existir
  db.get("SELECT valor FROM configuracoes WHERE chave = 'total_votos'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO configuracoes (chave, valor) VALUES ('total_votos', '0')");
    }
  });
});

// Middleware para obter IP do usuário
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
};

// Rota para votar (agora com nome)
app.post('/api/votar', (req, res) => {
  const { nome, voto } = req.body;
  const ip = getClientIP(req);
  const dataHoraBrasil = getBrasilDateTime();
  
  console.log('Recebendo voto:', { nome, voto, ip, dataHoraBrasil });
  
  if (!nome || nome.trim().length === 0) {
    return res.status(400).json({ error: 'Por favor, digite seu nome!' });
  }
  
  if (nome.length > 50) {
    return res.status(400).json({ error: 'Nome muito longo! Use até 50 caracteres.' });
  }
  
  if (!voto || (voto !== 'menino' && voto !== 'menina')) {
    return res.status(400).json({ error: 'Voto inválido' });
  }
  
  // Verificar se já votou
  db.get("SELECT * FROM votos WHERE ip = ?", [ip], (err, row) => {
    if (err) {
      console.error('Erro ao verificar IP:', err);
      return res.status(500).json({ error: 'Erro no servidor' });
    }
    
    if (row) {
      return res.status(400).json({ error: `❌ ${row.nome}, você já votou! Apenas um voto por pessoa.` });
    }
    
    // Registrar voto com nome e data/hora do Brasil
    db.run(
      "INSERT INTO votos (nome, voto, ip, data) VALUES (?, ?, ?, ?)", 
      [nome.trim(), voto, ip, dataHoraBrasil.toISOString()], 
      (err) => {
        if (err) {
          console.error('Erro ao inserir voto:', err);
          return res.status(500).json({ error: 'Erro ao registrar voto' });
        }
        
        // Atualizar total
        db.run("UPDATE configuracoes SET valor = CAST(valor AS INTEGER) + 1 WHERE chave = 'total_votos'");
        
        console.log(`Voto registrado: ${nome} votou em ${voto} às ${dataHoraBrasil.toLocaleString('pt-BR')}`);
        res.json({ success: true, message: `🎉 Obrigado ${nome}! Seu voto foi registrado! 🎉` });
      }
    );
  });
});

// Rota para obter resultados
app.get('/api/resultados', (req, res) => {
  db.get("SELECT COUNT(*) as total FROM votos", (err, totalRow) => {
    if (err) {
      return res.status(500).json({ error: 'Erro no servidor' });
    }
    
    db.get("SELECT COUNT(*) as menino FROM votos WHERE voto = 'menino'", (err, meninoRow) => {
      if (err) {
        return res.status(500).json({ error: 'Erro no servidor' });
      }
      
      db.get("SELECT COUNT(*) as menina FROM votos WHERE voto = 'menina'", (err, meninaRow) => {
        if (err) {
          return res.status(500).json({ error: 'Erro no servidor' });
        }
        
        const total = totalRow.total;
        const menino = meninoRow.menino;
        const menina = meninaRow.menina;
        
        res.json({
          total,
          menino,
          menina,
          percentualMenino: total > 0 ? ((menino / total) * 100).toFixed(1) : 0,
          percentualMenina: total > 0 ? ((menina / total) * 100).toFixed(1) : 0
        });
      });
    });
  });
});

// Rota para obter últimos votantes (com horário do Brasil)
app.get('/api/ultimos-votantes', (req, res) => {
  db.all(
    "SELECT nome, voto, data FROM votos ORDER BY data DESC LIMIT 10",
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Erro no servidor' });
      }
      
      const votantes = rows.map(row => {
        // Converter a data para horário do Brasil
        let dataObj = new Date(row.data);
        // Se a data veio sem fuso, ajustar
        if (isNaN(dataObj.getTime())) {
          dataObj = new Date(row.data + 'Z');
        }
        
        return {
          nome: row.nome,
          voto: row.voto,
          data: dataObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        };
      });
      
      res.json(votantes);
    }
  );
});

// Rota para admin - verificar senha
app.post('/api/admin/verificar', (req, res) => {
  const { senha } = req.body;
  if (senha === 'chaadmin2024') {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

// Rota para admin - zerar enquete
app.post('/api/admin/zerar', (req, res) => {
  const { senha } = req.body;
  
  if (senha !== 'chaadmin2024') {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  
  db.run("DELETE FROM votos", (err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao zerar votos' });
    }
    
    db.run("UPDATE configuracoes SET valor = '0' WHERE chave = 'total_votos'");
    res.json({ success: true, message: 'Enquete zerada com sucesso!' });
  });
});

// Rota para admin - obter estatísticas completas
app.get('/api/admin/estatisticas', (req, res) => {
  const { senha } = req.query;
  
  if (senha !== 'chaadmin2024') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  db.all("SELECT * FROM votos ORDER BY data DESC LIMIT 20", (err, votosRecentes) => {
    if (err) {
      return res.status(500).json({ error: 'Erro no servidor' });
    }
    
    db.get("SELECT COUNT(*) as total FROM votos", (err, totalRow) => {
      db.get("SELECT COUNT(*) as menino FROM votos WHERE voto = 'menino'", (err, meninoRow) => {
        db.get("SELECT COUNT(*) as menina FROM votos WHERE voto = 'menina'", (err, meninaRow) => {
          res.json({
            total: totalRow.total,
            menino: meninoRow.menino,
            menina: meninaRow.menina,
            votosRecentes: votosRecentes.map(v => {
              let dataObj = new Date(v.data);
              if (isNaN(dataObj.getTime())) {
                dataObj = new Date(v.data + 'Z');
              }
              return {
                nome: v.nome,
                voto: v.voto,
                ip: v.ip,
                data: dataObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
              };
            })
          });
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`✨ Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`🔐 Painel admin: http://localhost:${PORT}/admin.html`);
  console.log(`🔑 Senha admin: chaadmin2024`);
  console.log(`🕒 Horário do servidor (Brasília): ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
});
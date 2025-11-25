const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Variable global de base de datos
let db;

// Inicializar SQLite
const initDB = async () => {
  try {
    db = await open({
      filename: './conversations.db',
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Base de datos SQLite inicializada");
  } catch (err) {
    console.error("❌ Error al inicializar la base de datos:", err);
  }
};

// -------------------- RUTAS --------------------

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Guardar conversación
app.post("/api/conversations", async (req, res) => {
  const { platform, user_id, user_message, ai_response, metadata } = req.body;

  if (!platform || !user_message || !ai_response) {
    return res.status(400).json({
      error: "Faltan campos requeridos: platform, user_message, ai_response",
    });
  }

  try {
    const result = await db.run(
      `INSERT INTO conversations (platform, user_id, user_message, ai_response, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        platform,
        user_id || null,
        user_message,
        ai_response,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    const newRecord = await db.get("SELECT * FROM conversations WHERE id = ?", [
      result.lastID,
    ]);

    res.status(201).json({ success: true, data: newRecord });
  } catch (err) {
    console.error("Error al guardar conversación:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Obtener todas con paginación y filtros
app.get("/api/conversations", async (req, res) => {
  const { page = 1, limit = 50, platform, user_id } = req.query;
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (platform) {
    where.push("platform = ?");
    params.push(platform);
  }

  if (user_id) {
    where.push("user_id = ?");
    params.push(user_id);
  }

  const whereClause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";

  try {
    const conversations = await db.all(
      `SELECT * FROM conversations ${whereClause} 
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalCount = await db.get(
      `SELECT COUNT(*) as count FROM conversations ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: conversations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit),
      },
    });
  } catch (err) {
    console.error("Error al obtener conversaciones:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Obtener una conversación
app.get("/api/conversations/:id", async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM conversations WHERE id = ?", [
      req.params.id,
    ]);

    if (!row)
      return res.status(404).json({ error: "Conversación no encontrada" });

    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Eliminar conversación
app.delete("/api/conversations/:id", async (req, res) => {
  try {
    const result = await db.run(
      "DELETE FROM conversations WHERE id = ?",
      req.params.id
    );

    if (result.changes === 0)
      return res.status(404).json({ error: "Conversación no encontrada" });

    res.json({ success: true, message: "Eliminada correctamente" });
  } catch (err) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Estadísticas
app.get("/api/stats", async (req, res) => {
  try {
    const total = await db.get("SELECT COUNT(*) as total FROM conversations");

    const byPlatform = await db.all(
      "SELECT platform, COUNT(*) as count FROM conversations GROUP BY platform"
    );

    const daily = await db.all(
      "SELECT DATE(created_at) as date, COUNT(*) as count FROM conversations GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30"
    );

    res.json({
      success: true,
      data: {
        total: total.total,
        by_platform: byPlatform,
        daily,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// Iniciar servidor
const start = async () => {
  await initDB();
  app.listen(port, () => {
    console.log(`🚀 API corriendo en http://localhost:${port}`);
  });
};

start();

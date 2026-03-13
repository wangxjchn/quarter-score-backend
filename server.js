const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// --- 内存存储 ---
let scores = [];
let nextId = 1;

// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// GET /api/scores — 获取所有记录
app.get("/api/scores", (req, res) => {
  res.json(scores);
});

// POST /api/scores — 创建记录
app.post("/api/scores", (req, res) => {
  const { name, q1 = 0, q2 = 0, q3 = 0, q4 = 0 } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const nq1 = Number(q1), nq2 = Number(q2), nq3 = Number(q3), nq4 = Number(q4);
  const record = {
    id: nextId++,
    name: name.trim(),
    q1: nq1, q2: nq2, q3: nq3, q4: nq4,
    total: nq1 + nq2 + nq3 + nq4,
    createdAt: new Date().toISOString()
  };
  scores.push(record);
  res.status(201).json(record);
});

// GET /api/scores/:id — 获取单条记录
app.get("/api/scores/:id", (req, res) => {
  const score = scores.find(s => s.id === Number(req.params.id));
  if (!score) return res.status(404).json({ error: "Not found" });
  res.json(score);
});

// PUT /api/scores/:id — 更新记录
app.put("/api/scores/:id", (req, res) => {
  const idx = scores.findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const { name, q1, q2, q3, q4 } = req.body;
  const updated = { ...scores[idx] };
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name must be a non-empty string" });
    }
    updated.name = name.trim();
  }
  if (q1 !== undefined) updated.q1 = Number(q1);
  if (q2 !== undefined) updated.q2 = Number(q2);
  if (q3 !== undefined) updated.q3 = Number(q3);
  if (q4 !== undefined) updated.q4 = Number(q4);
  updated.total = updated.q1 + updated.q2 + updated.q3 + updated.q4;
  scores[idx] = updated;
  res.json(updated);
});

// DELETE /api/scores/:id — 删除记录
app.delete("/api/scores/:id", (req, res) => {
  const idx = scores.findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  scores.splice(idx, 1);
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

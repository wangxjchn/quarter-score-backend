const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

// 健康检查接口
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// 根路径
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Render 要求监听 process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

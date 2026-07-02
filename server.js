const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log("🚀 VVD CPA запущен");
    console.log(`http://localhost:${PORT}`);
});

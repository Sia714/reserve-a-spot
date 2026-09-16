import app from "./app.js";
import pool from "./db.js";

const PORT = 5000;

pool.query("SELECT 1")
  .then(() => {
    console.log("MySQL connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error: unknown) => {
    console.error("MySQL connection failed:", error);
  });
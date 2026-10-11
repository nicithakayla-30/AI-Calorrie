require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const db = require("../database/db");

const {
  calculateBMR,
  calculateTDEE,
  calculateDailyCalorieTarget
} = require("./calorieCalculator");

const { analyzeFoodImage } = require("./aiService");

const {
  getSession,
  startOnboarding,
  processOnboarding,
  deleteSession
} = require("./onboardingService");

const app = express();

// Penting: Render menentukan PORT saat aplikasi online.
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Menampilkan website dari folder public.
app.use(express.static(path.join(__dirname, "../public")));


// ============================================================
// FILE UPLOAD
// ============================================================

const upload = multer({
  dest: path.join(__dirname, "../uploads"),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});


// ============================================================
// HOME PAGE
// ============================================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/index.html")
  );
});


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "AI Calorie Tracker API is running"
  });
});


// ============================================================
// CREATE USER
// ============================================================

app.post("/api/users", (req, res) => {
  try {
    const {
      whatsapp_id,
      name,
      gender,
      age,
      height,
      current_weight,
      target_weight,
      activity_level,
      goal
    } = req.body;

    if (
      !whatsapp_id ||
      !name ||
      !gender ||
      !age ||
      !height ||
      !current_weight ||
      !target_weight ||
      !activity_level ||
      !goal
    ) {
      return res.status(400).json({
        error: "All user data is required"
      });
    }

    const bmr = calculateBMR({
      gender,
      age,
      weight: current_weight,
      height
    });

    const tdee = calculateTDEE(
      bmr,
      activity_level
    );

    const dailyCalorieTarget =
      calculateDailyCalorieTarget(
        tdee,
        goal
      );

    const result = db.prepare(`
      INSERT INTO users (
        whatsapp_id,
        name,
        gender,
        age,
        height,
        current_weight,
        target_weight,
        activity_level,
        goal,
        bmr,
        tdee,
        daily_calorie_target
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      whatsapp_id,
      name,
      gender,
      age,
      height,
      current_weight,
      target_weight,
      activity_level,
      goal,
      bmr,
      tdee,
      dailyCalorieTarget
    );

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: "User created successfully",
      user
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create user"
    });
  }
});


// ============================================================
// GET USER PROFILE
// ============================================================

app.get("/api/users/:whatsapp_id", (req, res) => {
  try {
    const user = db
      .prepare(`
        SELECT *
        FROM users
        WHERE whatsapp_id = ?
      `)
      .get(req.params.whatsapp_id);

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.json({ user });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to get user"
    });
  }
});


// ============================================================
// CREATE FOOD LOG
// ============================================================

app.post("/api/food-logs", (req, res) => {
  try {
    const {
      whatsapp_id,
      food_name,
      calories,
      protein,
      carbs,
      fat,
      portion
    } = req.body;

    if (
      !whatsapp_id ||
      !food_name ||
      calories === undefined
    ) {
      return res.status(400).json({
        error:
          "whatsapp_id, food_name, and calories are required"
      });
    }

    const user = db
      .prepare(`
        SELECT id
        FROM users
        WHERE whatsapp_id = ?
      `)
      .get(whatsapp_id);

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const result = db.prepare(`
      INSERT INTO food_logs (
        user_id,
        food_name,
        calories,
        protein,
        carbs,
        fat,
        portion
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      food_name,
      calories,
      protein || 0,
      carbs || 0,
      fat || 0,
      portion || null
    );

    const food = db
      .prepare(`
        SELECT *
        FROM food_logs
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: "Food logged successfully",
      food
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to log food"
    });
  }
});


// ============================================================
// GET TODAY'S FOOD LOGS
// ============================================================

app.get(
  "/api/food-logs/:whatsapp_id/today",
  (req, res) => {
    try {
      const user = db
        .prepare(`
          SELECT
            id,
            name,
            daily_calorie_target
          FROM users
          WHERE whatsapp_id = ?
        `)
        .get(req.params.whatsapp_id);

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      const foods = db.prepare(`
        SELECT
          id,
          food_name,
          calories,
          protein,
          carbs,
          fat,
          portion,
          eaten_at
        FROM food_logs
        WHERE user_id = ?
          AND date(eaten_at) = date('now', 'localtime')
        ORDER BY eaten_at ASC
      `).all(user.id);

      const totalCalories = foods.reduce(
        (total, food) => total + food.calories,
        0
      );

      res.json({
        user: {
          name: user.name,
          daily_calorie_target:
            user.daily_calorie_target
        },
        foods,
        summary: {
          total_calories: totalCalories,
          remaining_calories:
            user.daily_calorie_target - totalCalories
        }
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Failed to get food logs"
      });
    }
  }
);


// ============================================================
// ANALYZE FOOD IMAGE + CHATBOT REPLY
// ============================================================

app.post(
  "/api/analyze-food-chat",
  upload.single("image"),
  async (req, res) => {
    let imagePath = null;

    try {
      const { whatsapp_id } = req.body;

      if (!whatsapp_id) {
        return res.status(400).json({
          error: "whatsapp_id is required"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Image file is required"
        });
      }

      imagePath = req.file.path;

      const user = db
        .prepare(`
          SELECT
            id,
            name,
            daily_calorie_target
          FROM users
          WHERE whatsapp_id = ?
        `)
        .get(whatsapp_id);

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      const analysis = await analyzeFoodImage(
        imagePath,
        req.file.mimetype
      );

      const insertedFoods = [];

      const insertFood = db.prepare(`
        INSERT INTO food_logs (
          user_id,
          food_name,
          calories,
          protein,
          carbs,
          fat,
          portion
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const saveFoods = db.transaction((foods) => {
        for (const food of foods) {
          const result = insertFood.run(
            user.id,
            food.food_name,
            Number(food.calories) || 0,
            Number(food.protein) || 0,
            Number(food.carbs) || 0,
            Number(food.fat) || 0,
            food.portion || null
          );

          insertedFoods.push(
            db.prepare(`
              SELECT *
              FROM food_logs
              WHERE id = ?
            `).get(result.lastInsertRowid)
          );
        }
      });

      saveFoods(analysis.foods || []);

      const today = db.prepare(`
        SELECT
          COALESCE(SUM(calories), 0)
          AS total_calories
        FROM food_logs
        WHERE user_id = ?
          AND date(eaten_at) = date('now', 'localtime')
      `).get(user.id);

      const totalCalories = today.total_calories;

      const remainingCalories =
        user.daily_calorie_target - totalCalories;

      let reply =
        "🍽️ Aku berhasil menganalisis makanan kamu!\n\n";

      if (insertedFoods.length > 0) {
        insertedFoods.forEach((food) => {
          reply += `🍲 ${food.food_name}\n`;
          reply += `⚖️ Porsi: ${
            food.portion || "Tidak diketahui"
          }\n`;
          reply += `🔥 Estimasi: ${Math.round(
            food.calories
          )} kcal\n\n`;
        });
      } else {
        reply +=
          "Aku belum bisa mengenali makanan pada foto ini dengan cukup yakin 😅\n\n";
      }

      reply += "📊 Rekap hari ini\n";

      reply += `🔥 Total: ${Math.round(
        totalCalories
      )} kcal\n`;

      reply += `🎯 Target: ${Math.round(
        user.daily_calorie_target
      )} kcal\n`;

      if (remainingCalories >= 0) {
        reply += `✅ Sisa: ${Math.round(
          remainingCalories
        )} kcal`;
      } else {
        reply += `⚠️ Melebihi target sekitar ${Math.round(
          Math.abs(remainingCalories)
        )} kcal`;
      }

      res.json({
        reply,
        analysis,
        saved_foods: insertedFoods,
        summary: {
          total_calories_today: totalCalories,
          daily_calorie_target:
            user.daily_calorie_target,
          remaining_calories: remainingCalories
        }
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Failed to analyze food image",
        details: error.message
      });

    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }
);


// ============================================================
// CHATBOT + ONBOARDING
// ============================================================

app.post("/api/chat", (req, res) => {
  try {
    const {
      whatsapp_id,
      message
    } = req.body;

    if (!whatsapp_id || !message) {
      return res.status(400).json({
        error:
          "whatsapp_id and message are required"
      });
    }

    const text = message
      .toLowerCase()
      .trim();


    // RESET ONBOARDING

    if (text === "reset") {
      deleteSession(whatsapp_id);

      return res.json({
        reply:
          "Data sementara sudah di-reset. Ketik 'halo' untuk mulai lagi."
      });
    }


    // CHECK ONBOARDING

    const session = getSession(whatsapp_id);

    if (session) {
      return res.json({
        reply: processOnboarding(
          whatsapp_id,
          message
        )
      });
    }


    // FIND EXISTING USER

    const user = db
      .prepare(`
        SELECT *
        FROM users
        WHERE whatsapp_id = ?
      `)
      .get(whatsapp_id);


    // NEW USER

    if (!user) {
      return res.json({
        reply: startOnboarding(whatsapp_id)
      });
    }


    // PROFILE

    if (
      text === "profil" ||
      text.includes("data saya") ||
      text.includes("data aku")
    ) {
      return res.json({
        reply: `👤 Profil ${user.name}

⚖️ Berat sekarang: ${user.current_weight} kg
🎯 Target berat: ${user.target_weight} kg
📏 Tinggi: ${user.height} cm

🔥 BMR: ${Math.round(user.bmr)} kcal
⚡ TDEE: ${Math.round(user.tdee)} kcal
🎯 Target harian: ${Math.round(
          user.daily_calorie_target
        )} kcal`
      });
    }


    // CALORIE TARGET

    if (
      text.includes("target kalori") ||
      text.includes("target harian")
    ) {
      return res.json({
        reply: `🎯 Target kalori kamu sekitar ${Math.round(
          user.daily_calorie_target
        )} kcal/hari.`
      });
    }


    // REMAINING CALORIES

    if (
      text.includes("sisa kalori") ||
      text.includes("kalori tersisa") ||
      text.includes("masih punya berapa kalori")
    ) {
      const result = db.prepare(`
        SELECT
          COALESCE(SUM(calories), 0)
          AS total_calories
        FROM food_logs
        WHERE user_id = ?
          AND date(eaten_at) = date('now', 'localtime')
      `).get(user.id);

      const total = result.total_calories;

      const remaining =
        user.daily_calorie_target - total;

      return res.json({
        reply: `📊 Kalori hari ini

🔥 Dikonsumsi: ${Math.round(total)} kcal
🎯 Target: ${Math.round(
          user.daily_calorie_target
        )} kcal
✅ Sisa: ${Math.round(
          remaining
        )} kcal`
      });
    }


    // DAILY SUMMARY

    if (
      text.includes("rekap") ||
      text.includes("kalori hari ini") ||
      text.includes("makan hari ini")
    ) {
      const foods = db.prepare(`
        SELECT
          food_name,
          calories
        FROM food_logs
        WHERE user_id = ?
          AND date(eaten_at) = date('now', 'localtime')
        ORDER BY eaten_at ASC
      `).all(user.id);

      const total = foods.reduce(
        (sum, food) => sum + food.calories,
        0
      );

      let reply = "📊 Rekap hari ini\n\n";

      if (foods.length === 0) {
        reply +=
          "Belum ada makanan yang dicatat.\n\n";
      } else {
        foods.forEach((food) => {
          reply += `🍽️ ${food.food_name} — ${Math.round(
            food.calories
          )} kcal\n`;
        });

        reply += "\n";
      }

      reply += `🔥 Total: ${Math.round(total)} kcal\n`;

      reply += `🎯 Target: ${Math.round(
        user.daily_calorie_target
      )} kcal\n`;

      reply += `✅ Sisa: ${Math.round(
        user.daily_calorie_target - total
      )} kcal`;

      return res.json({ reply });
    }


    // MENU

    if (
      text === "halo" ||
      text === "hai" ||
      text === "menu" ||
      text === "help"
    ) {
      return res.json({
        reply: `Halo ${user.name}! 👋

Aku AI Calorie Tracker kamu.

Kamu bisa bilang:

👤 "profil"
🎯 "target kalori"
🔥 "sisa kalori"
📊 "rekap hari ini"

Atau kirim 📸 foto makanan.`
      });
    }


    // DEFAULT

    return res.json({
      reply:
        "Aku belum mengerti 😅 Ketik 'menu' untuk melihat fitur."
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Chatbot failed"
    });
  }
});


// ============================================================
// ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
  console.error(error);

  res.status(400).json({
    error: error.message || "Request failed"
  });
});


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server running at http://localhost:${PORT}`
  );
});
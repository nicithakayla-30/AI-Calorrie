const db = require("../database/db");

function getSession(whatsappId) {
  return db
    .prepare(`
      SELECT *
      FROM onboarding_sessions
      WHERE whatsapp_id = ?
    `)
    .get(whatsappId);
}

function saveSession(whatsappId, step, data) {
  db.prepare(`
    INSERT INTO onboarding_sessions (
      whatsapp_id,
      step,
      data
    )
    VALUES (?, ?, ?)
    ON CONFLICT(whatsapp_id)
    DO UPDATE SET
      step = excluded.step,
      data = excluded.data
  `).run(
    whatsappId,
    step,
    JSON.stringify(data)
  );
}

function deleteSession(whatsappId) {
  db.prepare(`
    DELETE FROM onboarding_sessions
    WHERE whatsapp_id = ?
  `).run(whatsappId);
}

function normalizeGender(text) {
  const value = text.toLowerCase().trim();

  if (
    value === "1" ||
    value.includes("laki") ||
    value.includes("pria") ||
    value === "male"
  ) {
    return "male";
  }

  if (
    value === "2" ||
    value.includes("perempuan") ||
    value.includes("wanita") ||
    value.includes("cewek") ||
    value === "female"
  ) {
    return "female";
  }

  return null;
}

function normalizeActivity(text) {
  const value = text.toLowerCase().trim();

  if (value === "1" || value.includes("jarang")) {
    return "sedentary";
  }

  if (value === "2" || value.includes("ringan")) {
    return "light";
  }

  if (value === "3" || value.includes("sedang")) {
    return "moderate";
  }

  if (
    value === "4" ||
    value.includes("sangat aktif") ||
    value.includes("very active")
  ) {
    return "very_active";
  }

  return null;
}

function normalizeGoal(text) {
  const value = text.toLowerCase().trim();

  if (
    value === "1" ||
    value.includes("turun") ||
    value.includes("menurunkan") ||
    value === "lose"
  ) {
    return "lose";
  }

  if (
    value === "2" ||
    value.includes("tetap") ||
    value.includes("mempertahankan") ||
    value === "maintain"
  ) {
    return "maintain";
  }

  if (
    value === "3" ||
    value.includes("naik") ||
    value.includes("menaikkan") ||
    value === "gain"
  ) {
    return "gain";
  }

  return null;
}

function startOnboarding(whatsappId) {
  saveSession(whatsappId, "name", {});

  return `Halo! 👋

Aku AI Calorie Tracker kamu.

Sebelum mulai, aku perlu beberapa data dulu ya.

📝 Siapa nama kamu?`;
}

function processOnboarding(whatsappId, message) {
  const session = getSession(whatsappId);

  if (!session) {
    return null;
  }

  let data = {};

  try {
    data = JSON.parse(session.data || "{}");
  } catch {
    data = {};
  }

  const text = message.trim();

  if (session.step === "name") {
    if (text.length < 2) {
      return "Nama kamu terlalu pendek 😅 Coba masukkan nama yang benar.";
    }

    data.name = text;

    saveSession(whatsappId, "gender", data);

    return `Nice to meet you, ${data.name}! 👋

Jenis kelamin kamu?

1. Laki-laki
2. Perempuan`;
  }

  if (session.step === "gender") {
    const gender = normalizeGender(text);

    if (!gender) {
      return `Pilih salah satu ya:

1. Laki-laki
2. Perempuan`;
    }

    data.gender = gender;

    saveSession(whatsappId, "age", data);

    return "Berapa umur kamu? 🎂\n\nContoh: 20";
  }

  if (session.step === "age") {
    const age = Number(text);

    if (!Number.isInteger(age) || age < 10 || age > 100) {
      return "Masukkan umur yang valid ya 😊\nContoh: 20";
    }

    data.age = age;

    saveSession(whatsappId, "height", data);

    return "Berapa tinggi badan kamu dalam cm? 📏\n\nContoh: 160";
  }

  if (session.step === "height") {
    const height = Number(text);

    if (!Number.isFinite(height) || height < 100 || height > 250) {
      return "Masukkan tinggi yang valid ya 😊\nContoh: 160";
    }

    data.height = height;

    saveSession(whatsappId, "current_weight", data);

    return "Berapa berat badan kamu sekarang dalam kg? ⚖️\n\nContoh: 70";
  }

  if (session.step === "current_weight") {
    const currentWeight = Number(text);

    if (
      !Number.isFinite(currentWeight) ||
      currentWeight < 20 ||
      currentWeight > 300
    ) {
      return "Masukkan berat badan yang valid ya 😊\nContoh: 70";
    }

    data.current_weight = currentWeight;

    saveSession(whatsappId, "target_weight", data);

    return "Berapa target berat badan kamu? 🎯\n\nContoh: 55";
  }

  if (session.step === "target_weight") {
    const targetWeight = Number(text);

    if (
      !Number.isFinite(targetWeight) ||
      targetWeight < 20 ||
      targetWeight > 300
    ) {
      return "Masukkan target berat yang valid ya 😊\nContoh: 55";
    }

    data.target_weight = targetWeight;

    saveSession(whatsappId, "activity_level", data);

    return `Seberapa aktif kamu sehari-hari? 🏃

1. Jarang olahraga
2. Aktivitas ringan
3. Aktivitas sedang
4. Sangat aktif`;
  }

  if (session.step === "activity_level") {
    const activity = normalizeActivity(text);

    if (!activity) {
      return `Pilih salah satu ya:

1. Jarang olahraga
2. Aktivitas ringan
3. Aktivitas sedang
4. Sangat aktif`;
    }

    data.activity_level = activity;

    saveSession(whatsappId, "goal", data);

    return `Apa tujuan kamu? 🎯

1. Menurunkan berat badan
2. Mempertahankan berat badan
3. Menaikkan berat badan`;
  }

  if (session.step === "goal") {
    const goal = normalizeGoal(text);

    if (!goal) {
      return `Pilih salah satu ya:

1. Menurunkan berat badan
2. Mempertahankan berat badan
3. Menaikkan berat badan`;
    }

    data.goal = goal;

    return finishOnboarding(whatsappId, data);
  }

  return "Terjadi masalah dalam proses pendaftaran. Ketik 'reset' lalu coba lagi.";
}

function finishOnboarding(whatsappId, data) {
  try {
    const {
      calculateBMR,
      calculateTDEE,
      calculateDailyCalorieTarget
    } = require("./calorieCalculator");

    const existingUser = db
      .prepare(`
        SELECT id
        FROM users
        WHERE whatsapp_id = ?
      `)
      .get(whatsappId);

    if (existingUser) {
      deleteSession(whatsappId);

      return "Nomor ini sudah terdaftar sebagai user 😊";
    }

    const bmr = calculateBMR({
      gender: data.gender,
      age: data.age,
      weight: data.current_weight,
      height: data.height
    });

    const tdee = calculateTDEE(
      bmr,
      data.activity_level
    );

    const dailyCalorieTarget =
      calculateDailyCalorieTarget(
        tdee,
        data.goal
      );

    db.prepare(`
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
      whatsappId,
      data.name,
      data.gender,
      data.age,
      data.height,
      data.current_weight,
      data.target_weight,
      data.activity_level,
      data.goal,
      bmr,
      tdee,
      dailyCalorieTarget
    );

    deleteSession(whatsappId);

    return `🎉 Pendaftaran selesai, ${data.name}!

📋 Profil kamu:

⚖️ Berat sekarang: ${data.current_weight} kg
🎯 Target berat: ${data.target_weight} kg
📏 Tinggi: ${data.height} cm

🔥 BMR: ${Math.round(bmr)} kcal
⚡ TDEE: ${Math.round(tdee)} kcal
🎯 Target kalori: ${Math.round(
      dailyCalorieTarget
    )} kcal/hari

📸 Sekarang kamu sudah bisa mengirim foto makanan untuk dianalisis.

Ketik "menu" untuk melihat fitur lainnya.`;
  } catch (error) {
    console.error(error);

    return "Maaf, terjadi kesalahan saat menyimpan profil 😭";
  }
}

module.exports = {
  getSession,
  startOnboarding,
  processOnboarding,
  deleteSession
};
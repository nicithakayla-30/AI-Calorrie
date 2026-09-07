function calculateBMR({ gender, age, weight, height }) {
  if (gender.toLowerCase() === "male") {
    return (10 * weight) + (6.25 * height) - (5 * age) + 5;
  }

  return (10 * weight) + (6.25 * height) - (5 * age) - 161;
}

function calculateTDEE(bmr, activityLevel) {
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725
  };

  const multiplier = activityMultipliers[activityLevel];

  if (!multiplier) {
    throw new Error("Invalid activity level");
  }

  return bmr * multiplier;
}

function calculateDailyCalorieTarget(tdee, goal) {
  if (goal === "lose") {
    return tdee - 500;
  }

  if (goal === "gain") {
    return tdee + 300;
  }

  return tdee;
}

module.exports = {
  calculateBMR,
  calculateTDEE,
  calculateDailyCalorieTarget
};
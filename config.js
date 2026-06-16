window.TR_CONFIG = Object.freeze({
  phases: [
    { name: "APPROACH", duration: 18, width: 1, speed: 780 },
    { name: "THE TRENCH", duration: 24, width: .8, speed: 900 },
    { name: "CORE ACCESS", duration: 20, width: .62, speed: 1020 },
    { name: "CORE GUARDIAN", duration: 99, width: .72, speed: 760 },
    { name: "ESCAPE", duration: 18, width: .58, speed: 1250 }
  ],
  ships: {
    specter: {
      name: "SPECTER", role: "FAST STRIKE", hull: 72, shield: 76,
      move: 1.22, fireRate: .78, damageTaken: 1.18, speed: 1.12, boostDrain: 1.12,
      color: "#a846ff", laser: "#d36cff"
    },
    vanguard: {
      name: "VANGUARD", role: "BALANCED ASSAULT", hull: 100, shield: 100,
      move: 1, fireRate: 1, damageTaken: 1, speed: 1, boostDrain: 1,
      color: "#36f4ff", laser: "#36f4ff"
    },
    bulwark: {
      name: "BULWARK", role: "HEAVY DEFENSE", hull: 135, shield: 130,
      move: .78, fireRate: 1.28, damageTaken: .72, speed: .9, boostDrain: .82,
      color: "#ff9b42", laser: "#ffb14a"
    }
  },
  difficulties: {
    cadet: {
      name: "CADET", score: .8, damage: .72, density: .8,
      projectileSpeed: .82, bossFire: 1.18
    },
    ace: {
      name: "ACE", score: 1, damage: 1, density: 1,
      projectileSpeed: 1, bossFire: 1
    },
    nightmare: {
      name: "NIGHTMARE", score: 1.6, damage: 1.32, density: 1.35,
      projectileSpeed: 1.22, bossFire: .9
    }
  }
});

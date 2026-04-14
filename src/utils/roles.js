// ─── ROLE HELPERS ─────────────────────────────────────────────────────────────

export const roleKey = (role) => String(role || "")
  .trim()
  .toLowerCase()
  .replace(/ı/g, "i")
  .replace(/ğ/g, "g")
  .replace(/ü/g, "u")
  .replace(/ş/g, "s")
  .replace(/ö/g, "o")
  .replace(/ç/g, "c");

export const normalizeRole = (role) => {
  const r = String(role || "").trim().toLowerCase();
  if (["admin", "başkan", "yonetici", "yönetici"].includes(r)) return "Başkan";
  return role;
};

// Level 0: Başkan + Teknik Yönetici + Başkan Yardımcısı (tam yetki)
//          Denetmen + Denetmen Yardımcısı (sadece denetim)
// Level 1: Departman Yöneticisi + Departman Yardımcısı (kendi departmanı)
// Level 2: Departman Üyesi / Üye (okuma)
export const hasSuperRole = r => ["admin", "baskan", "teknik yonetici", "yardimci", "baskan yardimcisi"].includes(roleKey(r));
export const hasAdminRole = hasSuperRole; // backward-compat alias

export const roleLevel = r => {
  const key = roleKey(r);
  if (["admin", "baskan", "teknik yonetici", "yardimci", "baskan yardimcisi", "denetmen", "denetmen yardimcisi"].includes(key)) return 0;
  if (["departman yoneticisi", "departman yardimcisi"].includes(key)) return 1;
  return 2; // Üye, Departman Üyesi
};

export const isDenetmenRole = r => ["denetmen", "denetmen yardimcisi"].includes(roleKey(r));

export const displayRole = r => {
  const key = roleKey(r);
  if (key === "teknik yonetici") return "Teknik Yönetici";
  if (key === "baskan yardimcisi" || key === "yardimci") return "Başkan Yardımcısı";
  if (key === "departman yardimcisi") return "Departman Yardımcısı";
  if (key === "denetmen yardimcisi") return "Denetmen Yardımcısı";
  if (hasSuperRole(r)) return "Başkan";
  if (key === "departman yoneticisi") return "Departman Yöneticisi";
  if (key === "denetmen") return "Denetmen";
  return "Departman Üyesi";
};

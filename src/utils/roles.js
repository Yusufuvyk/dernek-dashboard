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

// Level 0: Başkan + Teknik Yönetici + Yardımcı (tam yetki)
// Level 1: Departman Yöneticisi (sadece kendi departmanı)
// Level 2: Departman Üyesi / Üye (okuma)
// Level 3: Denetmen (sadece denetim paneli)
export const hasSuperRole = r => ["admin", "baskan", "teknik yoneticisi", "yardimci"].includes(roleKey(r));
export const hasAdminRole = hasSuperRole; // backward-compat alias

export const roleLevel = r => {
  const key = roleKey(r);
  if (["admin", "baskan", "teknik yoneticisi", "yardimci", "denetmen"].includes(key)) return 0;
  if (key === "departman yoneticisi") return 1;
  return 2; // Üye, Departman Üyesi
};

export const isDenetmenRole = r => roleKey(r) === "denetmen";

export const displayRole = r => {
  const key = roleKey(r);
  if (key === "teknik yoneticisi") return "Teknik Yönetici";
  if (key === "yardimci") return "Yardımcı";
  if (hasSuperRole(r)) return "Başkan";
  if (key === "departman yoneticisi") return "Departman Yöneticisi";
  if (key === "denetmen") return "Denetmen";
  return "Departman Üyesi";
};

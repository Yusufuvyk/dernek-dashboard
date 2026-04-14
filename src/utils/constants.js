// ─── CONSTANTS ────────────────────────────────────────────────────────────────
export const AVATAR_COLORS = ["#1F2937", "#374151", "#4B5563", "#6B7280", "#0F766E", "#8A6A16"];
export const avatarColor = id => AVATAR_COLORS[(id?.charCodeAt(id.length - 1) || 0) % AVATAR_COLORS.length];
export const ROMA_RED = "#8B0000";
export const STOIC_NAVY = "#1B1D22";
export const MARBLE = "#FFFFFF";
export const GOLD = "#B98B2C";
export const FONT_SERIF = "'Cinzel','Cormorant Garamond','Times New Roman',serif";

export const STATUS = {
  "tamamlandı": { color: "#30D158", label: "Tamamlandı" },
  "devam": { color: GOLD, label: "Devam Ediyor" },
  "gecikmeli": { color: ROMA_RED, label: "Gecikmeli" },
  "planlandı": { color: STOIC_NAVY, label: "Planlandı" },
  "yapıldı": { color: "#30D158", label: "Yapıldı" },
  "bekliyor": { color: GOLD, label: "Bekliyor" },
  "yanıtlandı": { color: "#30D158", label: "Yanıtlandı" },
  "kapatıldı": { color: "#8A8A8E", label: "Kapatıldı" },
};

export const MSG_TYPE = {
  soru: { color: STOIC_NAVY, label: "Soru" },
  destek: { color: GOLD, label: "Destek" },
  bilgi: { color: "#30D158", label: "Bilgi" },
  dosya: { color: ROMA_RED, label: "Dosya İsteği" },
};

export const ROLE_COLOR = {
  "Admin": ROMA_RED,
  "Başkan": ROMA_RED,
  "Teknik Yönetici": ROMA_RED,
  "Departman Yöneticisi": STOIC_NAVY,
  "Departman Üyesi": STOIC_NAVY,
  "Üye": "#30D158",
  "Genel Üye": "#30D158",
  "Denetmen": GOLD,
  "Yardımcı": "#A855F7",
  "Teknik Yönetici Yardımcısı": "#DC2626",
  "Başkan Yardımcısı": "#A855F7",
  "Departman Yardımcısı": "#7C3AED",
  "Denetmen Yardımcısı": "#C084FC",
};

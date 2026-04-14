import { AVATAR_COLORS, STOIC_NAVY, ROMA_RED, GOLD } from "./constants";

// ─── STYLES ───────────────────────────────────────────────────────────────────
export const avatarColor = id => AVATAR_COLORS[(id?.charCodeAt(id.length - 1) || 0) % AVATAR_COLORS.length];

export const S = {
  app: { display: "flex", height: "100vh", fontFamily: "'Manrope','DM Sans','Segoe UI',sans-serif", background: "#ECEDEF", color: "#171717", overflow: "hidden", padding: 10, boxSizing: "border-box" },
  sidebar: { width: 210, background: "#F6F7F8", border: "1px solid #DFE2E6", borderRadius: 14, display: "flex", flexDirection: "column", padding: "0 0 12px", flexShrink: 0, boxShadow: "0 1px 2px rgba(16,24,40,.04)" },
  nav: { flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 },
  navItem: a => ({ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", color: a ? "#101828" : "#5D6673", background: a ? "#DDEBF8" : "transparent", border: a ? "1px solid #CFE2F5" : "1px solid transparent", fontSize: 12.5, fontWeight: a ? 700 : 600, userSelect: "none" }),
  navSection: { fontSize: 10, fontWeight: 700, color: "#98A2B3", textTransform: "uppercase", letterSpacing: 1, padding: "12px 10px 4px" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", marginLeft: 10, background: "#F3F4F6", border: "1px solid #DFE2E6", borderRadius: 18, boxShadow: "0 8px 24px rgba(16,24,40,.05)" },
  topbar: { background: "transparent", borderBottom: "1px solid #E3E6EA", padding: "0 22px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  content: { flex: 1, overflow: "auto", padding: "16px" },
  card: { background: "#FFFFFF", borderRadius: 12, padding: "16px 18px", border: "1px solid #E7E8EA", boxShadow: "0 1px 2px rgba(16,24,40,.04)" },
  cardTitle: { fontSize: 11, fontWeight: 800, color: "#2A2927", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.85 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 },
  stat: c => ({ background: "#FFFFFF", borderRadius: 14, padding: "16px 18px", color: "#191918", border: "1px solid #E5E5E5", boxShadow: "0 1px 0 rgba(0,0,0,.02)", borderTop: `3px solid ${c}` }),
  btn: (v = "primary") => {
    const b = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 650, cursor: "pointer", border: "none", whiteSpace: "nowrap", fontFamily: "inherit" };
    return v === "primary" ? { ...b, background: ROMA_RED, color: "#fff", border: "1px solid #580000" }
      : v === "ghost" ? { ...b, background: "#fff", color: STOIC_NAVY, border: "1px solid #d2d0cb" }
      : v === "green" ? { ...b, background: "#1F8F5F", color: "#fff" }
      : v === "blue" ? { ...b, background: STOIC_NAVY, color: "#fff", border: "1px solid #0f1013" }
      : v === "danger" ? { ...b, background: "#2B2B2B", color: "#fff" }
      : b;
  },
  label: { fontSize: 12, fontWeight: 650, color: "#4F4D49", display: "block", marginBottom: 5 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #DADADA", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FFFFFF", fontFamily: "inherit" },
  select: { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #DADADA", fontSize: 13, outline: "none", background: "#FFFFFF", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #DADADA", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", background: "#FFFFFF", minHeight: 72, fontFamily: "inherit" },
  formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "9px 13px", fontSize: 10.5, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #ECEEF2" },
  td: { padding: "12px 13px", fontSize: 12.5, borderBottom: "1px solid #F0F2F5", verticalAlign: "middle", color: "#1D2939" },
  badge: c => ({ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c + "22", color: c }),
  pb: { height: 5, background: "#EAEAEA", borderRadius: 4, overflow: "hidden" },
  pbF: p => ({ height: "100%", width: `${p}%`, background: p === 100 ? "#1F8F5F" : p < 30 ? ROMA_RED : GOLD, borderRadius: 4 }),
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, padding: 26, width: "100%", maxWidth: 540, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.22)" },
  flex: (g = 0) => ({ display: "flex", alignItems: "center", gap: g }),
  flexBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  tag: { display: "inline-block", padding: "3px 8px", borderRadius: 6, fontSize: 11, background: "#F8FAFC", color: "#475467", border: "1px solid #E4E7EC" },
  empty: { textAlign: "center", padding: "40px 0", color: "#7b7975", fontSize: 13 },
  avatar: (color = STOIC_NAVY) => ({ width: 32, height: 32, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }),
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2, 10);
export const today = () => new Date().toISOString().slice(0, 10);
export const dayFromDateTime = dt => (dt ? String(dt).slice(0, 10) : today());
export const fmtDate = d => d ? new Date(d).toLocaleDateString("tr-TR") : "—";
export const fmtDateTime = d => d ? new Date(d).toLocaleString("tr-TR") : "—";
// Şu anki zamanı yerel saat dilimiyle datetime-local formatında döndürür
export const nowLocalISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" }); };
export const timeAgo = d => {
  if (!d) return "";
  const diff = Math.floor((Date.now() - new Date(d)) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff}dk önce`;
  if (diff < 1440) return `${Math.floor(diff / 60)}sa önce`;
  return fmtDate(d);
};

// Firebase hata kodlarını Türkçe mesaja çevirir
export const firebaseErrTR = (e) => {
  const code = e?.code || "";
  if (code === "auth/email-already-in-use")    return "Bu e-posta adresi zaten kullanımda. Farklı bir e-posta deneyin.";
  if (code === "auth/invalid-email")            return "Geçersiz e-posta adresi. Lütfen geçerli bir e-posta girin.";
  if (code === "auth/weak-password")            return "Şifre çok zayıf. En az 6 karakter olmalıdır.";
  if (code === "auth/user-not-found")           return "Kullanıcı bulunamadı.";
  if (code === "auth/wrong-password")           return "Şifre hatalı.";
  if (code === "auth/too-many-requests")        return "Çok fazla deneme yapıldı. Lütfen bir süre bekleyin.";
  if (code === "auth/network-request-failed")   return "Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edin.";
  if (code === "auth/user-disabled")            return "Bu kullanıcı hesabı devre dışı bırakılmış.";
  if (code === "auth/requires-recent-login")    return "Bu işlem için tekrar giriş yapmanız gerekiyor.";
  if (code === "auth/invalid-credential")       return "Geçersiz e-posta veya şifre.";
  return e?.message || "Bilinmeyen bir hata oluştu.";
};

export const openPrintableReport = ({ title, bodyHtml }) => {
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap');
    *{box-sizing:border-box;}
    @media screen{body{visibility:hidden;overflow:hidden;margin:0;}}
    @media print{body{visibility:visible;}}
    body{font-family:'Noto Sans','Segoe UI',Arial,sans-serif;padding:28px 34px;font-size:13px;line-height:1.75;color:#1a1a18;max-width:900px;margin:0 auto;}
    h1{font-size:19px;border-bottom:2px solid #1a1a1a;padding-bottom:8px;margin-bottom:18px;color:#151515;}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6a5610;margin:20px 0 8px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed;word-break:break-word;}
    td,th{padding:6px 9px;border:1px solid #d9d3d1;vertical-align:top;word-break:break-word;overflow-wrap:break-word;}
    td:first-child{font-weight:700;background:#f7f3f2;width:160px;}
    thead td,th{background:#f7f3f2 !important;font-weight:700;}
    .box{border:1px solid #d9d3d1;border-radius:6px;padding:12px;min-height:60px;line-height:1.75;word-break:break-word;}
    ul,ol{margin:6px 0;padding-left:22px;}li{margin-bottom:2px;}
    @media print{body{padding:12px;}@page{margin:1.2cm;}}
  `;
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
${bodyHtml}
<script>
  window.onload = function() {
    window.focus();
    window.print();
    setTimeout(function(){ window.close(); }, 800);
  };
<\/script>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank", "width=900,height=700,noopener");
  if (!popup) {
    URL.revokeObjectURL(url);
    alert("Yazdır penceresi açılamadı. Lütfen tarayıcının popup engelleyicisini kapatın.");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
};

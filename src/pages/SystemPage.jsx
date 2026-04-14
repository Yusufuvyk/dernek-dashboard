import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { S } from "../utils/styles";
import { ROMA_RED, STOIC_NAVY, GOLD } from "../utils/constants";
import { displayRole } from "../utils/roles";
import { fmtDate } from "../utils/helpers";

export default function SystemPage({ users, depts, tasks, meetings, messages, fileRequests, attendance, registrations }) {
  const [deletedCount, setDeletedCount] = useState("…");
  const [auditCount, setAuditCount] = useState("…");

  useEffect(() => {
    getDocs(collection(db, "deletedUsers")).then(s => setDeletedCount(s.size));
    getDocs(collection(db, "auditLogs")).then(s => setAuditCount(s.size)).catch(() => setAuditCount(0));
  }, []);

  const collections = [
    { label: "Kullanıcılar", col: "users", count: users.length, color: STOIC_NAVY },
    { label: "Departmanlar", col: "depts", count: depts.length, color: STOIC_NAVY },
    { label: "Görevler", col: "tasks", count: tasks.length, color: STOIC_NAVY },
    { label: "Toplantılar", col: "meetings", count: meetings.length, color: STOIC_NAVY },
    { label: "Mesajlar", col: "messages", count: messages.length, color: STOIC_NAVY },
    { label: "Dosya Talepleri", col: "fileRequests", count: fileRequests.length, color: STOIC_NAVY },
    { label: "Devamsızlık", col: "attendance", count: attendance.length, color: STOIC_NAVY },
    { label: "Kayıt Bekleyenler", col: "registrations", count: registrations.length, color: registrations.length > 0 ? GOLD : STOIC_NAVY },
    { label: "Silinen Kullanıcılar", col: "deletedUsers", count: deletedCount, color: ROMA_RED },
    { label: "Denetim Logları", col: "auditLogs", count: auditCount, color: STOIC_NAVY },
  ];

  // Rol dağılımı
  const roleCounts = {};
  users.forEach(u => {
    const r = displayRole(u.role);
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  });

  // Görev durum dağılımı
  const taskStatus = { tamamlandı: 0, devam: 0, gecikmeli: 0, planlandı: 0 };
  tasks.forEach(t => {
    const s = (t.status || "").toLowerCase();
    if (s === "tamamlandı") taskStatus.tamamlandı++;
    else if (s === "devam" || s === "devam ediyor") taskStatus.devam++;
    else if (s === "gecikmeli") taskStatus.gecikmeli++;
    else taskStatus.planlandı++;
  });

  const card = { background: "#fff", borderRadius: 10, border: "1px solid #E4E7EC", padding: "16px 20px" };
  const sectionTitle = { fontSize: 11, fontWeight: 700, color: "#667085", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Firestore Koleksiyon Boyutları */}
      <div style={card}>
        <div style={sectionTitle}>Firestore Koleksiyonları</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {collections.map(c => (
            <div key={c.col} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${c.color}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.count}</div>
              <div style={{ fontSize: 11.5, color: "#667085", marginTop: 2 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, fontFamily: "monospace" }}>{c.col}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* Rol Dağılımı */}
        <div style={card}>
          <div style={sectionTitle}>Kullanıcı Rol Dağılımı</div>
          {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
            <div key={role} style={{ ...S.flexBetween, padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ fontSize: 13, color: "#374151" }}>{role}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: STOIC_NAVY }}>{count}</span>
            </div>
          ))}
          {users.length === 0 && <div style={S.empty}>Kullanıcı yok</div>}
        </div>

        {/* Görev Durumu */}
        <div style={card}>
          <div style={sectionTitle}>Görev Durum Özeti</div>
          {[
            { label: "Tamamlandı", val: taskStatus.tamamlandı, color: "#30D158" },
            { label: "Devam Ediyor", val: taskStatus.devam, color: GOLD },
            { label: "Gecikmeli", val: taskStatus.gecikmeli, color: ROMA_RED },
            { label: "Planlandı", val: taskStatus.planlandı, color: STOIC_NAVY },
          ].map(item => (
            <div key={item.label} style={{ marginBottom: 10 }}>
              <div style={{ ...S.flexBetween, marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: "#374151" }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.val}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "#F3F4F6", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: item.color, width: tasks.length ? `${(item.val / tasks.length) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
          {tasks.length === 0 && <div style={S.empty}>Görev yok</div>}
        </div>

      </div>

      {/* Departman Özeti */}
      <div style={card}>
        <div style={sectionTitle}>Departman Özeti</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {depts.map(d => {
            const members = users.filter(u => u.deptId === d.id);
            const deptTasks = tasks.filter(t => t.deptId === d.id);
            const done = deptTasks.filter(t => t.status === "tamamlandı").length;
            return (
              <div key={d.id} style={{ background: "#F9FAFB", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: STOIC_NAVY, marginBottom: 4 }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: "#667085" }}>{members.length} üye · {deptTasks.length} görev</div>
                {deptTasks.length > 0 && (
                  <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: "#E5E7EB" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "#30D158", width: `${(done / deptTasks.length) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {depts.length === 0 && <div style={S.empty}>Departman yok</div>}
        </div>
      </div>

      {/* Sistem Bilgisi */}
      <div style={card}>
        <div style={sectionTitle}>Sistem Bilgisi</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {[
            { label: "Firebase Project", val: "manageapp-627da" },
            { label: "Hosting", val: "GitHub Pages" },
            { label: "Framework", val: "React + Vite" },
            { label: "Veritabanı", val: "Cloud Firestore" },
            { label: "Auth", val: "Firebase Auth (Email/Password)" },
            { label: "Toplam Doküman", val: collections.reduce((a, c) => a + (typeof c.count === "number" ? c.count : 0), 0) },
          ].map(item => (
            <div key={item.label} style={{ padding: "6px 10px", background: "#F9FAFB", borderRadius: 6 }}>
              <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: STOIC_NAVY, fontFamily: typeof item.val === "string" && item.val.includes("-") ? "monospace" : "inherit" }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

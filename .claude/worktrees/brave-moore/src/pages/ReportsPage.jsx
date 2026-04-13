import { useState } from "react";
import { db } from "../firebase";
import { collection, doc, addDoc, deleteDoc, updateDoc, getDocs, setDoc, query, where, limit, serverTimestamp } from "firebase/firestore";
import { S } from "../utils/styles";
import { STOIC_NAVY, GOLD, ROMA_RED } from "../utils/constants";
import { hasAdminRole } from "../utils/roles";
import { today, fmtDateTime, openPrintableReport } from "../utils/helpers";
import Icon from "../components/Icon";

export default function ReportsPage({ meetings, depts, users, currentUser, userProfile }) {
  const [seeding, setSeeding] = useState(false);
  const done = meetings.filter(m => m.report);
  const getDept = id => depts.find(d => d.id === id)?.name || "—";
  const getName = id => users.find(u => u.id === id)?.name || id;

  const seedDemoData = async () => {
    if (!hasAdminRole(userProfile?.role)) {
      alert("Örnek veri yüklemek için Başkan yetkisi gerekir.");
      return;
    }
    setSeeding(true);
    try {
      const existingDemo = await getDocs(query(collection(db, "meetings"), where("demo", "==", true), limit(1)));
      if (!existingDemo.empty) {
        alert("Örnek veriler zaten eklenmiş.");
        setSeeding(false);
        return;
      }

      const deptPool = [...depts];
      if (deptPool.length < 3) {
        const demoDeptDefs = [
          { name: "Operasyon", desc: "Saha planlama ve süreç takibi" },
          { name: "İletişim", desc: "Üyeler ve paydaşlarla iletişim" },
          { name: "Finans", desc: "Bütçe, ödeme ve kaynak yönetimi" },
        ];
        for (const d of demoDeptDefs) {
          const ref = await addDoc(collection(db, "depts"), { ...d, demo: true });
          deptPool.push({ id: ref.id, ...d, demo: true });
        }
      }

      const userPool = [...users];
      if (userPool.length < 4) {
        const demoUsers = [
          { id: "demo_u1", name: "Aylin Demir", email: "aylin.demo@marcus.local", role: "Departman Yöneticisi", deptId: deptPool[0]?.id || null, title: "Operasyon Sorumlusu", avatar: "AD", managerId: null, demo: true },
          { id: "demo_u2", name: "Can Eren", email: "can.demo@marcus.local", role: "Departman Yöneticisi", deptId: deptPool[1]?.id || null, title: "İletişim Yöneticisi", avatar: "CE", managerId: null, demo: true },
          { id: "demo_u3", name: "Mina Kaya", email: "mina.demo@marcus.local", role: "Üye", deptId: deptPool[0]?.id || null, title: "Operasyon Analisti", avatar: "MK", managerId: "demo_u1", demo: true },
        ];
        for (const u of demoUsers) {
          await setDoc(doc(db, "users", u.id), u, { merge: true });
          userPool.push(u);
        }
      }

      const actorId = currentUser?.uid || userPool[0]?.id;
      const deptA = deptPool[0]?.id || null;
      const deptB = deptPool[1]?.id || null;
      const deptC = deptPool[2]?.id || null;
      const allUsers = userPool.filter(u => u.id !== actorId);

      const meetingA = await addDoc(collection(db, "meetings"), {
        title: "Nisan Dönemi Faaliyet Planlama", deptId: deptA,
        datetime: `${today()}T10:00`,
        participants: allUsers.slice(0, 3).map(u => u.id),
        status: "yapıldı",
        report: { kararlar: "Aylık etkinlik takvimi onaylandı.", aksiyonlar: "Sorumlu atamaları haftalık yapılacak.", attendedParticipantIds: allUsers.slice(0, 2).map(u => u.id) },
        createdAt: serverTimestamp(), demo: true,
      });

      const meetingB = await addDoc(collection(db, "meetings"), {
        title: "Bağışçı İlişkileri Değerlendirme", deptId: deptB,
        datetime: `${today()}T14:30`,
        participants: allUsers.slice(1, 4).map(u => u.id),
        status: "planlandı", report: null,
        createdAt: serverTimestamp(), demo: true,
      });

      const attendedA = new Set(allUsers.slice(0, 2).map(u => u.id));
      for (const participantId of allUsers.slice(0, 3).map(u => u.id)) {
        await setDoc(doc(db, "attendance", `${meetingA.id}_${participantId}`), {
          meetingId: meetingA.id, meetingTitle: "Nisan Dönemi Faaliyet Planlama",
          userId: participantId, date: today(), deptId: deptA,
          status: attendedA.has(participantId) ? "katildi" : "gelmedi",
          source: "meeting-report", updatedBy: actorId, updatedAt: serverTimestamp(), demo: true,
        }, { merge: true });
      }

      await addDoc(collection(db, "tasks"), { title: "Haftalık üye geri bildirim raporu", desc: "Departman bazlı geri bildirimlerin sınıflandırılması", deptId: deptA, assignedTo: allUsers[0]?.id || actorId, startDate: today(), endDate: today(), progress: 65, notes: "Demo görev kaydı", status: "devam", createdAt: serverTimestamp(), demo: true });
      await addDoc(collection(db, "tasks"), { title: "Nisan toplantı sunumu", desc: "Yönetim özeti ve KPI kartları", deptId: deptB, assignedTo: allUsers[1]?.id || actorId, startDate: today(), endDate: today(), progress: 25, notes: "Demo görev kaydı", status: "planlandı", createdAt: serverTimestamp(), demo: true });
      await addDoc(collection(db, "messages"), { type: "bilgi", subject: "Faaliyet raporu güncellemesi", body: "Nisan dönemi verileri sisteme eklendi.", fromId: actorId, toDeptId: deptA, status: "yanıtlandı", createdAt: new Date().toISOString(), replies: [], demo: true });
      await addDoc(collection(db, "fileRequests"), { subject: "Bütçe revizyon dosyası", desc: "Q2 bütçe tablolarının paylaşılması talep edilmiştir.", fromId: actorId, toDeptId: deptC, status: "bekliyor", createdAt: new Date().toISOString(), response: null, demo: true });
      await updateDoc(doc(db, "meetings", meetingB.id), { demoLinked: true });
      alert("Örnek veriler başarıyla eklendi.");
    } catch (err) {
      console.error("Örnek veri ekleme hatası:", err);
      alert("Örnek veriler eklenirken hata oluştu.");
    }
    setSeeding(false);
  };

  const printReport = m => {
    openPrintableReport({
      title: m.title,
      bodyHtml: `<h1>Toplantı Raporu</h1><table><tr><td>Toplantı</td><td>${m.title}</td></tr><tr><td>Departman</td><td>${getDept(m.deptId)}</td></tr><tr><td>Tarih</td><td>${fmtDateTime(m.datetime)}</td></tr><tr><td>Katılımcılar</td><td>${(m.participants || []).map(getName).join(", ")}</td></tr></table><h2>Alınan Kararlar</h2><div class="box">${m.report?.kararlar || "-"}</div><h2>Aksiyon Maddeleri</h2><div class="box">${m.report?.aksiyonlar || "-"}</div>`,
    });
  };

  const deleteReport = async (m) => {
    if (!window.confirm(`"${m.title}" raporunu silmek istiyor musunuz?\n\nBu işlem toplantıyı "Planlandı" durumuna geri alır ve devamsızlık kayıtlarını siler.`)) return;
    try {
      await updateDoc(doc(db, "meetings", m.id), { report: null, status: "planlandı" });
      const attSnap = await getDocs(query(collection(db, "attendance"), where("meetingId", "==", m.id)));
      await Promise.all(attSnap.docs.map(d => deleteDoc(d.ref)));
    } catch (e) {
      alert("Rapor silinemedi: " + e.message);
    }
  };

  return (
    <div>
      <div style={{ ...S.flexBetween, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#6B6B65" }}>Rapor, toplantı, departman ve görevler için örnek veri ekleyebilirsiniz.</div>
        <button style={S.btn("primary")} onClick={seedDemoData} disabled={seeding}>{seeding ? "Ekleniyor..." : "Örnek Veri Yükle"}</button>
      </div>
      <div style={S.grid3}>
        {[["Toplam", meetings.length, STOIC_NAVY], ["Raporlanan", done.length, "#30D158"], ["Bekleyen", meetings.length - done.length, GOLD]].map(([label, num, color]) => (
          <div key={label} style={S.stat(color)}><div style={{ fontSize: 30, fontWeight: 800 }}>{num}</div><div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{label}</div></div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div style={S.card}>
        <div style={S.cardTitle}>Tamamlanan Raporlar</div>
        {done.length === 0 ? <div style={S.empty}>Henüz raporlanmış toplantı yok.</div> : (
          <table style={S.table}>
            <thead><tr>{["Toplantı", "Departman", "Tarih", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{done.map(m => (
              <tr key={m.id}>
                <td style={S.td}><strong>{m.title}</strong></td>
                <td style={S.td}><span style={S.tag}>{getDept(m.deptId)}</span></td>
                <td style={S.td}>{fmtDateTime(m.datetime)}</td>
                <td style={S.td}>
                  <div style={S.flex(6)}>
                    <button style={S.btn("ghost")} onClick={() => printReport(m)}><Icon name="download" size={13} /> PDF</button>
                    {hasAdminRole(userProfile?.role) && <button style={{ ...S.btn("ghost"), color: ROMA_RED }} onClick={() => deleteReport(m)}><Icon name="trash" size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { S } from "../utils/styles";
import { avatarColor } from "../utils/constants";
import { ROMA_RED, GOLD, STOIC_NAVY, STATUS, MSG_TYPE } from "../utils/constants";
import { hasAdminRole } from "../utils/roles";
import { fmtDateTime, timeAgo } from "../utils/helpers";

export default function Dashboard({ tasks, meetings, depts, users, messages, fileRequests, currentUser, userProfile }) {
  const mine = hasAdminRole(userProfile?.role) ? tasks : tasks.filter(t => {
    const arr = Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo];
    return t.deptId === userProfile?.deptId || arr.includes(currentUser?.uid);
  });
  const myMsgs = messages.filter(m => m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId);
  const pendingMsgs = myMsgs.filter(m => m.status === "bekliyor").length;
  const getName = id => users.find(u => u.id === id)?.name || "—";
  const getDept = id => depts.find(d => d.id === id)?.name || "—";

  // Yaklaşan toplantılar: sadece planlandı + gelecekte + kullanıcıya ait
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const myUpcomingMeetings = meetings
    .filter(m => {
      if (m.status !== "planlandı") return false;
      const mDate = new Date(m.datetime);
      if (mDate <= now) return false;
      if (hasAdminRole(userProfile?.role)) return true;
      return m.participants?.includes(currentUser?.uid) || m.deptId === userProfile?.deptId;
    })
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const todayMeetings = myUpcomingMeetings.filter(m => {
    const d = new Date(m.datetime);
    return d >= todayStart && d < todayEnd;
  });

  const minutesUntilNext = myUpcomingMeetings.length > 0
    ? Math.round((new Date(myUpcomingMeetings[0].datetime) - now) / 60000)
    : null;

  return (
    <div>
      {/* Bugün toplantı bildirimi */}
      {todayMeetings.length > 0 && (
        <div style={{ background: "#FFF8E1", border: "1px solid #F9C74F", borderRadius: 10, padding: "11px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#7A5C00" }}>
              Bugün {todayMeetings.length} toplantınız var!
            </span>
            <div style={{ fontSize: 12, color: "#8A6A16", marginTop: 2 }}>
              {todayMeetings.map(m => `${m.title} — ${fmtDateTime(m.datetime)}`).join(" · ")}
            </div>
          </div>
          {minutesUntilNext !== null && minutesUntilNext <= 60 && (
            <span style={{ ...S.badge(ROMA_RED), fontSize: 11, whiteSpace: "nowrap" }}>
              {minutesUntilNext < 1 ? "Şimdi başlıyor!" : `${minutesUntilNext} dk sonra`}
            </span>
          )}
        </div>
      )}

      <div style={S.grid3}>
        {[["Toplam Görev", mine.length, STOIC_NAVY], ["Tamamlandı", mine.filter(t => t.status === "tamamlandı").length, "#30D158"], ["Bekleyen Mesaj", pendingMsgs, GOLD]].map(([label, num, color]) => (
          <div key={label} style={S.stat(color)}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>{num}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={S.cardTitle}>Departman Özeti</div>
          {depts.map(d => {
            const dT = tasks.filter(t => t.deptId === d.id);
            const pct = dT.length ? Math.round((dT.filter(t => t.status === "tamamlandı").length / dT.length) * 100) : 0;
            return (
              <div key={d.id} style={{ marginBottom: 13 }}>
                <div style={{ ...S.flexBetween, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                  <span style={{ fontSize: 11.5, color: "#8A8A8E" }}>{dT.length} görev · %{pct}</span>
                </div>
                <div style={S.pb}><div style={S.pbF(pct)} /></div>
              </div>
            );
          })}
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>Son Mesajlar</div>
          {messages.slice(0, 4).map(m => (
            <div key={m.id} style={{ ...S.flex(10), marginBottom: 12, alignItems: "flex-start" }}>
              <div style={{ ...S.avatar(avatarColor(m.fromId)), marginTop: 2 }}>{users.find(u => u.id === m.fromId)?.avatar || "?"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.flexBetween}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.subject}</span>
                  <span style={S.badge(MSG_TYPE[m.type]?.color || "#999")}>{MSG_TYPE[m.type]?.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "#8A8A8E" }}>{getName(m.fromId)} · {timeAgo(m.createdAt)}</div>
              </div>
            </div>
          ))}
          {messages.length === 0 && <div style={S.empty}>Henüz mesaj yok</div>}
        </div>
      </div>
      <div style={{ height: 16 }} />

      {/* Yaklaşan Toplantılar Kartı */}
      <div style={S.card}>
        <div style={S.cardTitle}>Yaklaşan Toplantılar</div>
        {myUpcomingMeetings.length === 0 ? (
          <div style={S.empty}>Yaklaşan toplantı yok</div>
        ) : (
          <table style={S.table}>
            <thead><tr>{["Toplantı", "Departman", "Tarih / Saat", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{myUpcomingMeetings.slice(0, 5).map(m => {
              const mDate = new Date(m.datetime);
              const diffMin = Math.round((mDate - now) / 60000);
              const diffLabel = diffMin < 60
                ? <span style={S.badge(ROMA_RED)}>{diffMin < 1 ? "Şimdi!" : `${diffMin}dk`}</span>
                : diffMin < 1440
                ? <span style={S.badge(GOLD)}>{Math.round(diffMin / 60)}sa</span>
                : <span style={S.badge(STOIC_NAVY)}>{Math.round(diffMin / 1440)}g</span>;
              return (
                <tr key={m.id}>
                  <td style={S.td}><strong>{m.title}</strong></td>
                  <td style={S.td}><span style={S.tag}>{getDept(m.deptId)}</span></td>
                  <td style={S.td}>{fmtDateTime(m.datetime)}</td>
                  <td style={S.td}>{diffLabel}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>

      <div style={{ height: 16 }} />
      <div style={S.card}>
        <div style={S.cardTitle}>Son Görevler</div>
        <table style={S.table}>
          <thead><tr>{["Görev", "Departman", "Durum"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{mine.slice(0, 5).map(t => (
            <tr key={t.id}>
              <td style={S.td}><strong>{t.title}</strong></td>
              <td style={S.td}><span style={S.tag}>{getDept(t.deptId)}</span></td>
              <td style={S.td}><span style={S.badge(STATUS[t.status]?.color || "#999")}>{STATUS[t.status]?.label}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import marcusLogo from "./assets/marcus-logo.png";
import {
  collection, doc, setDoc, getDocs, updateDoc,
  onSnapshot, query, limit, serverTimestamp, where
} from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";

import { S } from "./utils/styles";
import { normalizeRole, hasSuperRole, isDenetmenRole, roleLevel, isTeknikYonetici } from "./utils/roles";
import Icon from "./components/Icon";
import { avatarColor } from "./utils/constants";

import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import TasksPage from "./pages/TasksPage";
import MeetingsPage from "./pages/MeetingsPage";
import AttendancePage from "./pages/AttendancePage";
import OrgTreePage from "./pages/OrgTreePage";
import DepartmentsPage from "./pages/DepartmentsPage";
import UsersPage from "./pages/UsersPage";
import MessagesPage from "./pages/MessagesPage";
import FileRequestsPage from "./pages/FileRequestsPage";
import ReportsPage from "./pages/ReportsPage";
import AuditPage from "./pages/AuditPage";
import SystemPage from "./pages/SystemPage";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");

  const [users, setUsers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);
  const [fileRequests, setFileRequests] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [registrations, setRegistrations] = useState([]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load user profile
  useEffect(() => {
    if (!currentUser) { setUserProfile(null); return; }
    const userRef = doc(db, "users", currentUser.uid);
    const unsub = onSnapshot(userRef, async snap => {
      if (snap.exists()) {
        const data = snap.data();
        let normalizedRole = normalizeRole(data.role);
        // yusufuveyik@gmail.com her zaman Teknik Yönetici olsun
        if (data.email === "yusufuveyik@gmail.com" && normalizedRole !== "Teknik Yönetici") {
          normalizedRole = "Teknik Yönetici";
          await updateDoc(userRef, { role: "Teknik Yönetici", title: "Teknik Yönetici" });
        }
        setUserProfile({ id: snap.id, ...data, role: normalizedRole });
        return;
      }

      // Profil bulunamadı
      try {
        const existing = await getDocs(query(collection(db, "users"), limit(1)));
        if (!existing.empty) {
          await signOut(auth);
          return;
        }
        // İlk kurulum: Başkan olarak bootstrap
        const fallbackName = (currentUser.email || "Kullanici").split("@")[0];
        const name = currentUser.displayName || fallbackName;
        await setDoc(userRef, {
          name, email: currentUser.email || "", role: "Başkan",
          deptId: null, title: "Yönetici",
          avatar: name.slice(0, 2).toUpperCase(),
          managerId: null, createdAt: serverTimestamp(), autoCreated: true,
        });
      } catch (err) {
        console.error("Profil kontrol hatası:", err);
        await signOut(auth);
      }
    });
    return unsub;
  }, [currentUser]);

  // Realtime listeners
  useEffect(() => {
    if (!currentUser) return;
    const subs = [
      onSnapshot(collection(db, "users"), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "depts"), s => setDepts(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "tasks"), s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "meetings"), s => setMeetings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "messages"), s => setMessages(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "fileRequests"), s => setFileRequests(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "attendance"), s => setAttendance(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "registrations"), s => setRegistrations(s.docs.map(d => ({ id: d.id, ...d.data() })))),
    ];
    return () => subs.forEach(u => u());
  }, [currentUser]);

  const pendingMsgs = messages.filter(m => (m.toId === currentUser?.uid || m.toDeptId === userProfile?.deptId) && m.status === "bekliyor").length;
  const pendingRegs = hasSuperRole(userProfile?.role) ? registrations.filter(r => r.status === "bekliyor").length : 0;

  if (authLoading) return <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A18", fontSize: 16 }}>Yükleniyor...</div>;
  if (!currentUser) return <LoginPage onLogin={u => setCurrentUser(u)} />;
  if (!userProfile) return <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A18", fontSize: 16 }}>Profil yükleniyor...</div>;

  const rLevel = roleLevel(userProfile?.role);
  const canAudit = hasSuperRole(userProfile?.role) || isDenetmenRole(userProfile?.role);
  const isOwner = isTeknikYonetici(userProfile);

  // NAV — Denetmen dahil tüm Level 0 tam menü alır
  const NAV_GROUPS = (() => {
    const genel = { label: "Genel", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "tasks", label: "Görevler", icon: "tasks" }, { id: "meetings", label: "Toplantılar", icon: "calendar" }, { id: "attendance", label: "Devamsızlık", icon: "check" }] };
    const iletisim = { label: "İletişim", items: [{ id: "messages", label: "Mesajlar", icon: "inbox", badge: pendingMsgs }] };
    if (rLevel === 0) {
      return [
        genel,
        { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }, { id: "departments", label: "Departmanlar", icon: "users" }, { id: "userlist", label: "Kullanıcılar", icon: "users", badge: pendingRegs }] },
        iletisim,
        { label: "Raporlar", items: [{ id: "reports", label: "Raporlar", icon: "reports" }, { id: "audit", label: "Denetim", icon: "reports" }, ...(isOwner ? [{ id: "system", label: "Sistem Paneli", icon: "reports" }] : [])] },
      ];
    }
    if (rLevel === 1) {
      return [
        genel,
        { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }, { id: "departments", label: "Departmanlar", icon: "users" }] },
        iletisim,
        { label: "Raporlar", items: [{ id: "reports", label: "Raporlar", icon: "reports" }] },
      ];
    }
    return [
      genel,
      { label: "Organizasyon", items: [{ id: "orgtree", label: "Yönetim Ağacı", icon: "tree" }] },
      iletisim,
    ];
  })();

  const TITLES = { dashboard: "Dashboard", tasks: "Görev Yönetimi", meetings: "Toplantılar", attendance: "Devamsızlık Takibi", orgtree: "Yönetim Ağacı", departments: "Departmanlar", userlist: "Kullanıcılar", messages: "Mesajlar", reports: "Raporlar", audit: "Denetim Paneli", system: "Sistem Paneli" };
  const props = { tasks, meetings, depts, users, messages, fileRequests, attendance, currentUser, userProfile, registrations };
  const noAccess = <div style={S.card}><div style={S.empty}>Bu sayfaya erişim yetkiniz yok.</div></div>;

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard {...props} />;
      case "tasks": return <TasksPage {...props} />;
      case "meetings": return <MeetingsPage {...props} />;
      case "attendance": return <AttendancePage {...props} />;
      case "orgtree": return <OrgTreePage {...props} />;
      case "departments": return <DepartmentsPage {...props} />;
      case "userlist": return hasSuperRole(userProfile?.role) ? <UsersPage {...props} /> : noAccess;
      case "messages": return <MessagesPage {...props} />;
      case "reports": return <ReportsPage {...props} />;
      case "audit": return canAudit ? <AuditPage {...props} /> : noAccess;
      case "system": return isOwner ? <SystemPage {...props} /> : noAccess;
      default: return null;
    }
  };

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={{ padding: "16px 14px 14px", borderBottom: "1px solid #E4E7EC" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 17, fontWeight: 800, color: "#101828", letterSpacing: 1.2 }}>
            <img src={marcusLogo} alt="Marcus logo" style={{ width: 48, height: 48, objectFit: "contain", mixBlendMode: "multiply" }} />
            <span>MARCUS</span>
          </div>
        </div>
        <nav style={S.nav}>
          {NAV_GROUPS.map(g => (
            <div key={g.label}>
              <div style={S.navSection}>{g.label}</div>
              {g.items.map(n => (
                <div key={n.id} style={S.navItem(page === n.id)} onClick={() => setPage(n.id)}>
                  <Icon name={n.icon} size={16} />
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {n.badge > 0 && <span style={{ background: "#111827", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{n.badge}</span>}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: "0 8px" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 10, padding: "10px 12px", border: "1px solid #E4E7EC" }}>
            <div style={S.flex(8)}>
              <div style={{ ...S.avatar(avatarColor(currentUser.uid)), width: 28, height: 28, fontSize: 10 }}>{userProfile.avatar || userProfile.name?.[0]}</div>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: "#101828" }}>{userProfile.name}</div><div style={{ fontSize: 10.5, color: "#667085" }}>{userProfile.role}</div></div>
            </div>
            <button onClick={() => signOut(auth)} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, color: "#475467", fontSize: 11.5, cursor: "pointer", background: "none", border: "none", padding: 0, fontWeight: 700, fontFamily: "inherit" }}>
              <Icon name="logout" size={13} /> Çıkış Yap
            </button>
          </div>
        </div>
      </div>
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 24, borderRadius: 2, background: "#111827" }} />
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: "#101828", lineHeight: 1 }}>{TITLES[page]}</div>
          </div>
          <div style={{ fontSize: 12.5, color: "#667085" }}>{new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
        <div style={S.content}>{renderPage()}</div>
      </div>
    </div>
  );
}
